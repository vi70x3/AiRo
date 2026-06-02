import {
  Plan,
  Task,
  Dependency,
  PlanValidationResult,
  PlanValidationIssue,
  PlanValidationSeverity,
  PlanValidationIssueType,
  TaskValidationResult,
  DependencyValidationResult,
  ScopeValidationResult,
} from '@roo-code/types'

let issueCounter = 0

function nextIssueId(): string {
  return `issue-${++issueCounter}`
}

function resetIssueCounter(): void {
  issueCounter = 0
}

export class PlanQualityValidator {
  /**
   * Validate an entire plan: checks tasks, dependencies, scopes, and overall consistency.
   */
  validatePlan(plan: Plan): PlanValidationResult {
    resetIssueCounter()
    const issues: PlanValidationIssue[] = []

    // Check for duplicate task IDs
    issues.push(...this.detectDuplicateTasks(plan.tasks))

    // Validate each task individually
    for (const task of plan.tasks) {
      const taskResult = this.validateTask(task, plan)
      issues.push(...taskResult.issues)
    }

    // Validate dependencies
    const depResults = this.validateDependencies(plan.dependencies, plan)
    for (const depResult of depResults) {
      issues.push(...depResult.issues)
    }

    // Detect circular dependencies
    issues.push(...this.detectCircularDependencies(plan.dependencies, plan.tasks))

    // Find orphan tasks
    issues.push(...this.findOrphanTasks(plan.tasks, plan.dependencies))

    // Validate scope consistency
    const scopeResults = this.validateScopeConsistency(plan.tasks)
    for (const sr of scopeResults) {
      issues.push(...sr.issues)
    }

    // Determine overall severity
    const overallSeverity = this.computeOverallSeverity(issues)

    return {
      planId: plan.planId,
      version: plan.version,
      issues,
      overallSeverity,
    }
  }

  /**
   * Validate a single task: check description, scope, and basic fields.
   */
  validateTask(task: Task, plan: Plan): TaskValidationResult {
    const issues: PlanValidationIssue[] = []

    // Check for missing description
    if (!task.description || task.description.trim().length === 0) {
      issues.push({
        issueId: nextIssueId(),
        type: PlanValidationIssueType.MissingDescription,
        severity: PlanValidationSeverity.Error,
        message: `Task ${task.taskId} has no description`,
      })
    }

    // Check for invalid/missing scope
    if (!task.scope || task.scope.trim().length === 0) {
      issues.push({
        issueId: nextIssueId(),
        type: PlanValidationIssueType.InvalidScope,
        severity: PlanValidationSeverity.Error,
        message: `Task ${task.taskId} has no scope assigned`,
      })
    }

    // Check for duplicate task ID within the plan
    const duplicateTasks = plan.tasks.filter((t) => t.taskId === task.taskId)
    if (duplicateTasks.length > 1) {
      issues.push({
        issueId: nextIssueId(),
        type: PlanValidationIssueType.DuplicateTask,
        severity: PlanValidationSeverity.Error,
        message: `Duplicate task ID "${task.taskId}" found (${duplicateTasks.length} occurrences)`,
      })
    }

    // Check for unreachable tasks (tasks that are blocked by non-existent tasks)
    for (const blockedBy of task.blockedBy) {
      if (!plan.tasks.find((t) => t.taskId === blockedBy)) {
        issues.push({
          issueId: nextIssueId(),
          type: PlanValidationIssueType.UnreachableTask,
          severity: PlanValidationSeverity.Warning,
          message: `Task ${task.taskId} is blockedBy non-existent task "${blockedBy}"`,
        })
      }
    }

    // Check dependsOn references
    for (const dep of task.dependsOn) {
      if (!plan.tasks.find((t) => t.taskId === dep)) {
        issues.push({
          issueId: nextIssueId(),
          type: PlanValidationIssueType.InconsistentDependencies,
          severity: PlanValidationSeverity.Warning,
          message: `Task ${task.taskId} dependsOn non-existent task "${dep}"`,
        })
      }
    }

    const overallSeverity = this.computeOverallSeverity(issues)

    return {
      taskId: task.taskId,
      issues,
      overallSeverity,
    }
  }

  /**
   * Validate dependencies: check that referenced tasks exist and types are valid.
   */
  validateDependencies(dependencies: Dependency[], plan: Plan): DependencyValidationResult[] {
    const results: DependencyValidationResult[] = []
    const taskIds = new Set(plan.tasks.map((t) => t.taskId))

    for (const dep of dependencies) {
      const issues: PlanValidationIssue[] = []

      if (!taskIds.has(dep.fromTaskId)) {
        issues.push({
          issueId: nextIssueId(),
          type: PlanValidationIssueType.InconsistentDependencies,
          severity: PlanValidationSeverity.Error,
          message: `Dependency references non-existent fromTaskId "${dep.fromTaskId}"`,
        })
      }

      if (!taskIds.has(dep.toTaskId)) {
        issues.push({
          issueId: nextIssueId(),
          type: PlanValidationIssueType.InconsistentDependencies,
          severity: PlanValidationSeverity.Error,
          message: `Dependency references non-existent toTaskId "${dep.toTaskId}"`,
        })
      }

      if (dep.fromTaskId === dep.toTaskId) {
        issues.push({
          issueId: nextIssueId(),
          type: PlanValidationIssueType.CircularDependency,
          severity: PlanValidationSeverity.Error,
          message: `Self-referencing dependency on task "${dep.fromTaskId}"`,
        })
      }

      results.push({
        dependency: dep,
        issues,
        overallSeverity: this.computeOverallSeverity(issues),
      })
    }

    return results
  }

  /**
   * Detect circular dependencies using DFS.
   */
  detectCircularDependencies(dependencies: Dependency[], tasks: Task[]): PlanValidationIssue[] {
    const issues: PlanValidationIssue[] = []
    const adjacency = new Map<string, string[]>()

    // Build adjacency list from dependencies
    for (const dep of dependencies) {
      const neighbors = adjacency.get(dep.fromTaskId) || []
      neighbors.push(dep.toTaskId)
      adjacency.set(dep.fromTaskId, neighbors)
    }

    // Also add edges from task.dependsOn
    for (const task of tasks) {
      for (const depId of task.dependsOn) {
        const neighbors = adjacency.get(task.taskId) || []
        if (!neighbors.includes(depId)) {
          neighbors.push(depId)
        }
        adjacency.set(task.taskId, neighbors)
      }
    }

    // DFS-based cycle detection
    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    const dfs = (node: string, path: string[]): boolean => {
      visited.add(node)
      recursionStack.add(node)

      const neighbors = adjacency.get(node) || []
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, [...path, neighbor])) {
            return true
          }
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor)
          const cycle = path.slice(cycleStart).concat(neighbor)
          issues.push({
            issueId: nextIssueId(),
            type: PlanValidationIssueType.CircularDependency,
            severity: PlanValidationSeverity.Error,
            message: `Circular dependency detected: ${cycle.join(' -> ')}`,
          })
          return true
        }
      }

      recursionStack.delete(node)
      return false
    }

    for (const task of tasks) {
      if (!visited.has(task.taskId)) {
        dfs(task.taskId, [task.taskId])
      }
    }

    return issues
  }

  /**
   * Find orphan tasks: tasks with no dependencies and no dependents.
   */
  findOrphanTasks(tasks: Task[], dependencies: Dependency[]): PlanValidationIssue[] {
    const issues: PlanValidationIssue[] = []
    const hasIncoming = new Set<string>()
    const hasOutgoing = new Set<string>()

    for (const dep of dependencies) {
      hasOutgoing.add(dep.fromTaskId)
      hasIncoming.add(dep.toTaskId)
    }

    for (const task of tasks) {
      if (task.dependsOn.length > 0) {
        hasOutgoing.add(task.taskId)
      }
      for (const depId of task.dependsOn) {
        hasIncoming.add(depId)
      }
    }

    for (const task of tasks) {
      const isOrphan = !hasOutgoing.has(task.taskId) && !hasIncoming.has(task.taskId)
      if (isOrphan && tasks.length > 1) {
        issues.push({
          issueId: nextIssueId(),
          type: PlanValidationIssueType.OrphanTask,
          severity: PlanValidationSeverity.Warning,
          message: `Task "${task.taskId}" has no dependencies or dependents (orphan)`,
        })
      }
    }

    return issues
  }

  /**
   * Validate scope consistency: check that tasks in the same scope have consistent properties.
   */
  validateScopeConsistency(tasks: Task[]): ScopeValidationResult[] {
    const results: ScopeValidationResult[] = []
    const scopeMap = new Map<string, Task[]>()

    for (const task of tasks) {
      const scopeTasks = scopeMap.get(task.scope) || []
      scopeTasks.push(task)
      scopeMap.set(task.scope, scopeTasks)
    }

    for (const [scope, scopeTasks] of scopeMap) {
      const issues: PlanValidationIssue[] = []

      // Check for empty scope
      if (!scope || scope.trim().length === 0) {
        issues.push({
          issueId: nextIssueId(),
          type: PlanValidationIssueType.InvalidScope,
          severity: PlanValidationSeverity.Warning,
          message: `${scopeTasks.length} task(s) have empty scope`,
        })
      }

      results.push({
        scope,
        issues,
        overallSeverity: this.computeOverallSeverity(issues),
      })
    }

    return results
  }

  /**
   * Detect duplicate tasks by ID.
   */
  private detectDuplicateTasks(tasks: Task[]): PlanValidationIssue[] {
    const issues: PlanValidationIssue[] = []
    const seen = new Map<string, number>()

    for (const task of tasks) {
      const count = seen.get(task.taskId) || 0
      seen.set(task.taskId, count + 1)
    }

    for (const [taskId, count] of seen) {
      if (count > 1) {
        issues.push({
          issueId: nextIssueId(),
          type: PlanValidationIssueType.DuplicateTask,
          severity: PlanValidationSeverity.Error,
          message: `Duplicate task ID "${taskId}" found (${count} occurrences)`,
        })
      }
    }

    return issues
  }

  /**
   * Compute the overall severity from a list of issues.
   */
  private computeOverallSeverity(issues: PlanValidationIssue[]): PlanValidationSeverity {
    if (issues.some((i) => i.severity === PlanValidationSeverity.Error)) {
      return PlanValidationSeverity.Error
    }
    if (issues.some((i) => i.severity === PlanValidationSeverity.Warning)) {
      return PlanValidationSeverity.Warning
    }
    if (issues.some((i) => i.severity === PlanValidationSeverity.Info)) {
      return PlanValidationSeverity.Info
    }
    return PlanValidationSeverity.Info
  }
}
