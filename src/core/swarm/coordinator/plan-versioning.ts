import { Plan, PlanVersion, PlanDiff, Task } from '@roo-code/types'

/**
 * Default number of recent versions to keep in memory.
 * All versions are persisted to disk via daemon snapshots.
 */
const DEFAULT_MAX_VERSIONS_IN_MEMORY = 50

/**
 * Computes a diff between two task arrays (old vs new).
 * Returns added, removed, and modified task IDs with field-level changes.
 *
 * O(n) comparison using Maps for efficient lookups.
 */
export function computeTaskDiff(oldTasks: Task[], newTasks: Task[]): PlanDiff {
  const addedTasks: string[] = []
  const removedTasks: string[] = []
  const modifiedTasks: { taskId: string; changes: string[] }[] = []

  const oldMap = new Map<string, Task>()
  for (const t of oldTasks) {
    oldMap.set(t.taskId, t)
  }

  const newMap = new Map<string, Task>()
  for (const t of newTasks) {
    newMap.set(t.taskId, t)
  }

  // Find added and modified tasks
  for (const [taskId, newTask] of newMap) {
    const oldTask = oldMap.get(taskId)
    if (!oldTask) {
      addedTasks.push(taskId)
    } else {
      const fieldChanges = computeFieldChanges(oldTask, newTask)
      if (fieldChanges.length > 0) {
        modifiedTasks.push({ taskId, changes: fieldChanges })
      }
    }
  }

  // Find removed tasks
  for (const [taskId] of oldMap) {
    if (!newMap.has(taskId)) {
      removedTasks.push(taskId)
    }
  }

  return { addedTasks, removedTasks, modifiedTasks }
}

/**
 * Compare two Task objects field by field and return the list of changed field names.
 */
function computeFieldChanges(oldTask: Task, newTask: Task): string[] {
  const changes: string[] = []
  const fields: (keyof Task)[] = [
    'description', 'owner', 'scope', 'status', 'dependsOn',
    'blockedBy', 'checkpoints', 'estimatedEffort', 'priority', 'tags',
  ]
  for (const field of fields) {
    const oldVal = oldTask[field]
    const newVal = newTask[field]
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push(field)
    }
  }
  return changes
}

/**
 * Deep-clone a Plan object to ensure version snapshots are independent.
 */
export function clonePlan(plan: Plan): Plan {
  return JSON.parse(JSON.stringify(plan))
}

/**
 * PlanVersioning manages the version history for a single plan.
 *
 * It maintains an append-only log of PlanVersion entries, computes diffs
 * between versions, and supports rollback (which creates a new version
 * copying the old state — history is never deleted).
 *
 * Memory bounding: only the last N full plan snapshots are kept in memory.
 * Older versions store only the diff. All versions are persisted to disk
 * via the daemon snapshot mechanism.
 */
export class PlanVersioning {
  private versions: PlanVersion[] = []
  private maxVersionsInMemory: number
  private currentPlan: Plan | null = null

  constructor(maxVersionsInMemory: number = DEFAULT_MAX_VERSIONS_IN_MEMORY) {
    this.maxVersionsInMemory = maxVersionsInMemory
  }

  /**
   * Initialize versioning with the first version of a plan.
   * Called when a plan is first created.
   */
  initialize(plan: Plan, createdBy: string): PlanVersion {
    const version: PlanVersion = {
      version: 1,
      plan: clonePlan(plan),
      createdAt: Date.now(),
      createdBy,
      changeDescription: 'Plan created',
      diff: {
        addedTasks: plan.tasks.map(t => t.taskId),
        removedTasks: [],
        modifiedTasks: [],
      },
    }
    this.versions = [version]
    this.currentPlan = clonePlan(plan)
    return version
  }

  /**
   * Record a new version after a plan mutation.
   * Computes the diff between the current state and the new state.
   *
   * @param newPlan - The mutated plan (already modified)
   * @param createdBy - The agentId making the change
   * @param changeDescription - Human-readable description of the change
   * @returns The newly created PlanVersion
   */
  recordVersion(newPlan: Plan, createdBy: string, changeDescription: string): PlanVersion {
    if (!this.currentPlan) {
      throw new Error('PlanVersioning not initialized. Call initialize() first.')
    }

    const diff = computeTaskDiff(this.currentPlan.tasks, newPlan.tasks)
    const nextVersion = this.versions.length + 1

    const version: PlanVersion = {
      version: nextVersion,
      plan: clonePlan(newPlan),
      createdAt: Date.now(),
      createdBy,
      changeDescription,
      diff,
    }

    this.versions.push(version)
    this.currentPlan = clonePlan(newPlan)
    this.enforceMemoryBound()

    return version
  }

  /**
   * Get the full version history (all versions).
   */
  getHistory(): PlanVersion[] {
    return [...this.versions]
  }

  /**
   * Get a specific version by version number (1-based).
   */
  getVersion(versionNumber: number): PlanVersion | undefined {
    if (versionNumber < 1 || versionNumber > this.versions.length) {
      return undefined
    }
    return this.versions[versionNumber - 1]
  }

  /**
   * Get the latest version.
   */
  getLatestVersion(): PlanVersion | undefined {
    if (this.versions.length === 0) {
      return undefined
    }
    return this.versions[this.versions.length - 1]
  }

  /**
   * Compare two versions and return the diff between them.
   * The diff is computed by comparing the task arrays of the two versions.
   *
   * @param v1 - First version number
   * @param v2 - Second version number
   * @returns PlanDiff between the two versions
   */
  compareVersions(v1: number, v2: number): PlanDiff {
    const version1 = this.getVersion(v1)
    const version2 = this.getVersion(v2)

    if (!version1 || !version2) {
      throw new Error(`Invalid version(s): v1=${v1}, v2=${v2}. Valid range: 1-${this.versions.length}`)
    }

    return computeTaskDiff(version1.plan.tasks, version2.plan.tasks)
  }

  /**
   * Roll back to a previous version by creating a NEW version that
   * copies the state of the target version. This is an append-only
   * operation — no history is deleted.
   *
   * @param versionNumber - The version to roll back to
   * @param createdBy - The agentId performing the rollback
   * @returns The new Plan (with the rolled-back state) and the new PlanVersion
   */
  rollbackToVersion(versionNumber: number, createdBy: string): { plan: Plan; version: PlanVersion } {
    const targetVersion = this.getVersion(versionNumber)
    if (!targetVersion) {
      throw new Error(`Version ${versionNumber} not found. Valid range: 1-${this.versions.length}`)
    }

    const rolledBackPlan = clonePlan(targetVersion.plan)
    const nextVersionNumber = this.versions.length + 1

    // Update the plan's version number to match the new version
    rolledBackPlan.version = nextVersionNumber

    const diff = computeTaskDiff(this.currentPlan!.tasks, rolledBackPlan.tasks)

    const newVersion: PlanVersion = {
      version: nextVersionNumber,
      plan: clonePlan(rolledBackPlan),
      createdAt: Date.now(),
      createdBy,
      changeDescription: `Rolled back to version ${versionNumber}`,
      diff,
    }

    this.versions.push(newVersion)
    this.currentPlan = clonePlan(rolledBackPlan)
    this.enforceMemoryBound()

    return { plan: rolledBackPlan, version: newVersion }
  }

  /**
   * Restore version history from a persisted snapshot.
   */
  restoreFromVersions(versions: PlanVersion[]): void {
    this.versions = [...versions]
    if (versions.length > 0) {
      const latest = versions[versions.length - 1]
      this.currentPlan = clonePlan(latest.plan)
    }
  }

  /**
   * Get the current in-memory plan state.
   */
  getCurrentPlan(): Plan | null {
    return this.currentPlan ? clonePlan(this.currentPlan) : null
  }

  /**
   * Enforce the memory bounding policy: keep only the last N versions
   * with full plan snapshots. Older versions have their plan cleared
   * (only the diff is retained).
   *
   * All versions are still persisted to disk via daemon snapshots,
   * so this is purely an in-memory optimization.
   */
  private enforceMemoryBound(): void {
    if (this.versions.length <= this.maxVersionsInMemory) {
      return
    }

    // Keep the last N versions with full snapshots.
    // For older versions, clear the plan to save memory (keep only diff).
    const cutoff = this.versions.length - this.maxVersionsInMemory
    for (let i = 0; i < cutoff; i++) {
      // Clear the plan snapshot for old versions — diff is still available
      this.versions[i] = {
        ...this.versions[i],
        plan: { ...this.versions[i].plan, tasks: [], dependencies: [], updateHistory: [] } as unknown as Plan,
      }
    }
  }
}
