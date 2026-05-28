import * as vscode from "vscode"

import { TodoItem } from "@roo-code/types"

import { Task } from "../task/Task"
import { getModeBySlug } from "../../shared/modes"
import { formatResponse } from "../prompts/responses"
import { t } from "../../i18n"
import { parseMarkdownChecklist } from "./UpdateTodoListTool"
import { Package } from "../../shared/package"
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
							formatResponse.toolError(`Subtask ${i + 1}: invalid todos format: must be a markdown checklist`),
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
			const asyncManager = (provider as any).getAsyncSubtaskManager?.()
			if (!asyncManager) {
				pushToolResult(formatResponse.toolError("Async subtask manager not available"))
				return
			}

			const result = await asyncManager.spawnSubtasks({
				parentTaskId: task.taskId,
				subtasks: validatedSubtasks,
			})

			pushToolResult(
				`Spawned ${result.length} async subtask(s) in parallel. ` +
				`Each subtask is running in its own worktree and editor tab. ` +
				`When all subtask(s) complete, their changes will be auto-merged.`,
			)
			return
		} catch (error) {
			await handleError("creating async tasks", error)
			return
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
