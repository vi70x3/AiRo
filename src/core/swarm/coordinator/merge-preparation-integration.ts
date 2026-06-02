import { IDaemon } from '../interfaces'
import {
  Plan,
  CompletionReport,
  MergeReadinessReport,
  MergePreparationResult,
  MergePreparationAction,
  MergePreparationStatusReport,
  ValidationResult,
  ValidationStatus,
  AgentLifecycleState,
} from '@roo-code/types'

/**
 * Integration layer that coordinates merge preparation logic with the Coordinator.
 * It provides methods to evaluate merge readiness, initiate preparation,
 * and decide on automatic merge actions based on task completions.
 */
export class MergePreparationIntegration {
  private daemon: IDaemon
  private coordinatorId: string

  constructor(daemon: IDaemon, coordinatorId: string) {
    this.daemon = daemon
    this.coordinatorId = coordinatorId
  }

  /**
   * Check merge readiness for a given plan. Determines if all tasks are completed,
   * there are no active agents, and validation checks have passed.
   */
  checkMergeReadinessForPlan(plan: Plan): MergeReadinessReport {
    const incompleteTasks = plan.tasks.filter((t) => t.status !== 'completed')
    const blockers: string[] = []

    if (incompleteTasks.length > 0) {
      blockers.push(`${incompleteTasks.length} task(s) are not completed`)
    }

    const allAgents = this.daemon.listAgents()
    const activeAgents = allAgents.filter(
      (a) =>
        a.state === AgentLifecycleState.Running ||
        a.state === AgentLifecycleState.Blocked ||
        a.state === AgentLifecycleState.Spawned ||
        a.state === AgentLifecycleState.Ready
    )

    if (activeAgents.length > 0) {
      blockers.push(`${activeAgents.length} active agent(s) still running`)
    }

    const validationResults: ValidationResult[] = [
      {
        checkName: 'all_tasks_completed',
        status: incompleteTasks.length === 0 ? ValidationStatus.Passed : ValidationStatus.Failed,
        message:
          incompleteTasks.length === 0
            ? 'All tasks completed'
            : `${incompleteTasks.length} tasks incomplete`,
      },
      {
        checkName: 'no_active_agents',
        status: activeAgents.length === 0 ? ValidationStatus.Passed : ValidationStatus.Failed,
        message:
          activeAgents.length === 0
            ? 'No active agents'
            : `${activeAgents.length} active agent(s)`,
      },
    ]

    const ready =
      blockers.length === 0 &&
      validationResults.every((r) => r.status === ValidationStatus.Passed)

    return {
      ready,
      blockers,
      unresolvedConflictCount: 0,
      activeAgentCount: activeAgents.length,
      validationResults,
    }
  }

  /**
   * Initiate merge preparation for a plan. Returns a detailed MergePreparationResult.
   */
  initiateMergePreparation(plan: Plan): MergePreparationResult {
    const readiness = this.checkMergeReadinessForPlan(plan)
    const completionReports: CompletionReport[] = []

    return {
      worktreeId: plan.planId,
      readyForMerge: readiness.ready,
      unresolvedConflicts: [],
      validationChecks: readiness.validationResults,
      validationResults: readiness.validationResults,
      preparedAt: Date.now(),
      completionReports,
      blockers: readiness.blockers,
    }
  }

  /**
   * Handle a task completion report and decide what actions to take.
   */
  handleTaskCompletionForMerge(
    report: CompletionReport,
    plan: Plan
  ): MergePreparationAction[] {
    const readiness = this.checkMergeReadinessForPlan(plan)
    const actions: MergePreparationAction[] = []

    const allTasksCompleted = plan.tasks.every((t) => t.status === 'completed')

    if (!readiness.ready) {
      if (allTasksCompleted) {
        // All tasks done but merge is blocked (e.g., active agents)
        actions.push({
          type: 'block',
          reason: `Merge blocked: ${readiness.blockers.join(', ')}`,
        })
      } else {
        actions.push({
          type: 'notify',
          message: `Merge not ready: ${readiness.blockers.join(', ')}`,
        })
      }
      return actions
    }

    if (this.shouldAutoMerge(readiness, report)) {
      actions.push({
        type: 'auto_merge',
        reason: 'All tasks completed and validation passed',
      })
    } else {
      actions.push({
        type: 'block',
        reason: 'Conditions not met for auto merge',
      })
    }

    return actions
  }

  /**
   * Produce a status report for the current merge preparation state.
   */
  getMergePreparationStatus(plan: Plan): MergePreparationStatusReport {
    const readiness = this.checkMergeReadinessForPlan(plan)
    const actions = this.handleTaskCompletionForMerge(
      {
        reportId: 'status-check',
        agentId: this.coordinatorId,
        taskId: '',
        timestamp: Date.now(),
        outcome: 'success' as any,
        changes: [],
        validationResults: [],
        blockers: [],
        duration: 0,
      },
      plan
    )

    const status = readiness.ready
      ? 'ready'
      : readiness.blockers.length > 0
        ? 'blocked'
        : 'pending'

    // Ensure a 'block' action is present when the status is blocked
    if (status === 'blocked' && !actions.some((a) => a.type === 'block')) {
      actions.push({
        type: 'block',
        reason: `Merge blocked: ${readiness.blockers.join(', ')}`,
      })
    }

    const preparation: MergePreparationResult = {
      worktreeId: plan.planId,
      readyForMerge: readiness.ready,
      unresolvedConflicts: [],
      validationChecks: readiness.validationResults,
      validationResults: readiness.validationResults,
      preparedAt: Date.now(),
      completionReports: [],
      blockers: readiness.blockers,
    }

    return {
      status,
      actions,
      report: preparation,
    }
  }

  /**
   * Determine if an automatic merge should be performed based on readiness and report outcome.
   */
  shouldAutoMerge(
    readiness: MergeReadinessReport,
    report: CompletionReport
  ): boolean {
    if (!readiness.ready) return false
    if (report.outcome !== 'success') return false
    return readiness.validationResults.every(
      (v) => v.status === ValidationStatus.Passed
    )
  }
}
