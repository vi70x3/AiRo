// npx vitest run src/core/tools/__tests__/SwitchModeTool.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest"

import { SwitchModeTool } from "../SwitchModeTool"
import { Task } from "../../task/Task"
import { formatResponse } from "../../prompts/responses"

// Mock Task
function createMockTask(overrides: Partial<Task> = {}): Task {
	const mockTask = {
		taskId: "test-task",
		instanceId: "test-instance",
		consecutiveMistakeCount: 0,
		didToolFailInCurrentTurn: false,
		recordToolError: vi.fn(),
		sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing param error"),
		providerRef: {
			deref: vi.fn().mockReturnValue({
				getState: vi.fn().mockResolvedValue({
					modeSwitchingEnabled: true,
					mode: "code",
					customModes: [],
				}),
				handleModeSwitch: vi.fn().mockResolvedValue(undefined),
			}),
		},
		ask: vi.fn().mockResolvedValue({ response: "yesButtonClicked" }),
		say: vi.fn().mockResolvedValue(undefined),
		...overrides,
	} as unknown as Task

	return mockTask
}

describe("SwitchModeTool", () => {
	let switchModeTool: SwitchModeTool

	beforeEach(() => {
		switchModeTool = new SwitchModeTool()
	})

	describe("execute", () => {
		it("returns error when modeSwitchingEnabled is false", async () => {
			const task = createMockTask({
				providerRef: {
					deref: vi.fn().mockReturnValue({
						getState: vi.fn().mockResolvedValue({
							modeSwitchingEnabled: false,
							mode: "code",
							customModes: [],
						}),
						handleModeSwitch: vi.fn().mockResolvedValue(undefined),
					}),
				},
			})

			const pushToolResult = vi.fn()
			const askApproval = vi.fn().mockResolvedValue(true)
			const handleError = vi.fn()

			await switchModeTool.execute(
				{ mode_slug: "architect", reason: "testing" },
				task,
				{ askApproval, handleError, pushToolResult },
			)

			expect(task.recordToolError).toHaveBeenCalledWith("switch_mode")
			expect(task.didToolFailInCurrentTurn).toBe(true)
			expect(pushToolResult).toHaveBeenCalledWith(
				formatResponse.toolError(
					"Mode switching is disabled. Enable it in settings to allow mode switching requests.",
				),
			)
		})

		it("proceeds normally when modeSwitchingEnabled is undefined (defaults to true)", async () => {
			const task = createMockTask({
				providerRef: {
					deref: vi.fn().mockReturnValue({
						getState: vi.fn().mockResolvedValue({
							mode: "code",
							customModes: [],
						}),
						handleModeSwitch: vi.fn().mockResolvedValue(undefined),
					}),
				},
			})

			const pushToolResult = vi.fn()
			const askApproval = vi.fn().mockResolvedValue(true)
			const handleError = vi.fn()

			await switchModeTool.execute(
				{ mode_slug: "architect", reason: "testing" },
				task,
				{ askApproval, handleError, pushToolResult },
			)

			expect(task.didToolFailInCurrentTurn).toBe(false)
		})

		it("proceeds normally when modeSwitchingEnabled is true", async () => {
			const task = createMockTask()

			const pushToolResult = vi.fn()
			const askApproval = vi.fn().mockResolvedValue(true)
			const handleError = vi.fn()

			await switchModeTool.execute(
				{ mode_slug: "architect", reason: "testing" },
				task,
				{ askApproval, handleError, pushToolResult },
			)

			// Should NOT have called recordToolError for the mode switching check
			// (it may be called for other reasons like missing params, but not for the master switch)
			expect(task.didToolFailInCurrentTurn).toBe(false)
		})
	})
})
