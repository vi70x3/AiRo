import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LifecycleTracker } from '../lifecycle-tracker'
import {
	AgentLifecycleState,
	AgentMetadata,
	AgentType,
	CompletionReport,
	CompletionOutcome,
	Plan,
	Task,
} from '@roo-code/types'

// Note: @roo-code/types barrel export resolves TaskStatus to the one from task.ts
// (which has Running, Idle, etc.) because task.ts is exported before swarm.ts.
// The swarm.ts TaskStatus (with Pending, InProgress) is shadowed.
// The lifecycle-tracker source code works around this by using string literals.
// We must do the same in tests.

// Helper to create a mock daemon
const createMockDaemon = () => {
	const agents: Record<string, AgentMetadata> = {}
	let coordinatorId: string | null = null
	let storedPlan: Plan | null = null
	return {
		getAgent: vi.fn((id: string) => agents[id] ?? null),
		listAgents: vi.fn(() => Object.values(agents)),
		getPlan: vi.fn(() => storedPlan),
		setPlan: vi.fn((p: Plan) => { storedPlan = p }),
		registerAgent: vi.fn((agent: AgentMetadata) => { agents[agent.agentId] = agent }),
		unregisterAgent: vi.fn(),
		sendDM: vi.fn(),
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

// Helper to create agent metadata
const createAgentMetadata = (
	agentId: string,
	state: AgentLifecycleState = AgentLifecycleState.Running,
	taskId: string | null = 'task-1',
	lastHeartbeat: number = Date.now(),
): AgentMetadata => ({
	agentId,
	agentType: AgentType.Agent,
	state,
	parentId: 'coord-1',
	worktreeScope: 'scope-1',
	spawnedAt: Date.now() - 100000,
	lastHeartbeat,
	taskId,
	mode: '',
})

// Helper to create a task using string literals for status (matching swarm.ts TaskStatus)
const createTask = (
	taskId: string,
	owner: string,
	status: string = 'in_progress',
	priority: number = 1,
): Task => ({
	taskId,
	description: `Task ${taskId}`,
	owner,
	scope: `scope-${taskId}`,
	status: status as any,
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

describe('LifecycleTracker', () => {
	let mockDaemon: ReturnType<typeof createMockDaemon>
	let tracker: LifecycleTracker

	beforeEach(() => {
		mockDaemon = createMockDaemon()
		tracker = new LifecycleTracker(mockDaemon)
	})

	describe('trackStateChange', () => {
		it('records lifecycle event', () => {
			const event = tracker.trackStateChange(
				'agent-1',
				AgentLifecycleState.Spawned,
				AgentLifecycleState.Ready,
				'Agent initialized',
			)

			expect(event).toBeDefined()
			expect(event.agentId).toBe('agent-1')
			expect(event.previousState).toBe(AgentLifecycleState.Spawned)
			expect(event.newState).toBe(AgentLifecycleState.Ready)
			expect(event.reason).toBe('Agent initialized')
			expect(event.eventId).toBeDefined()
			expect(event.timestamp).toBeDefined()
		})

		it('tracks terminal states', () => {
			const event = tracker.trackStateChange(
				'agent-1',
				AgentLifecycleState.Running,
				AgentLifecycleState.Completed,
				'Task done',
			)

			expect(event.newState).toBe(AgentLifecycleState.Completed)
			expect(tracker.getTrackedState('agent-1')).toBe(AgentLifecycleState.Completed)
		})

		it('tracks Failed as terminal state', () => {
			const event = tracker.trackStateChange(
				'agent-1',
				AgentLifecycleState.Running,
				AgentLifecycleState.Failed,
				'Error occurred',
			)

			expect(event.newState).toBe(AgentLifecycleState.Failed)
			expect(tracker.getTrackedState('agent-1')).toBe(AgentLifecycleState.Failed)
		})
	})

	describe('checkHeartbeats', () => {
		it('all alive within threshold', () => {
			const now = Date.now()
			const agent1 = createAgentMetadata('agent-1', AgentLifecycleState.Running, 'task-1', now - 5000)
			const agent2 = createAgentMetadata('agent-2', AgentLifecycleState.Running, 'task-2', now - 10000)
			mockDaemon.registerAgent(agent1)
			mockDaemon.registerAgent(agent2)

			tracker.trackStateChange('agent-1', AgentLifecycleState.Spawned, AgentLifecycleState.Running)
			tracker.trackStateChange('agent-2', AgentLifecycleState.Spawned, AgentLifecycleState.Running)

			const results = tracker.checkHeartbeats()
			expect(results).toHaveLength(2)
			expect(results.every((r) => r.isAlive)).toBe(true)
		})

		it('detects dead agents (exceeded threshold)', () => {
			const now = Date.now()
			const aliveAgent = createAgentMetadata('agent-1', AgentLifecycleState.Running, 'task-1', now - 5000)
			const deadAgent = createAgentMetadata('agent-2', AgentLifecycleState.Running, 'task-2', now - 120000)
			mockDaemon.registerAgent(aliveAgent)
			mockDaemon.registerAgent(deadAgent)

			tracker.trackStateChange('agent-1', AgentLifecycleState.Spawned, AgentLifecycleState.Running)
			tracker.trackStateChange('agent-2', AgentLifecycleState.Spawned, AgentLifecycleState.Running)

			const results = tracker.checkHeartbeats()
			expect(results).toHaveLength(2)

			const aliveResult = results.find((r) => r.agentId === 'agent-1')
			const deadResult = results.find((r) => r.agentId === 'agent-2')

			expect(aliveResult?.isAlive).toBe(true)
			expect(deadResult?.isAlive).toBe(false)
		})
	})

	describe('getDeadAgents', () => {
		it('returns only dead agents', () => {
			const now = Date.now()
			const aliveAgent = createAgentMetadata('agent-1', AgentLifecycleState.Running, 'task-1', now - 5000)
			const deadAgent = createAgentMetadata('agent-2', AgentLifecycleState.Running, 'task-2', now - 120000)
			mockDaemon.registerAgent(aliveAgent)
			mockDaemon.registerAgent(deadAgent)

			tracker.trackStateChange('agent-1', AgentLifecycleState.Spawned, AgentLifecycleState.Running)
			tracker.trackStateChange('agent-2', AgentLifecycleState.Spawned, AgentLifecycleState.Running)

			const heartbeatResults = tracker.checkHeartbeats()
			const deadAgents = tracker.getDeadAgents(heartbeatResults)

			expect(deadAgents).toHaveLength(1)
			expect(deadAgents[0].agentId).toBe('agent-2')
		})
	})

	describe('handleCompletion', () => {
		it('stores report, updates state', () => {
			const report: CompletionReport = {
				reportId: 'report-1',
				agentId: 'agent-1',
				taskId: 'task-1',
				timestamp: Date.now(),
				outcome: CompletionOutcome.Success,
				changes: [],
				validationResults: [],
				blockers: [],
				duration: 5000,
			}

			tracker.handleCompletion(report)

			expect(tracker.getCompletionReport('agent-1')).toBe(report)
			expect(tracker.getTrackedState('agent-1')).toBe(AgentLifecycleState.Completed)
		})
	})

	describe('handleFailure', () => {
		it('updates state, finds tasks for reassignment', () => {
			const tasks: Task[] = [
				createTask('task-1', 'agent-1', 'in_progress'),
				createTask('task-2', 'agent-1', 'pending'),
				createTask('task-3', 'agent-2', 'in_progress'),
			]
			const plan = createPlan(tasks)
			mockDaemon.setPlan(plan)

			tracker.trackStateChange('agent-1', AgentLifecycleState.Spawned, AgentLifecycleState.Running)
			tracker.handleFailure('agent-1', 'Test failure')

			expect(tracker.getTrackedState('agent-1')).toBe(AgentLifecycleState.Failed)

			const tasksForReassignment = tracker.findTasksForReassignment('agent-1')
			expect(tasksForReassignment).toContain('task-1')
			expect(tasksForReassignment).toContain('task-2')
			expect(tasksForReassignment).not.toContain('task-3')
		})
	})

	describe('getTrackedAgents', () => {
		it('returns all tracked agent states', () => {
			tracker.trackStateChange('agent-1', AgentLifecycleState.Spawned, AgentLifecycleState.Running)
			tracker.trackStateChange('agent-2', AgentLifecycleState.Spawned, AgentLifecycleState.Ready)

			const allStates = tracker.getAllTrackedStates()
			expect(allStates.get('agent-1')).toBe(AgentLifecycleState.Running)
			expect(allStates.get('agent-2')).toBe(AgentLifecycleState.Ready)
		})
	})

	describe('getLifecycleEvents', () => {
		it('returns all lifecycle events', () => {
			tracker.trackStateChange('agent-1', AgentLifecycleState.Spawned, AgentLifecycleState.Ready)
			tracker.trackStateChange('agent-1', AgentLifecycleState.Ready, AgentLifecycleState.Running)
			tracker.trackStateChange('agent-2', AgentLifecycleState.Spawned, AgentLifecycleState.Ready)

			const events = tracker.getLifecycleEvents()
			expect(events).toHaveLength(3)
		})

		it('returns events for specific agent', () => {
			tracker.trackStateChange('agent-1', AgentLifecycleState.Spawned, AgentLifecycleState.Ready)
			tracker.trackStateChange('agent-2', AgentLifecycleState.Spawned, AgentLifecycleState.Ready)

			const agent1Events = tracker.getAgentEvents('agent-1')
			expect(agent1Events).toHaveLength(1)
			expect(agent1Events[0].agentId).toBe('agent-1')
		})
	})

	describe('getCompletionReport', () => {
		it('returns stored completion report', () => {
			const report: CompletionReport = {
				reportId: 'report-1',
				agentId: 'agent-1',
				taskId: 'task-1',
				timestamp: Date.now(),
				outcome: CompletionOutcome.Success,
				changes: [],
				validationResults: [],
				blockers: [],
				duration: 5000,
			}

			tracker.handleCompletion(report)
			expect(tracker.getCompletionReport('agent-1')).toBe(report)
		})

		it('returns undefined for unknown agent', () => {
			expect(tracker.getCompletionReport('unknown-agent')).toBeUndefined()
		})
	})

	describe('getAllCompletionReports', () => {
		it('returns all stored completion reports', () => {
			const report1: CompletionReport = {
				reportId: 'report-1',
				agentId: 'agent-1',
				taskId: 'task-1',
				timestamp: Date.now(),
				outcome: CompletionOutcome.Success,
				changes: [],
				validationResults: [],
				blockers: [],
				duration: 5000,
			}
			const report2: CompletionReport = {
				reportId: 'report-2',
				agentId: 'agent-2',
				taskId: 'task-2',
				timestamp: Date.now(),
				outcome: CompletionOutcome.Success,
				changes: [],
				validationResults: [],
				blockers: [],
				duration: 3000,
			}

			tracker.handleCompletion(report1)
			tracker.handleCompletion(report2)

			const allReports = tracker.getAllCompletionReports()
			expect(allReports).toHaveLength(2)
		})
	})

	describe('getAgentMetadata', () => {
		it('returns metadata for registered agent', () => {
			const agent = createAgentMetadata('agent-1')
			mockDaemon.registerAgent(agent)

			const metadata = tracker.getAgentMetadata('agent-1')
			expect(metadata).not.toBeNull()
			expect(metadata?.agentId).toBe('agent-1')
		})

		it('returns null for unregistered agent', () => {
			const metadata = tracker.getAgentMetadata('unknown-agent')
			expect(metadata).toBeNull()
		})
	})
})
