import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SpawnManager } from '../spawn-manager'
import {
  AgentType,
  AgentLifecycleState,
  Task,
  TaskStatus,
  Plan,
} from '@roo-code/types'
import { WorktreeDecision } from '../worktree-decision'

// Helper to create a mock daemon
const createMockDaemon = () => {
  const agents: Record<string, any> = {}
  return {
    registerAgent: vi.fn((agent: any) => { agents[agent.agentId] = agent }),
    unregisterAgent: vi.fn((id: string) => { delete agents[id] }),
    getAgent: vi.fn((id: string) => agents[id] ?? null),
    listAgents: vi.fn(() => Object.values(agents)),
    sendDM: vi.fn(),
    broadcast: vi.fn(),
    setCoordinatorId: vi.fn(),
    getCoordinatorId: vi.fn(),
    setPlan: vi.fn(),
    getPlan: vi.fn(),
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

// Helper to create a plan
const createPlan = (tasks: Task[]): Plan => ({
  planId: 'plan-1',
  version: 1,
  tasks,
  dependencies: [],
  description: 'Test plan',
  updateHistory: [],
})

describe('SpawnManager', () => {
  let mockDaemon: any
  let spawnManager: SpawnManager

  beforeEach(() => {
    mockDaemon = createMockDaemon()
    spawnManager = new SpawnManager(mockDaemon, 'coord-1')
  })

  describe('construction', () => {
    it('constructs with daemon and coordinatorId', () => {
      expect(spawnManager).toBeDefined()
    })
  })

  describe('spawnWorktreeManager', () => {
    it('creates WM metadata with correct properties', () => {
      const wm = spawnManager.spawnWorktreeManager('scope1')
      expect(wm.agentType).toBe(AgentType.WorktreeManager)
      expect(wm.state).toBe(AgentLifecycleState.Spawned)
      expect(wm.parentId).toBe('coord-1')
      expect(wm.worktreeScope).toBe('scope1')
      expect(wm.taskId).toBeNull()
      expect(wm.agentId).toBeDefined()
      expect(wm.spawnedAt).toBeTypeOf('number')
      expect(wm.lastHeartbeat).toBeTypeOf('number')
    })

    it('registers the WM with the daemon', () => {
      const wm = spawnManager.spawnWorktreeManager('scope1')
      expect(mockDaemon.registerAgent).toHaveBeenCalledWith(wm)
    })

    it('tracks the WM internally', () => {
      const wm = spawnManager.spawnWorktreeManager('scope1')
      const wms = spawnManager.getSpawnedWorktreeManagers()
      expect(wms).toHaveLength(1)
      expect(wms[0].agentId).toBe(wm.agentId)
    })
  })

  describe('spawnAgent', () => {
    it('creates agent metadata with correct properties', () => {
      const agent = spawnManager.spawnAgent('task-1')
      expect(agent.agentType).toBe(AgentType.Agent)
      expect(agent.state).toBe(AgentLifecycleState.Spawned)
      expect(agent.parentId).toBe('coord-1')
      expect(agent.taskId).toBe('task-1')
      expect(agent.worktreeScope).toBe('')
      expect(agent.agentId).toBeDefined()
    })

    it('creates agent with worktree scope when provided', () => {
      const agent = spawnManager.spawnAgent('task-1', 'scopeA')
      expect(agent.worktreeScope).toBe('scopeA')
    })

    it('registers the agent with the daemon', () => {
      const agent = spawnManager.spawnAgent('task-1')
      expect(mockDaemon.registerAgent).toHaveBeenCalledWith(agent)
    })

    it('tracks the agent internally', () => {
      const agent = spawnManager.spawnAgent('task-1')
      const agents = spawnManager.getSpawnedAgents()
      expect(agents).toHaveLength(1)
      expect(agents[0].agentId).toBe(agent.agentId)
    })
  })

  describe('spawnAgentsForPlan with worktrees', () => {
    it('spawns WMs for each scope and agents assigned to scopes', () => {
      const tasks = [
        createTask('t1', 'frontend'),
        createTask('t2', 'backend'),
        createTask('t3', 'testing'),
      ]
      const plan = createPlan(tasks)

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

      const result = spawnManager.spawnAgentsForPlan(plan, worktreeDecision)

      expect(result.worktreeManagers).toHaveLength(3)
      expect(result.spawned).toHaveLength(3)
      expect(result.unassigned).toHaveLength(0)

      // Verify WMs have correct scopes
      const wmScopes = result.worktreeManagers.map(wm => wm.worktreeScope).sort()
      expect(wmScopes).toEqual(['backend', 'frontend', 'testing'])

      // Verify agents are assigned to correct scopes
      for (const agent of result.spawned) {
        const task = tasks.find(t => t.taskId === agent.taskId)
        expect(agent.worktreeScope).toBe(task?.scope)
      }
    })

    it('tracks multiple agents across scopes', () => {
      const tasks = [
        createTask('t1', 'frontend'),
        createTask('t2', 'frontend'),
        createTask('t3', 'backend'),
      ]
      const plan = createPlan(tasks)

      const scopeAssignments = new Map<string, string[]>()
      scopeAssignments.set('frontend', ['t1', 't2'])
      scopeAssignments.set('backend', ['t3'])

      const worktreeDecision: WorktreeDecision = {
        useWorktrees: true,
        reason: 'Clear scope separation',
        worktreeCount: 2,
        scopeAssignments,
      }

      const result = spawnManager.spawnAgentsForPlan(plan, worktreeDecision)

      expect(result.worktreeManagers).toHaveLength(2)
      expect(result.spawned).toHaveLength(3)
      expect(result.unassigned).toHaveLength(0)
    })
  })

  describe('spawnAgentsForPlan without worktrees', () => {
    it('spawns all agents in the main workspace', () => {
      const tasks = [
        createTask('t1', 'frontend'),
        createTask('t2', 'backend'),
      ]
      const plan = createPlan(tasks)

      const worktreeDecision: WorktreeDecision = {
        useWorktrees: false,
        reason: 'Fewer than 3 tasks',
        worktreeCount: 0,
        scopeAssignments: new Map(),
      }

      const result = spawnManager.spawnAgentsForPlan(plan, worktreeDecision)

      expect(result.worktreeManagers).toHaveLength(0)
      expect(result.spawned).toHaveLength(2)
      expect(result.unassigned).toHaveLength(0)

      // Agents should have empty worktreeScope
      for (const agent of result.spawned) {
        expect(agent.worktreeScope).toBe('')
      }
    })
  })

  describe('assignTasksToScopes', () => {
    it('maps tasks to scope-based agents', () => {
      // Spawn agents first
      spawnManager.spawnAgent('t1', 'frontend')
      spawnManager.spawnAgent('t2', 'backend')

      const tasks = [
        createTask('t1', 'frontend'),
        createTask('t2', 'backend'),
      ]

      const scopeAssignments = new Map<string, string[]>()
      scopeAssignments.set('frontend', ['t1'])
      scopeAssignments.set('backend', ['t2'])

      const assignments = spawnManager.assignTasksToScopes(tasks, scopeAssignments)

      // Should have 2 assignments (agentId → taskId)
      expect(assignments.size).toBe(2)
    })
  })

  describe('canSpawnAgent', () => {
    it('returns true for a task that exists in the plan and is not assigned', () => {
      const tasks = [createTask('t1', 'frontend')]
      const plan = createPlan(tasks)
      expect(spawnManager.canSpawnAgent('t1', plan)).toBe(true)
    })

    it('returns false for a non-existent task', () => {
      const tasks = [createTask('t1', 'frontend')]
      const plan = createPlan(tasks)
      expect(spawnManager.canSpawnAgent('nonexistent', plan)).toBe(false)
    })

    it('returns false for an already assigned task', () => {
      const tasks = [createTask('t1', 'frontend')]
      const plan = createPlan(tasks)
      spawnManager.spawnAgent('t1')
      expect(spawnManager.canSpawnAgent('t1', plan)).toBe(false)
    })
  })

  describe('getSpawnedAgents / getSpawnedWorktreeManagers', () => {
    it('returns empty arrays when nothing spawned', () => {
      expect(spawnManager.getSpawnedAgents()).toEqual([])
      expect(spawnManager.getSpawnedWorktreeManagers()).toEqual([])
    })

    it('returns all spawned agents and WMs', () => {
      spawnManager.spawnAgent('t1')
      spawnManager.spawnAgent('t2')
      spawnManager.spawnWorktreeManager('scope1')

      expect(spawnManager.getSpawnedAgents()).toHaveLength(2)
      expect(spawnManager.getSpawnedWorktreeManagers()).toHaveLength(1)
    })
  })
})
