import * as path from "path"
import * as os from "os"

import { RooCodeEventName, type TodoItem } from "@roo-code/types"
import { worktreeService } from "@roo-code/core"

import type { ClineProvider } from "../webview/ClineProvider"

export interface AsyncSubtaskSpec {
	mode: string
	message: string
	todos: TodoItem[]
}

export interface SpawnSubtasksParams {
	parentTaskId: string
	subtasks: AsyncSubtaskSpec[]
}

export interface AsyncSubtaskStatus {
	subtaskIndex: number
	taskId: string
	worktreePath: string
	branchName: string
	provider: ClineProvider
	status: "pending" | "running" | "completed" | "failed"
	completionResult?: string
	error?: string
}

interface MergeSuccess {
	success: true
	mergedBranches: string[]
	summary: string
}

interface MergeFailure {
	success: false
	error: string
	mergedBranches: string[]
	failedBranch: string
}

export type MergeResult = MergeSuccess | MergeFailure

/**
 * Manages the lifecycle of async parallel subtasks.
 *
 * Each subtask runs in its own git worktree and editor tab.
 * When all subtasks complete, their branches are merged back into the main branch.
 */
export class AsyncSubtaskManager {
	private subtasks: Map<string, AsyncSubtaskStatus> = new Map()
	private parentProvider: ClineProvider
	private parentTaskId: string
	private worktreeBasePath: string
	private mergeInProgress = false

	constructor(parentProvider: ClineProvider, parentTaskId: string) {
		this.parentProvider = parentProvider
		this.parentTaskId = parentTaskId

		const projectName = path.basename(parentProvider.cwd || os.homedir())
		this.worktreeBasePath = path.join(os.homedir(), ".roo", "worktrees", `${projectName}-${parentTaskId.substring(0, 8)}`)
	}

	/**
	 * Spawn multiple subtasks in parallel, each in its own worktree and editor tab.
	 */
	async spawnSubtasks(params: SpawnSubtasksParams): Promise<AsyncSubtaskStatus[]> {
		const { subtasks: specs } = params
		const results: AsyncSubtaskStatus[] = []

		const currentBranch = await worktreeService.getCurrentBranch(this.parentProvider.cwd)
		const baseBranch = currentBranch || "main"

		for (let i = 0; i < specs.length; i++) {
			const spec = specs[i]
			const branchName = `roo-async/${this.parentTaskId.substring(0, 8)}/subtask-${i + 1}`
			const worktreePath = path.join(this.worktreeBasePath, `subtask-${i + 1}`)

			const status: AsyncSubtaskStatus = {
				subtaskIndex: i,
				taskId: "",
				worktreePath,
				branchName,
				provider: null as any,
				status: "pending",
			}

			try {
				// Create git worktree with a new branch
				const createResult = await worktreeService.createWorktree(this.parentProvider.cwd, {
					path: worktreePath,
					branch: branchName,
					baseBranch,
					createNewBranch: true,
				})

				if (!createResult.success) {
					status.status = "failed"
					status.error = createResult.message
					this.subtasks.set(`${i}`, status)
					results.push(status)
					continue
				}

				// Create a new ClineProvider for this subtask's editor tab
				const subtaskProvider = await this.createSubtaskProvider(spec, worktreePath, i)
				status.provider = subtaskProvider

				// Create the task in the subtask provider
				const task = await subtaskProvider.createTask(spec.message, undefined, undefined, {
					initialTodos: spec.todos,
					initialStatus: "active",
				})

				status.taskId = task.taskId
				status.status = "running"
				this.subtasks.set(`${i}`, status)
				results.push(status)

				// Listen for task completion
				this.listenForSubtaskCompletion(subtaskProvider, `${i}`, task.taskId)

				// Emit event
				this.parentProvider.emit(
					RooCodeEventName.AsyncSubtaskSpawned,
					this.parentTaskId,
					task.taskId,
					worktreePath,
					branchName,
				)
			} catch (error) {
				status.status = "failed"
				status.error = error instanceof Error ? error.message : String(error)
				this.subtasks.set(`${i}`, status)
				results.push(status)
			}
		}

		return results
	}

	/**
	 * Create a ClineProvider instance for a subtask editor tab.
	 */
	private async createSubtaskProvider(
		spec: AsyncSubtaskSpec,
		worktreePath: string,
		index: number,
	): Promise<ClineProvider> {
		const { ClineProvider } = await import("../webview/ClineProvider")
		const { ContextProxy } = await import("../config/ContextProxy")
		const worktreeContextProxy = new ContextProxy(this.parentProvider.context)

		const provider = new ClineProvider(
			this.parentProvider.context,
			(this.parentProvider as any).outputChannel,
			"editor",
			worktreeContextProxy,
		)

		provider.configureInstance({ mode: spec.mode as any })

		const { default: vscode } = await import("vscode")
		const panel = (vscode as any).window.createWebviewPanel(
			ClineProvider.tabPanelId,
			`Roo Code — Async Subtask ${index + 1}`,
			(vscode as any).ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [this.parentProvider.context.extensionUri],
			},
		)

		await provider.resolveWebviewView(panel)

		return provider
	}

	/**
	 * Listen for subtask completion events.
	 */
	private listenForSubtaskCompletion(provider: ClineProvider, subtaskKey: string, taskId: string): void {
		const onCompleted = (completedTaskId: string) => {
			if (completedTaskId !== taskId) return

			const status = this.subtasks.get(subtaskKey)
			if (status) {
				status.status = "completed"
				this.checkAllSubtasksComplete()
			}

			this.parentProvider.emit(
				RooCodeEventName.AsyncSubtaskCompleted,
				this.parentTaskId,
				completedTaskId,
				"",
			)
		}

		const onAborted = (abortedTaskId: string) => {
			if (abortedTaskId !== taskId) return

			const status = this.subtasks.get(subtaskKey)
			if (status) {
				status.status = "failed"
				status.error = "Task was aborted"
				this.checkAllSubtasksComplete()
			}

			this.parentProvider.emit(
				RooCodeEventName.AsyncSubtaskFailed,
				this.parentTaskId,
				abortedTaskId,
				"Task was aborted",
			)
		}

		provider.on(RooCodeEventName.TaskCompleted, onCompleted)
		provider.on(RooCodeEventName.TaskAborted, onAborted)
	}

	/**
	 * Check if all subtasks have completed (or failed).
	 * If so, trigger the merge phase.
	 */
	private checkAllSubtasksComplete(): void {
		if (this.mergeInProgress) return

		const allDone = Array.from(this.subtasks.values()).every(
			(s) => s.status === "completed" || s.status === "failed",
		)

		if (allDone) {
			this.mergeInProgress = true
			this.parentProvider.emit(RooCodeEventName.AsyncSubtasksAllCompleted, this.parentTaskId)
			this.triggerMergePhase().catch((error) => {
				console.error(`[AsyncSubtaskManager] Merge phase error: ${error}`)
			})
		}
	}

	/**
	 * Trigger the merge phase: merge all completed subtask branches back into the main branch.
	 */
	private async triggerMergePhase(): Promise<void> {
		this.parentProvider.emit(RooCodeEventName.MergeStarted, this.parentTaskId)

		try {
			const completedSubtasks = Array.from(this.subtasks.values()).filter(
				(s) => s.status === "completed",
			)

			const mergedBranches: string[] = []
			const mergeErrors: string[] = []

			for (const subtask of completedSubtasks) {
				try {
					const mergeResult = await this.mergeBranch(subtask.branchName)
					if (mergeResult.success) {
						mergedBranches.push(subtask.branchName)
					} else {
						mergeErrors.push(`Failed to merge ${subtask.branchName}: ${mergeResult.error}`)
					}
				} catch (error) {
					mergeErrors.push(
						`Error merging ${subtask.branchName}: ${error instanceof Error ? error.message : String(error)}`,
					)
				}
			}

			await this.cleanupWorktrees()

			const summary = this.buildMergeSummary(mergedBranches, mergeErrors)

			if (mergeErrors.length > 0) {
				this.parentProvider.emit(RooCodeEventName.MergeFailed, this.parentTaskId, summary)
			} else {
				this.parentProvider.emit(RooCodeEventName.MergeCompleted, this.parentTaskId, summary)
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			this.parentProvider.emit(RooCodeEventName.MergeFailed, this.parentTaskId, errorMessage)
		}
	}

	/**
	 * Merge a single branch into the current branch.
	 */
	private async mergeBranch(branchName: string): Promise<{ success: true } | { success: false; error: string }> {
		try {
			const cwd = this.parentProvider.cwd
			const { execFile } = await import("child_process")
			const { promisify } = await import("util")
			const execFileAsync = promisify(execFile)

			await execFileAsync("git", ["merge", branchName, "--no-edit"], { cwd })

			return { success: true }
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)

			if (errorMessage.includes("CONFLICT") || errorMessage.includes("Automatic merge failed")) {
				try {
					const { execFile } = await import("child_process")
					const { promisify } = await import("util")
					const execFileAsync = promisify(execFile)
					await execFileAsync("git", ["merge", "--abort"], { cwd: this.parentProvider.cwd })
				} catch {
					// Best effort abort
				}
				return { success: false, error: `Merge conflict: ${errorMessage}` }
			}

			return { success: false, error: errorMessage }
		}
	}

	/**
	 * Clean up all subtask worktrees.
	 */
	private async cleanupWorktrees(): Promise<void> {
		for (const subtask of this.subtasks.values()) {
			try {
				await worktreeService.deleteWorktree(this.parentProvider.cwd, subtask.worktreePath, true)
			} catch {
				// Best effort cleanup
			}
		}
	}

	/**
	 * Build a human-readable merge summary.
	 */
	private buildMergeSummary(mergedBranches: string[], errors: string[]): string {
		const lines: string[] = []

		if (mergedBranches.length > 0) {
			lines.push(`Successfully merged ${mergedBranches.length} branch(es):`)
			for (const branch of mergedBranches) {
				lines.push(`  - ${branch}`)
			}
		}

		if (errors.length > 0) {
			lines.push(`\nMerge errors (${errors.length}):`)
			for (const error of errors) {
				lines.push(`  - ${error}`)
			}
		}

		return lines.join("\n")
	}

	/**
	 * Get the current status of all subtasks.
	 */
	getProgress(): AsyncSubtaskStatus[] {
		return Array.from(this.subtasks.values())
	}

	/**
	 * Get the parent task ID.
	 */
	getParentTaskId(): string {
		return this.parentTaskId
	}
}
