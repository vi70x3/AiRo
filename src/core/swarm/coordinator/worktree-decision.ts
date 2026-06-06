import { Task, Dependency, DependencyType } from '@roo-code/types'

export interface WorktreeDecision {
  /** Whether to use worktrees */
  useWorktrees: boolean
  /** Reason for the decision */
  reason: string
  /** How many worktrees to create (if using worktrees) */
  worktreeCount: number
  /** Scope assignments for each worktree */
  scopeAssignments: Map<string, string[]> // scope → taskIds
}

export enum ConflictRisk {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

export enum ScopeSeparation {
  Clear = 'clear',
  Moderate = 'moderate',
  Unclear = 'unclear',
}

export class WorktreeDecider {
  /**
   * Decide whether to use worktrees based on task analysis.
   * Implements the full heuristic from the spec:
   * - <3 tasks → no worktrees
   * - >50% file overlap between scopes → no worktrees (high merge cost)
   * - High conflict risk → use worktrees
   * - Clear scope separation → use worktrees
   */
  decide(tasks: Task[], dependencies: Dependency[]): WorktreeDecision {
    // First check: fewer than 3 tasks
    if (tasks.length < 3) {
      return {
        useWorktrees: false,
        reason: 'Fewer than 3 tasks, worktrees not beneficial',
        worktreeCount: 0,
        scopeAssignments: new Map(),
      }
    }

    // Second check: high scope overlap
    const overlap = this.calculateScopeOverlap(tasks)
    if (overlap > 0.5) {
      return {
        useWorktrees: false,
        reason: 'High file overlap (>50%), merge cost too high',
        worktreeCount: 0,
        scopeAssignments: new Map(),
      }
    }

    // Third check: scope separation
    const scopeSeparation = this.assessScopeSeparation(tasks)
    if (scopeSeparation === ScopeSeparation.Unclear) {
      return {
        useWorktrees: false,
        reason: 'Unclear scope separation, worktrees not beneficial',
        worktreeCount: 0,
        scopeAssignments: new Map(),
      }
    }

    // Fourth check: conflict risk
    const conflictRisk = this.assessConflictRisk(tasks, dependencies)

    // High conflict risk → use worktrees
    if (conflictRisk === ConflictRisk.High) {
      const scopeAssignments = this.assignScopesToWorktrees(tasks)
      return {
        useWorktrees: true,
        reason: 'High conflict risk, worktrees recommended for isolation',
        worktreeCount: scopeAssignments.size,
        scopeAssignments,
      }
    }

    // Clear scope separation → use worktrees
    if (scopeSeparation === ScopeSeparation.Clear) {
      const scopeAssignments = this.assignScopesToWorktrees(tasks)
      return {
        useWorktrees: true,
        reason: 'Clear scope separation, worktrees beneficial',
        worktreeCount: scopeAssignments.size,
        scopeAssignments,
      }
    }

    // Default: use worktrees if scope separation is at least Moderate
    if (scopeSeparation === ScopeSeparation.Moderate) {
      const scopeAssignments = this.assignScopesToWorktrees(tasks)
      return {
        useWorktrees: true,
        reason: 'Moderate scope separation, worktrees beneficial',
        worktreeCount: scopeAssignments.size,
        scopeAssignments,
      }
    }

    // Fallback: no worktrees
    return {
      useWorktrees: false,
      reason: 'Insufficient scope separation and low conflict risk',
      worktreeCount: 0,
      scopeAssignments: new Map(),
    }
  }

  /**
   * Calculate file overlap between task scopes.
   * Returns a percentage (0-1) representing how much overlap exists.
   * Since we don't have actual file paths yet, we use scope similarity
   * as a proxy: tasks in the same scope have high overlap.
   */
  calculateScopeOverlap(tasks: Task[]): number {
    if (tasks.length === 0) return 0

    const scopeCounts = new Map<string, number>()
    for (const task of tasks) {
      const count = scopeCounts.get(task.scope) ?? 0
      scopeCounts.set(task.scope, count + 1)
    }

    let maxCount = 0
    for (const count of scopeCounts.values()) {
      if (count > maxCount) {
        maxCount = count
      }
    }

    return maxCount / tasks.length
  }

  /**
   * Assess conflict risk based on task dependencies and scope overlap.
   * Returns: 'low', 'medium', 'high'
   */
  assessConflictRisk(tasks: Task[], dependencies: Dependency[]): ConflictRisk {
    if (dependencies.length === 0) {
      return ConflictRisk.Low
    }

    // Build a map of taskId → scope for quick lookup
    const taskScopeMap = new Map<string, string>()
    for (const task of tasks) {
      taskScopeMap.set(task.taskId, task.scope)
    }

    // Count cross-scope dependencies
    let crossScopeDeps = 0
    for (const dep of dependencies) {
      const fromScope = taskScopeMap.get(dep.fromTaskId)
      const toScope = taskScopeMap.get(dep.toTaskId)
      if (fromScope && toScope && fromScope !== toScope) {
        crossScopeDeps++
      }
    }

    const crossScopeRatio = crossScopeDeps / dependencies.length

    if (crossScopeRatio > 0.3) {
      return ConflictRisk.High
    }
    if (crossScopeRatio > 0.1) {
      return ConflictRisk.Medium
    }
    return ConflictRisk.Low
  }

  /**
   * Determine scope separation clarity.
   * Returns: 'clear', 'moderate', 'unclear'
   * Clear = most tasks have distinct scopes with little overlap
   * Unclear = many tasks share scopes or have no scope
   */
  assessScopeSeparation(tasks: Task[]): ScopeSeparation {
    if (tasks.length === 0) {
      return ScopeSeparation.Unclear
    }

    const uniqueScopes = new Set<string>()
    for (const task of tasks) {
      uniqueScopes.add(task.scope)
    }

    const scopeRatio = uniqueScopes.size / tasks.length

    if (scopeRatio > 0.5) {
      return ScopeSeparation.Clear
    }
    if (scopeRatio > 0.2) {
      return ScopeSeparation.Moderate
    }
    return ScopeSeparation.Unclear
  }

  /**
   * Assign scopes to worktrees.
   * Groups tasks by scope and determines how many worktrees are needed.
   * Each worktree gets one primary scope.
   */
  assignScopesToWorktrees(tasks: Task[]): Map<string, string[]> {
    const assignments = new Map<string, string[]>()

    for (const task of tasks) {
      const existing = assignments.get(task.scope) ?? []
      existing.push(task.taskId)
      assignments.set(task.scope, existing)
    }

    return assignments
  }
}
