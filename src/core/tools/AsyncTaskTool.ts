import * as vscode from "vscode"

import { RooCodeEventName, TodoItem } from "@roo-code/types"

import { Task } from "../task/Task"
import { getModeBySlug } from "../../shared/modes"
import { formatResponse } from "../prompts/responses"
import { t } from "../../i18n"
import { parseMarkdownChecklist } from "./UpdateTodoListTool"
import { Package } from "../../shared/package"
import { EXPERIMENT_IDS, experiments } from "../../shared/experiments"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"

interface AsyncTaskSubtaskSpec {
	mode: string
	message: string
	todos?: string
}

interface AsyncTaskParams {
	subtasks: AsyncTaskSubtaskSpec[]
}

/** Merge-wait timeout: 5 minutes */
const MERGE_TIMEOUT_MS = 300_000

export class AsyncTaskTool extends BaseTool<"async_task"> {
	readonly name = "async_task" as const

	async execute(params: AsyncTaskParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { subtasks } = params
		const { askApproval, handleError, pushToolResult } = callbacks

		try {
			// Validate required parameters.
			if (!subtasks || !Array.isArray(subtasks) || subtasks.length === 0) {
				task.consecutiveMistakeCount++
				task.recordToolError("async_task")
				task.didToolFailInCurrentTurn = true
				pushToolResult(await task.sayAndCreateMissingParamError("async_task", "subtasks"))
				return
			}

			// Require at least 2 subtasks for async execution
			if (subtasks.length < 2) {
				task.consecutiveMistakeCount++
				task.recordToolError("async_task")
				task.didToolFailInCurrentTurn = true
				pushToolResult(
					formatResponse.toolError("async_task requires at least 2 subtasks. Use new_task for a single subtask."),
				)
				return
			}

			// Enforce maximum concurrent subtasks
			const maxSubtasks = 5
			if (subtasks.length > maxSubtasks) {
				task.consecutiveMistakeCount++
				task.recordToolError("async_task")
				task.didToolFailInCurrentTurn = true
				pushToolResult(
					formatResponse.toolError(
						`async_task supports a maximum of ${maxSubtasks} subtasks. You provided ${subtasks.length}.`,
					),
				)
				return
			}

			const provider = task.providerRef.deref()
			if (!provider) {
				pushToolResult(formatResponse.toolError("Provider reference lost"))
				return
			}

			const state = await provider.getState()
	
				// Check if the async subtasks experiment is enabled
				const isAsyncSubtasksEnabled = experiments.isEnabled(
					state?.experiments ?? {},
					EXPERIMENT_IDS.ASYNC_SUBTASKS,
				)
	
				if (!isAsyncSubtasksEnabled) {
					pushToolResult(
						formatResponse.toolError(
							"Async subtasks is an experimental feature that must be enabled in settings. Please enable 'Async Subtasks' in the Experimental Settings section.",
						),
					)
					return
				}
	
				// Validate each subtask
				const requireTodos = vscode.workspace
					.getConfiguration(Package.name)
					.get<boolean>("newTaskRequireTodos", false)

			const validatedSubtasks: { mode: string; message: string; todos: TodoItem[] }[] = []

			for (let i = 0; i < subtasks.length; i++) {
				const spec = subtasks[i]

				if (!spec.mode) {
					task.consecutiveMistakeCount++
					task.recordToolError("async_task")
					task.didToolFailInCurrentTurn = true
					pushToolResult(formatResponse.toolError(`Subtask ${i + 1}: missing required parameter 'mode'`))
					return
				}

				if (!spec.message) {
					task.consecutiveMistakeCount++
					task.recordToolError("async_task")
					task.didToolFailInCurrentTurn = true
					pushToolResult(formatResponse.toolError(`Subtask ${i + 1}: missing required parameter 'message'`))
					return
				}

				if (requireTodos && spec.todos === undefined) {
					task.consecutiveMistakeCount++
					task.recordToolError("async_task")
					task.didToolFailInCurrentTurn = true
					pushToolResult(formatResponse.toolError(`Subtask ${i + 1}: missing required parameter 'todos'`))
					return
				}

				// Parse todos if provided
				let todoItems: TodoItem[] = []
				if (spec.todos) {
					try {
						todoItems = parseMarkdownChecklist(spec.todos)
					} catch (error) {
						task.consecutiveMistakeCount++
						task.recordToolError("async_task")
						task.didToolFailInCurrentTurn = true
						pushToolResult(
							formatResponse.toolError(`Subtask ${i + 1}: invalid format: must be a markdown checklist`),
						)
						return
					}
				}

				// Verify the mode exists
				const targetMode = getModeBySlug(spec.mode, state?.customModes)
				if (!targetMode) {
					pushToolResult(formatResponse.toolError(`Subtask ${i + 1}: invalid mode '${spec.mode}'`))
					return
				}

				validatedSubtasks.push({ mode: spec.mode, message: spec.message, todos: todoItems })
			}

			task.consecutiveMistakeCount = 0

			// Build approval message showing all subtasks
			const subtaskSummaries = validatedSubtasks.map((s, i) => {
				const modeConfig = getModeBySlug(s.mode, state?.customModes)
				return `  ${i + 1}. [${modeConfig?.name ?? s.mode}] ${s.message.substring(0, 100)}${s.message.length > 100 ? "..." : ""}`
			})

			const toolMessage = JSON.stringify({
				tool: "asyncTask",
				subtaskCount: validatedSubtasks.length,
				subtasks: validatedSubtasks.map((s, i) => ({
					index: i + 1,
					mode: s.mode,
					message: s.message,
					todos: s.todos,
				})),
			})

			const didApprove = await askApproval("tool", toolMessage)

			if (!didApprove) {
				return
			}

			// Delegate to AsyncSubtaskManager via provider
			const asyncManager = (provider as any).getAsyncSubtaskManager?.(task.taskId)
			if (!asyncManager) {
				pushToolResult(formatResponse.toolError("Async subtask manager not available"))
				return
			}

			const result = await asyncManager.spawnSubtasks({
				parentTaskId: task.taskId,
				subtasks: validatedSubtasks,
			})

			// Check if any subtasks actually started
			const runningCount = result.filter((r: any) => r.status === "running").length
			const failedCount = result.filter((r: any) => r.status === "failed").length

			if (runningCount === 0) {
				// All subtasks failed immediately — report errors
				const errors = result
					.filter((r: any) => r.error)
					.map((r: any) => `Subtask ${r.subtaskIndex + 1}: ${r.error}`)
					.join("\n")
				pushToolResult(formatResponse.toolError(`All subtasks failed to start:\n${errors}`))
				return
			}

			// Set up the completion callback — when all subtasks finish and merge is done,
			// this will inject the results into the parent task and resume it.
			this.setupCompletionCallback(task, provider, asyncManager)

			// Abort the parent task loop — it will be resumed when subtasks complete.
			task.abort = true
			;(task as any).abortReason = "async_subtasks_running"

			pushToolResult(
				`Spawned ${runningCount} async subtask(s) in parallel` +
					(failedCount > 0 ? ` (${failedCount} failed to start)` : "") +
					`. Each subtask is running in its own worktree and editor tab. ` +
					`When all subtask(s) complete, their changes will be auto-merged and the results will be reported back.`,
			)
			return
		} catch (error: unknown) {
			await handleError("creating async tasks", error instanceof Error ? error : new Error(String(error)))
			return
		}
	}

	/**
	 * Set up the callback that fires when all async subtasks complete.
	 * This injects the merge results into the parent task's API history
	 * and resumes the parent task loop.
	 *
	 * Uses `provider.once` to avoid leaking the event listener, and
	 * wraps the merge-event wait in a timeout to prevent hanging forever.
	 */
	private setupCompletionCallback(task: Task, provider: any, asyncManager: any): void {
		const onAllCompleted = async (parentTaskId: string) => {
			if (parentTaskId !== task.taskId) return

			// Wait for the merge phase to complete (with timeout).
			const mergeSummary = await Promise.race([
				new Promise<string>((resolve) => {
					const onMergeCompleted = (pid: string, summary: string) => {
						if (pid !== task.taskId) return
						provider.off(RooCodeEventName.MergeCompleted, onMergeCompleted)
						provider.off(RooCodeEventName.MergeFailed, onMergeFailed)
						resolve(summary)
					}
					const onMergeFailed = (pid: string, error: string) => {
						if (pid !== task.taskId) return
						provider.off(RooCodeEventName.MergeCompleted, onMergeCompleted)
						provider.off(RooCodeEventName.MergeFailed, onMergeFailed)
						resolve(`Merge failed: ${error}`)
					}
					provider.on(RooCodeEventName.MergeCompleted, onMergeCompleted)
					provider.on(RooCodeEventName.MergeFailed, onMergeFailed)
				}),
				new Promise<string>((_, reject) =>
					setTimeout(() => reject(new Error("Merge timeout")), MERGE_TIMEOUT_MS),
				),
			]).catch((err) => `Merge failed: ${err.message}`)

			// Build the result message for the orchestrator
			const progress = asyncManager.getProgress()
			const resultMessage = this.buildResultMessage(progress, mergeSummary)

			// Resume the parent task with the results
			await this.resumeParentWithResults(task, resultMessage)
		}

		// Use once() so the listener auto-removes after first fire — no leak.
		provider.once(RooCodeEventName.AsyncSubtasksAllCompleted, onAllCompleted)
	}

	/**
	 * Build a human-readable result message for the orchestrator LLM.
	 */
	private buildResultMessage(progress: any[], mergeSummary: string): string {
		const lines: string[] = []
		lines.push("All async subtasks have completed.\n")

		for (const subtask of progress) {
			const index = subtask.subtaskIndex + 1
			if (subtask.status === "completed") {
				lines.push(`- Subtask ${index}: COMPLETED (branch: ${subtask.branchName})`)
			} else {
				lines.push(`- Subtask ${index}: FAILED - ${subtask.error ?? "Unknown error"}`)
			}
		}

		lines.push(`\nMerge Results:\n${mergeSummary}`)

		return lines.join("\n")
	}

	/**
	 * Resume the parent task by injecting the subtask results into its API history
	 * and restarting the task loop.
	 *
	 * Creates new message/block objects instead of mutating the original history.
	 */
	private async resumeParentWithResults(task: Task, resultMessage: string): Promise<void> {
		try {
			// Find the tool_use_id from the last assistant message's async_task tool_use
			const apiHistory = task.apiConversationHistory
			let toolUseId: string | undefined
			for (let i = apiHistory.length - 1; i >= 0; i--) {
				const msg = apiHistory[i]
				if (msg.role === "assistant" && Array.isArray(msg.content)) {
					for (const block of msg.content) {
						if (block.type === "tool_use" && block.name === "async_task") {
							toolUseId = block.id
							break
						}
					}
					if (toolUseId) break
				}
			}

			// Build new API history without mutating the original objects.
			let newHistory: any[]

			if (toolUseId) {
				// Check if the last message already has a tool_result for this tool_use_id
				const lastMsg = apiHistory[apiHistory.length - 1]
				if (lastMsg?.role === "user" && Array.isArray(lastMsg.content)) {
					// Deep-clone the last message and its content blocks
					const newLastMsg = {
						...lastMsg,
						content: lastMsg.content.map((block: any) => {
							if (block.type === "tool_result" && block.tool_use_id === toolUseId) {
								// Replace this block with updated content
								return { ...block, content: resultMessage }
							}
							return { ...block }
						}),
					}
					// Check if we actually replaced anything
					const wasUpdated = newLastMsg.content !== lastMsg.content
					if (wasUpdated) {
						newHistory = [...apiHistory.slice(0, -1), newLastMsg]
					} else {
						// No existing tool_result found — append a new user message
						newHistory = [
							...apiHistory,
							{
								role: "user",
								content: [
									{
										type: "tool_result" as const,
										tool_use_id: toolUseId,
										content: resultMessage,
									},
								],
							},
						]
					}
				} else {
					// Last message is not a user message with content — append new
					newHistory = [
						...apiHistory,
						{
							role: "user",
							content: [
								{
									type: "tool_result" as const,
									tool_use_id: toolUseId,
									content: resultMessage,
								},
							],
						},
					]
				}
			} else {
				// Fallback: inject as plain text
				newHistory = [
					...apiHistory,
					{
						role: "user",
						content: [{ type: "text" as const, text: resultMessage }],
					},
				]
			}

			// Use the public overwriteApiConversationHistory method
			await task.overwriteApiConversationHistory(newHistory)

			// Reset abort state and resume the task loop
			task.abort = false
			;(task as any).abortReason = undefined

			// Resume the task loop — the LLM will see the tool_result with all subtask results
			await (task as any).initiateTaskLoop([])
		} catch (error) {
			console.error(`[AsyncTaskTool] Failed to resume parent task: ${error}`)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"async_task">): Promise<void> {
		const subtasks = block.params.subtasks
		const partialMessage = JSON.stringify({
			tool: "asyncTask",
			subtaskCount: Array.isArray(subtasks) ? subtasks.length : 0,
		})

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const asyncTaskTool = new AsyncTaskTool()
