import type { TaskNode, SwarmTaskStatus } from "@roo-code/types"

/**
 * Result of critical path computation.
 * - path: ordered list of tasks on the critical path (from source to sink)
 * - totalDuration: sum of estimatedDuration along the path
 * - cycleDetected: true if a cycle was found in the dependency graph
 */
export interface CriticalPathResult {
	path: TaskNode[]
	totalDuration: number
	cycleDetected: boolean
}

/**
 * Information about a blocked task.
 * - task: the blocked TaskNode
 * - blockedBy: list of incomplete dependencies that are blocking this task
 * - blockageType: 'hard' if a direct dependency is incomplete, 'soft' if all
 *   direct dependencies are complete but a transitive dependency is incomplete
 */
export interface BlockedTaskInfo {
	task: TaskNode
	blockedBy: TaskNode[]
	blockageType: "hard" | "soft"
}

/**
 * Compute the critical path through a task dependency DAG.
 *
 * The critical path is the longest path (by total estimatedDuration) from any
 * source node (no dependencies) to any sink node (no dependents). This
 * determines the minimum completion time for the plan.
 *
 * Uses a topological-sort-based longest-path algorithm. If a cycle is detected
 * during topological sort, returns an empty path with cycleDetected=true.
 *
 * @param tasks - Array of TaskNode objects with dependencies and durations
 * @returns CriticalPathResult with the ordered path, total duration, and cycle status
 */
export function computeCriticalPath(tasks: TaskNode[]): CriticalPathResult {
	if (tasks.length === 0) {
		return { path: [], totalDuration: 0, cycleDetected: false }
	}

	// Build a map from taskId to TaskNode for quick lookup
	const taskMap = new Map<string, TaskNode>()
	for (const task of tasks) {
		taskMap.set(task.taskId, task)
	}

	// Build adjacency: for each task, list of tasks that depend on it (successors)
	const successors = new Map<string, string[]>()
	for (const task of tasks) {
		successors.set(task.taskId, [])
	}
	for (const task of tasks) {
		for (const depId of task.dependsOn) {
			// Only add successor edges for dependencies that exist in the task list
			// Orphan dependencies (referencing tasks not in the list) are ignored
			if (taskMap.has(depId)) {
				successors.get(depId)!.push(task.taskId)
			}
		}
	}

	// Topological sort using Kahn's algorithm (BFS-based)
	// For in-degree, only count dependencies that exist in the task list
	// Orphan dependencies are ignored so the task can still be processed
	const inDegree = new Map<string, number>()
	for (const task of tasks) {
		const validDepCount = task.dependsOn.filter((depId) => taskMap.has(depId)).length
		inDegree.set(task.taskId, validDepCount)
	}

	const queue: string[] = []
	for (const task of tasks) {
		const validDepCount = task.dependsOn.filter((depId) => taskMap.has(depId)).length
		if (validDepCount === 0) {
			queue.push(task.taskId)
		}
	}

	const topoOrder: string[] = []
	while (queue.length > 0) {
		const nodeId = queue.shift()!
		topoOrder.push(nodeId)
		for (const succId of successors.get(nodeId) ?? []) {
			const currentDeg = inDegree.get(succId)! - 1
			inDegree.set(succId, currentDeg)
			if (currentDeg === 0) {
				queue.push(succId)
			}
		}
	}

	// If topoOrder doesn't include all nodes, there's a cycle
	if (topoOrder.length !== tasks.length) {
		return { path: [], totalDuration: 0, cycleDetected: true }
	}

	// Compute longest path distances using dynamic programming on topo order
	// dist[v] = max total duration to reach v from any source
	const dist = new Map<string, number>()
	// predecessor[v] = the task that gives the max distance to v
	const predecessor = new Map<string, string | null>()

	for (const nodeId of topoOrder) {
		const task = taskMap.get(nodeId)!
		if (task.dependsOn.length === 0) {
			// Source node: distance is just its own duration
			dist.set(nodeId, task.estimatedDuration)
			predecessor.set(nodeId, null)
		} else {
			// Find the predecessor that gives the maximum distance
			let maxDist = -1
			let bestPred: string | null = null
			for (const depId of task.dependsOn) {
				const depDist = dist.get(depId)
				if (depDist !== undefined && depDist > maxDist) {
					maxDist = depDist
					bestPred = depId
				}
			}
			// If no valid predecessor found (orphan dep), use own duration
			const totalDist = maxDist >= 0 ? maxDist + task.estimatedDuration : task.estimatedDuration
			dist.set(nodeId, totalDist)
			predecessor.set(nodeId, bestPred)
		}
	}

	// Find the sink node with the maximum distance (end of critical path)
	let maxTotalDuration = 0
	let sinkNodeId: string | null = null
	for (const nodeId of topoOrder) {
		const d = dist.get(nodeId)!
		// A sink node has no successors
		const hasSuccessors = (successors.get(nodeId) ?? []).length > 0
		if (!hasSuccessors && d > maxTotalDuration) {
			maxTotalDuration = d
			sinkNodeId = nodeId
		}
	}

	// If no sink found (all nodes have successors — shouldn't happen in a DAG),
	// pick the node with the overall max distance
	if (sinkNodeId === null) {
		for (const nodeId of topoOrder) {
			const d = dist.get(nodeId)!
			if (d > maxTotalDuration) {
				maxTotalDuration = d
				sinkNodeId = nodeId
			}
		}
	}

	if (sinkNodeId === null) {
		return { path: [], totalDuration: 0, cycleDetected: false }
	}

	// Trace back from sink to source to build the critical path
	const criticalPathIds: string[] = []
	let current: string | null = sinkNodeId
	while (current !== null) {
		criticalPathIds.unshift(current)
		current = predecessor.get(current) ?? null
	}

	const criticalPath = criticalPathIds.map((id) => taskMap.get(id)!).filter((t) => t !== undefined)

	return {
		path: criticalPath,
		totalDuration: maxTotalDuration,
		cycleDetected: false,
	}
}

/**
 * Identify blocked tasks and their blocking reasons.
 *
 * A task is "blocked" if it cannot proceed because dependencies are not completed.
 *
 * - Hard blockage: at least one direct dependency (in dependsOn) is not in
 *   SwarmTaskStatus.Completed status.
 * - Soft blockage: all direct dependencies are completed, but a transitive
 *   dependency (reachable through the dependency chain) is not completed.
 *   This means the task could theoretically start but may encounter issues
 *   from upstream incomplete work.
 *
 * @param tasks - Array of TaskNode objects
 * @returns Array of BlockedTaskInfo describing each blocked task and why
 */
export function getBlockedTasks(tasks: TaskNode[]): BlockedTaskInfo[] {
	if (tasks.length === 0) {
		return []
	}

	const taskMap = new Map<string, TaskNode>()
	for (const task of tasks) {
		taskMap.set(task.taskId, task)
	}

	const completedStatus: SwarmTaskStatus = "completed"

	// Helper: check if a task is completed
	const isCompleted = (task: TaskNode): boolean => task.status === completedStatus

	// Helper: find all transitive dependencies of a task (excluding the task itself)
	const getTransitiveDeps = (taskId: string): Set<string> => {
		const visited = new Set<string>()
		const stack = [taskId]
		while (stack.length > 0) {
			const current = stack.pop()!
			if (visited.has(current)) continue
			visited.add(current)
			const task = taskMap.get(current)
			if (task) {
				for (const depId of task.dependsOn) {
					if (!visited.has(depId)) {
						stack.push(depId)
					}
				}
			}
		}
		visited.delete(taskId) // exclude the task itself
		return visited
	}

	const result: BlockedTaskInfo[] = []

	for (const task of tasks) {
		// Skip tasks that are already completed or failed — they aren't "blocked"
		if (task.status === completedStatus || task.status === "failed") {
			continue
		}

		// Check direct dependencies
		const directIncompleteDeps: TaskNode[] = []
		for (const depId of task.dependsOn) {
			const depTask = taskMap.get(depId)
			if (depTask && !isCompleted(depTask)) {
				directIncompleteDeps.push(depTask)
			}
		}

		if (directIncompleteDeps.length > 0) {
			// Hard blockage: direct dependency is not completed
			result.push({
				task,
				blockedBy: directIncompleteDeps,
				blockageType: "hard",
			})
			continue
		}

		// All direct deps are complete — check transitive deps for soft blockage
		const transitiveDeps = getTransitiveDeps(task.taskId)
		const transitiveIncompleteDeps: TaskNode[] = []
		for (const depId of transitiveDeps) {
			const depTask = taskMap.get(depId)
			if (depTask && !isCompleted(depTask)) {
				transitiveIncompleteDeps.push(depTask)
			}
		}

		if (transitiveIncompleteDeps.length > 0) {
			// Soft blockage: transitive dependency is not completed
			result.push({
				task,
				blockedBy: transitiveIncompleteDeps,
				blockageType: "soft",
			})
		}
	}

	return result
}