import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CrossWorktreeCoordinator, CrossWorktreeConflict, InterWorktreeDag } from '../cross-worktree-coordinator'
import { IDaemon } from '../../interfaces'
import { AgentLifecycleState, WorktreeMetadata, WorktreeStatus, Plan, Task, Dependency, NotificationType, Notification, TouchNotification } from '@roo-code/types'

const createMockDaemon = () => {
  const agents: Record<string, any> = {}
  let coordinatorId: string | null = null
  const notifications: Record<string, any[]> = {}
  return {
    registerAgent: vi.fn((a) => { agents[a.agentId] = a }),
    getAgent: vi.fn((id) => agents[id] ?? null),
    listAgents: vi.fn(() => Object.values(agents)),
    sendDM: vi.fn(),
    broadcast: vi.fn(),
    setCoordinatorId: vi.fn((id) => { coordinatorId = id }),
    getCoordinatorId: vi.fn(() => coordinatorId),
    setPlan: vi.fn(),
    getPlan: vi.fn(() => null),
    getPendingNotifications: vi.fn((agentId) => notifications[agentId] ?? []),
    unregisterAgent: vi.fn(),
    joinChannel: vi.fn(),
    leaveChannel: vi.fn(),
    sendToChannel: vi.fn(),
    setContextKey: vi.fn(),
    getContextKey: vi.fn(),
    listContextKeys: vi.fn(),
    subscribeToKey: vi.fn(),
    notifyFileTouch: vi.fn(),
    broadcastIntent: vi.fn(),
    createSnapshot: vi.fn(),
    restoreFromSnapshot: vi.fn(),
    listSnapshots: vi.fn(),
    _setNotifications: (agentId: string, notifs: any[]) => { notifications[agentId] = notifs },
  } as unknown as IDaemon
}

describe('CrossWorktreeCoordinator', () => {
  let daemon: IDaemon
  let coordinator: CrossWorktreeCoordinator

  beforeEach(() => {
    daemon = createMockDaemon()
    coordinator = new CrossWorktreeCoordinator(daemon)
  })

  it('returns empty conflicts when no cross-scope file overlap', () => {
    const conflicts = coordinator.detectCrossWorktreeConflicts()
    expect(conflicts).toHaveLength(0)
  })

  it('detects cross-worktree conflicts for files in multiple scopes', () => {
    const wm1 = { agentId: 'wm-1', worktreeScope: 'scope1', state: AgentLifecycleState.Ready, agentType: 'worktree_manager' }
    const wm2 = { agentId: 'wm-2', worktreeScope: 'scope2', state: AgentLifecycleState.Ready, agentType: 'worktree_manager' }
    ;(daemon as any).registerAgent(wm1)
    ;(daemon as any).registerAgent(wm2)

    const touch1: Notification = {
      notificationId: 'n1',
      type: NotificationType.Touch,
      payload: { filePath: 'shared.ts', modifyingAgentId: 'a1', operation: 'modify' } as TouchNotification,
      timestamp: Date.now(),
    }
    const touch2: Notification = {
      notificationId: 'n2',
      type: NotificationType.Touch,
      payload: { filePath: 'shared.ts', modifyingAgentId: 'a2', operation: 'modify' } as TouchNotification,
      timestamp: Date.now(),
    }
    ;(daemon as any)._setNotifications('a1', [touch1])
    ;(daemon as any)._setNotifications('a2', [touch2])

    const agent1 = { agentId: 'a1', worktreeScope: 'scope1', state: AgentLifecycleState.Running, agentType: 'agent' }
    const agent2 = { agentId: 'a2', worktreeScope: 'scope2', state: AgentLifecycleState.Running, agentType: 'agent' }
    ;(daemon as any).registerAgent(agent1)
    ;(daemon as any).registerAgent(agent2)

    const conflicts = coordinator.detectCrossWorktreeConflicts()
    expect(conflicts.length).toBeGreaterThan(0)
    const shared = conflicts.find(c => c.conflict.filePath === 'shared.ts')
    expect(shared).toBeDefined()
    expect(shared!.involvedScopes).toContain('scope1')
    expect(shared!.involvedScopes).toContain('scope2')
    expect(shared!.involvedManagerIds).toContain('wm-1')
    expect(shared!.involvedManagerIds).toContain('wm-2')
  })

  it('returns empty when file only touched in one scope', () => {
    const wm1 = { agentId: 'wm-1', worktreeScope: 'scope1', state: AgentLifecycleState.Ready, agentType: 'worktree_manager' }
    ;(daemon as any).registerAgent(wm1)

    const touch: Notification = {
      notificationId: 'n1',
      type: NotificationType.Touch,
      payload: { filePath: 'local.ts', modifyingAgentId: 'a1', operation: 'modify' } as TouchNotification,
      timestamp: Date.now(),
    }
    ;(daemon as any)._setNotifications('a1', [touch])

    const agent1 = { agentId: 'a1', worktreeScope: 'scope1', state: AgentLifecycleState.Running, agentType: 'agent' }
    ;(daemon as any).registerAgent(agent1)

    const conflicts = coordinator.detectCrossWorktreeConflicts()
    expect(conflicts).toHaveLength(0)
  })

  it('coordinateCrossWorktreeResolution returns a resolution and notifies managers', () => {
    const conflict: CrossWorktreeConflict = {
      conflict: {
        conflictId: 'c1',
        filePath: 'shared.ts',
        conflictingAgents: ['a1', 'a2'],
        detectedAt: Date.now(),
        status: 'detected',
        resolution: null,
      },
      involvedScopes: ['scope1', 'scope2'],
      involvedManagerIds: ['wm-1', 'wm-2'],
      escalated: false,
    }

    const resolution = coordinator.coordinateCrossWorktreeResolution(conflict)
    expect(resolution).toBeDefined()
    expect(resolution.strategy).toBe('merge')
    expect((daemon as any).sendDM).toHaveBeenCalledTimes(2)
  })

  it('determineMergeOrder returns topologically sorted scopes', () => {
    const plan: Plan = {
      planId: 'plan-1',
      version: 1,
      description: 'test',
      tasks: [
        { taskId: 't1', description: 't1', owner: 'a1', dependsOn: [], checkpoints: [], scope: 'scope1', priority: 1 } as Task,
        { taskId: 't2', description: 't2', owner: 'a2', dependsOn: ['t1'], checkpoints: [], scope: 'scope2', priority: 1 } as Task,
      ],
      dependencies: [
        { fromTaskId: 't2', toTaskId: 't1', type: 'blocks' } as Dependency,
      ],
    } as any

    const worktrees: WorktreeMetadata[] = [
      {
        worktreeId: 'scope1',
        path: '/tmp/scope1',
        branchName: 'feature/scope1',
        baseBranch: 'main',
        managerId: 'wm-1',
        assignedAgents: [],
        status: WorktreeStatus.Active,
        conflicts: [],
        mergePreparation: null,
      },
      {
        worktreeId: 'scope2',
        path: '/tmp/scope2',
        branchName: 'feature/scope2',
        baseBranch: 'main',
        managerId: 'wm-2',
        assignedAgents: [],
        status: WorktreeStatus.Active,
        conflicts: [],
        mergePreparation: null,
      },
    ]

    const order = coordinator.determineMergeOrder(worktrees, plan)
    // scope1 should come before scope2 because t2 depends on t1
    expect(order[0]).toBe('scope1')
    expect(order[1]).toBe('scope2')
  })

  it('buildInterWorktreeDependencyDag creates correct nodes and edges', () => {
    const plan: Plan = {
      planId: 'plan-1',
      version: 1,
      description: 'test',
      tasks: [
        { taskId: 't1', description: 't1', owner: 'a1', dependsOn: [], checkpoints: [], scope: 'scope1', priority: 1 } as Task,
        { taskId: 't2', description: 't2', owner: 'a2', dependsOn: ['t1'], checkpoints: [], scope: 'scope2', priority: 1 } as Task,
      ],
      dependencies: [
        { fromTaskId: 't2', toTaskId: 't1', type: 'blocks' } as Dependency,
      ],
    } as any

    const dag = coordinator.buildInterWorktreeDependencyDag(plan)
    expect(dag.nodes).toContain('scope1')
    expect(dag.nodes).toContain('scope2')
    expect(dag.edges.length).toBe(1)
    expect(dag.edges[0].fromScope).toBe('scope1')
    expect(dag.edges[0].toScope).toBe('scope2')
    expect(dag.edges[0].taskIds).toContain('t1')
    expect(dag.edges[0].taskIds).toContain('t2')
  })
})
