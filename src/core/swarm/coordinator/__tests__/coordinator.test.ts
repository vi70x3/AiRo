import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Coordinator } from '../coordinator'
import { Agent } from '../../agent/agent'
import {
  AgentType,
  AgentLifecycleState,
  Task,
  Dependency,
  PlanUpdate,
  PlanChange,
  PlanChangeType,
  CompletionReport,
  WorktreeMetadata,
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
    updateAgentState: vi.fn(),
    sendDM: vi.fn(),
    broadcast: vi.fn(),
    setCoordinatorId: vi.fn((id) => { coordinatorId = id }),
    getCoordinatorId: vi.fn(() => coordinatorId),
    setPlan: vi.fn((p) => { plan = p }),
    getPlan: vi.fn(() => plan),
    setPlanVersions: vi.fn(),
    getPlanVersions: vi.fn(() => []),
    // other methods stubbed
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

describe('Coordinator', () => {
  let mockDaemon: any
  let coordinator: Coordinator

  beforeEach(() => {
    mockDaemon = createMockDaemon()
    coordinator = new Coordinator('coord-1', mockDaemon)
  })

  it('sets coordinatorId on daemon and starts ready', () => {
    expect(mockDaemon.setCoordinatorId).toHaveBeenCalledWith('coord-1')
    expect(coordinator.state).toBe(AgentLifecycleState.Ready)
  })

  it('creates initial plan and stores in daemon', () => {
    const tasks: Task[] = []
    const deps: Dependency[] = []
    const plan = coordinator.createInitialPlan('test', tasks, deps)
    expect(plan.description).toBe('test')
    expect(mockDaemon.setPlan).toHaveBeenCalledWith(plan)
  })

  it('approves valid plan update and applies changes', () => {
    const task: Task = { taskId: 't1', description: 'a', owner: 'coord-1', scope: 's1', status: 'pending' as any, dependsOn: [], blockedBy: [], checkpoints: [], estimatedEffort: 0, priority: 1, tags: [] }
    const plan = coordinator.createInitialPlan('desc', [], [])
    const update: PlanUpdate = {
      updateId: 'u1',
      proposerId: 'coord-1',
      timestamp: Date.now(),
      version: plan.version,
      changes: [{
        changeType: PlanChangeType.AddTask,
        targetId: 't1',
        before: null,
        after: task,
        description: 'add task',
      }],
      reason: 'test',
      impact: '',
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
    }
    const decision = coordinator.reviewPlanUpdate(update)
    expect(decision.approved).toBe(true)
    const storedPlan = mockDaemon.getPlan()
    expect(storedPlan.tasks).toContainEqual(task)
    expect(storedPlan.version).toBe(2)
  })

  it('rejects update with wrong version', () => {
    const plan = coordinator.createInitialPlan('desc', [], [])
    const update: PlanUpdate = {
      updateId: 'u2',
      proposerId: 'coord-1',
      timestamp: Date.now(),
      version: plan.version + 1,
      changes: [],
      reason: '',
      impact: '',
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
    }
    const decision = coordinator.reviewPlanUpdate(update)
    expect(decision.approved).toBe(false)
    expect(decision.reason).toContain('version mismatch')
  })

  it('rejects update from inactive proposer', () => {
    const mockAgent = new Agent('agent-1', AgentType.Agent, mockDaemon)
    mockAgent.markReady()
    mockAgent.startRunning()
    mockAgent.markFailed()
    const plan = coordinator.createInitialPlan('desc', [], [])
    const update: PlanUpdate = {
      updateId: 'u3',
      proposerId: 'agent-1',
      timestamp: Date.now(),
      version: plan.version,
      changes: [{ changeType: PlanChangeType.AddTask, targetId: 't', before: null, after: null, description: '' }],
      reason: '',
      impact: '',
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
    }
    const decision = coordinator.reviewPlanUpdate(update)
    expect(decision.approved).toBe(false)
    expect(decision.reason).toContain('not active')
  })

  it('rejects update with no changes', () => {
    const plan = coordinator.createInitialPlan('desc', [], [])
    const update: PlanUpdate = {
      updateId: 'u4',
      proposerId: 'coord-1',
      timestamp: Date.now(),
      version: plan.version,
      changes: [],
      reason: '',
      impact: '',
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
    }
    const decision = coordinator.reviewPlanUpdate(update)
    expect(decision.approved).toBe(false)
    expect(decision.reason).toContain('no changes')
  })

  it('spawns worktree manager metadata and tracks it', () => {
    const meta = coordinator.spawnWorktreeManager('scope1')
    expect(meta.agentType).toBe(AgentType.WorktreeManager)
    expect(coordinator.getTrackedAgents().get(meta.agentId)).toBe(AgentLifecycleState.Spawned)
  })

  it('spawns agent metadata and tracks it', () => {
    const meta = coordinator.spawnAgent('task-1', 'scopeA')
    expect(meta.agentType).toBe(AgentType.Agent)
    expect(coordinator.getTrackedAgents().get(meta.agentId)).toBe(AgentLifecycleState.Spawned)
  })

  it('tracks agent state changes', () => {
    coordinator.trackAgentState('a1', AgentLifecycleState.Running)
    expect(coordinator.getTrackedAgents().get('a1')).toBe(AgentLifecycleState.Running)
  })

  it('handles agent completion reports', () => {
    const report: CompletionReport = { reportId: 'r1', agentId: 'a1', taskId: 't1', timestamp: Date.now(), outcome: 'success' as any, changes: [], validationResults: [], blockers: [], duration: 100 }
    coordinator.handleAgentCompletion(report)
    expect(coordinator.getCompletionReport('a1')).toBe(report)
    expect(coordinator.getTrackedAgents().get('a1')).toBe(AgentLifecycleState.Completed)
  })

  it('decides worktree usage based on tasks', () => {
    // 3 tasks with 2 scopes where one scope has 2 tasks = 2/3 = 0.67 overlap > 0.5 → no worktrees
    const tasksWithOverlap: Task[] = [
      { taskId: '1', description: '', owner: '', scope: 's1', status: 'pending' as any, dependsOn: [], blockedBy: [], checkpoints: [], estimatedEffort: 0, priority: 1, tags: [] },
      { taskId: '2', description: '', owner: '', scope: 's2', status: 'pending' as any, dependsOn: [], blockedBy: [], checkpoints: [], estimatedEffort: 0, priority: 1, tags: [] },
      { taskId: '3', description: '', owner: '', scope: 's1', status: 'pending' as any, dependsOn: [], blockedBy: [], checkpoints: [], estimatedEffort: 0, priority: 1, tags: [] },
    ]
    expect(coordinator.decideWorktreeUsage(tasksWithOverlap)).toBe(false)

    // <3 tasks → no worktrees
    expect(coordinator.decideWorktreeUsage(tasksWithOverlap.slice(0, 2))).toBe(false)

    // 3 tasks with 3 distinct scopes → clear separation → use worktrees
    const tasksDistinct: Task[] = [
      { taskId: '1', description: '', owner: '', scope: 'frontend', status: 'pending' as any, dependsOn: [], blockedBy: [], checkpoints: [], estimatedEffort: 0, priority: 1, tags: [] },
      { taskId: '2', description: '', owner: '', scope: 'backend', status: 'pending' as any, dependsOn: [], blockedBy: [], checkpoints: [], estimatedEffort: 0, priority: 1, tags: [] },
      { taskId: '3', description: '', owner: '', scope: 'testing', status: 'pending' as any, dependsOn: [], blockedBy: [], checkpoints: [], estimatedEffort: 0, priority: 1, tags: [] },
    ]
    expect(coordinator.decideWorktreeUsage(tasksDistinct)).toBe(true)
  })
})
