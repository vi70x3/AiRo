import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PlanDistributor } from '../plan-distributor'
import { IDaemon } from '../../interfaces'
import { AgentLifecycleState, Plan, Task, Dependency } from '@roo-code/types'

const createMockDaemon = () => {
  const agents: Record<string, any> = {}
  let coordinatorId: string | null = null
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
    unregisterAgent: vi.fn(),
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
  } as unknown as IDaemon
}

describe('PlanDistributor', () => {
  let daemon: IDaemon
  let distributor: PlanDistributor

  beforeEach(() => {
    daemon = createMockDaemon()
    distributor = new PlanDistributor(daemon)
  })

  it('sends direct messages to active agents for relevant tasks', () => {
    const agentA = { agentId: 'a1', worktreeScope: 'wt1', state: AgentLifecycleState.Ready, agentType: 'agent' }
    const agentB = { agentId: 'b2', worktreeScope: 'wt2', state: AgentLifecycleState.Running, agentType: 'agent' }
    ;(daemon as any).registerAgent(agentA)
    ;(daemon as any).registerAgent(agentB)

    const plan: Plan = {
      planId: 'plan-1',
      version: 1,
      description: 'test plan',
      tasks: [
        { taskId: 't1', description: 'task 1', owner: 'a1', dependsOn: [], checkpoints: [], scope: 'wt1', priority: 1 } as Task,
        { taskId: 't2', description: 'task 2', owner: 'b2', dependsOn: [], checkpoints: [], scope: 'wt2', priority: 1 } as Task,
      ],
      dependencies: [],
    } as any

    const result = distributor.distributePlan(plan)
    expect(result.distributedCount).toBe(2)
    expect(result.broadcastSent).toBe(true)
    expect((daemon as any).sendDM).toHaveBeenCalledTimes(2)
    const calls = (daemon as any).sendDM.mock.calls
    const recipients = calls.map((c: any[]) => c[0].recipientId)
    expect(recipients).toContain('a1')
    expect(recipients).toContain('b2')
  })

  it('broadcasts a summary message', () => {
    const plan: Plan = { planId: 'p', version: 1, description: 'test', tasks: [], dependencies: [] } as any
    distributor.distributePlan(plan)
    expect((daemon as any).broadcast).toHaveBeenCalledTimes(1)
    const msg = (daemon as any).broadcast.mock.calls[0][0]
    expect(msg.content.planId).toBe('p')
    expect(msg.content.description).toBe('test')
  })

  it('excludes crashed/stopped/failed agents from distribution', () => {
    const active = { agentId: 'active1', worktreeScope: 'wt1', state: AgentLifecycleState.Ready, agentType: 'agent' }
    const crashed = { agentId: 'crashed1', worktreeScope: 'wt1', state: AgentLifecycleState.Crashed, agentType: 'agent' }
    const stopped = { agentId: 'stopped1', worktreeScope: 'wt1', state: AgentLifecycleState.Stopped, agentType: 'agent' }
    const failed = { agentId: 'failed1', worktreeScope: 'wt1', state: AgentLifecycleState.Failed, agentType: 'agent' }
    ;(daemon as any).registerAgent(active)
    ;(daemon as any).registerAgent(crashed)
    ;(daemon as any).registerAgent(stopped)
    ;(daemon as any).registerAgent(failed)

    const plan: Plan = { planId: 'p', version: 1, description: 'test', tasks: [], dependencies: [] } as any
    const result = distributor.distributePlan(plan)
    expect(result.distributedCount).toBe(1)
    expect(result.recipientIds).toEqual(['active1'])
  })

  it('findRelevantTasks returns owned tasks and transitive dependents', () => {
    const plan: Plan = {
      planId: 'p',
      version: 1,
      description: 'test',
      tasks: [
        { taskId: 't1', description: 't1', owner: 'a1', dependsOn: [], checkpoints: [], scope: 'wt1', priority: 1 } as Task,
        { taskId: 't2', description: 't2', owner: 'a2', dependsOn: ['t1'], checkpoints: [], scope: 'wt1', priority: 1 } as Task,
        { taskId: 't3', description: 't3', owner: 'a3', dependsOn: ['t2'], checkpoints: [], scope: 'wt1', priority: 1 } as Task,
      ],
      dependencies: [
        { fromTaskId: 't2', toTaskId: 't1', type: 'blocks' } as Dependency,
        { fromTaskId: 't3', toTaskId: 't2', type: 'blocks' } as Dependency,
      ],
    } as any

    const relevant = distributor.findRelevantTasks(plan, 'a1')
    const taskIds = relevant.map(t => t.taskId)
    expect(taskIds).toContain('t1')
    expect(taskIds).toContain('t2')
    expect(taskIds).toContain('t3')
  })

  it('findRelatedAgents returns owners of related tasks', () => {
    const plan: Plan = {
      planId: 'p',
      version: 1,
      description: 'test',
      tasks: [
        { taskId: 't1', description: 't1', owner: 'a1', dependsOn: [], checkpoints: [], scope: 'wt1', priority: 1 } as Task,
        { taskId: 't2', description: 't2', owner: 'a2', dependsOn: ['t1'], checkpoints: [], scope: 'wt1', priority: 1 } as Task,
      ],
      dependencies: [
        { fromTaskId: 't2', toTaskId: 't1', type: 'blocks' } as Dependency,
      ],
    } as any

    const related = distributor.findRelatedAgents(plan, 'a1')
    expect(related).toContain('a2')
    expect(related).not.toContain('a1')
  })

  it('distributePlanUpdate sends targeted updates to relevant agents', () => {
    const agentA = { agentId: 'a1', worktreeScope: 'wt1', state: AgentLifecycleState.Ready, agentType: 'agent' }
    const agentB = { agentId: 'b2', worktreeScope: 'wt2', state: AgentLifecycleState.Running, agentType: 'agent' }
    ;(daemon as any).registerAgent(agentA)
    ;(daemon as any).registerAgent(agentB)

    const plan: Plan = {
      planId: 'plan-1',
      version: 2,
      description: 'test',
      tasks: [
        { taskId: 't1', description: 'task 1', owner: 'a1', dependsOn: [], checkpoints: [], scope: 'wt1', priority: 1 } as Task,
        { taskId: 't2', description: 'task 2', owner: 'b2', dependsOn: [], checkpoints: [], scope: 'wt2', priority: 1 } as Task,
      ],
      dependencies: [],
    } as any

    const update = {
      updateId: 'u1',
      planId: 'plan-1',
      changes: [
        { changeId: 'c1', type: 'modify', targetId: 't1', description: 'changed t1' },
      ],
      reason: 'scope adjustment',
      impact: 'low',
      timestamp: Date.now(),
    }

    const result = distributor.distributePlanUpdate(plan, update as any)
    expect(result.distributedCount).toBe(2)
    expect(result.broadcastSent).toBe(true)
  })
})