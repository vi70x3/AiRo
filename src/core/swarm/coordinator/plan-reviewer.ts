import {
	Plan,
	PlanUpdate,
	PlanChange,
	AgentLifecycleState,
	Task,
	Dependency,
} from '@roo-code/types'
import { IDaemon } from '../interfaces'

export interface ValidationResult {
	isValid: boolean
	errors: string[]
}

export enum RiskLevel {
	Low = 'low',
	Medium = 'medium',
	High = 'high',
}

export interface ImpactAnalysis {
	affectedTaskIds: string[]
	hasCycles: boolean
	cycles: string[][]
	affectsInProgressTasks: boolean
	inProgressTaskIds: string[]
	conflictsWithPending: boolean
	conflictingUpdateIds: string[]
	riskLevel: RiskLevel
	affectedTaskCount: number
}

export class PlanReviewer {
	private daemon: IDaemon

	constructor(daemon: IDaemon) {
		this.daemon = daemon
	}

	/**
	 * Validate a plan update proposal.
	 * Checks version match, proposer is active, update has changes and reason.
	 */
	validateUpdate(update: PlanUpdate, currentPlan: Plan): ValidationResult {
		const errors: string[] = []

		if (update.version !== currentPlan.version) {
			errors.push(
				`Plan version mismatch: update references version ${update.version}, current is ${currentPlan.version}`
			)
		}

		const proposer = this.daemon.getAgent(update.proposerId)
		if (!proposer) {
			errors.push(`Proposer ${update.proposerId} is not a registered agent`)
		} else if (
			proposer.state === AgentLifecycleState.Crashed ||
			proposer.state === AgentLifecycleState.Failed ||
			proposer.state === AgentLifecycleState.Stopped
		) {
			errors.push(
				`Proposer ${update.proposerId} is not active (state: ${proposer.state})`
			)
		}

		if (!update.changes || update.changes.length === 0) {
			errors.push('Plan update has no changes')
		}

		if (!update.reason || update.reason.trim().length === 0) {
			errors.push('Plan update has no reason')
		}

		return {
			isValid: errors.length === 0,
			errors,
		}
	}

	/**
	 * Analyze the full impact of a plan update.
	 * Applies all checks and returns comprehensive ImpactAnalysis.
	 */
	analyzeImpact(update: PlanUpdate, currentPlan: Plan): ImpactAnalysis {
		const newDependencies = this.extractNewDependencies(update, currentPlan)
		const allDependencies = [...currentPlan.dependencies, ...newDependencies]

		const cycles = this.detectCycles(currentPlan.tasks, allDependencies)
		const hasCycles = cycles.length > 0

		const affectedTaskIds = this.findAffectedTasks(update, currentPlan)
		const inProgressTaskIds = this.checkInProgressTasks(Array.from(affectedTaskIds))
		const affectsInProgressTasks = inProgressTaskIds.length > 0

		const conflictingUpdateIds = this.checkPendingConflicts(update)
		const conflictsWithPending = conflictingUpdateIds.length > 0

		const affectedTaskCount = affectedTaskIds.size
		const riskLevel = this.determineRiskLevel(
			hasCycles,
			affectsInProgressTasks,
			conflictsWithPending,
			affectedTaskCount
		)

		return {
			affectedTaskIds: Array.from(affectedTaskIds),
			hasCycles,
			cycles,
			affectsInProgressTasks,
			inProgressTaskIds,
			conflictsWithPending,
			conflictingUpdateIds,
			riskLevel,
			affectedTaskCount,
		}
	}

	/**
	 * Detect cycles in the dependency graph using DFS.
	 * Builds adjacency list from tasks + dependencies, then runs DFS
	 * with a visited set and recursion stack.
	 */
	detectCycles(tasks: Task[], dependencies: Dependency[]): string[][] {
		const adjacencyList = new Map<string, string[]>()

		for (const task of tasks) {
			if (!adjacencyList.has(task.taskId)) {
				adjacencyList.set(task.taskId, [])
			}
		}

		for (const dep of dependencies) {
			const neighbors = adjacencyList.get(dep.fromTaskId) || []
			neighbors.push(dep.toTaskId)
			adjacencyList.set(dep.fromTaskId, neighbors)
		}

		const visited = new Set<string>()
		const recursionStack = new Set<string>()
		const cycles: string[][] = []

		const dfs = (node: string, path: string[]): void => {
			visited.add(node)
			recursionStack.add(node)
			path.push(node)

			const neighbors = adjacencyList.get(node) || []
			for (const neighbor of neighbors) {
				if (!visited.has(neighbor)) {
					dfs(neighbor, path)
				} else if (recursionStack.has(neighbor)) {
					const cycleStart = path.indexOf(neighbor)
					const cycle = path.slice(cycleStart)
					cycles.push([...cycle])
				}
			}

			path.pop()
			recursionStack.delete(node)
		}

		for (const task of tasks) {
			if (!visited.has(task.taskId)) {
				dfs(task.taskId, [])
			}
		}

		return cycles
	}

	/**
	 * For each change, find the target task and all tasks that transitively depend on it.
	 * Returns all affected task IDs.
	 */
	findAffectedTasks(update: PlanUpdate, currentPlan: Plan): Set<string> {
		const affected = new Set<string>()

		// Build reverse adjacency: taskId -> list of tasks that depend on it
		const reverseAdj = new Map<string, string[]>()
		for (const dep of currentPlan.dependencies) {
			const dependents = reverseAdj.get(dep.toTaskId) || []
			dependents.push(dep.fromTaskId)
			reverseAdj.set(dep.toTaskId, dependents)
		}

		// Also include new dependencies from the update
		for (const change of update.changes) {
			if (change.changeType === 'add_dependency' || change.changeType === 'remove_dependency') {
				const dep = (change.after || change.before) as Dependency | undefined
				if (dep) {
					const dependents = reverseAdj.get(dep.toTaskId) || []
					if (!dependents.includes(dep.fromTaskId)) {
						dependents.push(dep.fromTaskId)
					}
					reverseAdj.set(dep.toTaskId, dependents)
				}
			}
		}

		// Collect directly changed task IDs
		const changedTaskIds: string[] = []
		for (const change of update.changes) {
			if (
				change.changeType === 'add_task' ||
				change.changeType === 'modify_task' ||
				change.changeType === 'remove_task' ||
				change.changeType === 'update_scope'
			) {
				changedTaskIds.push(change.targetId)
			}
		}

		// For each changed task, find all transitively affected tasks via BFS
		for (const taskId of changedTaskIds) {
			affected.add(taskId)
			const queue: string[] = [taskId]
			while (queue.length > 0) {
				const current = queue.shift()!
				const dependents = reverseAdj.get(current) || []
				for (const dependent of dependents) {
					if (!affected.has(dependent)) {
						affected.add(dependent)
						queue.push(dependent)
					}
				}
			}
		}

		return affected
	}

	/**
	 * For each affected task ID, check if any agent is working on it.
	 * Returns task IDs that are in progress.
	 */
	checkInProgressTasks(affectedTaskIds: string[]): string[] {
		const inProgress: string[] = []
		const allAgents = this.daemon.listAgents()

		for (const taskId of affectedTaskIds) {
			for (const agent of allAgents) {
				const metadata = agent as unknown as { taskId: string | null; state: AgentLifecycleState }
				if (
					metadata.taskId === taskId &&
					metadata.state === AgentLifecycleState.Running
				) {
					inProgress.push(taskId)
					break
				}
			}
		}

		return inProgress
	}

	/**
	 * For each change in the update, check if any pending update also modifies
	 * the same task or dependency. Returns conflicting update IDs.
	 */
	checkPendingConflicts(update: PlanUpdate): string[] {
		const conflictingIds: string[] = []
		const currentPlan = this.daemon.getPlan()
		if (!currentPlan) return conflictingIds

		const myTargetIds = new Set<string>()
		for (const change of update.changes) {
			myTargetIds.add(change.targetId)
		}

		for (const pendingUpdate of currentPlan.updateHistory) {
			if (pendingUpdate.status !== 'pending') continue
			if (pendingUpdate.updateId === update.updateId) continue

			for (const change of pendingUpdate.changes) {
				if (myTargetIds.has(change.targetId)) {
					if (!conflictingIds.includes(pendingUpdate.updateId)) {
						conflictingIds.push(pendingUpdate.updateId)
					}
					break
				}
			}
		}

		return conflictingIds
	}

	/**
	 * Determine risk level based on impact analysis signals.
	 * High if hasCycles or affectsInProgressTasks or conflictsWithPending.
	 * Medium if affectedTaskCount > 3.
	 * Low otherwise.
	 */
	determineRiskLevel(
		hasCycles: boolean,
		affectsInProgressTasks: boolean,
		conflictsWithPending: boolean,
		affectedTaskCount: number
	): RiskLevel {
		if (hasCycles || affectsInProgressTasks || conflictsWithPending) {
			return RiskLevel.High
		}
		if (affectedTaskCount > 3) {
			return RiskLevel.Medium
		}
		return RiskLevel.Low
	}

	/**
	 * Review a plan update: combine validation + impact analysis.
	 * If validation fails, reject.
	 * If risk is High, reject with reason.
	 * If risk is Medium, approve with modifications (review notes about risk).
	 * If risk is Low, approve.
	 */
	reviewUpdate(
		update: PlanUpdate,
		currentPlan: Plan
	): { approved: boolean; reason: string; reviewNotes: string | null } {
		const validation = this.validateUpdate(update, currentPlan)
		if (!validation.isValid) {
			return {
				approved: false,
				reason: `Validation failed: ${validation.errors.join('; ')}`,
				reviewNotes: null,
			}
		}

		const impact = this.analyzeImpact(update, currentPlan)

		if (impact.riskLevel === RiskLevel.High) {
			const reasons: string[] = []
			if (impact.hasCycles) {
				reasons.push(`dependency cycles detected: ${impact.cycles.map(c => c.join(' -> ')).join(', ')}`)
			}
			if (impact.affectsInProgressTasks) {
				reasons.push(`affects in-progress tasks: ${impact.inProgressTaskIds.join(', ')}`)
			}
			if (impact.conflictsWithPending) {
				reasons.push(`conflicts with pending updates: ${impact.conflictingUpdateIds.join(', ')}`)
			}
			return {
				approved: false,
				reason: `High risk: ${reasons.join('; ')}`,
				reviewNotes: null,
			}
		}

		if (impact.riskLevel === RiskLevel.Medium) {
			return {
				approved: true,
				reason: 'Approved with risk acknowledgment',
				reviewNotes: `Medium risk: ${impact.affectedTaskCount} tasks affected. Affected tasks: ${impact.affectedTaskIds.join(', ')}. Proceed with caution.`,
			}
		}

		return {
			approved: true,
			reason: 'Update validated and approved',
			reviewNotes: null,
		}
	}

	/**
	 * Extract new dependencies from the plan update changes.
	 */
	private extractNewDependencies(update: PlanUpdate, currentPlan: Plan): Dependency[] {
		const existingDepKeys = new Set<string>()
		for (const dep of currentPlan.dependencies) {
			existingDepKeys.add(`${dep.fromTaskId}->${dep.toTaskId}`)
		}

		const newDeps: Dependency[] = []
		for (const change of update.changes) {
			if (change.changeType === 'add_dependency') {
				const dep = change.after as Dependency | undefined
				if (dep) {
					const key = `${dep.fromTaskId}->${dep.toTaskId}`
					if (!existingDepKeys.has(key)) {
						newDeps.push(dep)
					}
				}
			}
		}
		return newDeps
	}
}
