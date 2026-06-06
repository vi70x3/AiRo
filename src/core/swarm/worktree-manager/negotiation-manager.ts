import {
  ConflictNegotiation,
  NegotiationProposal,
  NegotiationStatus,
  ResolutionStrategy,
  DirectMessage,
} from '@roo-code/types'
import { IDaemon } from '../interfaces'
import { ConflictTracker } from './conflict-tracker'

/**
 * NegotiationManager enables agents to negotiate conflict resolution.
 *
 * Design notes:
 * - Async: agents may respond at different times
 * - Each negotiation has a lifecycle: open → proposed → accepted/rejected → closed
 * - Proposals are collected from participants until consensus or escalation
 * - Integrates with ConflictTracker for timeline events
 */
export class NegotiationManager {
  private daemon: IDaemon
  private conflictTracker: ConflictTracker
  private negotiations: Map<string, ConflictNegotiation>

  constructor(daemon: IDaemon, conflictTracker: ConflictTracker) {
    this.daemon = daemon
    this.conflictTracker = conflictTracker
    this.negotiations = new Map()
  }

  /**
   * Start a new negotiation for a conflict.
   * Creates a ConflictNegotiation and notifies all participants via DM.
   */
  startNegotiation(
    conflictId: string,
    initiator: string,
    participants: string[],
  ): ConflictNegotiation {
    const negotiationId = crypto.randomUUID()
    const now = Date.now()

    const negotiation: ConflictNegotiation = {
      negotiationId,
      conflictId,
      initiator,
      participants,
      status: 'open',
      proposals: [],
      createdAt: now,
      updatedAt: now,
    }

    this.negotiations.set(negotiationId, negotiation)

    // Track timeline event
    this.conflictTracker.addNegotiationTimelineEntry(
      conflictId,
      initiator,
      'negotiation_started',
      `Negotiation started by ${initiator} with participants: ${participants.join(', ')}`,
    )

    // Notify all participants via DM
    for (const participantId of participants) {
      const dm: DirectMessage = {
        messageId: crypto.randomUUID(),
        senderId: initiator,
        recipientId: participantId,
        content: JSON.stringify({
          type: 'negotiation_started',
          negotiationId,
          conflictId,
          initiator,
          participants,
          timestamp: now,
        }),
        timestamp: now,
        read: false,
      }
      this.daemon.sendDM(dm)
    }

    return negotiation
  }

  /**
   * Submit a resolution proposal to an active negotiation.
   */
  submitProposal(
    negotiationId: string,
    agentId: string,
    strategy: ResolutionStrategy,
    description: string,
  ): NegotiationProposal | null {
    const negotiation = this.negotiations.get(negotiationId)
    if (!negotiation) {
      return null
    }

    if (negotiation.status === 'closed') {
      return null
    }

    const proposal: NegotiationProposal = {
      proposalId: crypto.randomUUID(),
      agentId,
      resolutionStrategy: strategy,
      description,
      timestamp: Date.now(),
    }

    negotiation.proposals.push(proposal)
    negotiation.status = 'proposed'
    negotiation.updatedAt = Date.now()
    this.negotiations.set(negotiationId, negotiation)

    // Track timeline event
    this.conflictTracker.addNegotiationTimelineEntry(
      negotiation.conflictId,
      agentId,
      'proposal_submitted',
      `Proposal by ${agentId}: ${strategy} - ${description}`,
    )

    // Notify other participants about the proposal
    for (const participantId of negotiation.participants) {
      if (participantId !== agentId) {
        const dm: DirectMessage = {
          messageId: crypto.randomUUID(),
          senderId: agentId,
          recipientId: participantId,
          content: JSON.stringify({
            type: 'proposal_submitted',
            negotiationId,
            proposalId: proposal.proposalId,
            agentId,
            strategy,
            description,
            timestamp: proposal.timestamp,
          }),
          timestamp: proposal.timestamp,
          read: false,
        }
        this.daemon.sendDM(dm)
      }
    }

    return proposal
  }

  /**
   * Accept a proposal in a negotiation.
   * When accepted, the negotiation is marked as 'accepted' and closed.
   */
  acceptProposal(
    negotiationId: string,
    proposalId: string,
    agentId: string,
  ): ConflictNegotiation | null {
    const negotiation = this.negotiations.get(negotiationId)
    if (!negotiation) {
      return null
    }

    if (negotiation.status === 'closed') {
      return null
    }

    const proposal = negotiation.proposals.find((p) => p.proposalId === proposalId)
    if (!proposal) {
      return null
    }

    negotiation.status = 'accepted'
    negotiation.resolvedBy = agentId
    negotiation.resolvedAt = Date.now()
    negotiation.acceptedProposalId = proposalId
    negotiation.updatedAt = Date.now()
    this.negotiations.set(negotiationId, negotiation)

    // Track timeline event
    this.conflictTracker.addNegotiationTimelineEntry(
      negotiation.conflictId,
      agentId,
      'proposal_accepted',
      `Proposal ${proposalId} accepted by ${agentId}: ${proposal.resolutionStrategy}`,
    )

    // Notify all participants
    for (const participantId of negotiation.participants) {
      const dm: DirectMessage = {
        messageId: crypto.randomUUID(),
        senderId: agentId,
        recipientId: participantId,
        content: JSON.stringify({
          type: 'proposal_accepted',
          negotiationId,
          proposalId,
          acceptedBy: agentId,
          strategy: proposal.resolutionStrategy,
          timestamp: Date.now(),
        }),
        timestamp: Date.now(),
        read: false,
      }
      this.daemon.sendDM(dm)
    }

    return negotiation
  }

  /**
   * Reject a proposal in a negotiation with a reason.
   * The negotiation remains open for further proposals.
   */
  rejectProposal(
    negotiationId: string,
    proposalId: string,
    agentId: string,
    reason: string,
  ): ConflictNegotiation | null {
    const negotiation = this.negotiations.get(negotiationId)
    if (!negotiation) {
      return null
    }

    if (negotiation.status === 'closed') {
      return null
    }

    const proposal = negotiation.proposals.find((p) => p.proposalId === proposalId)
    if (!proposal) {
      return null
    }

    // Keep negotiation open for more proposals, but mark as 'rejected' temporarily
    // to indicate the last proposal was rejected
    negotiation.status = 'rejected'
    negotiation.updatedAt = Date.now()
    this.negotiations.set(negotiationId, negotiation)

    // Track timeline event
    this.conflictTracker.addNegotiationTimelineEntry(
      negotiation.conflictId,
      agentId,
      'proposal_rejected',
      `Proposal ${proposalId} rejected by ${agentId}: ${reason}`,
    )

    // Notify all participants
    for (const participantId of negotiation.participants) {
      const dm: DirectMessage = {
        messageId: crypto.randomUUID(),
        senderId: agentId,
        recipientId: participantId,
        content: JSON.stringify({
          type: 'proposal_rejected',
          negotiationId,
          proposalId,
          rejectedBy: agentId,
          reason,
          timestamp: Date.now(),
        }),
        timestamp: Date.now(),
        read: false,
      }
      this.daemon.sendDM(dm)
    }

    return negotiation
  }

  /**
   * Close a negotiation without resolution.
   */
  closeNegotiation(negotiationId: string, closedBy: string): ConflictNegotiation | null {
    const negotiation = this.negotiations.get(negotiationId)
    if (!negotiation) {
      return null
    }

    negotiation.status = 'closed'
    negotiation.resolvedBy = closedBy
    negotiation.resolvedAt = Date.now()
    negotiation.updatedAt = Date.now()
    this.negotiations.set(negotiationId, negotiation)

    return negotiation
  }

  /**
   * Get the current status of a negotiation.
   */
  getNegotiationStatus(negotiationId: string): NegotiationStatus | null {
    const negotiation = this.negotiations.get(negotiationId)
    if (!negotiation) {
      return null
    }
    return negotiation.status
  }

  /**
   * Get the full negotiation object by ID.
   */
  getNegotiation(negotiationId: string): ConflictNegotiation | undefined {
    return this.negotiations.get(negotiationId)
  }

  /**
   * List all active (non-closed) negotiations.
   */
  listActiveNegotiations(): ConflictNegotiation[] {
    const result: ConflictNegotiation[] = []
    for (const negotiation of this.negotiations.values()) {
      if (negotiation.status !== 'closed') {
        result.push(negotiation)
      }
    }
    return result
  }

  /**
   * List all negotiations (including closed).
   */
  listAllNegotiations(): ConflictNegotiation[] {
    return Array.from(this.negotiations.values())
  }

  /**
   * Get all negotiations for a specific conflict.
   */
  getNegotiationsForConflict(conflictId: string): ConflictNegotiation[] {
    const result: ConflictNegotiation[] = []
    for (const negotiation of this.negotiations.values()) {
      if (negotiation.conflictId === conflictId) {
        result.push(negotiation)
      }
    }
    return result
  }

  /**
   * Get all negotiations where an agent is a participant.
   */
  getNegotiationsForAgent(agentId: string): ConflictNegotiation[] {
    const result: ConflictNegotiation[] = []
    for (const negotiation of this.negotiations.values()) {
      if (
        negotiation.initiator === agentId ||
        negotiation.participants.includes(agentId)
      ) {
        result.push(negotiation)
      }
    }
    return result
  }

  /**
   * Get all active negotiations for snapshot persistence.
   */
  getActiveNegotiationsForSnapshot(): ConflictNegotiation[] {
    return this.listActiveNegotiations()
  }

  /**
   * Restore negotiations from a snapshot.
   */
  restoreFromSnapshot(negotiations: ConflictNegotiation[]): void {
    this.negotiations.clear()
    for (const negotiation of negotiations) {
      this.negotiations.set(negotiation.negotiationId, negotiation)
    }
  }
}
