import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Coordinator } from '../coordinator'
import { SpawnManager } from '../spawn-manager'
import {
  AgentType,
  AgentLifecycleState,
  Task,
  TaskStatus,
} from '@roo-code/types'
import { WorktreeDecision } from '../worktree-decision'

// Helper to create mock daemon
const createMockDaemon = () => {
  const agents: Record<string, any> = {}
  let coordinatorId: string | null = null
  let plan: any = null
  return {
    registerAgent: vi.fn((agent: any) => { agents[agent.agentId] = agent }),
    unregisterAgent: vi.fn((id: string) => { delete agents[id] }),
    getAgent: vi.fn((id: string) => agents[id] ?? null),
    sendDM: vi.fn(),
    broadcast: vi.fn(),
    setCoordinatorId: vi.fn((id: string) => { coordinatorId = id }),
    getCoordinatorId: vi.fn(() => coordinatorId),
    setPlan: vi.fn((p: any) => { plan = p }),
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

// Helper to create tasks
const createTask = (taskId: string, scope: string): Task => ({
  taskId,
  description: `Task ${taskId}`,
  owner: '',
  scope,
  status: TaskStatus.Pending,
  dependsOn: [],
  blockedBy: [],
  checkpoints: [],
  estimatedEffort: 5,
  priority: 5,
  tags: [],
})

describe('Coordinator Spawn Integration', () => {
  let mockDaemon: any
  let coordinator: Coordinator

  beforeEach(() => {
    mockDaemon = createMockDaemon()
    coordinator = new Coordinator('coord-1', mockDaemon)
  })

  it('has spawnManager property that is a SpawnManager instance', () => {
    expect(coordinator.spawnManager).toBeInstanceOf(SpawnManager)
  })

  it('spawnWorktreeManager delegates to spawnManager', () => {
    const meta = coordinator.spawnWorktreeManager('scope1')
    expect(meta.agentType).toBe(AgentType.WorktreeManager)
    expect(meta.worktreeScope).toBe('scope1')
    expect(meta.state).toBe(AgentLifecycleState.Spawned)
  })

  it('spawnAgent delegates to spawnManager', () => {
    const meta = coordinator.spawnAgent('task-1', 'scopeA')
    expect(meta.agentType).toBe(AgentType.Agent)
    expect(meta.taskId).toBe('task-1')
    expect(meta.worktreeScope).toBe('scopeA')
    expect(meta.state).toBe(AgentLifecycleState.Spawned)
  })

  it('spawnAgentsForPlan spawns and tracks all agents', () => {
    const tasks = [
      createTask('t1', 'frontend'),
      createTask('t2', 'backend'),
      createTask('t3', 'testing'),
    ]

    const scopeAssignments = new Map<string, string[]>()
    scopeAssignments.set('frontend', ['t1'])
    scopeAssignments.set('backend', ['t2'])
    scopeAssignments.set('testing', ['t3'])

    const worktreeDecision: WorktreeDecision = {
      useWorktrees: true,
      reason: 'Clear scope separation',
      worktreeCount: 3,
      scopeAssignments,
    }

    const plan = {
      planId: 'plan-1',
      version: 1,
      tasks,
      dependencies: [],
      description: 'Test plan',
      updateHistory: [],
    }

    const result = coordinator.spawnAgentsForPlan(plan, worktreeDecision)

    expect(result.spawned).toHaveLength(3)
    expect(result.worktreeManagers).toHaveLength(3)
    expect(result.unassigned).toHaveLength(0)

    // Verify all agents are tracked
    const tracked = coordinator.getTrackedAgents()
    for (const agent of result.spawned) {
      expect(tracked.get(agent.agentId)).toBe(AgentLifecycleState.Spawned)
    }
    for (const wm of result.worktreeManagers) {
      expect(tracked.get(wm.agentId)).toBe(AgentLifecycleState.Spawned)
    }
  })

  it('spawnAgentsForPlan without worktrees spawns agents in main workspace', () => {
    const tasks = [
      createTask('t1', 'frontend'),
      createTask('t2', 'backend'),
    ]

    const worktreeDecision: WorktreeDecision = {
      useWorktrees: false,
      reason: 'Fewer than 3 tasks',
      worktreeCount: 0,
      scopeAssignments: new Map(),
    }

    const plan = {
      planId: 'plan-1',
      version: 1,
      tasks,
      dependencies: [],
      description: 'Test plan',
      updateHistory: [],
    }

    const result = coordinator.spawnAgentsForPlan(plan, worktreeDecision)

    expect(result.spawned).toHaveLength(2)
    expect(result.worktreeManagers).toHaveLength(0)
    expect(result.unassigned).toHaveLength(0)

    // Agents should have empty worktreeScope
    for (const agent of result.spawned) {
      expect(agent.worktreeScope).toBe('')
    }
  })
})
