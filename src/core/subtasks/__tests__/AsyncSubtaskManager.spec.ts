import { describe, it, expect, vi, beforeEach } from "vitest"
import * as path from "path"
import * as os from "os"

import { RooCodeEventName } from "@roo-code/types"
import { AsyncSubtaskManager } from "../AsyncSubtaskManager"

// ─── Module-level Mocks ───────────────────────────────────────────────────────

// Mock worktreeService from @roo-code/core
vi.mock("@roo-code/core", () => ({
	worktreeService: {
		getCurrentBranch: vi.fn(),
		createWorktree: vi.fn(),
		deleteWorktree: vi.fn(),
	},
}))

// Mock child_process — mergeBranch does `const { execFile } = await import("child_process")`
vi.mock("child_process", () => ({
	execFile: vi.fn(),
}))

// Mock util — mergeBranch does `const { promisify } = await import("util")`
// promisify always returns our controlled mockExecFileAsync
const { mockExecFileAsync } = vi.hoisted(() => ({
	mockExecFileAsync: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}))
vi.mock("util", () => ({
	promisify: vi.fn((fn: any) => mockExecFileAsync),
}))

// Import mocked modules after vi.mock setup
import { worktreeService } from "@roo-code/core"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockCwd = "/home/vi/test-project"
const mockParentTaskId = "task-abc12345-def67890"

function createMockParentProvider(): any {
	return {
		cwd: mockCwd,
		context: {
			extensionUri: { fsPath: "/home/vi/.vscode/extensions/roo-code" },
		} as any,
		outputChannel: { appendLine: vi.fn() } as any,
		emit: vi.fn(),
		on: vi.fn(),
		off: vi.fn(),
		once: vi.fn(),
	}
}

function createMockSubtaskProvider(taskId = "mock-task-id"): any {
	return {
		createTask: vi.fn().mockResolvedValue({ taskId }),
		emit: vi.fn(),
		on: vi.fn(),
		off: vi.fn(),
		once: vi.fn(),
		resolveWebviewView: vi.fn().mockResolvedValue(undefined),
		configureInstance: vi.fn(),
	}
}

function createManager(): AsyncSubtaskManager {
	return new AsyncSubtaskManager(createMockParentProvider(), mockParentTaskId)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AsyncSubtaskManager", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.restoreAllMocks()
		// Re-set module mock implementations (restoreAllMocks resets them)
		vi.mocked(worktreeService.getCurrentBranch).mockResolvedValue("main")
		vi.mocked(worktreeService.createWorktree).mockResolvedValue({ success: true, message: "ok" })
		vi.mocked(worktreeService.deleteWorktree).mockResolvedValue({ success: true, message: "ok" })
		// Reset mockExecFileAsync to default (success)
		mockExecFileAsync.mockReset()
		mockExecFileAsync.mockResolvedValue({ stdout: "", stderr: "" })
	})

	// ═══════════════════════════════════════════════════════════════════════════
	// A. Constructor Tests (3 tests)
	// ═══════════════════════════════════════════════════════════════════════════
	describe("constructor", () => {
		it("should set parentProvider and parentTaskId correctly", () => {
			const provider = createMockParentProvider()
			const manager = new AsyncSubtaskManager(provider, mockParentTaskId)

			expect((manager as any).parentProvider).toBe(provider)
			expect(manager.getParentTaskId()).toBe(mockParentTaskId)
		})

		it("should compute worktreeBasePath using projectName and parentTaskId substring", () => {
			const provider = createMockParentProvider()
			const manager = new AsyncSubtaskManager(provider, mockParentTaskId)

			const expectedPrefix = mockParentTaskId.substring(0, 8)
			const expectedPath = path.join(
				os.homedir(),
				".roo",
				"worktrees",
				`test-project-${expectedPrefix}`,
			)

			expect((manager as any).worktreeBasePath).toBe(expectedPath)
		})

		it("should initialize with empty subtasks map and mergeInProgress = false", () => {
			const manager = createManager()

			expect(manager.getProgress()).toEqual([])
			expect((manager as any).mergeInProgress).toBe(false)
		})
	})

	// ═══════════════════════════════════════════════════════════════════════════
	// B. spawnSubtasks Tests (9 tests)
	// ═══════════════════════════════════════════════════════════════════════════
	describe("spawnSubtasks", () => {
		let mockSubtaskProvider: any

		beforeEach(() => {
			mockSubtaskProvider = createMockSubtaskProvider()
			// STUB createSubtaskProvider — avoids loading real ClineProvider/ContextProxy/vscode
			vi.spyOn(AsyncSubtaskManager.prototype as any, "createSubtaskProvider")
				.mockResolvedValue(mockSubtaskProvider)
			// STUB listenForSubtaskCompletion — avoids attaching event listeners on real provider
			vi.spyOn(AsyncSubtaskManager.prototype as any, "listenForSubtaskCompletion")
				.mockImplementation(() => {})
		})

		it("should reset state (clears subtasks map, sets mergeInProgress = false) on each call", async () => {
			const manager = createManager()

			// Pre-populate state
			;(manager as any).mergeInProgress = true
			;(manager as any).subtasks.set("old", {
				subtaskIndex: 0,
				taskId: "old-task",
				worktreePath: "/old",
				branchName: "old-branch",
				provider: null,
				status: "completed",
			})

			await manager.spawnSubtasks({
				parentTaskId: mockParentTaskId,
				subtasks: [
					{ mode: "code", message: "Task 1", todos: [] },
					{ mode: "code", message: "Task 2", todos: [] },
				],
			})

			expect((manager as any).mergeInProgress).toBe(false)
			expect(manager.getProgress().length).toBe(2)
			expect(manager.getProgress().find((s) => s.taskId === "old-task")).toBeUndefined()
		})

		it("should get current branch from worktreeService", async () => {
			const manager = createManager()

			await manager.spawnSubtasks({
				parentTaskId: mockParentTaskId,
				subtasks: [{ mode: "code", message: "Task 1", todos: [] }],
			})

			expect(worktreeService.getCurrentBranch).toHaveBeenCalledWith(mockCwd)
		})

		it('should use "main" as baseBranch when currentBranch is null', async () => {
			vi.mocked(worktreeService.getCurrentBranch).mockResolvedValue(null)

			const manager = createManager()

			await manager.spawnSubtasks({
				parentTaskId: mockParentTaskId,
				subtasks: [{ mode: "code", message: "Task 1", todos: [] }],
			})

			expect(worktreeService.createWorktree).toHaveBeenCalledWith(
				mockCwd,
				expect.objectContaining({ baseBranch: "main" }),
			)
		})

		it('should use "main" as baseBranch when currentBranch is empty string', async () => {
			vi.mocked(worktreeService.getCurrentBranch).mockResolvedValue("")

			const manager = createManager()

			await manager.spawnSubtasks({
				parentTaskId: mockParentTaskId,
				subtasks: [{ mode: "code", message: "Task 1", todos: [] }],
			})

			expect(worktreeService.createWorktree).toHaveBeenCalledWith(
				mockCwd,
				expect.objectContaining({ baseBranch: "main" }),
			)
		})

		it("should create correct branch names: roo-async/${taskIdPrefix}/subtask-${i+1}", async () => {
			const manager = createManager()
			const taskIdPrefix = mockParentTaskId.substring(0, 8)

			await manager.spawnSubtasks({
				parentTaskId: mockParentTaskId,
				subtasks: [
					{ mode: "code", message: "Task 1", todos: [] },
					{ mode: "code", message: "Task 2", todos: [] },
					{ mode: "code", message: "Task 3", todos: [] },
				],
			})

			const calls = vi.mocked(worktreeService.createWorktree).mock.calls
			expect(calls[0][1].branch).toBe(`roo-async/${taskIdPrefix}/subtask-1`)
			expect(calls[1][1].branch).toBe(`roo-async/${taskIdPrefix}/subtask-2`)
			expect(calls[2][1].branch).toBe(`roo-async/${taskIdPrefix}/subtask-3`)
		})

		it("should set status to failed when worktree creation fails", async () => {
			vi.mocked(worktreeService.createWorktree).mockResolvedValue({
				success: false,
				message: "Worktree already exists",
			})

			const manager = createManager()

			const results = await manager.spawnSubtasks({
				parentTaskId: mockParentTaskId,
				subtasks: [{ mode: "code", message: "Task 1", todos: [] }],
			})

			expect(results[0].status).toBe("failed")
			expect(results[0].error).toBe("Worktree already exists")
		})

		it("should set status to running and emit AsyncSubtaskSpawned on successful spawn", async () => {
			const provider = createMockParentProvider()
			const manager = new AsyncSubtaskManager(provider, mockParentTaskId)

			const results = await manager.spawnSubtasks({
				parentTaskId: mockParentTaskId,
				subtasks: [{ mode: "code", message: "Task 1", todos: [] }],
			})

			expect(results[0].status).toBe("running")
			expect(results[0].taskId).toBe("mock-task-id")
			expect(provider.emit).toHaveBeenCalledWith(
				RooCodeEventName.AsyncSubtaskSpawned,
				mockParentTaskId,
				"mock-task-id",
				expect.any(String),
				expect.stringContaining("roo-async/"),
			)
		})

		it("should return correct AsyncSubtaskStatus array with all subtasks", async () => {
			const manager = createManager()

			const results = await manager.spawnSubtasks({
				parentTaskId: mockParentTaskId,
				subtasks: [
					{ mode: "code", message: "Task 1", todos: [] },
					{ mode: "code", message: "Task 2", todos: [] },
				],
			})

			expect(results).toHaveLength(2)
			expect(results[0].subtaskIndex).toBe(0)
			expect(results[1].subtaskIndex).toBe(1)
			expect(results[0].status).toBe("running")
			expect(results[1].status).toBe("running")
			expect(results[0].branchName).toContain("subtask-1")
			expect(results[1].branchName).toContain("subtask-2")
		})

		it("should call createSubtaskProvider and listenForSubtaskCompletion for each successful subtask", async () => {
			const createSpy = vi.spyOn(AsyncSubtaskManager.prototype as any, "createSubtaskProvider")
			const listenSpy = vi.spyOn(AsyncSubtaskManager.prototype as any, "listenForSubtaskCompletion")

			const manager = createManager()

			await manager.spawnSubtasks({
				parentTaskId: mockParentTaskId,
				subtasks: [
					{ mode: "code", message: "Task 1", todos: [] },
					{ mode: "code", message: "Task 2", todos: [] },
				],
			})

			expect(createSpy).toHaveBeenCalledTimes(2)
			expect(listenSpy).toHaveBeenCalledTimes(2)
		})

		it("should set status to failed and clean up worktree when provider/task creation fails", async () => {
			// Override createSubtaskProvider to throw for this test
			vi.spyOn(AsyncSubtaskManager.prototype as any, "createSubtaskProvider")
				.mockRejectedValueOnce(new Error("Provider creation failed"))

			const manager = createManager()

			const results = await manager.spawnSubtasks({
				parentTaskId: mockParentTaskId,
				subtasks: [{ mode: "code", message: "Task 1", todos: [] }],
			})

			expect(results[0].status).toBe("failed")
			expect(results[0].error).toBe("Provider creation failed")
			expect(worktreeService.deleteWorktree).toHaveBeenCalledWith(
				mockCwd,
				expect.any(String),
				true,
			)
		})
	})

	// ═══════════════════════════════════════════════════════════════════════════
	// C. listenForSubtaskCompletion Tests (3 tests)
	// ═══════════════════════════════════════════════════════════════════════════
	describe("listenForSubtaskCompletion", () => {
		// Call the real method directly with a mock provider.
		// Stub checkAllSubtasksComplete to prevent merge side effects.
		beforeEach(() => {
			vi.spyOn(AsyncSubtaskManager.prototype as any, "checkAllSubtasksComplete")
				.mockImplementation(() => {})
		})

		it("should set status to completed and emit AsyncSubtaskCompleted on TaskCompleted for matching taskId", () => {
			const provider = createMockParentProvider()
			const manager = new AsyncSubtaskManager(provider, mockParentTaskId)
			const subtaskKey = "0"
			const taskId = "subtask-task-123"

			// Set up a subtask in the map
			;(manager as any).subtasks.set(subtaskKey, {
				subtaskIndex: 0,
				taskId,
				worktreePath: "/wt/subtask-1",
				branchName: "roo-async/task-abc/subtask-1",
				provider: null,
				status: "running",
			})

			// Create a mock subtask provider that captures event handlers via on()
			const onHandlers: Record<string, Function> = {}
			const mockSubtaskProvider = {
				on: vi.fn((event: string, handler: Function) => {
					onHandlers[event] = handler
				}),
				off: vi.fn(),
				once: vi.fn(),
				emit: vi.fn(),
			}

			// Call the real listenForSubtaskCompletion method
			;(manager as any).listenForSubtaskCompletion(mockSubtaskProvider, subtaskKey, taskId)

			// Simulate TaskCompleted event with matching taskId
			onHandlers[RooCodeEventName.TaskCompleted](taskId)

			const status = (manager as any).subtasks.get(subtaskKey)
			expect(status.status).toBe("completed")
			expect(provider.emit).toHaveBeenCalledWith(
				RooCodeEventName.AsyncSubtaskCompleted,
				mockParentTaskId,
				taskId,
				"",
			)
		})

		it("should set status to failed with 'Task was aborted' and emit AsyncSubtaskFailed on TaskAborted for matching taskId", () => {
			const provider = createMockParentProvider()
			const manager = new AsyncSubtaskManager(provider, mockParentTaskId)
			const subtaskKey = "0"
			const taskId = "subtask-task-456"

			;(manager as any).subtasks.set(subtaskKey, {
				subtaskIndex: 0,
				taskId,
				worktreePath: "/wt/subtask-1",
				branchName: "roo-async/task-abc/subtask-1",
				provider: null,
				status: "running",
			})

			const onHandlers: Record<string, Function> = {}
			const mockSubtaskProvider = {
				on: vi.fn((event: string, handler: Function) => {
					onHandlers[event] = handler
				}),
				off: vi.fn(),
				once: vi.fn(),
				emit: vi.fn(),
			}

			;(manager as any).listenForSubtaskCompletion(mockSubtaskProvider, subtaskKey, taskId)

			// Simulate TaskAborted event with matching taskId
			onHandlers[RooCodeEventName.TaskAborted](taskId)

			const status = (manager as any).subtasks.get(subtaskKey)
			expect(status.status).toBe("failed")
			expect(status.error).toBe("Task was aborted")
			expect(provider.emit).toHaveBeenCalledWith(
				RooCodeEventName.AsyncSubtaskFailed,
				mockParentTaskId,
				taskId,
				"Task was aborted",
			)
		})

		it("should ignore events for a different taskId (no status change)", () => {
			const provider = createMockParentProvider()
			const manager = new AsyncSubtaskManager(provider, mockParentTaskId)
			const subtaskKey = "0"
			const taskId = "correct-task-id"

			;(manager as any).subtasks.set(subtaskKey, {
				subtaskIndex: 0,
				taskId,
				worktreePath: "/wt/subtask-1",
				branchName: "roo-async/task-abc/subtask-1",
				provider: null,
				status: "running",
			})

			const onHandlers: Record<string, Function> = {}
			const mockSubtaskProvider = {
				on: vi.fn((event: string, handler: Function) => {
					onHandlers[event] = handler
				}),
				off: vi.fn(),
				once: vi.fn(),
				emit: vi.fn(),
			}

			;(manager as any).listenForSubtaskCompletion(mockSubtaskProvider, subtaskKey, taskId)

			// Fire TaskCompleted with wrong taskId
			onHandlers[RooCodeEventName.TaskCompleted]("wrong-task-id")

			const status = (manager as any).subtasks.get(subtaskKey)
			expect(status.status).toBe("running") // unchanged
		})
	})

	// ═══════════════════════════════════════════════════════════════════════════
	// D. checkAllSubtasksComplete Tests (3 tests)
	// ═══════════════════════════════════════════════════════════════════════════
	describe("checkAllSubtasksComplete", () => {
		// Stub triggerMergePhase to prevent actual merge execution
		beforeEach(() => {
			vi.spyOn(AsyncSubtaskManager.prototype as any, "triggerMergePhase")
				.mockImplementation(() => Promise.resolve())
		})

		it("should not trigger merge when not all subtasks are done", () => {
			const provider = createMockParentProvider()
			const manager = new AsyncSubtaskManager(provider, mockParentTaskId)

			;(manager as any).subtasks.set("0", {
				subtaskIndex: 0,
				taskId: "t1",
				worktreePath: "/wt/1",
				branchName: "branch-1",
				provider: null,
				status: "completed",
			})
			;(manager as any).subtasks.set("1", {
				subtaskIndex: 1,
				taskId: "t2",
				worktreePath: "/wt/2",
				branchName: "branch-2",
				provider: null,
				status: "running",
			})

			;(manager as any).checkAllSubtasksComplete()

			expect((manager as any).mergeInProgress).toBe(false)
			expect(provider.emit).not.toHaveBeenCalledWith(
				RooCodeEventName.AsyncSubtasksAllCompleted,
				expect.anything(),
			)
		})

		it("should trigger merge when all subtasks are done (completed + failed mix)", () => {
			const provider = createMockParentProvider()
			const manager = new AsyncSubtaskManager(provider, mockParentTaskId)

			;(manager as any).subtasks.set("0", {
				subtaskIndex: 0,
				taskId: "t1",
				worktreePath: "/wt/1",
				branchName: "branch-1",
				provider: null,
				status: "completed",
			})
			;(manager as any).subtasks.set("1", {
				subtaskIndex: 1,
				taskId: "t2",
				worktreePath: "/wt/2",
				branchName: "branch-2",
				provider: null,
				status: "failed",
			})

			;(manager as any).checkAllSubtasksComplete()

			expect((manager as any).mergeInProgress).toBe(true)
			expect(provider.emit).toHaveBeenCalledWith(
				RooCodeEventName.AsyncSubtasksAllCompleted,
				mockParentTaskId,
			)
		})

		it("should not trigger merge when mergeInProgress is already true (prevents double merge)", () => {
			const provider = createMockParentProvider()
			const manager = new AsyncSubtaskManager(provider, mockParentTaskId)

			;(manager as any).subtasks.set("0", {
				subtaskIndex: 0,
				taskId: "t1",
				worktreePath: "/wt/1",
				branchName: "branch-1",
				provider: null,
				status: "completed",
			})

			;(manager as any).mergeInProgress = true
			vi.mocked(provider.emit).mockClear()

			;(manager as any).checkAllSubtasksComplete()

			expect(provider.emit).not.toHaveBeenCalledWith(
				RooCodeEventName.AsyncSubtasksAllCompleted,
				expect.anything(),
			)
		})
	})

	// ═══════════════════════════════════════════════════════════════════════════
	// E. triggerMergePhase Tests (5 tests)
	// ═══════════════════════════════════════════════════════════════════════════
	describe("triggerMergePhase", () => {
		function setupManagerWithSubtasks(
			statuses: Array<{ status: "completed" | "failed"; branchName: string }>,
		): { manager: AsyncSubtaskManager; provider: any } {
			const provider = createMockParentProvider()
			const manager = new AsyncSubtaskManager(provider, mockParentTaskId)

			statuses.forEach((s, index) => {
				;(manager as any).subtasks.set(`${index}`, {
					subtaskIndex: index,
					taskId: `task-${index}`,
					worktreePath: `/wt/subtask-${index + 1}`,
					branchName: s.branchName,
					provider: null,
					status: s.status,
				})
			})

			return { manager, provider }
		}

		it("should emit MergeStarted event", async () => {
			const { manager, provider } = setupManagerWithSubtasks([
				{ status: "completed", branchName: "branch-1" },
			])

			await (manager as any).triggerMergePhase()

			expect(provider.emit).toHaveBeenCalledWith(RooCodeEventName.MergeStarted, mockParentTaskId)
		})

		it("should merge only completed subtask branches (skips failed ones)", async () => {
			const { manager, provider } = setupManagerWithSubtasks([
				{ status: "completed", branchName: "branch-ok" },
				{ status: "failed", branchName: "branch-fail" },
			])

			await (manager as any).triggerMergePhase()

			// Only the completed branch should be merged
			expect(mockExecFileAsync).toHaveBeenCalledWith(
				"git",
				["merge", "branch-ok", "--no-edit"],
				expect.objectContaining({ cwd: mockCwd }),
			)
			// The failed branch should NOT be merged
			expect(mockExecFileAsync).not.toHaveBeenCalledWith(
				"git",
				["merge", "branch-fail", "--no-edit"],
				expect.anything(),
			)
			// MergeCompleted should be emitted
			expect(provider.emit).toHaveBeenCalledWith(
				RooCodeEventName.MergeCompleted,
				mockParentTaskId,
				expect.stringContaining("branch-ok"),
			)
		})

		it("should emit MergeCompleted with summary when all merges succeed", async () => {
			const { manager, provider } = setupManagerWithSubtasks([
				{ status: "completed", branchName: "branch-1" },
				{ status: "completed", branchName: "branch-2" },
			])

			await (manager as any).triggerMergePhase()

			expect(provider.emit).toHaveBeenCalledWith(
				RooCodeEventName.MergeCompleted,
				mockParentTaskId,
				expect.stringContaining("Successfully merged 2 branch(es)"),
			)
		})

		it("should emit MergeFailed with summary including errors when some merges fail", async () => {
			// First merge succeeds, second fails with CONFLICT, then abort succeeds
			mockExecFileAsync
				.mockResolvedValueOnce({ stdout: "", stderr: "" }) // first merge
				.mockRejectedValueOnce(new Error("CONFLICT: merge conflict in file.ts")) // second merge
				.mockResolvedValueOnce({ stdout: "", stderr: "" }) // abort for second merge

			const { manager, provider } = setupManagerWithSubtasks([
				{ status: "completed", branchName: "branch-1" },
				{ status: "completed", branchName: "branch-2" },
			])

			await (manager as any).triggerMergePhase()

			expect(provider.emit).toHaveBeenCalledWith(
				RooCodeEventName.MergeFailed,
				mockParentTaskId,
				expect.stringContaining("Merge errors"),
			)
		})

		it("should call cleanupWorktrees after merging", async () => {
			const { manager } = setupManagerWithSubtasks([
				{ status: "completed", branchName: "branch-1" },
			])

			await (manager as any).triggerMergePhase()

			expect(worktreeService.deleteWorktree).toHaveBeenCalledWith(
				mockCwd,
				"/wt/subtask-1",
				true,
			)
		})
	})

	// ═══════════════════════════════════════════════════════════════════════════
	// F. mergeBranch Tests (4 tests)
	// ═══════════════════════════════════════════════════════════════════════════
	describe("mergeBranch", () => {
		it("should return {success: true} on successful merge", async () => {
			const manager = createManager()

			const result = await (manager as any).mergeBranch("test-branch")

			expect(result).toEqual({ success: true })
		})

		it("should abort merge and return {success: false, error containing 'Merge conflict'} on CONFLICT", async () => {
			// First call (merge) fails with CONFLICT, second call (abort) succeeds
			mockExecFileAsync
				.mockRejectedValueOnce(new Error("CONFLICT: content conflict in src/file.ts"))
				.mockResolvedValueOnce({ stdout: "", stderr: "" })

			const manager = createManager()

			const result = await (manager as any).mergeBranch("conflict-branch")

			expect(result.success).toBe(false)
			expect(result.error).toContain("Merge conflict:")
			// Verify abort was attempted
			expect(mockExecFileAsync).toHaveBeenCalledWith(
				"git",
				["merge", "--abort"],
				expect.objectContaining({ cwd: mockCwd }),
			)
		})

		it("should abort merge and return conflict error on 'Automatic merge failed' message", async () => {
			mockExecFileAsync
				.mockRejectedValueOnce(new Error("Automatic merge failed; fix conflicts and then commit the result."))
				.mockResolvedValueOnce({ stdout: "", stderr: "" })

			const manager = createManager()

			const result = await (manager as any).mergeBranch("auto-conflict-branch")

			expect(result.success).toBe(false)
			expect(result.error).toContain("Merge conflict:")
		})

		it("should return {success: false, error} on other git errors", async () => {
			mockExecFileAsync.mockRejectedValue(new Error("fatal: not something we can merge"))

			const manager = createManager()

			const result = await (manager as any).mergeBranch("bad-branch")

			expect(result.success).toBe(false)
			expect(result.error).toBe("fatal: not something we can merge")
		})
	})

	// ═══════════════════════════════════════════════════════════════════════════
	// G. cleanupWorktrees Tests (2 tests)
	// ═══════════════════════════════════════════════════════════════════════════
	describe("cleanupWorktrees", () => {
		it("should call worktreeService.deleteWorktree for each subtask", async () => {
			const manager = createManager()

			;(manager as any).subtasks.set("0", {
				subtaskIndex: 0,
				taskId: "t0",
				worktreePath: "/wt/subtask-1",
				branchName: "branch-1",
				provider: null,
				status: "completed",
			})
			;(manager as any).subtasks.set("1", {
				subtaskIndex: 1,
				taskId: "t1",
				worktreePath: "/wt/subtask-2",
				branchName: "branch-2",
				provider: null,
				status: "completed",
			})

			await (manager as any).cleanupWorktrees()

			expect(worktreeService.deleteWorktree).toHaveBeenCalledTimes(2)
			expect(worktreeService.deleteWorktree).toHaveBeenCalledWith(mockCwd, "/wt/subtask-1", true)
			expect(worktreeService.deleteWorktree).toHaveBeenCalledWith(mockCwd, "/wt/subtask-2", true)
		})

		it("should continue even if individual deletions fail (best effort)", async () => {
			vi.mocked(worktreeService.deleteWorktree)
				.mockRejectedValueOnce(new Error("Delete failed"))
				.mockResolvedValueOnce({ success: true, message: "ok" })

			const manager = createManager()

			;(manager as any).subtasks.set("0", {
				subtaskIndex: 0,
				taskId: "t0",
				worktreePath: "/wt/subtask-1",
				branchName: "branch-1",
				provider: null,
				status: "completed",
			})
			;(manager as any).subtasks.set("1", {
				subtaskIndex: 1,
				taskId: "t1",
				worktreePath: "/wt/subtask-2",
				branchName: "branch-2",
				provider: null,
				status: "completed",
			})

			await expect((manager as any).cleanupWorktrees()).resolves.toBeUndefined()

			expect(worktreeService.deleteWorktree).toHaveBeenCalledTimes(2)
		})
	})

	// ═══════════════════════════════════════════════════════════════════════════
	// H. buildMergeSummary Tests (3 tests)
	// ═══════════════════════════════════════════════════════════════════════════
	describe("buildMergeSummary", () => {
		it("should list only merged branches when there are no errors", () => {
			const manager = createManager()

			const summary = (manager as any).buildMergeSummary(
				["roo-async/abc12345/subtask-1", "roo-async/abc12345/subtask-2"],
				[],
			)

			expect(summary).toContain("Successfully merged 2 branch(es)")
			expect(summary).toContain("roo-async/abc12345/subtask-1")
			expect(summary).toContain("roo-async/abc12345/subtask-2")
			expect(summary).not.toContain("Merge errors")
		})

		it("should list only errors when there are no merged branches", () => {
			const manager = createManager()

			const summary = (manager as any).buildMergeSummary(
				[],
				["Failed to merge branch-1: CONFLICT"],
			)

			expect(summary).toContain("Merge errors (1)")
			expect(summary).toContain("Failed to merge branch-1: CONFLICT")
			expect(summary).not.toContain("Successfully merged")
		})

		it("should include both sections when there are merged branches and errors", () => {
			const manager = createManager()

			const summary = (manager as any).buildMergeSummary(
				["roo-async/abc12345/subtask-1"],
				["Failed to merge roo-async/abc12345/subtask-2: CONFLICT"],
			)

			expect(summary).toContain("Successfully merged 1 branch(es)")
			expect(summary).toContain("roo-async/abc12345/subtask-1")
			expect(summary).toContain("Merge errors (1)")
			expect(summary).toContain("Failed to merge roo-async/abc12345/subtask-2: CONFLICT")
		})
	})

	// ═══════════════════════════════════════════════════════════════════════════
	// I. getProgress Tests (2 tests)
	// ═══════════════════════════════════════════════════════════════════════════
	describe("getProgress", () => {
		beforeEach(() => {
			// Stub createSubtaskProvider and listenForSubtaskCompletion for spawnSubtasks
			vi.spyOn(AsyncSubtaskManager.prototype as any, "createSubtaskProvider")
				.mockResolvedValue(createMockSubtaskProvider())
			vi.spyOn(AsyncSubtaskManager.prototype as any, "listenForSubtaskCompletion")
				.mockImplementation(() => {})
		})

		it("should return empty array when no subtasks", () => {
			const manager = createManager()

			expect(manager.getProgress()).toEqual([])
		})

		it("should return all subtask statuses after spawning", async () => {
			const manager = createManager()

			await manager.spawnSubtasks({
				parentTaskId: mockParentTaskId,
				subtasks: [
					{ mode: "code", message: "Task 1", todos: [] },
					{ mode: "code", message: "Task 2", todos: [] },
				],
			})

			const progress = manager.getProgress()

			expect(progress).toHaveLength(2)
			expect(progress[0].subtaskIndex).toBe(0)
			expect(progress[1].subtaskIndex).toBe(1)
		})
	})

	// ═══════════════════════════════════════════════════════════════════════════
	// J. getParentTaskId Tests (1 test)
	// ═══════════════════════════════════════════════════════════════════════════
	describe("getParentTaskId", () => {
		it("should return the parentTaskId passed in constructor", () => {
			const manager = createManager()

			expect(manager.getParentTaskId()).toBe(mockParentTaskId)
		})
	})
})