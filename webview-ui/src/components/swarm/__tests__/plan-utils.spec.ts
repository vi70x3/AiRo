import { computeCriticalPath, getBlockedTasks } from "../plan-utils"
import { TaskNode, SwarmTaskStatus } from "@roo-code/types"

// Helper to create a TaskNode with defaults
function makeTask(
	taskId: string,
	description: string,
	status: SwarmTaskStatus = SwarmTaskStatus.Pending,
	dependsOn: string[] = [],
	estimatedDuration: number = 10,
	owner: string = "agent-1",
	scope: string = "/scope",
	priority: number = 1,
	blockedBy: string[] = [],
): TaskNode {
	return {
		taskId,
		description,
		status,
		dependsOn,
		estimatedDuration,
		owner,
		scope,
		priority,
		blockedBy,
	}
}

describe("computeCriticalPath", () => {
	it("returns empty result for empty task list", () => {
		const result = computeCriticalPath([])
		expect(result.path).toEqual([])
		expect(result.totalDuration).toBe(0)
		expect(result.cycleDetected).toBe(false)
	})

	it("returns single task for a single-node graph", () => {
		const task = makeTask("t1", "Task 1", SwarmTaskStatus.Pending, [], 30)
		const result = computeCriticalPath([task])
		expect(result.path).toEqual([task])
		expect(result.totalDuration).toBe(30)
		expect(result.cycleDetected).toBe(false)
	})

	it("computes critical path for a linear chain", () => {
		const t1 = makeTask("t1", "Task 1", SwarmTaskStatus.Pending, [], 10)
		const t2 = makeTask("t2", "Task 2", SwarmTaskStatus.Pending, ["t1"], 20)
		const t3 = makeTask("t3", "Task 3", SwarmTaskStatus.Pending, ["t2"], 15)
		const result = computeCriticalPath([t1, t2, t3])
		expect(result.path).toEqual([t1, t2, t3])
		expect(result.totalDuration).toBe(45)
		expect(result.cycleDetected).toBe(false)
	})

	it("computes critical path for a diamond DAG", () => {
		// Diamond: t1 -> t2, t1 -> t3, t2 -> t4, t3 -> t4
		// t2 has longer duration, so critical path is t1 -> t2 -> t4
		const t1 = makeTask("t1", "Start", SwarmTaskStatus.Pending, [], 5)
		const t2 = makeTask("t2", "Long branch", SwarmTaskStatus.Pending, ["t1"], 30)
		const t3 = makeTask("t3", "Short branch", SwarmTaskStatus.Pending, ["t1"], 10)
		const t4 = makeTask("t4", "End", SwarmTaskStatus.Pending, ["t2", "t3"], 5)

		const result = computeCriticalPath([t1, t2, t3, t4])
		expect(result.path).toEqual([t1, t2, t4])
		expect(result.totalDuration).toBe(40) // 5 + 30 + 5
		expect(result.cycleDetected).toBe(false)
	})

	it("computes critical path for parallel branches with different lengths", () => {
		// Two independent chains: t1 -> t2 (total 20), t3 -> t4 (total 50)
		// Critical path should be t3 -> t4
		const t1 = makeTask("t1", "A1", SwarmTaskStatus.Pending, [], 10)
		const t2 = makeTask("t2", "A2", SwarmTaskStatus.Pending, ["t1"], 10)
		const t3 = makeTask("t3", "B1", SwarmTaskStatus.Pending, [], 30)
		const t4 = makeTask("t4", "B2", SwarmTaskStatus.Pending, ["t3"], 20)

		const result = computeCriticalPath([t1, t2, t3, t4])
		expect(result.path).toEqual([t3, t4])
		expect(result.totalDuration).toBe(50)
		expect(result.cycleDetected).toBe(false)
	})

	it("detects cycles and returns empty path with warning", () => {
		// Cycle: t1 -> t2 -> t3 -> t1
		const t1 = makeTask("t1", "Task 1", SwarmTaskStatus.Pending, ["t3"], 10)
		const t2 = makeTask("t2", "Task 2", SwarmTaskStatus.Pending, ["t1"], 10)
		const t3 = makeTask("t3", "Task 3", SwarmTaskStatus.Pending, ["t2"], 10)

		const result = computeCriticalPath([t1, t2, t3])
		expect(result.path).toEqual([])
		expect(result.totalDuration).toBe(0)
		expect(result.cycleDetected).toBe(true)
	})

	it("handles tasks with dependencies not in the task list (orphan deps)", () => {
		// t2 depends on "missing-task" which is not in the list
		const t1 = makeTask("t1", "Task 1", SwarmTaskStatus.Pending, [], 10)
		const t2 = makeTask("t2", "Task 2", SwarmTaskStatus.Pending, ["missing-task"], 20)

		const result = computeCriticalPath([t1, t2])
		// t2's orphan dep should be ignored; t2 treated as source with duration 20
		// t1 is also a source with duration 10
		// Critical path should be t2 (longer)
		expect(result.path).toEqual([t2])
		expect(result.totalDuration).toBe(20)
		expect(result.cycleDetected).toBe(false)
	})

	it("handles complex multi-path DAG correctly", () => {
		// Complex DAG:
		// t1 (5) -> t2 (10) -> t5 (5)
		// t1 (5) -> t3 (20) -> t5 (5)
		// t4 (15) -> t5 (5)
		// Critical path: t1 -> t3 -> t5 = 30
		const t1 = makeTask("t1", "Start", SwarmTaskStatus.Pending, [], 5)
		const t2 = makeTask("t2", "Short", SwarmTaskStatus.Pending, ["t1"], 10)
		const t3 = makeTask("t3", "Long", SwarmTaskStatus.Pending, ["t1"], 20)
		const t4 = makeTask("t4", "Independent", SwarmTaskStatus.Pending, [], 15)
		const t5 = makeTask("t5", "End", SwarmTaskStatus.Pending, ["t2", "t3", "t4"], 5)

		const result = computeCriticalPath([t1, t2, t3, t4, t5])
		expect(result.path).toEqual([t1, t3, t5])
		expect(result.totalDuration).toBe(30) // 5 + 20 + 5
		expect(result.cycleDetected).toBe(false)
	})
})

describe("getBlockedTasks", () => {
	it("returns empty result for empty task list", () => {
		const result = getBlockedTasks([])
		expect(result).toEqual([])
	})

	it("returns no blocked tasks when all tasks are completed", () => {
		const t1 = makeTask("t1", "Task 1", SwarmTaskStatus.Completed, [], 10)
		const t2 = makeTask("t2", "Task 2", SwarmTaskStatus.Completed, ["t1"], 10)

		const result = getBlockedTasks([t1, t2])
		expect(result).toEqual([])
	})

	it("identifies hard-blocked tasks (direct dependency incomplete)", () => {
		const t1 = makeTask("t1", "Task 1", SwarmTaskStatus.Pending, [], 10)
		const t2 = makeTask("t2", "Task 2", SwarmTaskStatus.Pending, ["t1"], 10)

		const result = getBlockedTasks([t1, t2])
		// Only t2 is blocked; t1 has no dependencies and is pending (not blocked)
		expect(result.length).toBe(1)

		// t2 is hard-blocked by t1
		const t2Blocked = result.find((b) => b.task.taskId === "t2")
		expect(t2Blocked).toBeDefined()
		expect(t2Blocked!.blockageType).toBe("hard")
		expect(t2Blocked!.blockedBy).toEqual([t1])

		// t1 is not blocked (no dependencies) — not in result
		const t1Blocked = result.find((b) => b.task.taskId === "t1")
		expect(t1Blocked).toBeUndefined()
	})

	it("identifies soft-blocked tasks (transitive dependency incomplete)", () => {
		// t1 is pending, t2 depends on t1 (completed), t3 depends on t2 (pending)
		// t3 is hard-blocked by t2 (pending)
		// but if t2 is completed and t1 is pending, t3 has soft blockage
		const t1 = makeTask("t1", "Task 1", SwarmTaskStatus.Pending, [], 10)
		const t2 = makeTask("t2", "Task 2", SwarmTaskStatus.Completed, ["t1"], 10)
		const t3 = makeTask("t3", "Task 3", SwarmTaskStatus.Pending, ["t2"], 10)

		const result = getBlockedTasks([t1, t2, t3])
		// t3's direct dep (t2) is completed, but transitive dep (t1) is pending
		const t3Blocked = result.find((b) => b.task.taskId === "t3")
		expect(t3Blocked).toBeDefined()
		expect(t3Blocked!.blockageType).toBe("soft")
		expect(t3Blocked!.blockedBy.some((b) => b.taskId === "t1")).toBe(true)
	})

	it("skips completed and failed tasks", () => {
		const t1 = makeTask("t1", "Task 1", SwarmTaskStatus.Completed, [], 10)
		const t2 = makeTask("t2", "Task 2", SwarmTaskStatus.Failed, [], 10)

		const result = getBlockedTasks([t1, t2])
		expect(result).toEqual([])
	})

	it("handles multiple blocking dependencies", () => {
		const t1 = makeTask("t1", "Task 1", SwarmTaskStatus.Pending, [], 10)
		const t2 = makeTask("t2", "Task 2", SwarmTaskStatus.InProgress, [], 10)
		const t3 = makeTask("t3", "Task 3", SwarmTaskStatus.Pending, ["t1", "t2"], 10)

		const result = getBlockedTasks([t1, t2, t3])
		const t3Blocked = result.find((b) => b.task.taskId === "t3")
		expect(t3Blocked).toBeDefined()
		expect(t3Blocked!.blockageType).toBe("hard")
		expect(t3Blocked!.blockedBy.length).toBe(2)
		expect(t3Blocked!.blockedBy.map((b) => b.taskId)).toContain("t1")
		expect(t3Blocked!.blockedBy.map((b) => b.taskId)).toContain("t2")
	})

	it("handles deep transitive dependencies for soft blockage", () => {
		// Chain: t1 (pending) -> t2 (completed) -> t3 (completed) -> t4 (pending)
		// t4's direct dep (t3) is completed, but transitive dep (t1) is pending
		const t1 = makeTask("t1", "Root", SwarmTaskStatus.Pending, [], 10)
		const t2 = makeTask("t2", "Mid1", SwarmTaskStatus.Completed, ["t1"], 10)
		const t3 = makeTask("t3", "Mid2", SwarmTaskStatus.Completed, ["t2"], 10)
		const t4 = makeTask("t4", "Leaf", SwarmTaskStatus.Pending, ["t3"], 10)

		const result = getBlockedTasks([t1, t2, t3, t4])
		const t4Blocked = result.find((b) => b.task.taskId === "t4")
		expect(t4Blocked).toBeDefined()
		expect(t4Blocked!.blockageType).toBe("soft")
		expect(t4Blocked!.blockedBy.some((b) => b.taskId === "t1")).toBe(true)
	})

	it("correctly identifies hard block when direct dep is in_progress", () => {
		const t1 = makeTask("t1", "Task 1", SwarmTaskStatus.InProgress, [], 10)
		const t2 = makeTask("t2", "Task 2", SwarmTaskStatus.Pending, ["t1"], 10)

		const result = getBlockedTasks([t1, t2])
		const t2Blocked = result.find((b) => b.task.taskId === "t2")
		expect(t2Blocked).toBeDefined()
		expect(t2Blocked!.blockageType).toBe("hard")
	})

	it("handles tasks with no dependencies (source nodes)", () => {
		const t1 = makeTask("t1", "Source", SwarmTaskStatus.Pending, [], 10)
		const result = getBlockedTasks([t1])
		// t1 has no dependencies and is pending — not blocked
		expect(result).toEqual([])
	})
})