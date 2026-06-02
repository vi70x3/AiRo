import {
  WorktreeMetadata,
  WorktreeStatus,
  ConflictInfo,
  ConflictStatus,
  MergePreparation,
  CompletionReport,
  ValidationResult,
  ValidationStatus,
  AgentLifecycleState,
  AgentMetadata,
} from '@roo-code/types'
import { IDaemon } from '../interfaces'
import { v4 as uuidv4 } from 'uuid'

export interface MergeReadiness {
  ready: boolean
  blockers: string[]
  unresolvedConflictCount: number
  activeAgentCount: number
  validationResults: ValidationResult[]
}

export class MergePreparer {
  private daemon: IDaemon
  private worktreeScope: string
  private managerId: string
  private trackedConflicts: Map<string, ConflictInfo> = new Map()

  constructor(daemon: IDaemon, worktreeScope: string, managerId: string) {
    this.daemon = daemon
    this.worktreeScope = worktreeScope
    this.managerId = managerId
  }

  /** Set the tracked conflicts for this worktree */
  setTrackedConflicts(conflicts: Map<string, ConflictInfo>): void {
    this.trackedConflicts = conflicts
  }

  /** Prepare worktree for merge: verify agents completed, run validation, detect conflicts, create MergePreparation */
  prepareForMerge(): MergePreparation {
    const readiness = this.checkMergeReadiness()
    const completionReports = this.getAgentCompletionReports()
    const validationResults = this.runValidation()
    const blockers: string[] = []

    // Collect blockers from unresolved conflicts
    if (readiness.unresolvedConflictCount > 0) {
      for (const conflict of this.trackedConflicts.values()) {
        if (conflict.status !== ConflictStatus.Resolved) {
          blockers.push(`Unresolved conflict in ${conflict.filePath}`)
        }
      }
    }

    // Collect blockers from active agents
    if (readiness.activeAgentCount > 0) {
      blockers.push(`${readiness.activeAgentCount} Active agents still running`)
    }

    // Collect blockers from failed validation
    for (const result of validationResults) {
      if (result.status === ValidationStatus.Failed) {
        blockers.push(`Validation failed: ${result.checkName}`)
      }
    }

    const preparation: MergePreparation = {
      worktreeId: this.worktreeScope,
      readyForMerge: readiness.ready && blockers.length === 0,
      unresolvedConflicts: Array.from(this.trackedConflicts.values())
        .filter(c => c.status !== ConflictStatus.Resolved)
        .map(c => c.conflictId),
      testResults: null,
      // validationChecks removed; using validationResults only
      validationResults,
      preparedAt: Date.now(),
      completionReports,
      blockers,
    }

    return preparation
  }

  /** Check if worktree is ready for merge */
  checkMergeReadiness(): MergeReadiness {
    const allAgents = this.daemon.listAgents()
    const scopeAgents = allAgents.filter(
      agent => agent.worktreeScope === this.worktreeScope
    )

    // Count active agents (not completed or stopped/failed/crashed)
    const activeAgents = scopeAgents.filter(
      agent =>
        agent.state === AgentLifecycleState.Running ||
        agent.state === AgentLifecycleState.Blocked ||
        agent.state === AgentLifecycleState.Spawned ||
        agent.state === AgentLifecycleState.Ready
    )

    // Count unresolved conflicts
    const unresolvedConflicts = Array.from(this.trackedConflicts.values()).filter(
      c => c.status !== ConflictStatus.Resolved
    )

    // Build blockers list
    const blockers: string[] = []
    if (unresolvedConflicts.length > 0) {
      blockers.push(`${unresolvedConflicts.length} Unresolved conflicts`)
    }
    if (activeAgents.length > 0) {
      blockers.push(`${activeAgents.length} Active agents still running`)
    }

    // Run validation checks
    const validationResults = this.runValidation()

    return {
      ready: blockers.length === 0,
      blockers,
      unresolvedConflictCount: unresolvedConflicts.length,
      activeAgentCount: activeAgents.length,
      validationResults,
    }
  }

  /** Verify all agents in scope have completed */
  verifyAgentsCompleted(): boolean {
    const allAgents = this.daemon.listAgents()
    const scopeAgents = allAgents.filter(
      agent => agent.worktreeScope === this.worktreeScope
    )

    return scopeAgents.every(
      agent =>
        agent.state === AgentLifecycleState.Completed ||
        agent.state === AgentLifecycleState.Stopped ||
        agent.state === AgentLifecycleState.Failed ||
        agent.state === AgentLifecycleState.Crashed
    )
  }

  /** Get completion reports for all agents in scope */
  getAgentCompletionReports(): CompletionReport[] {
    // In a real implementation, this would retrieve reports from the daemon
    // For now, we return an empty array as reports are stored elsewhere
    return []
  }

  /** Run validation checks (simulated — check completion reports for validation results) */
  runValidation(): ValidationResult[] {
    const results: ValidationResult[] = []

    // Check 1: All agents completed
    const agentsCompleted = this.verifyAgentsCompleted()
    results.push({
      checkName: 'agent_completion',
      status: agentsCompleted ? ValidationStatus.Passed : ValidationStatus.Warning,
      message: agentsCompleted
        ? 'All agents have completed'
        : 'Some agents are still active',
    })

    // Check 2: No unresolved conflicts
    const unresolvedConflicts = Array.from(this.trackedConflicts.values()).filter(
      c => c.status !== ConflictStatus.Resolved
    )
    results.push({
      checkName: 'conflict_resolution',
      status:
        unresolvedConflicts.length === 0
          ? ValidationStatus.Passed
          : ValidationStatus.Failed,
      message:
        unresolvedConflicts.length === 0
          ? 'All conflicts resolved'
          : `${unresolvedConflicts.length} unresolved conflict(s)`,
    })

    // Check 3: No agents assigned (warning if no agents)
    const allAgents = this.daemon.listAgents()
    const scopeAgents = allAgents.filter(
      agent => agent.worktreeScope === this.worktreeScope
    )
    results.push({
      checkName: 'agent_assignment',
      status:
        scopeAgents.length > 0
          ? ValidationStatus.Passed
          : ValidationStatus.Warning,
      message:
        scopeAgents.length > 0
          ? `${scopeAgents.length} agent(s) assigned`
          : 'No agents assigned to this worktree',
    })

    return results
  }

  /** Detect conflicts with base branch (simulated — return existing tracked conflicts) */
  detectBaseConflicts(): ConflictInfo[] {
    // In a real implementation, this would:
    // 1. Fetch the base branch
    // 2. Attempt a merge dry-run
    // 3. Identify conflicting files
    // For now, we return the tracked conflicts as a simulation
    return Array.from(this.trackedConflicts.values())
  }

  /** Notify Coordinator that worktree is ready for merge */
  notifyCoordinatorReady(): void {
    const coordinatorId = this.daemon.getCoordinatorId()
    if (!coordinatorId) return

    const readiness = this.checkMergeReadiness()
    const preparation = this.prepareForMerge()

    this.daemon.sendDM({
      messageId: uuidv4(),
      senderId: this.managerId,
      recipientId: coordinatorId,
      content: JSON.stringify({
        type: 'merge_ready',
        worktreeId: this.worktreeScope,
        ready: readiness.ready,
        preparation,
      }),
      timestamp: Date.now(),
      read: false,
    })
  }

  /** Notify Coordinator that worktree has blockers */
  notifyCoordinatorBlocked(blockers: string[]): void {
    const coordinatorId = this.daemon.getCoordinatorId()
    if (!coordinatorId) return

    this.daemon.sendDM({
      messageId: uuidv4(),
      senderId: this.managerId,
      recipientId: coordinatorId,
      content: JSON.stringify({
        type: 'merge_blocked',
        worktreeId: this.worktreeScope,
        blockers,
      }),
      timestamp: Date.now(),
      read: false,
    })
  }

  /** Get worktree metadata with merge preparation info */
  getWorktreeMetadataWithMerge(): WorktreeMetadata {
    const preparation = this.prepareForMerge()

    const allAgents = this.daemon.listAgents()
    const scopeAgents = allAgents.filter(
      agent => agent.worktreeScope === this.worktreeScope
    )

    return {
      worktreeId: this.worktreeScope,
      path: '', // Would be populated from actual worktree
      branchName: '', // Would be populated from actual worktree
      baseBranch: 'main',
      managerId: this.managerId,
      assignedAgents: scopeAgents.map(a => a.agentId),
      status: preparation.readyForMerge ? WorktreeStatus.Merging : WorktreeStatus.Active,
      conflicts: Array.from(this.trackedConflicts.values()),
      mergePreparation: preparation,
    }
  }
}