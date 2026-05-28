import { describe, it, expect, vi, beforeEach } from "vitest"

import { asyncTaskTool } from "../AsyncTaskTool"
import { ToolUse } from "../../../shared/tools"
import { Task } from "../../task/Task"
import { formatResponse } from "../../prompts/responses"
import { EXPERIMENT_IDS } from "../../../shared/experiments"

describe("asyncTaskTool", () => {
	let mockCline: any
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any

	beforeEach(() => {
		vi.clearAllMocks()

		mockCline = {
			cwd: "/test/workspace",
			taskId: "test-task-id",
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			recordToolUsage: vi.fn(),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
			say: vi.fn(),
			ask: vi.fn().mockResolvedValue(true),
			rooIgnoreController: {
				validateAccess: vi.fn().mockReturnValue(true),
			},
			providerRef: {
				deref: vi.fn().mockReturnValue({
					getState: vi.fn().mockResolvedValue({
						experiments: {
							[EXPERIMENT_IDS.ASYNC_SUBTASKS]: true,
						},
						customModes: [],
					}),
				}),
			},
		}

		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()
	})

	describe("experiment validation", () => {
		it("should error when async subtasks experiment is disabled", async () => {
			// Disable the experiment
			mockCline.providerRef.deref().getState.mockResolvedValue({
				experiments: {
					[EXPERIMENT_IDS.ASYNC_SUBTASKS]: false,
				},
				customModes: [],
			})

			const block: ToolUse = {
				type: "tool_use",
				name: "async_task",
				params: {
					subtasks: JSON.stringify([
						{ mode: "code", message: "Do task 1" },
						{ mode: "code", message: "Do task 2" },
					]),
				},
				nativeArgs: {
					subtasks: [
						{ mode: "code", message: "Do task 1" },
						{ mode: "code", message: "Do task 2" },
					],
				},
				partial: false,
			}

			await asyncTaskTool.handle(mockCline as Task, block as ToolUse<"async_task">, {
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
			// No experiments configured — should default to false
			mockCline.providerRef.deref().getState.mockResolvedValue({
				experiments: {},
				customModes: [],
			})

			const block: ToolUse = {
				type: "tool_use",
				name: "async_task",
				params: {
					subtasks: JSON.stringify([
						{ mode: "code", message: "Do task 1" },
						{ mode: "code", message: "Do task 2" },
					]),
				},
				nativeArgs: {
					subtasks: [
						{ mode: "code", message: "Do task 1" },
						{ mode: "code", message: "Do task 2" },
					],
				},
				partial: false,
			}

			await asyncTaskTool.handle(mockCline as Task, block as ToolUse<"async_task">, {
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
})
