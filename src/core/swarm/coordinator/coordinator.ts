import { Agent } from '../agent/agent'
import { ICoordinator, IDaemon } from '../interfaces'
import {
  AgentType,
  AgentLifecycleState,
  AgentMetadata,
  Plan,
  Task,
  Dependency,
  DependencyType,
  SwarmTaskStatus,
  PlanUpdate,
  PlanUpdateDecision,
  PlanChangeType,
  CompletionReport,
  WorktreeMetadata,
  WorktreeStatus,
  PlanVersion,
  PlanDiff,
  PlanValidationSeverity,
} from '@roo-code/types'
import { PlanCreator, PlanInput } from './plan-creation'
import { WorktreeDecider, WorktreeDecision } from './worktree-decision'
import { SpawnManager, SpawnResult } from './spawn-manager'
import { PlanReviewer } from './plan-reviewer'
import { LifecycleTracker } from './lifecycle-tracker'
import { PlanDistributor, DistributionResult } from './plan-distributor'
import { PlanVersioning } from './plan-versioning'
import { PlanQualityValidator } from './plan-quality-validator'
import { MergePreparationIntegration } from './merge-preparation-integration'

export class Coordinator extends Agent implements ICoordinator {
  private trackedAgents: Map<string, AgentLifecycleState>
  private completionReports: Map<string, CompletionReport>
  private pendingPlanUpdates: Map<string, PlanUpdate>
  private planVersioning: PlanVersioning

  public readonly planCreator: PlanCreator
  public readonly worktreeDecider: WorktreeDecider
  public readonly spawnManager: SpawnManager
  public readonly planReviewer: PlanReviewer
  public readonly lifecycleTracker: LifecycleTracker
  public readonly planDistributor: PlanDistributor
  public readonly planValidator: PlanQualityValidator
  public readonly mergeIntegration: MergePreparationIntegration

  constructor(agentId: string, daemon: IDaemon) {
    super(agentId, AgentType.Coordinator, daemon)
    this.daemon.setCoordinatorId(this.agentId)
    this.trackedAgents = new Map()
    this.completionReports = new Map()
    this.pendingPlanUpdates = new Map()
    this.planVersioning = new PlanVersioning()
    this.planCreator = new PlanCreator()
    this.worktreeDecider = new WorktreeDecider()
    this.spawnManager = new SpawnManager(this.daemon, this.agentId)
    this.planReviewer = new PlanReviewer(this.daemon)
    this.lifecycleTracker = new LifecycleTracker(this.daemon)
    this.planDistributor = new PlanDistributor(this.daemon)
    this.planValidator = new PlanQualityValidator()
    this.mergeIntegration = new MergePreparationIntegration(this.daemon, this.agentId)
    this.markReady()
  }

  /**
   * Sync the current version history to the daemon for snapshot persistence.
   */
  private syncVersionsToDaemon(): void {
    this.daemon.setPlanVersions(this.planVersioning.getHistory())
  }

  // --- ICoordinator Plan Methods ---

  createInitialPlan(description: string, tasks: Task[], dependencies: Dependency[]): Plan {
    const plan: Plan = {
      planId: crypto.randomUUID(),
      version: 1,
      tasks,
      dependencies,
      description,
      updateHistory: [],
    }
    // Validate plan quality before persisting
    const validationResult = this.planValidator.validatePlan(plan)
    if (validationResult.overallSeverity === PlanValidationSeverity.Error) {
      throw new Error(
        `Plan validation failed: ${validationResult.issues.map((i) => i.message).join('; ')}`
      )
    }
    this.daemon.setPlan(plan)
    this.planVersioning.initialize(plan, this.agentId)
    this.syncVersionsToDaemon()
    return plan
  }

  createPlanFromInput(input: PlanInput): Plan {
    const plan = this.planCreator.createPlan(input)
    // Validate plan quality before persisting
    const validationResult = this.planValidator.validatePlan(plan)
    if (validationResult.overallSeverity === PlanValidationSeverity.Error) {
      throw new Error(
        `Plan validation failed: ${validationResult.issues.map((i) => i.message).join('; ')}`
      )
    }
    this.daemon.setPlan(plan)
    this.planVersioning.initialize(plan, this.agentId)
    this.syncVersionsToDaemon()
    return plan
  }

  /**
   * Review a plan update and apply it if approved.
   *
   * Plan update lifecycle:
   *   1. pending  — update is proposed and stored in pendingPlanUpdates
   *   2. reviewed — reviewPlanUpdate() validates, analyzes impact, and decides
   *   3. approved — status set to 'approved', reviewedBy/reviewedAt stamped,
   *                 changes applied to the plan, update pushed to history
   *   4. rejected — status set to 'rejected', reviewedBy/reviewedAt stamped,
   *                 update is NOT applied but IS recorded in history for audit
   *
   * When approved, a new plan version is automatically created.
   *
   * @param update - The PlanUpdate to review (must be in 'pending' status)
   * @returns PlanUpdateDecision with approval status and reason
   */
  reviewPlanUpdate(update: PlanUpdate): PlanUpdateDecision {
    const currentPlan = this.daemon.getPlan()
    if (!currentPlan) {
      // Stamp the update as rejected when no plan exists
      update.status = 'rejected'
      update.reviewedBy = this.agentId
      update.reviewedAt = Date.now()
      update.reviewNotes = 'No current plan exists'
      return {
        updateId: update.updateId,
        approved: false,
        reason: 'No current plan exists',
        modifiedChanges: null,
      }
    }

    const reviewResult = this.planReviewer.reviewUpdate(update, currentPlan)

    const decision: PlanUpdateDecision = {
      updateId: update.updateId,
      approved: reviewResult.approved,
      reason: reviewResult.reason,
      modifiedChanges: reviewResult.approved ? update.changes : null,
    }

    // Stamp the update with review metadata regardless of outcome
    update.reviewedBy = this.agentId
    update.reviewedAt = Date.now()
    update.reviewNotes = reviewResult.reviewNotes

    if (decision.approved) {
      update.status = 'approved'
      this.applyPlanUpdate(update)
      // Auto-create a new version when the plan is approved and modified
      const updatedPlan = this.daemon.getPlan()
      if (updatedPlan) {
        this.planVersioning.recordVersion(
          updatedPlan,
          this.agentId,
          `Plan update approved: ${update.reason}`
        )
        this.syncVersionsToDaemon()
      }
    } else {
      update.status = 'rejected'
    }

    // Persist the reviewed update in the plan's history for audit trail
    currentPlan.updateHistory.push(update)
    this.daemon.setPlan(currentPlan)

    this.pendingPlanUpdates.delete(update.updateId)

    return decision
  }

  distributePlan(plan: Plan): void {
    const result = this.planDistributor.distributePlan(plan)
    // Also send a simple broadcast for backward compatibility
    this.broadcast(JSON.stringify({
      type: 'plan_update',
      planId: plan.planId,
      version: plan.version,
      description: plan.description,
      distributedCount: result.distributedCount,
    }))
  }

  distributePlanUpdate(plan: Plan, update: PlanUpdate): DistributionResult {
    return this.planDistributor.distributePlanUpdate(plan, update)
  }

  // --- Plan Mutation Methods (with automatic version creation) ---

  /**
   * Add a task to the current plan and auto-create a new version.
   *
   * @param task - The task to add
   * @param changeDescription - Description of the change for version history
   * @returns The updated Plan
   */
  addTask(task: Task, changeDescription?: string): Plan {
    const currentPlan = this.daemon.getPlan()
    if (!currentPlan) {
      throw new Error('No current plan exists. Create a plan first.')
    }

    currentPlan.tasks.push(task)
    currentPlan.version++
    this.daemon.setPlan(currentPlan)

    this.planVersioning.recordVersion(
      currentPlan,
      this.agentId,
      changeDescription ?? `Added task: ${task.taskId}`
    )
    this.syncVersionsToDaemon()

    return currentPlan
  }

  /**
   * Remove a task from the current plan and auto-create a new version.
   * Also removes any dependencies involving the removed task.
   *
   * @param taskId - The ID of the task to remove
   * @param changeDescription - Description of the change for version history
   * @returns The updated Plan
   */
  removeTask(taskId: string, changeDescription?: string): Plan {
    const currentPlan = this.daemon.getPlan()
    if (!currentPlan) {
      throw new Error('No current plan exists. Create a plan first.')
    }

    currentPlan.tasks = currentPlan.tasks.filter(t => t.taskId !== taskId)
    currentPlan.dependencies = currentPlan.dependencies.filter(
      d => d.fromTaskId !== taskId && d.toTaskId !== taskId
    )
    currentPlan.version++
    this.daemon.setPlan(currentPlan)

    this.planVersioning.recordVersion(
      currentPlan,
      this.agentId,
      changeDescription ?? `Removed task: ${taskId}`
    )
    this.syncVersionsToDaemon()

    return currentPlan
  }

  /**
   * Update an existing task in the current plan and auto-create a new version.
   *
   * @param taskId - The ID of the task to update
   * @param updates - Partial task fields to update
   * @param changeDescription - Description of the change for version history
   * @returns The updated Plan
   */
  updateTask(taskId: string, updates: Partial<Task>, changeDescription?: string): Plan {
    const currentPlan = this.daemon.getPlan()
    if (!currentPlan) {
      throw new Error('No current plan exists. Create a plan first.')
    }

    const taskIndex = currentPlan.tasks.findIndex(t => t.taskId === taskId)
    if (taskIndex === -1) {
      throw new Error(`Task ${taskId} not found in plan.`)
    }

    currentPlan.tasks[taskIndex] = { ...currentPlan.tasks[taskIndex], ...updates }
    currentPlan.version++
    this.daemon.setPlan(currentPlan)

    this.planVersioning.recordVersion(
      currentPlan,
      this.agentId,
      changeDescription ?? `Updated task: ${taskId}`
    )
    this.syncVersionsToDaemon()

    return currentPlan
  }

  /**
   * Set task dependencies for a specific task and auto-create a new version.
   *
   * @param taskId - The ID of the task whose dependencies to set
   * @param dependsOn - Array of task IDs this task depends on
   * @param changeDescription - Description of the change for version history
   * @returns The updated Plan
   */
  setTaskDependencies(taskId: string, dependsOn: string[], changeDescription?: string): Plan {
    const currentPlan = this.daemon.getPlan()
    if (!currentPlan) {
      throw new Error('No current plan exists. Create a plan first.')
    }

    const taskIndex = currentPlan.tasks.findIndex(t => t.taskId === taskId)
    if (taskIndex === -1) {
      throw new Error(`Task ${taskId} not found in plan.`)
    }

    currentPlan.tasks[taskIndex].dependsOn = dependsOn
    currentPlan.version++
    this.daemon.setPlan(currentPlan)

    this.planVersioning.recordVersion(
      currentPlan,
      this.agentId,
      changeDescription ?? `Updated dependencies for task: ${taskId}`
    )
    this.syncVersionsToDaemon()

    return currentPlan
  }

  // --- Version History Query Methods ---

  /**
   * Get the full version history of the current plan.
   *
   * @returns Array of PlanVersion entries, or empty array if no plan exists
   */
  getPlanHistory(): PlanVersion[] {
    return this.planVersioning.getHistory()
  }

  /**
   * Get a specific version of the current plan.
   *
   * @param version - The version number (1-based)
   * @returns The PlanVersion, or undefined if not found
   */
  getPlanVersion(version: number): PlanVersion | undefined {
    return this.planVersioning.getVersion(version)
  }

  /**
   * Compare two versions of the current plan and return the diff.
   *
   * @param v1 - First version number
   * @param v2 - Second version number
   * @returns PlanDiff between the two versions
   */
  compareVersions(v1: number, v2: number): PlanDiff {
    return this.planVersioning.compareVersions(v1, v2)
  }

  /**
   * Roll back the current plan to a previous version.
   * Creates a NEW version that copies the old state (append-only log).
   *
   * @param version - The version number to roll back to
   * @returns The restored Plan
   */
  rollbackToVersion(version: number): Plan {
    const result = this.planVersioning.rollbackToVersion(version, this.agentId)
    this.daemon.setPlan(result.plan)
    this.syncVersionsToDaemon()
    return result.plan
  }

  // --- ICoordinator Spawning Methods ---

  spawnWorktreeManager(scope: string): AgentMetadata {
    const wm = this.spawnManager.spawnWorktreeManager(scope)
    this.trackedAgents.set(wm.agentId, wm.state)
    return wm
  }

  spawnAgent(taskId: string, worktreeScope?: string): AgentMetadata {
    const agent = this.spawnManager.spawnAgent(taskId, worktreeScope)
    this.trackedAgents.set(agent.agentId, agent.state)
    return agent
  }

  spawnAgentsForPlan(plan: Plan, worktreeDecision: WorktreeDecision): SpawnResult {
    const result = this.spawnManager.spawnAgentsForPlan(plan, worktreeDecision)
    for (const agent of result.spawned) {
      this.trackedAgents.set(agent.agentId, agent.state)
    }
    for (const wm of result.worktreeManagers) {
      this.trackedAgents.set(wm.agentId, wm.state)
    }
    return result
  }

  // --- ICoordinator Lifecycle Methods ---

  trackAgentState(agentId: string, state: AgentLifecycleState): void {
    const previousState = this.trackedAgents.get(agentId) ?? AgentLifecycleState.Spawned
    this.trackedAgents.set(agentId, state)
    this.lifecycleTracker.trackStateChange(agentId, previousState, state)
  }

  handleAgentCompletion(report: CompletionReport): void {
    this.completionReports.set(report.agentId, report)
    this.trackedAgents.set(report.agentId, AgentLifecycleState.Completed)
    this.lifecycleTracker.handleCompletion(report)
    // Trigger merge preparation integration on each completion
    const plan = this.daemon.getPlan()
    if (plan) {
      this.mergeIntegration.handleTaskCompletionForMerge(report, plan)
    }
  }

  handleAgentFailure(agentId: string, _error: string): void {
    this.trackedAgents.set(agentId, AgentLifecycleState.Failed)
    this.lifecycleTracker.handleFailure(agentId, _error)
  }

  // --- ICoordinator Worktree Methods ---

  decideWorktreeUsage(tasks: Task[]): boolean {
    const currentPlan = this.daemon.getPlan()
    const dependencies = currentPlan?.dependencies ?? []
    const decision = this.worktreeDecider.decide(tasks, dependencies)
    return decision.useWorktrees
  }

  getWorktreeDecision(tasks: Task[]): WorktreeDecision {
    const currentPlan = this.daemon.getPlan()
    const dependencies = currentPlan?.dependencies ?? []
    return this.worktreeDecider.decide(tasks, dependencies)
  }

  // --- Helper Methods ---

  /**
   * Apply an approved plan update's changes to the current plan.
   *
   * Preconditions:
   *   - update.status must be 'approved' (stamped by reviewPlanUpdate)
   *   - update.reviewedBy and update.reviewedAt must be set
   *
   * This method mutates the plan in-memory (tasks, dependencies, version).
   * The update is pushed to updateHistory by reviewPlanUpdate(), not here,
   * to ensure rejected updates are also recorded for audit purposes.
   */
  private applyPlanUpdate(update: PlanUpdate): void {
    const currentPlan = this.daemon.getPlan()
    if (!currentPlan) return

    for (const change of update.changes) {
      switch (change.changeType) {
        case PlanChangeType.AddTask: {
          const newTask = change.after as Task
          if (newTask) {
            currentPlan.tasks.push(newTask)
          }
          break
        }
        case PlanChangeType.ModifyTask: {
          const modifiedTask = change.after as Task
          if (modifiedTask) {
            const idx = currentPlan.tasks.findIndex(t => t.taskId === modifiedTask.taskId)
            if (idx !== -1) {
              currentPlan.tasks[idx] = modifiedTask
            }
          }
          break
        }
        case PlanChangeType.RemoveTask: {
          const removedTaskId = change.targetId
          currentPlan.tasks = currentPlan.tasks.filter(t => t.taskId !== removedTaskId)
          currentPlan.dependencies = currentPlan.dependencies.filter(
            d => d.fromTaskId !== removedTaskId && d.toTaskId !== removedTaskId
          )
          break
        }
        case PlanChangeType.AddDependency: {
          const newDep = change.after as Dependency
          if (newDep) {
            currentPlan.dependencies.push(newDep)
          }
          break
        }
        case PlanChangeType.RemoveDependency: {
          currentPlan.dependencies = currentPlan.dependencies.filter(
            d => !(d.fromTaskId === change.targetId || d.toTaskId === change.targetId)
          )
          break
        }
        case PlanChangeType.UpdateScope: {
          const modifiedTask = change.after as Task
          if (modifiedTask) {
            const idx = currentPlan.tasks.findIndex(t => t.taskId === modifiedTask.taskId)
            if (idx !== -1) {
              currentPlan.tasks[idx] = modifiedTask
            }
          }
          break
        }
      }
    }

    currentPlan.version++
    this.daemon.setPlan(currentPlan)
  }

  getTrackedAgents(): Map<string, AgentLifecycleState> {
    return new Map(this.trackedAgents)
  }

  getCompletionReport(agentId: string): CompletionReport | undefined {
    return this.completionReports.get(agentId)
  }

  getAllCompletionReports(): CompletionReport[] {
    return Array.from(this.completionReports.values())
  }

  /**
   * Register a plan update as pending review.
   *
   * This is the entry point of the plan update lifecycle:
   *   update.status should be 'pending' when calling this method.
   *   The update will be stamped with reviewedBy/reviewedAt and moved
   *   to 'approved' or 'rejected' status when reviewPlanUpdate() is called.
   */
  addPendingPlanUpdate(update: PlanUpdate): void {
    this.pendingPlanUpdates.set(update.updateId, update)
  }

  getPendingPlanUpdates(): PlanUpdate[] {
    return Array.from(this.pendingPlanUpdates.values())
  }
}
