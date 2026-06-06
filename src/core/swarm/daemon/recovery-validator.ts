import {
  AgentLifecycleState,
  DaemonSnapshot,
  ResumeCheckpoint,
  SwarmTaskStatus,
  CrashValidationResult,
} from '@roo-code/types'

export class RecoveryValidator {
  validateSnapshot(snapshot: DaemonSnapshot): CrashValidationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const recoverableIssues: string[] = []

    // Validate agent references are consistent
    this.validateAgentConsistency(snapshot, errors, warnings, recoverableIssues)

    // Validate channel histories don't reference non-existent agents
    this.validateChannelHistories(snapshot, errors, warnings, recoverableIssues)

    // Validate plan state consistency
    if (snapshot.plan) {
      this.validatePlanState(snapshot, errors, warnings, recoverableIssues)
    }

    // Validate no orphaned worktrees
    this.validateWorktreeConsistency(snapshot, errors, warnings, recoverableIssues)

    const valid = errors.length === 0

    return {
      valid,
      errors,
      warnings,
      recoverableIssues,
    }
  }

  attemptRepair(snapshot: DaemonSnapshot, issues: string[]): DaemonSnapshot {
    const repaired = JSON.parse(JSON.stringify(snapshot)) as DaemonSnapshot

    for (const issue of issues) {
      if (issue.startsWith('Channel history references non-existent agent:')) {
        // Remove messages from non-existent agents
        const agentId = issue.split(':')[1]?.trim()
        if (agentId && repaired.channelHistories) {
          for (const entry of repaired.channelHistories) {
            entry.messages = entry.messages.filter(m => m.senderId !== agentId)
          }
        }
      }

      if (issue.startsWith('Task assigned to crashed agent:')) {
        // Reset task status to pending for reassignment
        const parts = issue.split(':')
        const taskId = parts[1]?.trim()
        if (taskId && repaired.plan) {
          const task = repaired.plan.tasks.find(t => t.taskId === taskId)
          if (task && task.status === SwarmTaskStatus.InProgress) {
            task.status = SwarmTaskStatus.Pending
          }
        }
      }

      if (issue.startsWith('Orphaned worktree:')) {
        // Remove orphaned worktree references from agents
        const worktreeScope = issue.split(':')[1]?.trim()
        if (worktreeScope) {
          repaired.agents = repaired.agents.map(agent => {
            if (agent.worktreeScope === worktreeScope) {
              return { ...agent, worktreeScope: '' }
            }
            return agent
          })
        }
      }
    }

    return repaired
  }

  validateCheckpoint(checkpoint: ResumeCheckpoint, snapshot: DaemonSnapshot): CrashValidationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const recoverableIssues: string[] = []

    // Check agent exists in snapshot
    const agentExists = snapshot.agents.some(a => a.agentId === checkpoint.agentId)
    if (!agentExists) {
      errors.push(`Agent '${checkpoint.agentId}' referenced in checkpoint does not exist in snapshot`)
    }

    // Check task exists if referenced
    if (checkpoint.lastTaskId && snapshot.plan) {
      const taskExists = snapshot.plan.tasks.some(t => t.taskId === checkpoint.lastTaskId)
      if (!taskExists) {
        warnings.push(`Task '${checkpoint.lastTaskId}' referenced in checkpoint does not exist in plan`)
      }
    }

    // Check worktree scope is valid
    if (checkpoint.worktreeScope) {
      const worktreeAgents = snapshot.agents.filter(a => a.worktreeScope === checkpoint.worktreeScope)
      if (worktreeAgents.length === 0) {
        recoverableIssues.push(`Worktree '${checkpoint.worktreeScope}' has no assigned agents`)
      }
    }

    // Validate checkpoint state is resumable
    const resumableStates: AgentLifecycleState[] = [
      AgentLifecycleState.Running,
      AgentLifecycleState.Blocked,
      AgentLifecycleState.Ready,
    ]
    if (!resumableStates.includes(checkpoint.lastState)) {
      warnings.push(`Agent state '${checkpoint.lastState}' may not be directly resumable`)
    }

    const valid = errors.length === 0

    return {
      valid,
      errors,
      warnings,
      recoverableIssues,
    }
  }

  // --- Private Methods ---

  private validateAgentConsistency(
    snapshot: DaemonSnapshot,
    errors: string[],
    warnings: string[],
    recoverableIssues: string[]
  ): void {
    const agentIds = new Set(snapshot.agents.map(a => a.agentId))

    // Check for agents in running state but with no heartbeat
    for (const agent of snapshot.agents) {
      if (agent.state === AgentLifecycleState.Running) {
        const timeSinceHeartbeat = Date.now() - agent.lastHeartbeat
        if (timeSinceHeartbeat > 120000) {
          warnings.push(`Agent '${agent.agentId}' is in running state but last heartbeat was ${timeSinceHeartbeat}ms ago`)
        }
      }

      // Check for crashed agents
      if (agent.state === AgentLifecycleState.Crashed) {
        recoverableIssues.push(`Agent '${agent.agentId}' is in crashed state and may need recovery`)
      }
    }

    // Validate notification queues reference existing agents
    for (const agentId of Object.keys(snapshot.notificationQueues)) {
      if (!agentIds.has(agentId)) {
        recoverableIssues.push(`Notification queue references non-existent agent: ${agentId}`)
      }
    }
  }

  private validateChannelHistories(
    snapshot: DaemonSnapshot,
    errors: string[],
    warnings: string[],
    recoverableIssues: string[]
  ): void {
    const agentIds = new Set(snapshot.agents.map(a => a.agentId))

    if (!snapshot.channelHistories) {
      return
    }

    for (const entry of snapshot.channelHistories) {
      for (const message of entry.messages) {
        if (!agentIds.has(message.senderId)) {
          recoverableIssues.push(`Channel history references non-existent agent: ${message.senderId}`)
        }
      }
    }
  }

  private validatePlanState(
    snapshot: DaemonSnapshot,
    errors: string[],
    warnings: string[],
    recoverableIssues: string[]
  ): void {
    const crashedAgentIds = new Set(
      snapshot.agents
        .filter(a => a.state === AgentLifecycleState.Crashed)
        .map(a => a.agentId)
    )

    for (const task of snapshot.plan!.tasks) {
      // Check if task is assigned to crashed agent
      if (crashedAgentIds.has(task.owner) && task.status === SwarmTaskStatus.InProgress) {
        recoverableIssues.push(`Task assigned to crashed agent: ${task.taskId}`)
      }

      // Check for tasks with invalid dependencies
      for (const depId of task.dependsOn) {
        const depTask = snapshot.plan!.tasks.find(t => t.taskId === depId)
        if (!depTask) {
          errors.push(`Task '${task.taskId}' depends on non-existent task: ${depId}`)
        }
      }
    }
  }

  private validateWorktreeConsistency(
    snapshot: DaemonSnapshot,
    errors: string[],
    warnings: string[],
    recoverableIssues: string[]
  ): void {
    const worktreeScopes = new Set(
      snapshot.agents
        .map(a => a.worktreeScope)
        .filter(scope => scope && scope !== '')
    )

    for (const scope of worktreeScopes) {
      const agentsInWorktree = snapshot.agents.filter(a => a.worktreeScope === scope)
      if (agentsInWorktree.length === 0) {
        recoverableIssues.push(`Orphaned worktree: ${scope}`)
      }
    }
  }
}