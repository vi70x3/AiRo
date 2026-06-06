import { randomUUID } from "node:crypto"
import {
  ConflictResolutionStrategy,
  ConflictInfo,
  FileOperation,
} from '@roo-code/types'
import { IDaemon } from '../interfaces'
import { ConflictSeverity, ConflictType } from '../worktree-manager/conflict-detector'

export interface StrategyProposal {
  strategy: ConflictResolutionStrategy
  proposerId: string
  reason: string
  priorityAgent?: string
  partitionPlan?: FilePartition
  estimatedResolutionTime?: number
}

export interface FilePartition {
  assignments: Map<string, FileSection[]>
}

export interface FileSection {
  section: string
  agentId: string
}

export interface StrategyEvaluation {
  accepted: boolean
  counterProposal?: StrategyProposal
  reason: string
}

export interface SequentialOrder {
  firstAgent: string
  secondAgent: string
  reason: string
}

export interface RebaseProposal {
  baseAgent: string
  rebasingAgent: string
  reason: string
}

export class ConflictStrategies {
  private agentId: string
  private daemon: IDaemon

  constructor(agentId: string, daemon: IDaemon) {
    this.agentId = agentId
    this.daemon = daemon
  }

  proposeStrategy(
    conflictType: ConflictType,
    severity: ConflictSeverity,
    conflictingAgentId: string
  ): StrategyProposal {
    switch (conflictType) {
      case ConflictType.WriteWrite: {
        // WriteWrite → Sequential (propose self goes first if higher priority)
        const order = this.determineSequentialOrder(conflictingAgentId)
        return {
          strategy: ConflictResolutionStrategy.Merge,
          proposerId: this.agentId,
          reason: `Write-Write conflict: sequential resolution proposed. ${order.reason}`,
          priorityAgent: order.firstAgent,
          estimatedResolutionTime: 30000,
        }
      }
      case ConflictType.IntentWrite: {
        // IntentWrite → Sequential or Rebase
        const rebase = this.proposeRebase(conflictingAgentId)
        return {
          strategy: ConflictResolutionStrategy.Rebase,
          proposerId: this.agentId,
          reason: `Intent-Write conflict: rebase proposed. ${rebase.reason}`,
          estimatedResolutionTime: 20000,
        }
      }
      case ConflictType.IntentIntent: {
        // IntentIntent → Merge (partition the file)
        const partition = this.proposeMergePartition('shared-file.ts', conflictingAgentId)
        return {
          strategy: ConflictResolutionStrategy.Merge,
          proposerId: this.agentId,
          reason: 'Intent-Intent conflict: file partition proposed',
          partitionPlan: partition,
          estimatedResolutionTime: 15000,
        }
      }
      case ConflictType.ReadWrite: {
        // ReadWrite → Continue (optimistic, no action needed)
        return {
          strategy: ConflictResolutionStrategy.Merge,
          proposerId: this.agentId,
          reason: 'Read-Write conflict: optimistic continuation (low severity)',
          estimatedResolutionTime: 0,
        }
      }
    }
  }

  evaluateProposal(proposal: StrategyProposal): StrategyEvaluation {
    // Check if the proposal is fair
    // A proposal is fair if:
    // 1. It doesn't always prioritize the other agent
    // 2. The strategy is reasonable for the situation

    if (proposal.priorityAgent && proposal.priorityAgent !== this.agentId) {
      // Proposal prioritizes the other agent — counter-propose
      const order = this.determineSequentialOrder(proposal.proposerId)
      return {
        accepted: false,
        counterProposal: {
          strategy: proposal.strategy,
          proposerId: this.agentId,
          reason: `Counter-proposal: ${order.reason}`,
          priorityAgent: order.firstAgent,
        },
        reason: 'Proposal prioritizes other agent; counter-proposed with fair ordering',
      }
    }

    // Accept fair proposals
    return {
      accepted: true,
      reason: 'Proposal is fair and acceptable',
    }
  }

  determineSequentialOrder(otherAgentId: string): SequentialOrder {
    const plan = this.daemon.getPlan()
    const selfAgent = this.daemon.getAgent(this.agentId)
    const otherAgent = this.daemon.getAgent(otherAgentId)

    if (plan) {
      const selfTask = plan.tasks.find((t) => t.owner === this.agentId)
      const otherTask = plan.tasks.find((t) => t.owner === otherAgentId)

      if (selfTask && otherTask) {
        if (selfTask.priority > otherTask.priority) {
          return {
            firstAgent: this.agentId,
            secondAgent: otherAgentId,
            reason: `Task priority: ${selfTask.priority} > ${otherTask.priority}`,
          }
        }
        if (otherTask.priority > selfTask.priority) {
          return {
            firstAgent: otherAgentId,
            secondAgent: this.agentId,
            reason: `Task priority: ${otherTask.priority} > ${selfTask.priority}`,
          }
        }
      }

      if (selfTask && !otherTask) {
        return {
          firstAgent: this.agentId,
          secondAgent: otherAgentId,
          reason: 'Self has assigned task, other does not',
        }
      }
      if (!selfTask && otherTask) {
        return {
          firstAgent: otherAgentId,
          secondAgent: this.agentId,
          reason: 'Other has assigned task, self does not',
        }
      }
    }

    // Equal priority or no plan tasks — compare spawnedAt timestamps
    const selfMeta = selfAgent as unknown as { spawnedAt: number } | undefined
    const otherMeta = otherAgent as unknown as { spawnedAt: number } | undefined

    if (selfMeta && otherMeta) {
      if (selfMeta.spawnedAt <= otherMeta.spawnedAt) {
        return {
          firstAgent: this.agentId,
          secondAgent: otherAgentId,
          reason: `Earlier or equal spawn time: ${selfMeta.spawnedAt} <= ${otherMeta.spawnedAt}`,
        }
      }
      return {
        firstAgent: otherAgentId,
        secondAgent: this.agentId,
        reason: `Earlier spawn time: ${otherMeta.spawnedAt} < ${selfMeta.spawnedAt}`,
      }
    }

    return {
      firstAgent: this.agentId,
      secondAgent: otherAgentId,
      reason: 'Fallback: self prioritized by default',
    }
  }

  proposeMergePartition(filePath: string, otherAgentId: string): FilePartition {
    // Simplified partition: first half to one agent, second half to other
    const selfSections: FileSection[] = [
      { section: 'lines 1-N/2', agentId: this.agentId },
    ]
    const otherSections: FileSection[] = [
      { section: 'lines N/2+1-N', agentId: otherAgentId },
    ]

    const assignments = new Map<string, FileSection[]>()
    assignments.set(this.agentId, selfSections)
    assignments.set(otherAgentId, otherSections)

    return { assignments }
  }

  proposeRebase(otherAgentId: string): RebaseProposal {
    const order = this.determineSequentialOrder(otherAgentId)

    return {
      baseAgent: order.firstAgent,
      rebasingAgent: order.secondAgent,
      reason: order.reason,
    }
  }

  shouldEscalate(conflictType: ConflictType, negotiationAttempts: number): boolean {
    // Escalate if > 3 negotiation attempts
    if (negotiationAttempts > 3) {
      return true
    }

    // Escalate if Critical conflict (WriteWrite) with no clear resolution
    if (conflictType === ConflictType.WriteWrite && negotiationAttempts > 1) {
      return true
    }

    return false
  }

  reportResolution(
    conflictId: string,
    strategy: ConflictResolutionStrategy,
    resolvedBy: string[]
  ): void {
    const coordinatorId = this.daemon.getCoordinatorId()
    if (!coordinatorId) return

    this.daemon.sendDM({
      messageId: randomUUID(),
      senderId: this.agentId,
      recipientId: coordinatorId,
      content: JSON.stringify({
        type: 'conflict_resolution_report',
        conflictId,
        strategy,
        resolvedBy,
        reporterId: this.agentId,
        timestamp: Date.now(),
      }),
      timestamp: Date.now(),
      read: false,
    })
  }
}
