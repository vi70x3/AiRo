import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
	ConflictResolver,
	NegotiationResponse,
} from '../conflict-resolver'
import {
	ConflictType,
	ConflictSeverity,
	DetectedConflict,
} from '../conflict-detector'
import {
	ConflictResolutionStrategy,
	ConflictStatus,
	Plan,
	Task,
	TaskStatus,
	AgentType,
	AgentLifecycleState,
} from '@roo-code/types'

// Helper to create a mock daemon
const createMockDaemon = () => {
	const agents: Record<string, any> = {}
	let coordinatorId: string | null = null
	let plan: Plan | null = null
	const sentDMs: any[] = []
	return {
		getAgent: vi.fn((id: string) => agents[id] ?? null),
		listAgents: vi.fn(() => Object.values(agents)),
		getPlan: vi.fn(() => plan),
		setPlan: vi.fn((p: Plan) => { plan = p }),
		registerAgent: vi.fn((agent: any) => { agents[agent.agentId] = agent }),
		unregisterAgent: vi.fn((id: string) => { delete agents[id] }),
		sendDM: vi.fn((msg: any) => { sentDMs.push(msg) }),
		getSentDMs: () => sentDMs,
		clearSentDMs: () => { sentDMs.length = 0 },
		broadcast: vi.fn(),
		setCoordinatorId: vi.fn((id: string) => { coordinatorId = id }),
		getCoordinatorId: vi.fn(() => coordinatorId),
		joinChannel: vi.fn(),
		leaveChannel: vi.fn(),
		sendToChannel: vi.fn(),
		setContextKey: vi.fn(),
		getContextKey: vi.fn(),
		listContextKeys: vi.fn(),
		subscribeToKey: vi.fn(),
		getPendingNotifications: vi.fn(),
		notifyFileTouch: vi.fn(),
		broadcastIntent: vi.fn(),
		createSnapshot: vi.fn(),
		restoreFromSnapshot: vi.fn(),
		listSnapshots: vi.fn(),
	}
}

// Helper to create a detected conflict
const createDetectedConflict = (
	overrides: Partial<DetectedConflict> = {},
): DetectedConflict => ({
	conflictId: 'conflict-1',
	filePath: 'src/file.ts',
	conflictingAgents: ['agent-1', 'agent-2'],
	conflictType: ConflictType.WriteWrite,
	severity: ConflictSeverity.Critical,
	detectedAt: Date.now(),
	status: ConflictStatus.Detected,
	...overrides,
})

// Helper to create a task
const createTask = (
	taskId: string,
	owner: string,
	priority: number = 1,
	status: TaskStatus = TaskStatus.InProgress,
): Task => ({
	taskId,
	description: `Task ${taskId}`,
	owner,
	scope: `scope-${taskId}`,
	status,
	dependsOn: [],
	blockedBy: [],
	checkpoints: [],
	estimatedEffort: 60,
	priority,
	tags: [],
})

// Helper to create a plan
const createPlan = (tasks: Task[] = []): Plan => ({
	planId: 'plan-1',
	version: 1,
	tasks,
	dependencies: [],
	description: 'Test plan',
	updateHistory: [],
})

describe('ConflictResolver', () => {
	let mockDaemon: ReturnType<typeof createMockDaemon>
	let resolver: ConflictResolver

	beforeEach(() => {
		mockDaemon = createMockDaemon()
		resolver = new ConflictResolver(mockDaemon)
	})

	describe('resolveConflict', () => {
		it('Low severity → resolved with no negotiation needed', () => {
			const conflict = createDetectedConflict({
				severity: ConflictSeverity.Low,
				conflictType: ConflictType.ReadWrite,
			})

			const result = resolver.resolveConflict(conflict)
			expect(result.resolved).toBe(true)
			expect(result.negotiationId).toBeNull()
		})

		it('Medium severity → initiate negotiation', () => {
			const conflict = createDetectedConflict({
				severity: ConflictSeverity.Medium,
				conflictType: ConflictType.IntentIntent,
			})

			const result = resolver.resolveConflict(conflict)
			expect(result.resolved).toBe(false)
			expect(result.negotiationId).not.toBeNull()
			expect(result.strategy).toBeDefined()
		})

		it('High severity → initiate negotiation', () => {
			const conflict = createDetectedConflict({
				severity: ConflictSeverity.High,
				conflictType: ConflictType.IntentWrite,
			})

			const result = resolver.resolveConflict(conflict)
			expect(result.resolved).toBe(false)
			expect(result.negotiationId).not.toBeNull()
		})

		it('Critical severity → initiate negotiation', () => {
			const conflict = createDetectedConflict({
				severity: ConflictSeverity.Critical,
				conflictType: ConflictType.WriteWrite,
			})

			const result = resolver.resolveConflict(conflict)
			expect(result.resolved).toBe(false)
			expect(result.negotiationId).not.toBeNull()
		})
	})

	describe('determineStrategy', () => {
		it('WriteWrite + Critical → CoordinatorDecision', () => {
			const strategy = resolver.determineStrategy(
				ConflictType.WriteWrite,
				ConflictSeverity.Critical,
			)
			expect(strategy).toBe(ConflictResolutionStrategy.CoordinatorDecision)
		})

		it('IntentWrite + High → Rebase', () => {
			const strategy = resolver.determineStrategy(
				ConflictType.IntentWrite,
				ConflictSeverity.High,
			)
			expect(strategy).toBe(ConflictResolutionStrategy.Rebase)
		})

		it('IntentIntent + Medium → Merge', () => {
			const strategy = resolver.determineStrategy(
				ConflictType.IntentIntent,
				ConflictSeverity.Medium,
			)
			expect(strategy).toBe(ConflictResolutionStrategy.Merge)
		})

		it('ReadWrite + Low → Merge', () => {
			const strategy = resolver.determineStrategy(
				ConflictType.ReadWrite,
				ConflictSeverity.Low,
			)
			expect(strategy).toBe(ConflictResolutionStrategy.Merge)
		})

		it('unmatched combination → Manual', () => {
			const strategy = resolver.determineStrategy(
				ConflictType.ReadWrite,
				ConflictSeverity.Critical,
			)
			expect(strategy).toBe(ConflictResolutionStrategy.Manual)
		})
	})

	describe('determinePriority', () => {
		it('higher task priority goes first', () => {
			const agentA = {
				agentId: 'agent-1',
				state: AgentLifecycleState.Running,
				agentType: AgentType.Agent,
				spawnedAt: Date.now(),
			}
			const agentB = {
				agentId: 'agent-2',
				state: AgentLifecycleState.Running,
				agentType: AgentType.Agent,
				spawnedAt: Date.now(),
			}
			mockDaemon.registerAgent(agentA)
			mockDaemon.registerAgent(agentB)

			const plan = createPlan([
				createTask('task-1', 'agent-1', 5),
				createTask('task-2', 'agent-2', 2),
			])
			mockDaemon.setPlan(plan)

			const result = resolver.determinePriority('agent-1', 'agent-2')
			expect(result.higherPriorityAgentId).toBe('agent-1')
			expect(result.lowerPriorityAgentId).toBe('agent-2')
			expect(result.reason).toContain('Task priority')
		})

		it('equal priority → earlier spawn goes first', () => {
			const now = Date.now()
			const agentA = {
				agentId: 'agent-1',
				state: AgentLifecycleState.Running,
				agentType: AgentType.Agent,
				spawnedAt: now - 10000,
			}
			const agentB = {
				agentId: 'agent-2',
				state: AgentLifecycleState.Running,
				agentType: AgentType.Agent,
				spawnedAt: now - 5000,
			}
			mockDaemon.registerAgent(agentA)
			mockDaemon.registerAgent(agentB)

			const plan = createPlan([
				createTask('task-1', 'agent-1', 3),
				createTask('task-2', 'agent-2', 3),
			])
			mockDaemon.setPlan(plan)

			const result = resolver.determinePriority('agent-1', 'agent-2')
			expect(result.higherPriorityAgentId).toBe('agent-1')
			expect(result.reason).toContain('Earlier spawn')
		})
	})

	describe('initiateNegotiation', () => {
		it('sends DMs to both agents', () => {
			const conflict = createDetectedConflict()
			mockDaemon.clearSentDMs()

			const negotiationId = resolver.initiateNegotiation(
				conflict,
				ConflictResolutionStrategy.Merge,
			)

			expect(negotiationId).toBeDefined()
			const sentDMs = mockDaemon.getSentDMs()
			expect(sentDMs).toHaveLength(2)

			const recipients = sentDMs.map((dm: any) => dm.recipientId)
			expect(recipients).toContain('agent-1')
			expect(recipients).toContain('agent-2')

			const dmContent = JSON.parse(sentDMs[0].content)
			expect(dmContent.type).toBe('negotiation_request')
			expect(dmContent.negotiationId).toBe(negotiationId)
			expect(dmContent.conflictId).toBe(conflict.conflictId)
		})
	})

	describe('escalateToCoordinator', () => {
		it('sends DM to coordinator', () => {
			mockDaemon.setCoordinatorId('coord-1')
			mockDaemon.clearSentDMs()

			const conflict = createDetectedConflict()
			resolver.escalateToCoordinator(conflict)

			const sentDMs = mockDaemon.getSentDMs()
			expect(sentDMs).toHaveLength(1)
			expect(sentDMs[0].recipientId).toBe('coord-1')

			const dmContent = JSON.parse(sentDMs[0].content)
			expect(dmContent.type).toBe('conflict_escalation')
			expect(dmContent.conflictId).toBe(conflict.conflictId)
		})

		it('does nothing when no coordinator is set', () => {
			mockDaemon.clearSentDMs()

			const conflict = createDetectedConflict()
			resolver.escalateToCoordinator(conflict)

			expect(mockDaemon.getSentDMs()).toHaveLength(0)
		})
	})

	describe('checkNegotiationTimeouts', () => {
		it('detects timed-out negotiations', () => {
			// Create a resolver with a very short timeout
			const shortResolver = new ConflictResolver(mockDaemon, 0)

			const conflict = createDetectedConflict()
			const negotiationId = shortResolver.initiateNegotiation(
				conflict,
				ConflictResolutionStrategy.Merge,
			)

			// Use vi.useFakeTimers to advance time
			vi.useFakeTimers()
			vi.advanceTimersByTime(1)

			const timedOutIds = shortResolver.checkNegotiationTimeouts()
			expect(timedOutIds).toContain(negotiationId)

			const negotiation = shortResolver.getPendingNegotiation(negotiationId)
			expect(negotiation?.status).toBe('timed_out')

			vi.useRealTimers()
		})
	})

	describe('recordNegotiationResponse', () => {
		it('resolves when both accept', () => {
			const conflict = createDetectedConflict()
			const negotiationId = resolver.initiateNegotiation(
				conflict,
				ConflictResolutionStrategy.Merge,
			)

			const result1 = resolver.recordNegotiationResponse(
				negotiationId,
				'agent-1',
				NegotiationResponse.Accept,
			)
			expect(result1?.resolved).toBe(false)

			const result2 = resolver.recordNegotiationResponse(
				negotiationId,
				'agent-2',
				NegotiationResponse.Accept,
			)
			expect(result2?.resolved).toBe(true)
			expect(result2?.strategy).toBe(ConflictResolutionStrategy.Merge)
		})

		it('sets Manual strategy when one rejects', () => {
			const conflict = createDetectedConflict()
			const negotiationId = resolver.initiateNegotiation(
				conflict,
				ConflictResolutionStrategy.Merge,
			)

			resolver.recordNegotiationResponse(
				negotiationId,
				'agent-1',
				NegotiationResponse.Accept,
			)

			const result = resolver.recordNegotiationResponse(
				negotiationId,
				'agent-2',
				NegotiationResponse.Reject,
			)
			expect(result?.resolved).toBe(true)
			expect(result?.strategy).toBe(ConflictResolutionStrategy.Manual)
		})

		it('returns null for unknown negotiation', () => {
			const result = resolver.recordNegotiationResponse(
				'unknown-negotiation',
				'agent-1',
				NegotiationResponse.Accept,
			)
			expect(result).toBeNull()
		})
	})

	describe('getPendingNegotiation', () => {
		it('returns pending negotiation by ID', () => {
			const conflict = createDetectedConflict()
			const negotiationId = resolver.initiateNegotiation(
				conflict,
				ConflictResolutionStrategy.Merge,
			)

			const negotiation = resolver.getPendingNegotiation(negotiationId)
			expect(negotiation).toBeDefined()
			expect(negotiation?.status).toBe('pending')
			expect(negotiation?.initiatorAgentId).toBe('agent-1')
			expect(negotiation?.responderAgentId).toBe('agent-2')
		})
	})

	describe('getAllPendingNegotiations', () => {
		it('returns only pending negotiations', () => {
			const conflict1 = createDetectedConflict({ conflictId: 'c1', conflictingAgents: ['a1', 'a2'] })
			const conflict2 = createDetectedConflict({ conflictId: 'c2', conflictingAgents: ['a3', 'a4'] })

			const id1 = resolver.initiateNegotiation(conflict1, ConflictResolutionStrategy.Merge)
			const id2 = resolver.initiateNegotiation(conflict2, ConflictResolutionStrategy.Rebase)

			const allPending = resolver.getAllPendingNegotiations()
			expect(allPending).toHaveLength(2)

			resolver.recordNegotiationResponse(id1, 'a1', NegotiationResponse.Accept)
			resolver.recordNegotiationResponse(id1, 'a2', NegotiationResponse.Accept)

			const remaining = resolver.getAllPendingNegotiations()
			expect(remaining).toHaveLength(1)
			expect(remaining[0].negotiationId).toBe(id2)
		})
	})

	describe('getNegotiationResult', () => {
		it('returns negotiation result after responses', () => {
			const conflict = createDetectedConflict()
			const negotiationId = resolver.initiateNegotiation(
				conflict,
				ConflictResolutionStrategy.Merge,
			)

			resolver.recordNegotiationResponse(negotiationId, 'agent-1', NegotiationResponse.Accept)
			resolver.recordNegotiationResponse(negotiationId, 'agent-2', NegotiationResponse.Accept)

			const result = resolver.getNegotiationResult(negotiationId)
			expect(result).toBeDefined()
			expect(result?.resolved).toBe(true)
			expect(result?.strategy).toBe(ConflictResolutionStrategy.Merge)
		})
	})

	describe('toConflictInfo', () => {
		it('converts DetectedConflict to ConflictInfo', () => {
			const detected = createDetectedConflict()
			const info = ConflictResolver.toConflictInfo(detected)

			expect(info.conflictId).toBe(detected.conflictId)
			expect(info.filePath).toBe(detected.filePath)
			expect(info.conflictingAgents).toEqual(detected.conflictingAgents)
			expect(info.detectedAt).toBe(detected.detectedAt)
			expect(info.status).toBe(detected.status)
			expect(info.resolution).toBeNull()
		})
	})
})
