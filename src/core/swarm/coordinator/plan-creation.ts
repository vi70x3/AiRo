import {
  Plan,
  Task,
  Dependency,
  DependencyType,
  TaskStatus,
  Checkpoint,
  CheckpointStatus,
} from '@roo-code/types'

/**
 * Input for plan creation — a high-level task description
 * that needs to be decomposed into a task DAG.
 */
export interface PlanInput {
  description: string
  /** High-level task descriptions to decompose */
  taskDescriptions: TaskDescription[]
  /** Known dependencies between tasks (by description index) */
  knownDependencies?: DependencyInput[]
}

export interface TaskDescription {
  description: string
  /** Files/areas this task will likely touch */
  scope?: string
  /** Estimated effort (1-10 scale) */
  estimatedEffort?: number
  /** Priority (1-10, higher = more important) */
  priority?: number
  /** Tags for categorization */
  tags?: string[]
  /** Checkpoints within this task */
  checkpoints?: string[]
}

export interface DependencyInput {
  /** Index of the task that depends on the other */
  fromTaskIndex: number
  /** Index of the task being depended on */
  toTaskIndex: number
  /** Type of dependency */
  type?: DependencyType
}

export class PlanCreator {
  private taskIdCounter = 0

  /**
   * Create a complete plan from high-level input.
   * Generates task IDs, sets up dependencies, assigns scopes,
   * creates checkpoints, and builds the full Plan object.
   */
  createPlan(input: PlanInput): Plan {
    // Build tasks from descriptions
    const tasks = input.taskDescriptions.map((desc, index) => this.buildTask(desc, index))

    // Build explicit dependencies from knownDependencies
    const explicitDeps = input.knownDependencies
      ? this.buildDependencies(input.knownDependencies, tasks)
      : []

    // Analyze for implicit dependencies
    const implicitDeps = this.analyzeImplicitDependencies(input.taskDescriptions)
    const builtImplicitDeps = this.buildDependencies(implicitDeps, tasks)

    // Merge dependencies, avoiding duplicates
    const allDeps = [...explicitDeps]
    for (const dep of builtImplicitDeps) {
      const exists = allDeps.some(
        (d) => d.fromTaskId === dep.fromTaskId && d.toTaskId === dep.toTaskId
      )
      if (!exists) {
        allDeps.push(dep)
      }
    }

    return {
      planId: this.generatePlanId(),
      version: 1,
      tasks,
      dependencies: allDeps,
      description: input.description,
      updateHistory: [],
    }
  }

  /**
   * Generate a unique task ID.
   */
  private generateTaskId(): string {
    this.taskIdCounter++
    return `task-${this.taskIdCounter}-${crypto.randomUUID().slice(0, 8)}`
  }

  /**
   * Generate a unique plan ID.
   */
  private generatePlanId(): string {
    return `plan-${crypto.randomUUID()}`
  }

  /**
   * Build a Task object from a TaskDescription.
   * Assigns ID, default values for missing fields, creates checkpoints.
   */
  private buildTask(desc: TaskDescription, index: number): Task {
    const scope = desc.scope ?? this.inferScope(desc.description, index)
    return {
      taskId: this.generateTaskId(),
      description: desc.description,
      owner: '',
      scope,
      status: TaskStatus.Pending,
      dependsOn: [],
      blockedBy: [],
      checkpoints: this.createCheckpoints(desc.checkpoints ?? []),
      estimatedEffort: desc.estimatedEffort ?? 5,
      priority: desc.priority ?? 5,
      tags: desc.tags ?? [],
    }
  }

  /**
   * Build Dependency objects from DependencyInput array.
   * Resolves task indices to task IDs.
   */
  private buildDependencies(inputs: DependencyInput[], tasks: Task[]): Dependency[] {
    const deps: Dependency[] = []
    for (const input of inputs) {
      const fromTask = tasks[input.fromTaskIndex]
      const toTask = tasks[input.toTaskIndex]
      if (fromTask && toTask) {
        deps.push({
          fromTaskId: fromTask.taskId,
          toTaskId: toTask.taskId,
          type: input.type ?? DependencyType.Soft,
        })
      }
    }
    return deps
  }

  /**
   * Analyze task descriptions for implicit dependencies.
   * For example, if two tasks share the same scope, they may need
   * a soft dependency to coordinate file access.
   *
   * Returns additional DependencyInput[] for implicit dependencies.
   */
  analyzeImplicitDependencies(descriptions: TaskDescription[]): DependencyInput[] {
    const implicitDeps: DependencyInput[] = []
    const scopeMap = new Map<number, string>()

    // Infer scopes for all descriptions
    for (let i = 0; i < descriptions.length; i++) {
      const scope = descriptions[i].scope ?? this.inferScope(descriptions[i].description, i)
      scopeMap.set(i, scope)
    }

    // For each pair of tasks with the same scope, add a soft dependency
    // (lower index depends on higher index for consistent ordering)
    for (let i = 0; i < descriptions.length; i++) {
      for (let j = i + 1; j < descriptions.length; j++) {
        const scopeI = scopeMap.get(i)
        const scopeJ = scopeMap.get(j)
        if (scopeI && scopeJ && scopeI === scopeJ) {
          implicitDeps.push({
            fromTaskIndex: i,
            toTaskIndex: j,
            type: DependencyType.Soft,
          })
        }
      }
    }

    return implicitDeps
  }

  /**
   * Assign scopes to tasks that don't have explicit scopes.
   * Uses task description keywords to infer scope areas.
   */
  assignScopes(descriptions: TaskDescription[]): Map<number, string> {
    const result = new Map<number, string>()
    for (let i = 0; i < descriptions.length; i++) {
      const scope = descriptions[i].scope ?? this.inferScope(descriptions[i].description, i)
      result.set(i, scope)
    }
    return result
  }

  /**
   * Create checkpoint objects from checkpoint descriptions.
   */
  private createCheckpoints(checkpointDescriptions: string[]): Checkpoint[] {
    return checkpointDescriptions.map((desc) => ({
      checkpointId: `checkpoint-${crypto.randomUUID().slice(0, 8)}`,
      description: desc,
      status: CheckpointStatus.Pending,
      completedAt: null,
      validationResult: null,
    }))
  }

  /**
   * Infer scope from task description using keyword matching.
   * Order matters: more specific categories are checked first.
   */
  private inferScope(description: string, index: number): string {
    const lower = description.toLowerCase()

    // Check more specific/narrow categories first
    const documentationKeywords = ['docs', 'documentation', 'readme']
    const testingKeywords = ['test', 'spec', 'testing', 'coverage']
    const infrastructureKeywords = ['config', 'setup', 'infrastructure', 'deploy']
    const frontendKeywords = ['ui', 'page', 'component', 'style', 'css', 'html', 'frontend', 'react']
    const backendKeywords = ['api', 'server', 'database', 'migration', 'model', 'backend', 'endpoint']

    if (documentationKeywords.some((kw) => lower.includes(kw))) return 'documentation'
    if (testingKeywords.some((kw) => lower.includes(kw))) return 'testing'
    if (infrastructureKeywords.some((kw) => lower.includes(kw))) return 'infrastructure'
    if (frontendKeywords.some((kw) => lower.includes(kw))) return 'frontend'
    if (backendKeywords.some((kw) => lower.includes(kw))) return 'backend'

    return `scope-${index}`
  }
}
