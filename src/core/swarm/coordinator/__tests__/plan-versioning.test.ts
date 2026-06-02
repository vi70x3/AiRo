import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Coordinator } from '../coordinator'
import { PlanVersioning, computeTaskDiff, clonePlan } from '../plan-versioning'
import {
  AgentType,
  AgentLifecycleState,
  Task,
  Dependency,
  Plan,
  PlanUpdate,
  PlanChange,
  PlanChangeType,
  PlanVersion,
  PlanDiff,
  SwarmTaskStatus,
} from '@roo-code/types'

// Helper to create a mock daemon
const createMockDaemon = () => {
  const agents: Record<string, any> = {}
  let coordinatorId: string | null = null
  let plan: any = null
  let planVersions: PlanVersion[] = []
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
    setPlanVersions: vi.fn((v) => { planVersions = v }),
    getPlanVersions: vi.fn(() => planVersions),
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

// Helper to create a task
const makeTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  taskId: id,
  description: `Task ${id}`,
  owner: '',
  scope: 'default',
  status: SwarmTaskStatus.Pending,
  dependsOn: [],
  blockedBy: [],
  checkpoints: [],
  estimatedEffort: 5,
  priority: 5,
  tags: [],
  ...overrides,
})

// ============================================================
// PlanVersioning class tests
// ============================================================
describe('PlanVersioning', () => {
  let versioning: PlanVersioning
  let basePlan: Plan

  beforeEach(() => {
    versioning = new PlanVersioning()
    basePlan = {
      planId: 'plan-1',
      version: 1,
      tasks: [makeTask('t1'), makeTask('t2')],
      dependencies: [],
      description: 'Test plan',
      updateHistory: [],
    }
  })

  describe('initialize', () => {
    it('creates version 1 with all tasks as added', () => {
      const v = versioning.initialize(basePlan, 'agent-1')
      expect(v.version).toBe(1)
      expect(v.createdBy).toBe('agent-1')
      expect(v.changeDescription).toBe('Plan created')
      expect(v.diff.addedTasks).toEqual(['t1', 't2'])
      expect(v.diff.removedTasks).toEqual([])
      expect(v.diff.modifiedTasks).toEqual([])
      expect(v.plan.tasks).toHaveLength(2)
    })

    it('sets the current plan', () => {
      versioning.initialize(basePlan, 'agent-1')
      const current = versioning.getCurrentPlan()
      expect(current).not.toBeNull()
      expect(current!.tasks).toHaveLength(2)
    })
  })

  describe('recordVersion', () => {
    it('creates version 2 with correct diff when adding a task', () => {
      versioning.initialize(basePlan, 'agent-1')

      const modifiedPlan = clonePlan(basePlan)
      modifiedPlan.tasks.push(makeTask('t3'))
      modifiedPlan.version = 2

      const v = versioning.recordVersion(modifiedPlan, 'agent-1', 'Added task t3')
      expect(v.version).toBe(2)
      expect(v.diff.addedTasks).toEqual(['t3'])
      expect(v.diff.removedTasks).toEqual([])
      expect(v.diff.modifiedTasks).toEqual([])
    })

    it('creates version 2 with correct diff when removing a task', () => {
      versioning.initialize(basePlan, 'agent-1')

      const modifiedPlan = clonePlan(basePlan)
      modifiedPlan.tasks = modifiedPlan.tasks.filter(t => t.taskId !== 't1')
      modifiedPlan.version = 2

      const v = versioning.recordVersion(modifiedPlan, 'agent-1', 'Removed task t1')
      expect(v.version).toBe(2)
      expect(v.diff.addedTasks).toEqual([])
      expect(v.diff.removedTasks).toEqual(['t1'])
      expect(v.diff.modifiedTasks).toEqual([])
    })

    it('creates version 2 with correct diff when modifying a task', () => {
      versioning.initialize(basePlan, 'agent-1')

      const modifiedPlan = clonePlan(basePlan)
      modifiedPlan.tasks[0].status = SwarmTaskStatus.InProgress
      modifiedPlan.version = 2

      const v = versioning.recordVersion(modifiedPlan, 'agent-1', 'Updated task t1')
      expect(v.version).toBe(2)
      expect(v.diff.addedTasks).toEqual([])
      expect(v.diff.removedTasks).toEqual([])
      expect(v.diff.modifiedTasks).toHaveLength(1)
      expect(v.diff.modifiedTasks[0].taskId).toBe('t1')
      expect(v.diff.modifiedTasks[0].changes).toContain('status')
    })

    it('throws if not initialized', () => {
      expect(() => versioning.recordVersion(basePlan, 'agent-1', 'test'))
        .toThrow('PlanVersioning not initialized')
    })
  })

  describe('getHistory', () => {
    it('returns all versions in order', () => {
      versioning.initialize(basePlan, 'agent-1')

      const modifiedPlan = clonePlan(basePlan)
      modifiedPlan.tasks.push(makeTask('t3'))
      modifiedPlan.version = 2
      versioning.recordVersion(modifiedPlan, 'agent-1', 'Added t3')

      const history = versioning.getHistory()
      expect(history).toHaveLength(2)
      expect(history[0].version).toBe(1)
      expect(history[1].version).toBe(2)
    })

    it('returns empty array when not initialized', () => {
      expect(versioning.getHistory()).toEqual([])
    })
  })

  describe('getVersion', () => {
    it('returns the correct version', () => {
      versioning.initialize(basePlan, 'agent-1')
      const v = versioning.getVersion(1)
      expect(v).toBeDefined()
      expect(v!.version).toBe(1)
    })

    it('returns undefined for invalid version', () => {
      versioning.initialize(basePlan, 'agent-1')
      expect(versioning.getVersion(0)).toBeUndefined()
      expect(versioning.getVersion(99)).toBeUndefined()
    })
  })

  describe('getLatestVersion', () => {
    it('returns the latest version', () => {
      versioning.initialize(basePlan, 'agent-1')
      const modifiedPlan = clonePlan(basePlan)
      modifiedPlan.tasks.push(makeTask('t3'))
      modifiedPlan.version = 2
      versioning.recordVersion(modifiedPlan, 'agent-1', 'Added t3')

      const latest = versioning.getLatestVersion()
      expect(latest).toBeDefined()
      expect(latest!.version).toBe(2)
    })

    it('returns undefined when not initialized', () => {
      expect(versioning.getLatestVersion()).toBeUndefined()
    })
  })

  describe('compareVersions', () => {
    it('returns diff between two versions', () => {
      versioning.initialize(basePlan, 'agent-1')

      const modifiedPlan = clonePlan(basePlan)
      modifiedPlan.tasks.push(makeTask('t3'))
      modifiedPlan.tasks = modifiedPlan.tasks.filter(t => t.taskId !== 't1')
      modifiedPlan.version = 2
      versioning.recordVersion(modifiedPlan, 'agent-1', 'Added t3, removed t1')

      const diff = versioning.compareVersions(1, 2)
      expect(diff.addedTasks).toEqual(['t3'])
      expect(diff.removedTasks).toEqual(['t1'])
    })

    it('throws for invalid versions', () => {
      versioning.initialize(basePlan, 'agent-1')
      expect(() => versioning.compareVersions(1, 99)).toThrow('Invalid version')
    })
  })

  describe('rollbackToVersion', () => {
    it('creates a new version copying the old state', () => {
      versioning.initialize(basePlan, 'agent-1')

      // Version 2: add t3
      const v2Plan = clonePlan(basePlan)
      v2Plan.tasks.push(makeTask('t3'))
      v2Plan.version = 2
      versioning.recordVersion(v2Plan, 'agent-1', 'Added t3')

      // Rollback to version 1
      const result = versioning.rollbackToVersion(1, 'agent-1')
      expect(result.version.version).toBe(3) // new version
      expect(result.version.changeDescription).toBe('Rolled back to version 1')
      expect(result.plan.tasks).toHaveLength(2) // back to original 2 tasks
      expect(result.plan.tasks.map(t => t.taskId)).toEqual(['t1', 't2'])

      // History should have 3 versions now
      expect(versioning.getHistory()).toHaveLength(3)
    })

    it('throws for invalid version', () => {
      versioning.initialize(basePlan, 'agent-1')
      expect(() => versioning.rollbackToVersion(99, 'agent-1')).toThrow('Version 99 not found')
    })
  })

  describe('restoreFromVersions', () => {
    it('restores version history from persisted data', () => {
      versioning.initialize(basePlan, 'agent-1')
      const history = versioning.getHistory()

      const newVersioning = new PlanVersioning()
      newVersioning.restoreFromVersions(history)

      expect(newVersioning.getHistory()).toHaveLength(1)
      expect(newVersioning.getVersion(1)!.version).toBe(1)
    })
  })

  describe('memory bounding', () => {
    it('clears plan snapshots for old versions beyond max', () => {
      const smallVersioning = new PlanVersioning(3) // keep only 3 in memory
      smallVersioning.initialize(basePlan, 'agent-1')

      // Create 5 versions
      for (let i = 0; i < 4; i++) {
        const p = clonePlan(smallVersioning.getCurrentPlan()!)
        p.tasks.push(makeTask(`extra-${i}`))
        p.version = i + 2
        smallVersioning.recordVersion(p, 'agent-1', `Added extra-${i}`)
      }

      const history = smallVersioning.getHistory()
      expect(history).toHaveLength(5)

      // Old versions (1, 2) should have empty tasks (cleared for memory)
      expect(history[0].plan.tasks).toHaveLength(0)
      expect(history[1].plan.tasks).toHaveLength(0)

      // Recent versions (3, 4, 5) should still have full snapshots
      expect(history[2].plan.tasks.length).toBeGreaterThan(0)
      expect(history[3].plan.tasks.length).toBeGreaterThan(0)
      expect(history[4].plan.tasks.length).toBeGreaterThan(0)
    })
  })
})

// ============================================================
// computeTaskDiff tests
// ============================================================
describe('computeTaskDiff', () => {
  it('detects added tasks', () => {
    const oldTasks = [makeTask('t1')]
    const newTasks = [makeTask('t1'), makeTask('t2')]
    const diff = computeTaskDiff(oldTasks, newTasks)
    expect(diff.addedTasks).toEqual(['t2'])
    expect(diff.removedTasks).toEqual([])
    expect(diff.modifiedTasks).toEqual([])
  })

  it('detects removed tasks', () => {
    const oldTasks = [makeTask('t1'), makeTask('t2')]
    const newTasks = [makeTask('t1')]
    const diff = computeTaskDiff(oldTasks, newTasks)
    expect(diff.addedTasks).toEqual([])
    expect(diff.removedTasks).toEqual(['t2'])
    expect(diff.modifiedTasks).toEqual([])
  })

  it('detects modified tasks', () => {
    const oldTasks = [makeTask('t1', { status: SwarmTaskStatus.Pending })]
    const newTasks = [makeTask('t1', { status: SwarmTaskStatus.InProgress })]
    const diff = computeTaskDiff(oldTasks, newTasks)
    expect(diff.addedTasks).toEqual([])
    expect(diff.removedTasks).toEqual([])
    expect(diff.modifiedTasks).toHaveLength(1)
    expect(diff.modifiedTasks[0].taskId).toBe('t1')
    expect(diff.modifiedTasks[0].changes).toContain('status')
  })

  it('detects multiple field changes', () => {
    const oldTasks = [makeTask('t1', { status: SwarmTaskStatus.Pending, priority: 1 })]
    const newTasks = [makeTask('t1', { status: SwarmTaskStatus.Completed, priority: 5 })]
    const diff = computeTaskDiff(oldTasks, newTasks)
    expect(diff.modifiedTasks).toHaveLength(1)
    expect(diff.modifiedTasks[0].changes).toContain('status')
    expect(diff.modifiedTasks[0].changes).toContain('priority')
  })

  it('returns empty diff for identical task arrays', () => {
    const tasks = [makeTask('t1'), makeTask('t2')]
    const diff = computeTaskDiff(tasks, tasks)
    expect(diff.addedTasks).toEqual([])
    expect(diff.removedTasks).toEqual([])
    expect(diff.modifiedTasks).toEqual([])
  })

  it('handles empty arrays', () => {
    const diff = computeTaskDiff([], [])
    expect(diff.addedTasks).toEqual([])
    expect(diff.removedTasks).toEqual([])
    expect(diff.modifiedTasks).toEqual([])
  })

  it('handles combined add, remove, modify', () => {
    const oldTasks = [
      makeTask('t1', { status: SwarmTaskStatus.Pending }),
      makeTask('t2'),
    ]
    const newTasks = [
      makeTask('t1', { status: SwarmTaskStatus.Completed }),
      makeTask('t3'),
    ]
    const diff = computeTaskDiff(oldTasks, newTasks)
    expect(diff.addedTasks).toEqual(['t3'])
    expect(diff.removedTasks).toEqual(['t2'])
    expect(diff.modifiedTasks).toHaveLength(1)
    expect(diff.modifiedTasks[0].taskId).toBe('t1')
  })
})

// ============================================================
// clonePlan tests
// ============================================================
describe('clonePlan', () => {
  it('creates a deep copy independent of the original', () => {
    const plan: Plan = {
      planId: 'p1',
      version: 1,
      tasks: [makeTask('t1')],
      dependencies: [],
      description: 'test',
      updateHistory: [],
    }
    const cloned = clonePlan(plan)
    expect(cloned).toEqual(plan)
    expect(cloned).not.toBe(plan)
    expect(cloned.tasks).not.toBe(plan.tasks)

    // Mutating clone should not affect original
    cloned.tasks.push(makeTask('t2'))
    expect(plan.tasks).toHaveLength(1)
    expect(cloned.tasks).toHaveLength(2)
  })
})

// ============================================================
// Coordinator integration tests
// ============================================================
describe('Coordinator Plan Versioning Integration', () => {
  let mockDaemon: any
  let coordinator: Coordinator

  beforeEach(() => {
    mockDaemon = createMockDaemon()
    coordinator = new Coordinator('coord-1', mockDaemon)
  })

  describe('plan creation initializes versioning', () => {
    it('creates version 1 on createInitialPlan', () => {
      const plan = coordinator.createInitialPlan('test', [makeTask('t1')], [])
      expect(plan.version).toBe(1)

      const history = coordinator.getPlanHistory()
      expect(history).toHaveLength(1)
      expect(history[0].version).toBe(1)
      expect(history[0].changeDescription).toBe('Plan created')
      expect(mockDaemon.setPlanVersions).toHaveBeenCalled()
    })

    it('creates version 1 on createPlanFromInput', () => {
      const plan = coordinator.createPlanFromInput({
        description: 'test',
        taskDescriptions: [{ description: 'task 1' }],
      })
      expect(plan.version).toBe(1)

      const history = coordinator.getPlanHistory()
      expect(history).toHaveLength(1)
    })
  })

  describe('addTask', () => {
    it('adds a task and creates a new version', () => {
      coordinator.createInitialPlan('test', [makeTask('t1')], [])
      const updated = coordinator.addTask(makeTask('t2'))

      expect(updated.tasks).toHaveLength(2)
      expect(updated.version).toBe(2)

      const history = coordinator.getPlanHistory()
      expect(history).toHaveLength(2)
      expect(history[1].version).toBe(2)
      expect(history[1].diff.addedTasks).toEqual(['t2'])
    })

    it('throws if no plan exists', () => {
      expect(() => coordinator.addTask(makeTask('t1'))).toThrow('No current plan exists')
    })
  })

  describe('removeTask', () => {
    it('removes a task and creates a new version', () => {
      coordinator.createInitialPlan('test', [makeTask('t1'), makeTask('t2')], [])
      const updated = coordinator.removeTask('t1')

      expect(updated.tasks).toHaveLength(1)
      expect(updated.version).toBe(2)

      const history = coordinator.getPlanHistory()
      expect(history).toHaveLength(2)
      expect(history[1].diff.removedTasks).toEqual(['t1'])
    })

    it('throws if no plan exists', () => {
      expect(() => coordinator.removeTask('t1')).toThrow('No current plan exists')
    })
  })

  describe('updateTask', () => {
    it('updates a task and creates a new version', () => {
      coordinator.createInitialPlan('test', [makeTask('t1', { status: SwarmTaskStatus.Pending })], [])
      const updated = coordinator.updateTask('t1', { status: SwarmTaskStatus.InProgress })

      expect(updated.tasks[0].status).toBe(SwarmTaskStatus.InProgress)
      expect(updated.version).toBe(2)

      const history = coordinator.getPlanHistory()
      expect(history).toHaveLength(2)
      expect(history[1].diff.modifiedTasks).toHaveLength(1)
      expect(history[1].diff.modifiedTasks[0].taskId).toBe('t1')
    })

    it('throws if task not found', () => {
      coordinator.createInitialPlan('test', [], [])
      expect(() => coordinator.updateTask('nonexistent', {})).toThrow('not found')
    })

    it('throws if no plan exists', () => {
      expect(() => coordinator.updateTask('t1', {})).toThrow('No current plan exists')
    })
  })

  describe('setTaskDependencies', () => {
    it('sets dependencies and creates a new version', () => {
      coordinator.createInitialPlan('test', [makeTask('t1'), makeTask('t2')], [])
      const updated = coordinator.setTaskDependencies('t1', ['t2'])

      expect(updated.tasks[0].dependsOn).toEqual(['t2'])
      expect(updated.version).toBe(2)

      const history = coordinator.getPlanHistory()
      expect(history).toHaveLength(2)
    })

    it('throws if task not found', () => {
      coordinator.createInitialPlan('test', [], [])
      expect(() => coordinator.setTaskDependencies('nonexistent', [])).toThrow('not found')
    })
  })

  describe('reviewPlanUpdate creates version on approval', () => {
    it('creates a new version when update is approved', () => {
      const plan = coordinator.createInitialPlan('test', [], [])
      const task = makeTask('t-new')
      const update: PlanUpdate = {
        updateId: 'u1',
        proposerId: 'coord-1',
        timestamp: Date.now(),
        version: plan.version,
        changes: [{
          changeType: PlanChangeType.AddTask,
          targetId: 't-new',
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

      const history = coordinator.getPlanHistory()
      expect(history).toHaveLength(2) // version 1 (initial) + version 2 (approved update)
      expect(history[1].changeDescription).toContain('Plan update approved')
    })

    it('does not create a new version when update is rejected', () => {
      const plan = coordinator.createInitialPlan('test', [], [])
      const update: PlanUpdate = {
        updateId: 'u2',
        proposerId: 'coord-1',
        timestamp: Date.now(),
        version: plan.version + 1, // wrong version → rejection
        changes: [],
        reason: '',
        impact: '',
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
      }
      coordinator.reviewPlanUpdate(update)

      const history = coordinator.getPlanHistory()
      expect(history).toHaveLength(1) // only initial version
    })
  })

  describe('getPlanHistory', () => {
    it('returns empty array when no plan exists', () => {
      expect(coordinator.getPlanHistory()).toEqual([])
    })

    it('returns all versions after mutations', () => {
      coordinator.createInitialPlan('test', [makeTask('t1')], [])
      coordinator.addTask(makeTask('t2'))
      coordinator.addTask(makeTask('t3'))

      const history = coordinator.getPlanHistory()
      expect(history).toHaveLength(3)
      expect(history.map(v => v.version)).toEqual([1, 2, 3])
    })
  })

  describe('getPlanVersion', () => {
    it('returns specific version', () => {
      coordinator.createInitialPlan('test', [makeTask('t1')], [])
      coordinator.addTask(makeTask('t2'))

      const v1 = coordinator.getPlanVersion(1)
      expect(v1).toBeDefined()
      expect(v1!.version).toBe(1)

      const v2 = coordinator.getPlanVersion(2)
      expect(v2).toBeDefined()
      expect(v2!.version).toBe(2)
    })

    it('returns undefined for invalid version', () => {
      coordinator.createInitialPlan('test', [], [])
      expect(coordinator.getPlanVersion(99)).toBeUndefined()
    })
  })

  describe('compareVersions', () => {
    it('returns diff between two versions', () => {
      coordinator.createInitialPlan('test', [makeTask('t1')], [])
      coordinator.addTask(makeTask('t2'))

      const diff = coordinator.compareVersions(1, 2)
      expect(diff.addedTasks).toEqual(['t2'])
      expect(diff.removedTasks).toEqual([])
    })

    it('throws for invalid versions', () => {
      coordinator.createInitialPlan('test', [], [])
      expect(() => coordinator.compareVersions(1, 99)).toThrow('Invalid version')
    })
  })

  describe('rollbackToVersion', () => {
    it('rolls back to a previous version and creates a new version', () => {
      coordinator.createInitialPlan('test', [makeTask('t1')], [])
      coordinator.addTask(makeTask('t2'))
      coordinator.addTask(makeTask('t3'))

      // Rollback to version 1 (only t1)
      const restored = coordinator.rollbackToVersion(1)
      expect(restored.tasks).toHaveLength(1)
      expect(restored.tasks[0].taskId).toBe('t1')

      // Should have 4 versions now: 1 (initial), 2 (add t2), 3 (add t3), 4 (rollback to v1)
      const history = coordinator.getPlanHistory()
      expect(history).toHaveLength(4)
      expect(history[3].version).toBe(4)
      expect(history[3].changeDescription).toBe('Rolled back to version 1')
    })

    it('throws for invalid version', () => {
      coordinator.createInitialPlan('test', [], [])
      expect(() => coordinator.rollbackToVersion(99)).toThrow('Version 99 not found')
    })
  })

  describe('daemon sync', () => {
    it('syncs versions to daemon after each mutation', () => {
      coordinator.createInitialPlan('test', [makeTask('t1')], [])
      expect(mockDaemon.setPlanVersions).toHaveBeenCalledTimes(1)

      coordinator.addTask(makeTask('t2'))
      expect(mockDaemon.setPlanVersions).toHaveBeenCalledTimes(2)

      coordinator.removeTask('t1')
      expect(mockDaemon.setPlanVersions).toHaveBeenCalledTimes(3)
    })
  })
})
