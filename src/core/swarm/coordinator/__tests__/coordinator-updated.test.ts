import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Coordinator } from '../coordinator'
import { PlanCreator } from '../plan-creation'
import { WorktreeDecider, ConflictRisk, ScopeSeparation } from '../worktree-decision'
import {
  AgentType,
  AgentLifecycleState,
  Task,
  Dependency,
  DependencyType,
  TaskStatus,
} from '@roo-code/types'

// Helper to create mock daemon
const createMockDaemon = () => {
  const agents: Record<string, any> = {}
  let coordinatorId: string | null = null
  let plan: any = null
  return {
    registerAgent: vi.fn((agent) => { agents[agent.agentId] = agent }),
    unregisterAgent: vi.fn((id) => { delete agents[id] }),
    getAgent: vi.fn((id) => agents[id] ?? null),
    sendDM: vi.fn(),
    broadcast: vi.fn(),
    setCoordinatorId: vi.fn((id) => { coordinatorId = id }),
    getCoordinatorId: vi.fn(() => coordinatorId),
    setPlan: vi.fn((p) => { plan = p }),
    getPlan: vi.fn(() => plan),
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
    listAgents: vi.fn(() => Object.values(agents)),
  }
}

// Helper to create tasks with specific scopes
const createTasks = (scopes: string[]): Task[] =>
  scopes.map((scope, i) => ({
    taskId: `task-${i}`,
    description: `Task ${i}`,
    owner: '',
    scope,
    status: TaskStatus.Pending,
    dependsOn: [],
    blockedBy: [],
    checkpoints: [],
    estimatedEffort: 5,
    priority: 5,
    tags: [],
  }))

describe('Coordinator (updated)', () => {
  let mockDaemon: any
  let coordinator: Coordinator

  beforeEach(() => {
    mockDaemon = createMockDaemon()
    coordinator = new Coordinator('coord-1', mockDaemon)
  })

  it('has planCreator and worktreeDecider properties', () => {
    expect(coordinator.planCreator).toBeInstanceOf(PlanCreator)
    expect(coordinator.worktreeDecider).toBeInstanceOf(WorktreeDecider)
  })

  it('createPlanFromInput uses PlanCreator', () => {
    const plan = coordinator.createPlanFromInput({
      description: 'Test plan from input',
      taskDescriptions: [
        { description: 'Update the login page UI' },
        { description: 'Add database migration for users' },
        { description: 'Write tests for the API' },
      ],
    })

    expect(plan.description).toBe('Test plan from input')
    expect(plan.tasks).toHaveLength(3)
    expect(plan.version).toBe(1)
    expect(mockDaemon.setPlan).toHaveBeenCalledWith(plan)

    // Verify scopes were inferred
    expect(plan.tasks[0].scope).toBe('frontend') // login page UI
    expect(plan.tasks[1].scope).toBe('backend') // database migration
    expect(plan.tasks[2].scope).toBe('testing') // tests
  })

  it('getWorktreeDecision returns full WorktreeDecision', () => {
    // Set up a plan first
    coordinator.createInitialPlan('test', [], [])

    const tasks = createTasks(['frontend', 'backend', 'testing'])
    const decision = coordinator.getWorktreeDecision(tasks)

    expect(decision).toHaveProperty('useWorktrees')
    expect(decision).toHaveProperty('reason')
    expect(decision).toHaveProperty('worktreeCount')
    expect(decision).toHaveProperty('scopeAssignments')
    expect(decision.scopeAssignments).toBeInstanceOf(Map)
  })

  it('decideWorktreeUsage delegates to WorktreeDecider', () => {
    // Set up a plan first
    coordinator.createInitialPlan('test', [], [])

    // <3 tasks → false
    const twoTasks = createTasks(['frontend', 'backend'])
    expect(coordinator.decideWorktreeUsage(twoTasks)).toBe(false)

    // 3 tasks with different scopes → true
    const threeTasks = createTasks(['frontend', 'backend', 'testing'])
    expect(coordinator.decideWorktreeUsage(threeTasks)).toBe(true)

    // 3 tasks all same scope → false (high overlap)
    const sameScopeTasks = createTasks(['frontend', 'frontend', 'frontend'])
    expect(coordinator.decideWorktreeUsage(sameScopeTasks)).toBe(false)
  })

  it('backward compatibility: createInitialPlan still works directly', () => {
    const tasks: Task[] = [
      {
        taskId: 't1',
        description: 'Direct task',
        owner: 'coord-1',
        scope: 's1',
        status: TaskStatus.Pending,
        dependsOn: [],
        blockedBy: [],
        checkpoints: [],
        estimatedEffort: 5,
        priority: 5,
        tags: [],
      },
    ]
    const deps: Dependency[] = []

    const plan = coordinator.createInitialPlan('direct plan', tasks, deps)

    expect(plan.description).toBe('direct plan')
    expect(plan.tasks).toHaveLength(1)
    expect(plan.tasks[0].taskId).toBe('t1')
    expect(plan.dependencies).toHaveLength(0)
    expect(plan.version).toBe(1)
    expect(mockDaemon.setPlan).toHaveBeenCalledWith(plan)
  })

  it('getWorktreeDecision returns correct structure for <3 tasks', () => {
    coordinator.createInitialPlan('test', [], [])

    const tasks = createTasks(['frontend', 'backend'])
    const decision = coordinator.getWorktreeDecision(tasks)

    expect(decision.useWorktrees).toBe(false)
    expect(decision.reason).toBe('Fewer than 3 tasks, worktrees not beneficial')
    expect(decision.worktreeCount).toBe(0)
    expect(decision.scopeAssignments.size).toBe(0)
  })

  it('getWorktreeDecision returns correct structure for high overlap', () => {
    coordinator.createInitialPlan('test', [], [])

    // 4 tasks, 3 in same scope = 75% overlap
    const tasks = createTasks(['frontend', 'frontend', 'frontend', 'backend'])
    const decision = coordinator.getWorktreeDecision(tasks)

    expect(decision.useWorktrees).toBe(false)
    expect(decision.reason).toBe('High file overlap (>50%), merge cost too high')
  })

  it('getWorktreeDecision returns correct structure for clear separation', () => {
    coordinator.createInitialPlan('test', [], [])

    const tasks = createTasks(['frontend', 'backend', 'testing'])
    const decision = coordinator.getWorktreeDecision(tasks)

    expect(decision.useWorktrees).toBe(true)
    expect(decision.worktreeCount).toBe(3)
    expect(decision.scopeAssignments.get('frontend')).toEqual(['task-0'])
    expect(decision.scopeAssignments.get('backend')).toEqual(['task-1'])
    expect(decision.scopeAssignments.get('testing')).toEqual(['task-2'])
  })
})
