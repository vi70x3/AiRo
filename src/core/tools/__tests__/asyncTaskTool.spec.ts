import { describe, it, expect, vi, beforeEach } from "vitest"

import { asyncTaskTool, AsyncTaskTool } from "../AsyncTaskTool"
import { ToolUse } from "../../../shared/tools"
import { Task } from "../../task/Task"
import { formatResponse } from "../../prompts/responses"
import { EXPERIMENT_IDS, experiments } from "../../../shared/experiments"
import { getModeBySlug } from "../../../shared/modes"
import { parseMarkdownChecklist } from "../UpdateTodoListTool"
import { RooCodeEventName } from "@roo-code/types"
import * as vscode from "vscode"

// Mock internal modules that are imported by AsyncTaskTool
vi.mock("../../../shared/modes", () => ({
	getModeBySlug: vi.fn(),
}))

vi.mock("../UpdateTodoListTool", () => ({
	parseMarkdownChecklist: vi.fn(),
}))

vi.mock("../../../shared/experiments", () => ({
	EXPERIMENT_IDS: {
		ASYNC_SUBTASKS: "asyncSubtasks",
	},
	experiments: {
		isEnabled: vi.fn(),
	},
}))

describe("asyncTaskTool", () => {
	let mockTask: any
	let mockProvider: any
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any

	beforeEach(() => {
		vi.clearAllMocks()

		// Reset vscode workspace.getConfiguration to default
		vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
			get: vi.fn().mockReturnValue(false),
		} as any)

		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()

		mockProvider = {
			getState: vi.fn().mockResolvedValue({
				experiments: {
					[EXPERIMENT_IDS.ASYNC_SUBTASKS]: true,
				},
				customModes: [],
			}),
			getAsyncSubtaskManager: vi.fn(),
			once: vi.fn(),
			on: vi.fn(),
			off: vi.fn(),
			emit: vi.fn(),
		}

		mockTask = {
			taskId: "test-task-id",
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			didToolFailInCurrentTurn: false,
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
			abort: false,
			abortReason: undefined,
			apiConversationHistory: [],
			overwriteApiConversationHistory: vi.fn().mockResolvedValue(undefined),
			initiateTaskLoop: vi.fn().mockResolvedValue(undefined),
			providerRef: {
				deref: vi.fn().mockReturnValue(mockProvider),
			},
		}

		// Default: experiment enabled
		vi.mocked(experiments.isEnabled).mockReturnValue(true)

		// Default: getModeBySlug returns a valid mode
		vi.mocked(getModeBySlug).mockReturnValue({ name: "Code", slug: "code" })

		// Default: parseMarkdownChecklist returns empty array
		vi.mocked(parseMarkdownChecklist).mockReturnValue([])
	})

	// Helper to build a ToolUse block with nativeArgs
	const buildBlock = (nativeArgs: any, partial = false): ToolUse =>
		({
			type: "tool_use",
			name: "async_task",
			params: {},
			nativeArgs,
			partial,
		}) as unknown as ToolUse

	const buildSubtask = (overrides: any = {}) => ({
		mode: "code",
		message: "Do something",
		...overrides,
	})

	// ─────────────────────────────────────────────────────────────
	// A. Parameter Validation Tests
	// ─────────────────────────────────────────────────────────────
	describe("parameter validation", () => {
		it("should error when subtasks is undefined", async () => {
			const block = buildBlock({ subtasks: undefined })

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("async_task")
			expect(mockTask.didToolFailInCurrentTurn).toBe(true)
			expect(mockPushToolResult).toHaveBeenCalledWith("Missing parameter error")
		})

		it("should error when subtasks is an empty array", async () => {
			const block = buildBlock({ subtasks: [] })

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockPushToolResult).toHaveBeenCalledWith("Missing parameter error")
		})

		it("should error when subtasks is not an array (wrong key)", async () => {
			const block = buildBlock({ wrongKey: "not-an-array" })

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockPushToolResult).toHaveBeenCalledWith("Missing parameter error")
		})

		it("should error when subtasks has only 1 item (requires at least 2)", async () => {
			const block = buildBlock({ subtasks: [buildSubtask()] })

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockPushToolResult).toHaveBeenCalledWith(
				formatResponse.toolError(
					"async_task requires at least 2 subtasks. Use new_task for a single subtask.",
				),
			)
		})

		it("should error when subtasks has 6 items (exceeds max of 5)", async () => {
			const subtasks = Array.from({ length: 6 }, (_, i) =>
				buildSubtask({ message: `Task ${i + 1}` }),
			)
			const block = buildBlock({ subtasks })

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockPushToolResult).toHaveBeenCalledWith(
				formatResponse.toolError(
					"async_task supports a maximum of 5 subtasks. You provided 6.",
				),
			)
		})
	})

	// ─────────────────────────────────────────────────────────────
	// B. Provider / Experiment Validation Tests
	// ─────────────────────────────────────────────────────────────
	describe("provider and experiment validation", () => {
		it("should error when providerRef.deref() returns null", async () => {
			mockTask.providerRef.deref.mockReturnValue(null)
			const block = buildBlock({
				subtasks: [buildSubtask(), buildSubtask({ message: "Task 2" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockPushToolResult).toHaveBeenCalledWith(
				formatResponse.toolError("Provider reference lost"),
			)
		})

		it("should error when async subtasks experiment is disabled", async () => {
			vi.mocked(experiments.isEnabled).mockReturnValue(false)

			const block = buildBlock({
				subtasks: [buildSubtask(), buildSubtask({ message: "Task 2" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockPushToolResult).toHaveBeenCalledWith(
				formatResponse.toolError(
					"Async subtasks is an experimental feature that must be enabled in settings. Please enable 'Async Subtasks' in the Experimental Settings section.",
				),
			)
		})

		it("should error when async subtasks experiment is not present (defaults to disabled)", async () => {
			mockProvider.getState.mockResolvedValue({
				experiments: {},
				customModes: [],
			})
			vi.mocked(experiments.isEnabled).mockReturnValue(false)

			const block = buildBlock({
				subtasks: [buildSubtask(), buildSubtask({ message: "Task 2" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockPushToolResult).toHaveBeenCalledWith(
				formatResponse.toolError(
					"Async subtasks is an experimental feature that must be enabled in settings. Please enable 'Async Subtasks' in the Experimental Settings section.",
				),
			)
		})
	})

	// ─────────────────────────────────────────────────────────────
	// C. Subtask Validation Tests
	// ─────────────────────────────────────────────────────────────
	describe("subtask validation", () => {
		it("should error when subtask is missing mode", async () => {
			const block = buildBlock({
				subtasks: [buildSubtask({ mode: "" }), buildSubtask({ message: "Task 2" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockPushToolResult).toHaveBeenCalledWith(
				formatResponse.toolError("Subtask 1: missing required parameter 'mode'"),
			)
		})

		it("should error when subtask is missing message", async () => {
			const block = buildBlock({
				subtasks: [buildSubtask(), buildSubtask({ message: "" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockPushToolResult).toHaveBeenCalledWith(
				formatResponse.toolError("Subtask 2: missing required parameter 'message'"),
			)
		})

		it("should error when requireTodos is true and subtask is missing todos", async () => {
			vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
				get: vi.fn().mockReturnValue(true),
			} as any)

			const block = buildBlock({
				subtasks: [buildSubtask(), buildSubtask({ message: "Task 2" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockPushToolResult).toHaveBeenCalledWith(
				formatResponse.toolError("Subtask 1: missing required parameter 'todos'"),
			)
		})

		it("should error when todos has invalid format (parseMarkdownChecklist throws)", async () => {
			vi.mocked(parseMarkdownChecklist).mockImplementation(() => {
				throw new Error("Invalid checklist format")
			})

			const block = buildBlock({
				subtasks: [
					buildSubtask({ todos: "not a checklist" }),
					buildSubtask({ message: "Task 2" }),
				],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockPushToolResult).toHaveBeenCalledWith(
				formatResponse.toolError(
					"Subtask 1: invalid format: must be a markdown checklist",
				),
			)
		})

		it("should error when subtask has invalid mode slug", async () => {
			vi.mocked(getModeBySlug).mockReturnValue(undefined)

			const block = buildBlock({
				subtasks: [buildSubtask({ mode: "nonexistent-mode" }), buildSubtask({ message: "Task 2" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockPushToolResult).toHaveBeenCalledWith(
				formatResponse.toolError("Subtask 1: invalid mode 'nonexistent-mode'"),
			)
		})

		it("should reset consecutiveMistakeCount to 0 when all subtasks pass validation", async () => {
			vi.mocked(getModeBySlug).mockReturnValue({ name: "Code", slug: "code" })

			const mockAsyncManager = {
				spawnSubtasks: vi.fn().mockResolvedValue([
					{ status: "running", subtaskIndex: 0 },
					{ status: "running", subtaskIndex: 1 },
				]),
			}
			mockProvider.getAsyncSubtaskManager.mockReturnValue(mockAsyncManager)

			const block = buildBlock({
				subtasks: [buildSubtask(), buildSubtask({ message: "Task 2" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockTask.consecutiveMistakeCount).toBe(0)
		})
	})

	// ─────────────────────────────────────────────────────────────
	// D. Approval Tests
	// ─────────────────────────────────────────────────────────────
	describe("approval", () => {
		it("should return without pushing tool result when approval is denied", async () => {
			mockAskApproval.mockResolvedValue(false)

			const block = buildBlock({
				subtasks: [buildSubtask(), buildSubtask({ message: "Task 2" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockAskApproval).toHaveBeenCalled()
			// When approval denied, execute returns early — no pushToolResult from execute itself
			expect(mockPushToolResult).not.toHaveBeenCalled()
		})

		it("should continue to spawn phase when approval is granted", async () => {
			mockAskApproval.mockResolvedValue(true)

			const mockAsyncManager = {
				spawnSubtasks: vi.fn().mockResolvedValue([
					{ status: "running", subtaskIndex: 0 },
				]),
			}
			mockProvider.getAsyncSubtaskManager.mockReturnValue(mockAsyncManager)

			const block = buildBlock({
				subtasks: [buildSubtask(), buildSubtask({ message: "Task 2" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockAskApproval).toHaveBeenCalled()
			expect(mockAsyncManager.spawnSubtasks).toHaveBeenCalled()
		})
	})

	// ─────────────────────────────────────────────────────────────
	// E. Subtask Spawning Tests
	// ─────────────────────────────────────────────────────────────
	describe("subtask spawning", () => {
		it("should error when getAsyncSubtaskManager returns null", async () => {
			mockProvider.getAsyncSubtaskManager.mockReturnValue(null)

			const block = buildBlock({
				subtasks: [buildSubtask(), buildSubtask({ message: "Task 2" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockPushToolResult).toHaveBeenCalledWith(
				formatResponse.toolError("Async subtask manager not available"),
			)
		})

		it("should error when all subtasks fail to start (runningCount === 0)", async () => {
			const mockAsyncManager = {
				spawnSubtasks: vi.fn().mockResolvedValue([
					{ status: "failed", subtaskIndex: 0, error: "spawn error 1" },
					{ status: "failed", subtaskIndex: 1, error: "spawn error 2" },
				]),
			}
			mockProvider.getAsyncSubtaskManager.mockReturnValue(mockAsyncManager)

			const block = buildBlock({
				subtasks: [buildSubtask(), buildSubtask({ message: "Task 2" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockPushToolResult).toHaveBeenCalledWith(
				formatResponse.toolError(
					"All subtasks failed to start:\nSubtask 1: spawn error 1\nSubtask 2: spawn error 2",
				),
			)
		})

		it("should report partial success when some subtasks fail and some run", async () => {
			const mockAsyncManager = {
				spawnSubtasks: vi.fn().mockResolvedValue([
					{ status: "running", subtaskIndex: 0 },
					{ status: "failed", subtaskIndex: 1, error: "spawn error" },
				]),
			}
			mockProvider.getAsyncSubtaskManager.mockReturnValue(mockAsyncManager)

			const block = buildBlock({
				subtasks: [buildSubtask(), buildSubtask({ message: "Task 2" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Spawned 1 async subtask(s) in parallel (1 failed to start)"),
			)
		})

		it("should succeed when all subtasks are running, abort task, and setup completion callback", async () => {
			const mockAsyncManager = {
				spawnSubtasks: vi.fn().mockResolvedValue([
					{ status: "running", subtaskIndex: 0 },
					{ status: "running", subtaskIndex: 1 },
				]),
			}
			mockProvider.getAsyncSubtaskManager.mockReturnValue(mockAsyncManager)

			const block = buildBlock({
				subtasks: [buildSubtask(), buildSubtask({ message: "Task 2" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			// Task should be aborted
			expect(mockTask.abort).toBe(true)
			expect(mockTask.abortReason).toBe("async_subtasks_running")

			// Completion callback should be set up
			expect(mockProvider.once).toHaveBeenCalledWith(
				RooCodeEventName.AsyncSubtasksAllCompleted,
				expect.any(Function),
			)

			// Success message pushed
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Spawned 2 async subtask(s) in parallel"),
			)
		})
	})

	// ─────────────────────────────────────────────────────────────
	// F. handlePartial Tests
	// ─────────────────────────────────────────────────────────────
	describe("handlePartial", () => {
		// handlePartial reads from block.params.subtasks (not nativeArgs)
		const buildPartialBlock = (params: any, partial = true): ToolUse =>
			({
				type: "tool_use",
				name: "async_task",
				params,
				nativeArgs: {},
				partial,
			}) as unknown as ToolUse

		it("should call task.ask with JSON containing subtaskCount when subtasks array is present", async () => {
			const subtasks = [buildSubtask(), buildSubtask({ message: "Task 2" })]
			const block = buildPartialBlock({ subtasks }, true)
			;(mockTask.ask as any) = vi.fn().mockResolvedValue(undefined)

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockTask.ask).toHaveBeenCalledWith(
				"tool",
				JSON.stringify({ tool: "asyncTask", subtaskCount: 2 }),
				true,
			)
		})

		it("should report subtaskCount as 0 when subtasks is not present", async () => {
			const block = buildPartialBlock({}, true)
			;(mockTask.ask as any) = vi.fn().mockResolvedValue(undefined)

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockTask.ask).toHaveBeenCalledWith(
				"tool",
				JSON.stringify({ tool: "asyncTask", subtaskCount: 0 }),
				true,
			)
		})
	})

	// ─────────────────────────────────────────────────────────────
	// G. buildResultMessage Tests (tested via completion callback)
	// ─────────────────────────────────────────────────────────────
	describe("buildResultMessage (via prototype access)", () => {
		// Access the private method via the prototype for direct testing
		const getBuildResultMessage = () => {
			return (AsyncTaskTool.prototype as any).buildResultMessage.bind(asyncTaskTool)
		}

		it("should include COMPLETED status for each subtask when all complete", () => {
			const buildResultMessage = getBuildResultMessage()
			const progress = [
				{ subtaskIndex: 0, status: "completed", branchName: "branch-1" },
				{ subtaskIndex: 1, status: "completed", branchName: "branch-2" },
			]
			const mergeSummary = "Merge successful: 2 branches merged"

			const result = buildResultMessage(progress, mergeSummary)

			expect(result).toContain("All async subtasks have completed.")
			expect(result).toContain("Subtask 1: COMPLETED (branch: branch-1)")
			expect(result).toContain("Subtask 2: COMPLETED (branch: branch-2)")
			expect(result).toContain("Merge Results:")
			expect(result).toContain("Merge successful: 2 branches merged")
		})

		it("should include FAILED status for subtasks that failed", () => {
			const buildResultMessage = getBuildResultMessage()
			const progress = [
				{ subtaskIndex: 0, status: "completed", branchName: "branch-1" },
				{ subtaskIndex: 1, status: "failed", error: "Something went wrong" },
			]
			const mergeSummary = "Merge completed with warnings"

			const result = buildResultMessage(progress, mergeSummary)

			expect(result).toContain("Subtask 1: COMPLETED (branch: branch-1)")
			expect(result).toContain("Subtask 2: FAILED - Something went wrong")
		})

		it("should show FAILED with 'Unknown error' when error is falsy", () => {
			const buildResultMessage = getBuildResultMessage()
			const progress = [
				{ subtaskIndex: 0, status: "failed" },
			]
			const mergeSummary = "Merge failed"

			const result = buildResultMessage(progress, mergeSummary)

			expect(result).toContain("Subtask 1: FAILED - Unknown error")
		})
	})

	// ─────────────────────────────────────────────────────────────
	// H. resumeParentWithResults Tests (tested via completion callback)
	// ─────────────────────────────────────────────────────────────
	describe("resumeParentWithResults (via prototype access)", () => {
		const getResumeParentWithResults = () => {
			return (AsyncTaskTool.prototype as any).resumeParentWithResults.bind(asyncTaskTool)
		}

		it("should inject tool_result when tool_use_id is found in history", async () => {
			const resumeParentWithResults = getResumeParentWithResults()
			const apiHistory = [
				{
					role: "assistant",
					content: [
						{ type: "text", text: "I'll spawn tasks" },
						{ type: "tool_use", name: "async_task", id: "tool-use-123", input: {} },
					],
				},
			]
			mockTask.apiConversationHistory = apiHistory

			await resumeParentWithResults(mockTask, "All async subtasks have completed.")

			expect(mockTask.overwriteApiConversationHistory).toHaveBeenCalled()
			const newHistory = mockTask.overwriteApiConversationHistory.mock.calls[0][0]
			const lastMsg = newHistory[newHistory.length - 1]
			expect(lastMsg.role).toBe("user")
			expect(lastMsg.content[0].type).toBe("tool_result")
			expect(lastMsg.content[0].tool_use_id).toBe("tool-use-123")
			expect(lastMsg.content[0].content).toContain("All async subtasks have completed")
		})

		it("should inject as plain text when no tool_use_id is found in history", async () => {
			const resumeParentWithResults = getResumeParentWithResults()
			const apiHistory = [
				{
					role: "assistant",
					content: [
						{ type: "text", text: "Some message without tool use" },
					],
				},
			]
			mockTask.apiConversationHistory = apiHistory

			await resumeParentWithResults(mockTask, "All async subtasks have completed.")

			expect(mockTask.overwriteApiConversationHistory).toHaveBeenCalled()
			const newHistory = mockTask.overwriteApiConversationHistory.mock.calls[0][0]
			const lastMsg = newHistory[newHistory.length - 1]
			expect(lastMsg.role).toBe("user")
			expect(lastMsg.content[0].type).toBe("text")
			expect(lastMsg.content[0].text).toContain("All async subtasks have completed")
		})

		it("should replace existing tool_result content for the same tool_use_id", async () => {
			const resumeParentWithResults = getResumeParentWithResults()
			const apiHistory = [
				{
					role: "assistant",
					content: [
						{ type: "tool_use", name: "async_task", id: "tool-use-456", input: {} },
					],
				},
				{
					role: "user",
					content: [
						{ type: "tool_result", tool_use_id: "tool-use-456", content: "old result" },
					],
				},
			]
			mockTask.apiConversationHistory = apiHistory

			await resumeParentWithResults(mockTask, "All async subtasks have completed.")

			expect(mockTask.overwriteApiConversationHistory).toHaveBeenCalled()
			const newHistory = mockTask.overwriteApiConversationHistory.mock.calls[0][0]
			// The last message should have the updated content
			const lastMsg = newHistory[newHistory.length - 1]
			expect(lastMsg.role).toBe("user")
			expect(lastMsg.content[0].type).toBe("tool_result")
			expect(lastMsg.content[0].tool_use_id).toBe("tool-use-456")
			expect(lastMsg.content[0].content).toContain("All async subtasks have completed")
			// Should NOT contain the old content
			expect(lastMsg.content[0].content).not.toBe("old result")
		})

		it("should reset abort state and call initiateTaskLoop after resuming", async () => {
			const resumeParentWithResults = getResumeParentWithResults()
			mockTask.apiConversationHistory = []
			mockTask.abort = true
			;(mockTask as any).abortReason = "async_subtasks_running"

			await resumeParentWithResults(mockTask, "result message")

			expect(mockTask.abort).toBe(false)
			expect(mockTask.abortReason).toBeUndefined()
			expect(mockTask.initiateTaskLoop).toHaveBeenCalledWith([])
		})

		it("should append new user message with tool_result when tool_use_id found but no matching tool_result in last msg", async () => {
			const resumeParentWithResults = getResumeParentWithResults()
			const apiHistory = [
				{
					role: "assistant",
					content: [
						{ type: "tool_use", name: "async_task", id: "tool-use-789", input: {} },
					],
				},
				{
					role: "user",
					content: [
						{ type: "text", text: "some other content" },
					],
				},
			]
			mockTask.apiConversationHistory = apiHistory
	
			await resumeParentWithResults(mockTask, "All async subtasks have completed.")
	
			const newHistory = mockTask.overwriteApiConversationHistory.mock.calls[0][0]
			// When no matching tool_result exists, a new user message is appended
			expect(newHistory.length).toBe(3) // original 2 messages + new tool_result message
			const newMsg = newHistory[newHistory.length - 1]
			expect(newMsg.role).toBe("user")
			expect(newMsg.content[0].type).toBe("tool_result")
			expect(newMsg.content[0].tool_use_id).toBe("tool-use-789")
			expect(newMsg.content[0].content).toBe("All async subtasks have completed.")
		})
	})

	// ─────────────────────────────────────────────────────────────
	// Edge Cases
	// ─────────────────────────────────────────────────────────────
	describe("edge cases", () => {
		it("should handle exactly 2 subtasks (minimum valid)", async () => {
			const mockAsyncManager = {
				spawnSubtasks: vi.fn().mockResolvedValue([
					{ status: "running", subtaskIndex: 0 },
					{ status: "running", subtaskIndex: 1 },
				]),
			}
			mockProvider.getAsyncSubtaskManager.mockReturnValue(mockAsyncManager)

			const block = buildBlock({
				subtasks: [buildSubtask(), buildSubtask({ message: "Task 2" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockAsyncManager.spawnSubtasks).toHaveBeenCalled()
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Spawned 2 async subtask(s) in parallel"),
			)
		})

		it("should handle exactly 5 subtasks (maximum valid)", async () => {
			const subtasks = Array.from({ length: 5 }, (_, i) =>
				buildSubtask({ message: `Task ${i + 1}` }),
			)
			const mockAsyncManager = {
				spawnSubtasks: vi.fn().mockResolvedValue(
					Array.from({ length: 5 }, (_, i) => ({ status: "running", subtaskIndex: i })),
				),
			}
			mockProvider.getAsyncSubtaskManager.mockReturnValue(mockAsyncManager)

			const block = buildBlock({ subtasks })

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockAsyncManager.spawnSubtasks).toHaveBeenCalled()
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Spawned 5 async subtask(s) in parallel"),
			)
		})

		it("should handle subtask with valid todos (markdown checklist)", async () => {
			vi.mocked(parseMarkdownChecklist).mockReturnValue([
				{ id: "1", content: "Step 1", status: "pending" },
			])

			const mockAsyncManager = {
				spawnSubtasks: vi.fn().mockResolvedValue([
					{ status: "running", subtaskIndex: 0 },
					{ status: "running", subtaskIndex: 1 },
				]),
			}
			mockProvider.getAsyncSubtaskManager.mockReturnValue(mockAsyncManager)

			const block = buildBlock({
				subtasks: [
					buildSubtask({ todos: "- [ ] Step 1" }),
					buildSubtask({ message: "Task 2" }),
				],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(parseMarkdownChecklist).toHaveBeenCalledWith("- [ ] Step 1")
			expect(mockAsyncManager.spawnSubtasks).toHaveBeenCalled()
		})

		it("should handle subtask without todos when requireTodos is false", async () => {
			const mockAsyncManager = {
				spawnSubtasks: vi.fn().mockResolvedValue([
					{ status: "running", subtaskIndex: 0 },
					{ status: "running", subtaskIndex: 1 },
				]),
			}
			mockProvider.getAsyncSubtaskManager.mockReturnValue(mockAsyncManager)

			const block = buildBlock({
				subtasks: [buildSubtask(), buildSubtask({ message: "Task 2" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			// parseMarkdownChecklist should NOT be called since no todos provided
			expect(parseMarkdownChecklist).not.toHaveBeenCalled()
			expect(mockAsyncManager.spawnSubtasks).toHaveBeenCalled()
		})

		it("should handle errors via handleError callback", async () => {
			// Force an error by making provider.getState() throw
			mockProvider.getState.mockRejectedValue(new Error("State error"))

			const block = buildBlock({
				subtasks: [buildSubtask(), buildSubtask({ message: "Task 2" })],
			})

			await asyncTaskTool.handle(mockTask as Task, block as ToolUse<"async_task">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockHandleError).toHaveBeenCalledWith(
				"creating async tasks",
				expect.any(Error),
			)
		})
	})
})
