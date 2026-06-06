import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PlanReviewer, RiskLevel } from '../plan-reviewer'
import {
	Plan,
	PlanUpdate,
	PlanChangeType,
	AgentLifecycleState,
	Task,
	Dependency,
	DependencyType,
	SwarmTaskStatus,
} from '@roo-code/types'

// Helper to create a mock daemon
const createMockDaemon = (agents: any[] = [], plan: Plan | null = null) => {
	const agentMap: Record<string, any> = {}
	for (const agent of agents) {
		agentMap[agent.agentId] = agent
	}
	let storedPlan: Plan | null = plan
	return {
		getAgent: vi.fn((id: string) => agentMap[id] ?? null),
		listAgents: vi.fn(() => Object.values(agentMap)),
		getPlan: vi.fn(() => storedPlan),
		setPlan: vi.fn((p: Plan) => { storedPlan = p }),
		registerAgent: vi.fn((agent: any) => { agentMap[agent.agentId] = agent }),
		unregisterAgent: vi.fn(),
		sendDM: vi.fn(),
		broadcast: vi.fn(),
		setCoordinatorId: vi.fn(),
		getCoordinatorId: vi.fn(),
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

// Helper to create a basic task
const createTask = (
	taskId: string,
	owner: string = 'agent-1',
	dependsOn: string[] = [],
	priority: number = 1,
	status: SwarmTaskStatus = SwarmTaskStatus.Pending,
): Task => ({
	taskId,
	description: `Task ${taskId}`,
	owner,
	scope: `scope-${taskId}`,
	status,
	dependsOn,
	blockedBy: [],
	checkpoints: [],
	estimatedEffort: 60,
	priority,
	tags: [],
})

// Helper to create a basic plan
const createPlan = (
	tasks: Task[] = [],
	dependencies: Dependency[] = [],
	version: number = 1,
	updateHistory: PlanUpdate[] = [],
): Plan => ({
	planId: 'plan-1',
	version,
	tasks,
	dependencies,
	description: 'Test plan',
	updateHistory,
})

describe('PlanReviewer', () => {
	let mockDaemon: ReturnType<typeof createMockDaemon>
	let reviewer: PlanReviewer

	beforeEach(() => {
		mockDaemon = createMockDaemon()
		reviewer = new PlanReviewer(mockDaemon)
	})

	describe('validateUpdate', () => {
		it('valid update passes', () => {
			const proposer = {
				agentId: 'agent-1',
				state: AgentLifecycleState.Running,
				agentType: 'agent' as any,
			}
			mockDaemon.registerAgent(proposer)

			const plan = createPlan([createTask('task-1')], [], 1)
			const update: PlanUpdate = {
				updateId: 'update-1',
				proposerId: 'agent-1',
				timestamp: Date.now(),
				version: 1,
				changes: [
					{
						changeType: PlanChangeType.ModifyTask,
						targetId: 'task-1',
						before: null,
						after: { description: 'modified' },
						description: 'Modify task-1',
					},
				],
				reason: 'Valid reason',
				impact: 'Low',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			}

			const result = reviewer.validateUpdate(update, plan)
			expect(result.isValid).toBe(true)
			expect(result.errors).toHaveLength(0)
		})

		it('wrong version fails', () => {
			const proposer = {
				agentId: 'agent-1',
				state: AgentLifecycleState.Running,
				agentType: 'agent' as any,
			}
			mockDaemon.registerAgent(proposer)

			const plan = createPlan([createTask('task-1')], [], 2)
			const update: PlanUpdate = {
				updateId: 'update-1',
				proposerId: 'agent-1',
				timestamp: Date.now(),
				version: 1,
				changes: [
					{
						changeType: PlanChangeType.ModifyTask,
						targetId: 'task-1',
						before: null,
						after: { description: 'modified' },
						description: 'Modify task-1',
					},
				],
				reason: 'Test update',
				impact: '',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			}

			const result = reviewer.validateUpdate(update, plan)
			expect(result.isValid).toBe(false)
			expect(result.errors.some((e) => e.includes('version'))).toBe(true)
		})

		it('inactive proposer fails', () => {
			const crashedProposer = {
				agentId: 'agent-1',
				state: AgentLifecycleState.Crashed,
				agentType: 'agent' as any,
			}
			mockDaemon.registerAgent(crashedProposer)

			const plan = createPlan([createTask('task-1')], [], 1)
			const update: PlanUpdate = {
				updateId: 'update-1',
				proposerId: 'agent-1',
				timestamp: Date.now(),
				version: 1,
				changes: [
					{
						changeType: PlanChangeType.ModifyTask,
						targetId: 'task-1',
						before: null,
						after: { description: 'modified' },
						description: 'Modify task-1',
					},
				],
				reason: 'Test update',
				impact: '',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			}

			const result = reviewer.validateUpdate(update, plan)
			expect(result.isValid).toBe(false)
			expect(result.errors.some((e) => e.includes('not active'))).toBe(true)
		})

		it('inactive proposer with Failed state fails', () => {
			const failedProposer = {
				agentId: 'agent-1',
				state: AgentLifecycleState.Failed,
				agentType: 'agent' as any,
			}
			mockDaemon.registerAgent(failedProposer)

			const plan = createPlan([createTask('task-1')], [], 1)
			const update: PlanUpdate = {
				updateId: 'update-1',
				proposerId: 'agent-1',
				timestamp: Date.now(),
				version: 1,
				changes: [
					{
						changeType: PlanChangeType.ModifyTask,
						targetId: 'task-1',
						before: null,
						after: { description: 'modified' },
						description: 'Modify task-1',
					},
				],
				reason: 'Test update',
				impact: '',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			}

			const result = reviewer.validateUpdate(update, plan)
			expect(result.isValid).toBe(false)
			expect(result.errors.some((e) => e.includes('not active'))).toBe(true)
		})

		it('inactive proposer with Stopped state fails', () => {
			const stoppedProposer = {
				agentId: 'agent-1',
				state: AgentLifecycleState.Stopped,
				agentType: 'agent' as any,
			}
			mockDaemon.registerAgent(stoppedProposer)

			const plan = createPlan([createTask('task-1')], [], 1)
			const update: PlanUpdate = {
				updateId: 'update-1',
				proposerId: 'agent-1',
				timestamp: Date.now(),
				version: 1,
				changes: [
					{
						changeType: PlanChangeType.ModifyTask,
						targetId: 'task-1',
						before: null,
						after: { description: 'modified' },
						description: 'Modify task-1',
					},
				],
				reason: 'Test update',
				impact: '',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			}

			const result = reviewer.validateUpdate(update, plan)
			expect(result.isValid).toBe(false)
			expect(result.errors.some((e) => e.includes('not active'))).toBe(true)
		})

		it('no changes fails', () => {
			const proposer = {
				agentId: 'agent-1',
				state: AgentLifecycleState.Running,
				agentType: 'agent' as any,
			}
			mockDaemon.registerAgent(proposer)

			const plan = createPlan([createTask('task-1')], [], 1)
			const update: PlanUpdate = {
				updateId: 'update-1',
				proposerId: 'agent-1',
				timestamp: Date.now(),
				version: 1,
				changes: [],
				reason: 'Some reason',
				impact: '',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			}

			const result = reviewer.validateUpdate(update, plan)
			expect(result.isValid).toBe(false)
			expect(result.errors.some((e) => e.includes('no changes'))).toBe(true)
		})
	})

	describe('analyzeImpact', () => {
		it('no cycles, low risk', () => {
			const proposer = {
				agentId: 'agent-1',
				state: AgentLifecycleState.Running,
				agentType: 'agent' as any,
			}
			mockDaemon.registerAgent(proposer)

			const tasks = [createTask('task-1'), createTask('task-2')]
			const deps: Dependency[] = [
				{ fromTaskId: 'task-1', toTaskId: 'task-2', type: DependencyType.Hard },
			]
			const plan = createPlan(tasks, deps, 1)
			const update: PlanUpdate = {
				updateId: 'update-1',
				proposerId: 'agent-1',
				timestamp: Date.now(),
				version: 1,
				changes: [
					{
						changeType: PlanChangeType.ModifyTask,
						targetId: 'task-1',
						before: null,
						after: { description: 'modified' },
						description: 'Modify task-1',
					},
				],
				reason: 'Test update',
				impact: '',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			}

			const result = reviewer.analyzeImpact(update, plan)
			expect(result.hasCycles).toBe(false)
			expect(result.cycles).toHaveLength(0)
			expect(result.riskLevel).toBe(RiskLevel.Low)
		})

		it('detects dependency cycles', () => {
			const proposer = {
				agentId: 'agent-1',
				state: AgentLifecycleState.Running,
				agentType: 'agent' as any,
			}
			mockDaemon.registerAgent(proposer)

			const tasks = [
				createTask('task-1'),
				createTask('task-2'),
				createTask('task-3'),
			]
			const deps: Dependency[] = [
				{ fromTaskId: 'task-1', toTaskId: 'task-2', type: DependencyType.Hard },
				{ fromTaskId: 'task-2', toTaskId: 'task-3', type: DependencyType.Hard },
			]
			const plan = createPlan(tasks, deps, 1)

			const update: PlanUpdate = {
				updateId: 'update-1',
				proposerId: 'agent-1',
				timestamp: Date.now(),
				version: 1,
				changes: [
					{
						changeType: PlanChangeType.AddDependency,
						targetId: 'dep-new',
						before: null,
						after: {
							fromTaskId: 'task-3',
							toTaskId: 'task-1',
							type: DependencyType.Hard,
						},
						description: 'Add dependency task-3 -> task-1',
					},
				],
				reason: 'Test update',
				impact: '',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			}

			const result = reviewer.analyzeImpact(update, plan)
			expect(result.hasCycles).toBe(true)
			expect(result.cycles.length).toBeGreaterThan(0)
		})

		it('affects in-progress tasks → high risk', () => {
			const proposer = {
				agentId: 'agent-1',
				state: AgentLifecycleState.Running,
				agentType: 'agent' as any,
			}
			const runningAgent = {
				agentId: 'agent-2',
				state: AgentLifecycleState.Running,
				taskId: 'task-1',
				agentType: 'agent' as any,
			}
			mockDaemon.registerAgent(proposer)
			mockDaemon.registerAgent(runningAgent)

			const tasks = [
				createTask('task-1', 'agent-2', [], 1, SwarmTaskStatus.InProgress),
			]
			const plan = createPlan(tasks, [], 1)
			const update: PlanUpdate = {
				updateId: 'update-1',
				proposerId: 'agent-1',
				timestamp: Date.now(),
				version: 1,
				changes: [
					{
						changeType: PlanChangeType.ModifyTask,
						targetId: 'task-1',
						before: null,
						after: { description: 'modified' },
						description: 'Modify task-1',
					},
				],
				reason: 'Test update',
				impact: '',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			}

			const result = reviewer.analyzeImpact(update, plan)
			expect(result.affectsInProgressTasks).toBe(true)
			expect(result.inProgressTaskIds).toContain('task-1')
			expect(result.riskLevel).toBe(RiskLevel.High)
		})

		it('conflicts with pending updates', () => {
			const proposer = {
				agentId: 'agent-1',
				state: AgentLifecycleState.Running,
				agentType: 'agent' as any,
			}
			mockDaemon.registerAgent(proposer)

			const tasks = [createTask('task-1')]
			const existingPendingUpdate: PlanUpdate = {
				updateId: 'update-existing',
				proposerId: 'agent-2',
				timestamp: Date.now(),
				version: 1,
				changes: [
					{
						changeType: PlanChangeType.ModifyTask,
						targetId: 'task-1',
						before: null,
						after: { description: 'other change' },
						description: 'Other change to task-1',
					},
				],
				reason: 'Other update',
				impact: '',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			}
			const plan = createPlan(tasks, [], 1, [existingPendingUpdate])

			// checkPendingConflicts calls daemon.getPlan() internally, so set it on the daemon
			mockDaemon.setPlan(plan)

			const update: PlanUpdate = {
				updateId: 'update-new',
				proposerId: 'agent-1',
				timestamp: Date.now(),
				version: 1,
				changes: [
					{
						changeType: PlanChangeType.ModifyTask,
						targetId: 'task-1',
						before: null,
						after: { description: 'my change' },
						description: 'My change to task-1',
					},
				],
				reason: 'Test update',
				impact: '',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			}

			const result = reviewer.analyzeImpact(update, plan)
			expect(result.conflictsWithPending).toBe(true)
			expect(result.conflictingUpdateIds).toContain('update-existing')
		})
	})

	describe('detectCycles', () => {
		it('no cycles in simple DAG', () => {
			const tasks = [
				createTask('task-1'),
				createTask('task-2'),
				createTask('task-3'),
			]
			const deps: Dependency[] = [
				{ fromTaskId: 'task-1', toTaskId: 'task-2', type: DependencyType.Hard },
				{ fromTaskId: 'task-2', toTaskId: 'task-3', type: DependencyType.Hard },
			]

			const cycles = reviewer.detectCycles(tasks, deps)
			expect(cycles).toHaveLength(0)
		})

		it('detects cycle in circular dependencies', () => {
			const tasks = [
				createTask('task-1'),
				createTask('task-2'),
				createTask('task-3'),
			]
			const deps: Dependency[] = [
				{ fromTaskId: 'task-1', toTaskId: 'task-2', type: DependencyType.Hard },
				{ fromTaskId: 'task-2', toTaskId: 'task-3', type: DependencyType.Hard },
				{ fromTaskId: 'task-3', toTaskId: 'task-1', type: DependencyType.Hard },
			]

			const cycles = reviewer.detectCycles(tasks, deps)
			expect(cycles.length).toBeGreaterThan(0)
		})
	})

	describe('findAffectedTasks', () => {
		it('direct + transitive dependents', () => {
			const tasks = [
				createTask('task-1'),
				createTask('task-2'),
				createTask('task-3'),
			]
			const deps: Dependency[] = [
				{ fromTaskId: 'task-2', toTaskId: 'task-1', type: DependencyType.Hard },
				{ fromTaskId: 'task-3', toTaskId: 'task-2', type: DependencyType.Hard },
			]
			const plan = createPlan(tasks, deps)

			const update: PlanUpdate = {
				updateId: 'update-1',
				proposerId: 'agent-1',
				timestamp: Date.now(),
				version: 1,
				changes: [
					{
						changeType: PlanChangeType.ModifyTask,
						targetId: 'task-1',
						before: null,
						after: { description: 'modified' },
						description: 'Modify task-1',
					},
				],
				reason: 'Test',
				impact: '',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			}

			const affected = reviewer.findAffectedTasks(update, plan)
			expect(affected.has('task-1')).toBe(true)
			expect(affected.has('task-2')).toBe(true)
			expect(affected.has('task-3')).toBe(true)
		})
	})

	describe('checkInProgressTasks', () => {
		it('detects running agents on affected tasks', () => {
			const runningAgent = {
				agentId: 'agent-2',
				state: AgentLifecycleState.Running,
				taskId: 'task-1',
				agentType: 'agent' as any,
			}
			mockDaemon.registerAgent(runningAgent)

			const inProgress = reviewer.checkInProgressTasks(['task-1', 'task-2'])
			expect(inProgress).toContain('task-1')
			expect(inProgress).not.toContain('task-2')
		})
	})

	describe('checkPendingConflicts', () => {
		it('same task modified by multiple updates', () => {
			const tasks = [createTask('task-1')]
			const existingPendingUpdate: PlanUpdate = {
				updateId: 'update-existing',
				proposerId: 'agent-2',
				timestamp: Date.now(),
				version: 1,
				changes: [
					{
						changeType: PlanChangeType.ModifyTask,
						targetId: 'task-1',
						before: null,
						after: { description: 'other change' },
						description: 'Other change to task-1',
					},
				],
				reason: 'Other update',
				impact: '',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			}
			const plan = createPlan(tasks, [], 1, [existingPendingUpdate])
			mockDaemon.setPlan(plan)

			const conflicting = reviewer.checkPendingConflicts({
				updateId: 'update-new',
				proposerId: 'agent-1',
				timestamp: Date.now(),
				version: 1,
				changes: [
					{
						changeType: PlanChangeType.ModifyTask,
						targetId: 'task-1',
						before: null,
						after: { description: 'my change' },
						description: 'My change to task-1',
					},
				],
				reason: 'Test',
				impact: '',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			})

			expect(conflicting).toContain('update-existing')
		})
	})

	describe('determineRiskLevel', () => {
		it('returns high when hasCycles is true', () => {
			const level = reviewer.determineRiskLevel(true, false, false, 1)
			expect(level).toBe(RiskLevel.High)
		})

		it('returns high when affectsInProgressTasks is true', () => {
			const level = reviewer.determineRiskLevel(false, true, false, 1)
			expect(level).toBe(RiskLevel.High)
		})

		it('returns high when conflictsWithPending is true', () => {
			const level = reviewer.determineRiskLevel(false, false, true, 1)
			expect(level).toBe(RiskLevel.High)
		})

		it('returns medium when affectedTaskCount > 3', () => {
			const level = reviewer.determineRiskLevel(false, false, false, 5)
			expect(level).toBe(RiskLevel.Medium)
		})

		it('returns low when no risk signals and few affected tasks', () => {
			const level = reviewer.determineRiskLevel(false, false, false, 2)
			expect(level).toBe(RiskLevel.Low)
		})
	})

	describe('reviewUpdate', () => {
		it('approves low risk', () => {
			const proposer = {
				agentId: 'agent-1',
				state: AgentLifecycleState.Running,
				agentType: 'agent' as any,
			}
			mockDaemon.registerAgent(proposer)

			const tasks = [createTask('task-1')]
			const plan = createPlan(tasks, [], 1)
			const update: PlanUpdate = {
				updateId: 'update-1',
				proposerId: 'agent-1',
				timestamp: Date.now(),
				version: 1,
				changes: [
					{
						changeType: PlanChangeType.ModifyTask,
						targetId: 'task-1',
						before: null,
						after: { description: 'modified' },
						description: 'Modify task-1',
					},
				],
				reason: 'Test update',
				impact: '',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			}

			const result = reviewer.reviewUpdate(update, plan)
			expect(result.approved).toBe(true)
			expect(result.reviewNotes).toBeNull()
		})

		it('rejects high risk (cycles)', () => {
			const proposer = {
				agentId: 'agent-1',
				state: AgentLifecycleState.Running,
				agentType: 'agent' as any,
			}
			mockDaemon.registerAgent(proposer)

			const tasks = [
				createTask('task-1'),
				createTask('task-2'),
				createTask('task-3'),
			]
			const deps: Dependency[] = [
				{ fromTaskId: 'task-1', toTaskId: 'task-2', type: DependencyType.Hard },
				{ fromTaskId: 'task-2', toTaskId: 'task-3', type: DependencyType.Hard },
			]
			const plan = createPlan(tasks, deps, 1)

			const update: PlanUpdate = {
				updateId: 'update-1',
				proposerId: 'agent-1',
				timestamp: Date.now(),
				version: 1,
				changes: [
					{
						changeType: PlanChangeType.AddDependency,
						targetId: 'dep-new',
						before: null,
						after: {
							fromTaskId: 'task-3',
							toTaskId: 'task-1',
							type: DependencyType.Hard,
						},
						description: 'Add dependency task-3 -> task-1',
					},
				],
				reason: 'Test update',
				impact: '',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			}

			const result = reviewer.reviewUpdate(update, plan)
			expect(result.approved).toBe(false)
			expect(result.reason).toContain('High risk')
		})

		it('approves medium risk with notes', () => {
			const proposer = {
				agentId: 'agent-1',
				state: AgentLifecycleState.Running,
				agentType: 'agent' as any,
			}
			mockDaemon.registerAgent(proposer)

			const tasks = [
				createTask('task-1'),
				createTask('task-2'),
				createTask('task-3'),
				createTask('task-4'),
				createTask('task-5'),
			]
			const deps: Dependency[] = [
				{ fromTaskId: 'task-2', toTaskId: 'task-1', type: DependencyType.Hard },
				{ fromTaskId: 'task-3', toTaskId: 'task-1', type: DependencyType.Hard },
				{ fromTaskId: 'task-4', toTaskId: 'task-1', type: DependencyType.Hard },
				{ fromTaskId: 'task-5', toTaskId: 'task-1', type: DependencyType.Hard },
			]
			const plan = createPlan(tasks, deps, 1)

			const update: PlanUpdate = {
				updateId: 'update-1',
				proposerId: 'agent-1',
				timestamp: Date.now(),
				version: 1,
				changes: [
					{
						changeType: PlanChangeType.ModifyTask,
						targetId: 'task-1',
						before: null,
						after: { description: 'modified' },
						description: 'Modify task-1',
					},
				],
				reason: 'Test update',
				impact: '',
				status: 'pending',
				reviewedBy: null,
				reviewedAt: null,
				reviewNotes: null,
			}

			const result = reviewer.reviewUpdate(update, plan)
			expect(result.approved).toBe(true)
			expect(result.reviewNotes).not.toBeNull()
			expect(result.reviewNotes).toContain('Medium risk')
		})
	})
})
