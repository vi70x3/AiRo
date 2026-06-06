import {
	ConflictInfo,
	ConflictStatus,
	ConflictResolution,
	ConflictResolutionStrategy,
	DirectMessage,
} from '@roo-code/types'
import { IDaemon } from '../interfaces'
import { ConflictType, ConflictSeverity, DetectedConflict } from './conflict-detector'

export enum NegotiationResponse {
	Accept = 'accept',
	Reject = 'reject',
	Counter = 'counter',
}

export interface NegotiationResult {
	negotiationId: string
	conflictId: string
	initiatorAgentId: string
	responderAgentId: string
	initiatorResponse: NegotiationResponse | null
	responderResponse: NegotiationResponse | null
	resolved: boolean
	strategy: ConflictResolutionStrategy | null
	startedAt: number
	resolvedAt: number | null
}

export interface NegotiationState {
	negotiationId: string
	conflictId: string
	initiatorAgentId: string
	responderAgentId: string
	status: 'pending' | 'resolved' | 'escalated' | 'timed_out'
	startedAt: number
	negotiationTimeout: number
}

export class ConflictResolver {
	private daemon: IDaemon
	private pendingNegotiations: Map<string, NegotiationState>
	private negotiationResults: Map<string, NegotiationResult>
	private negotiationTimeout: number

	constructor(daemon: IDaemon, negotiationTimeout: number = 30000) {
		this.daemon = daemon
		this.pendingNegotiations = new Map()
		this.negotiationResults = new Map()
		this.negotiationTimeout = negotiationTimeout
	}

	/**
	 * Resolve a conflict based on its severity.
	 * Low severity: log and return resolved=true with strategy Continue.
	 * Medium/High/Critical: initiate negotiation.
	 */
	resolveConflict(conflict: DetectedConflict): {
		resolved: boolean
		strategy: ConflictResolutionStrategy | null
		negotiationId: string | null
	} {
		if (conflict.severity === ConflictSeverity.Low) {
			return {
				resolved: true,
				strategy: null,
				negotiationId: null,
			}
		}

		const strategy = this.determineStrategy(conflict.conflictType, conflict.severity)
		const negotiationId = this.initiateNegotiation(conflict, strategy)

		return {
			resolved: false,
			strategy,
			negotiationId,
		}
	}

	/**
	 * Determine the resolution strategy based on conflict type and severity.
	 * - WriteWrite + Critical → CoordinatorDecision
	 * - IntentWrite + High → Rebase
	 * - IntentIntent + Medium → Merge
	 * - ReadWrite + Low → Merge
	 */
	determineStrategy(
		conflictType: ConflictType,
		severity: ConflictSeverity
	): ConflictResolutionStrategy {
		if (conflictType === ConflictType.WriteWrite && severity === ConflictSeverity.Critical) {
			return ConflictResolutionStrategy.CoordinatorDecision
		}

		if (conflictType === ConflictType.IntentWrite && severity === ConflictSeverity.High) {
			return ConflictResolutionStrategy.Rebase
		}

		if (conflictType === ConflictType.IntentIntent && severity === ConflictSeverity.Medium) {
			return ConflictResolutionStrategy.Merge
		}

		if (conflictType === ConflictType.ReadWrite && severity === ConflictSeverity.Low) {
			return ConflictResolutionStrategy.Merge
		}

		return ConflictResolutionStrategy.Manual
	}

	/**
	 * Determine priority between two conflicting agents.
	 * Compare task priorities from plan. If equal, compare spawnedAt timestamps.
	 */
	determinePriority(agentIdA: string, agentIdB: string): {
		higherPriorityAgentId: string
		lowerPriorityAgentId: string
		reason: string
	} {
		const plan = this.daemon.getPlan()
		const agentA = this.daemon.getAgent(agentIdA)
		const agentB = this.daemon.getAgent(agentIdB)

		if (!agentA || !agentB) {
			return {
				higherPriorityAgentId: agentIdA,
				lowerPriorityAgentId: agentIdB,
				reason: 'Fallback: agent metadata unavailable',
			}
		}

		if (plan) {
			const taskA = plan.tasks.find((t) => t.owner === agentIdA)
			const taskB = plan.tasks.find((t) => t.owner === agentIdB)

			if (taskA && taskB) {
				if (taskA.priority > taskB.priority) {
					return {
						higherPriorityAgentId: agentIdA,
						lowerPriorityAgentId: agentIdB,
						reason: `Task priority: ${taskA.priority} > ${taskB.priority}`,
					}
				}
				if (taskB.priority > taskA.priority) {
					return {
						higherPriorityAgentId: agentIdB,
						lowerPriorityAgentId: agentIdA,
						reason: `Task priority: ${taskB.priority} > ${taskA.priority}`,
					}
				}
			}

			if (taskA && !taskB) {
				return {
					higherPriorityAgentId: agentIdA,
					lowerPriorityAgentId: agentIdB,
					reason: 'Agent A has assigned task, Agent B does not',
				}
			}
			if (!taskA && taskB) {
				return {
					higherPriorityAgentId: agentIdB,
					lowerPriorityAgentId: agentIdA,
					reason: 'Agent B has assigned task, Agent A does not',
				}
			}
		}

		// Equal priority or no plan tasks — compare spawnedAt timestamps
		const metaA = agentA as unknown as { spawnedAt: number }
		const metaB = agentB as unknown as { spawnedAt: number }

		if (metaA.spawnedAt < metaB.spawnedAt) {
			return {
				higherPriorityAgentId: agentIdA,
				lowerPriorityAgentId: agentIdB,
				reason: `Earlier spawn: ${metaA.spawnedAt} < ${metaB.spawnedAt}`,
			}
		}
		if (metaB.spawnedAt < metaA.spawnedAt) {
			return {
				higherPriorityAgentId: agentIdB,
				lowerPriorityAgentId: agentIdA,
				reason: `Earlier spawn: ${metaB.spawnedAt} < ${metaA.spawnedAt}`,
			}
		}

		return {
			higherPriorityAgentId: agentIdA,
			lowerPriorityAgentId: agentIdB,
			reason: 'Equal priority and spawn time — arbitrary selection',
		}
	}

	/**
	 * Send DMs to both conflicting agents with negotiation request.
	 */
	initiateNegotiation(
		conflict: DetectedConflict,
		strategy: ConflictResolutionStrategy
	): string {
		const negotiationId = crypto.randomUUID()
		const [agentA, agentB] = conflict.conflictingAgents

		const negotiationState: NegotiationState = {
			negotiationId,
			conflictId: conflict.conflictId,
			initiatorAgentId: agentA,
			responderAgentId: agentB,
			status: 'pending',
			startedAt: Date.now(),
			negotiationTimeout: this.negotiationTimeout,
		}

		this.pendingNegotiations.set(negotiationId, negotiationState)

		const requestContent = JSON.stringify({
			type: 'negotiation_request',
			negotiationId,
			conflictId: conflict.conflictId,
			filePath: conflict.filePath,
			conflictType: conflict.conflictType,
			severity: conflict.severity,
			proposedStrategy: strategy,
			timestamp: Date.now(),
		})

		const dmToA: DirectMessage = {
			messageId: crypto.randomUUID(),
			senderId: 'system',
			recipientId: agentA,
			content: requestContent,
			timestamp: Date.now(),
			read: false,
		}

		const dmToB: DirectMessage = {
			messageId: crypto.randomUUID(),
			senderId: 'system',
			recipientId: agentB,
			content: requestContent,
			timestamp: Date.now(),
			read: false,
		}

		this.daemon.sendDM(dmToA)
		this.daemon.sendDM(dmToB)

		return negotiationId
	}

	/**
	 * Escalate a conflict to the coordinator.
	 * Send DM to coordinator with conflict details.
	 */
	escalateToCoordinator(conflict: DetectedConflict): void {
		const coordinatorId = this.daemon.getCoordinatorId()
		if (!coordinatorId) return

		const escalationContent = JSON.stringify({
			type: 'conflict_escalation',
			conflictId: conflict.conflictId,
			filePath: conflict.filePath,
			conflictingAgents: conflict.conflictingAgents,
			conflictType: conflict.conflictType,
			severity: conflict.severity,
			detectedAt: conflict.detectedAt,
			timestamp: Date.now(),
		})

		const dm: DirectMessage = {
			messageId: crypto.randomUUID(),
			senderId: 'system',
			recipientId: coordinatorId,
			content: escalationContent,
			timestamp: Date.now(),
			read: false,
		}

		this.daemon.sendDM(dm)
	}

	/**
	 * Check negotiation timeouts.
	 * For each pending negotiation, check if startedAt + negotiationTimeout < Date.now().
	 * If timed out, escalate.
	 */
	checkNegotiationTimeouts(): string[] {
		const timedOutIds: string[] = []
		const now = Date.now()

		for (const [negotiationId, state] of this.pendingNegotiations) {
			if (state.status !== 'pending') continue

			if (state.startedAt + state.negotiationTimeout < now) {
				state.status = 'timed_out'
				this.pendingNegotiations.set(negotiationId, state)
				timedOutIds.push(negotiationId)

				const escalationContent = JSON.stringify({
					type: 'negotiation_timeout',
					negotiationId,
					conflictId: state.conflictId,
					initiatorAgentId: state.initiatorAgentId,
					responderAgentId: state.responderAgentId,
					startedAt: state.startedAt,
					timeout: state.negotiationTimeout,
					timestamp: now,
				})

				const coordinatorId = this.daemon.getCoordinatorId()
				if (coordinatorId) {
					const dm: DirectMessage = {
						messageId: crypto.randomUUID(),
						senderId: 'system',
						recipientId: coordinatorId,
						content: escalationContent,
						timestamp: now,
						read: false,
					}
					this.daemon.sendDM(dm)
				}
			}
		}

		return timedOutIds
	}

	/**
	 * Record a response from an agent in a negotiation.
	 */
	recordNegotiationResponse(
		negotiationId: string,
		agentId: string,
		response: NegotiationResponse
	): NegotiationResult | null {
		const state = this.pendingNegotiations.get(negotiationId)
		if (!state) return null

		const existingResult = this.negotiationResults.get(negotiationId)

		let result: NegotiationResult
		if (existingResult) {
			result = existingResult
			if (agentId === state.initiatorAgentId) {
				result.initiatorResponse = response
			} else {
				result.responderResponse = response
			}
		} else {
			result = {
				negotiationId,
				conflictId: state.conflictId,
				initiatorAgentId: state.initiatorAgentId,
				responderAgentId: state.responderAgentId,
				initiatorResponse: agentId === state.initiatorAgentId ? response : null,
				responderResponse: agentId === state.responderAgentId ? response : null,
				resolved: false,
				strategy: null,
				startedAt: state.startedAt,
				resolvedAt: null,
			}
		}

		// Check if both have responded
		if (result.initiatorResponse !== null && result.responderResponse !== null) {
			result.resolved = true
			result.resolvedAt = Date.now()
			state.status = 'resolved'
			this.pendingNegotiations.set(negotiationId, state)

			// Determine strategy based on responses
			if (
				result.initiatorResponse === NegotiationResponse.Accept &&
				result.responderResponse === NegotiationResponse.Accept
			) {
				result.strategy = ConflictResolutionStrategy.Merge
			} else if (
				result.initiatorResponse === NegotiationResponse.Reject ||
				result.responderResponse === NegotiationResponse.Reject
			) {
				result.strategy = ConflictResolutionStrategy.Manual
			} else {
				result.strategy = ConflictResolutionStrategy.Rebase
			}
		}

		this.negotiationResults.set(negotiationId, result)
		return result
	}

	/**
	 * Get a pending negotiation by ID.
	 */
	getPendingNegotiation(negotiationId: string): NegotiationState | undefined {
		return this.pendingNegotiations.get(negotiationId)
	}

	/**
	 * Get all pending negotiations.
	 */
	getAllPendingNegotiations(): NegotiationState[] {
		return Array.from(this.pendingNegotiations.values()).filter(
			(n) => n.status === 'pending'
		)
	}

	/**
	 * Get a negotiation result by ID.
	 */
	getNegotiationResult(negotiationId: string): NegotiationResult | undefined {
		return this.negotiationResults.get(negotiationId)
	}

	/**
	 * Convert a DetectedConflict to a ConflictInfo for storage.
	 */
	static toConflictInfo(detected: DetectedConflict): ConflictInfo {
		return {
			conflictId: detected.conflictId,
			filePath: detected.filePath,
			conflictingAgents: detected.conflictingAgents,
			detectedAt: detected.detectedAt,
			status: detected.status,
			resolution: null,
		}
	}
}
