import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictStrategies, StrategyProposal, StrategyEvaluation, SequentialOrder, RebaseProposal, FilePartition } from '../conflict-strategies'
import { IDaemon } from '../../interfaces'
import { ConflictType, ConflictSeverity } from '../../worktree-manager/conflict-detector'
import { ConflictResolutionStrategy, Plan, Task } from '@roo-code/types'

const createMockDaemon = () => {
  const agents: Record<string, any> = {}
  let plan: any = null
  return {
    registerAgent: vi.fn((a) => { agents[a.agentId] = a }),
    getAgent: vi.fn((id) => agents[id] ?? null),
    listAgents: vi.fn(() => Object.values(agents)),
    sendDM: vi.fn(),
    broadcast: vi.fn(),
    setCoordinatorId: vi.fn(),
    getCoordinatorId: vi.fn(() => null),
    setPlan: vi.fn((p) => { plan = p }),
    getPlan: vi.fn(() => plan),
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

describe('ConflictStrategies', () => {
  let daemon: IDaemon
  let strategies: ConflictStrategies

  beforeEach(() => {
    daemon = createMockDaemon()
    strategies = new ConflictStrategies('agent-1', daemon)
  })

  it('proposes Sequential strategy for WriteWrite conflicts', () => {
    const proposal = strategies.proposeStrategy(
      ConflictType.WriteWrite,
      ConflictSeverity.Medium,
      'agent-2'
    )
    expect(proposal.strategy).toBe(ConflictResolutionStrategy.Merge)
    expect(proposal.proposerId).toBe('agent-1')
    expect(proposal.priorityAgent).toBeDefined()
    expect(proposal.reason).toContain('Write-Write')
  })

  it('proposes Rebase strategy for IntentWrite conflicts', () => {
    const proposal = strategies.proposeStrategy(
      ConflictType.IntentWrite,
      ConflictSeverity.Medium,
      'agent-2'
    )
    expect(proposal.strategy).toBe(ConflictResolutionStrategy.Rebase)
    expect(proposal.proposerId).toBe('agent-1')
    expect(proposal.reason).toContain('Intent-Write')
  })

  it('proposes Merge with partition for IntentIntent conflicts', () => {
    const proposal = strategies.proposeStrategy(
      ConflictType.IntentIntent,
      ConflictSeverity.Medium,
      'agent-2'
    )
    expect(proposal.strategy).toBe(ConflictResolutionStrategy.Merge)
    expect(proposal.proposerId).toBe('agent-1')
    expect(proposal.partitionPlan).toBeDefined()
    expect(proposal.reason).toContain('Intent-Intent')
  })

  it('proposes Merge with no action for ReadWrite conflicts', () => {
    const proposal = strategies.proposeStrategy(
      ConflictType.ReadWrite,
      ConflictSeverity.Low,
      'agent-2'
    )
    expect(proposal.strategy).toBe(ConflictResolutionStrategy.Merge)
    expect(proposal.proposerId).toBe('agent-1')
    expect(proposal.estimatedResolutionTime).toBe(0)
    expect(proposal.reason).toContain('Read-Write')
  })

  it('evaluates proposal fairly when it prioritizes self', () => {
    const proposal: StrategyProposal = {
      strategy: ConflictResolutionStrategy.Merge,
      proposerId: 'agent-2',
      reason: 'test',
      priorityAgent: 'agent-1', // prioritizes self
    }
    const evaluation = strategies.evaluateProposal(proposal)
    expect(evaluation.accepted).toBe(true)
  })

  it('evaluates proposal unfairly when it prioritizes other agent', () => {
    const proposal: StrategyProposal = {
      strategy: ConflictResolutionStrategy.Merge,
      proposerId: 'agent-2',
      reason: 'test',
      priorityAgent: 'agent-2', // prioritizes other
    }
    const evaluation = strategies.evaluateProposal(proposal)
    expect(evaluation.accepted).toBe(false)
    expect(evaluation.counterProposal).toBeDefined()
    expect(evaluation.counterProposal?.priorityAgent).toBe('agent-1')
  })

  it('determines sequential order based on task priority', () => {
    const plan: Plan = {
      planId: 'plan-1',
      version: 1,
      description: 'test',
      tasks: [
        { taskId: 't1', description: 'high priority', owner: 'agent-1', dependsOn: [], checkpoints: [], scope: 'wt1', priority: 10 } as Task,
        { taskId: 't2', description: 'low priority', owner: 'agent-2', dependsOn: [], checkpoints: [], scope: 'wt1', priority: 1 } as Task,
      ],
      dependencies: [],
    } as any
    ;(daemon as any).setPlan(plan)

    const order = strategies.determineSequentialOrder('agent-2')
    expect(order.firstAgent).toBe('agent-1')
    expect(order.secondAgent).toBe('agent-2')
    expect(order.reason).toContain('Task priority')
  })

  it('determines sequential order based on spawn time when priorities equal', () => {
    const plan: Plan = {
      planId: 'plan-1',
      version: 1,
      description: 'test',
      tasks: [
        { taskId: 't1', description: 'equal priority', owner: 'agent-1', dependsOn: [], checkpoints: [], scope: 'wt1', priority: 5 } as Task,
        { taskId: 't2', description: 'equal priority', owner: 'agent-2', dependsOn: [], checkpoints: [], scope: 'wt1', priority: 5 } as Task,
      ],
      dependencies: [],
    } as any
    ;(daemon as any).setPlan(plan)

    // Mock spawnedAt on agents
    const agent1 = { agentId: 'agent-1', spawnedAt: 1000 }
    const agent2 = { agentId: 'agent-2', spawnedAt: 2000 }
    ;(daemon as any).getAgent = vi.fn((id) => id === 'agent-1' ? agent1 : agent2)

    const order = strategies.determineSequentialOrder('agent-2')
    expect(order.firstAgent).toBe('agent-1')
    expect(order.secondAgent).toBe('agent-2')
    expect(order.reason).toContain('Earlier or equal spawn time')
  })

  it('proposes merge partition splits file between agents', () => {
    const partition = strategies.proposeMergePartition('shared.ts', 'agent-2')
    expect(partition.assignments).toBeDefined()
    expect(partition.assignments.get('agent-1')).toBeDefined()
    expect(partition.assignments.get('agent-2')).toBeDefined()
    const selfSections = partition.assignments.get('agent-1')!
    const otherSections = partition.assignments.get('agent-2')!
    expect(selfSections.length).toBeGreaterThan(0)
    expect(otherSections.length).toBeGreaterThan(0)
  })

  it('proposes rebase with correct base and rebasing agents', () => {
    const proposal = strategies.proposeRebase('agent-2')
    expect(proposal.baseAgent).toBeDefined()
    expect(proposal.rebasingAgent).toBeDefined()
    expect(proposal.reason).toBeDefined()
  })

  it('shouldEscalate returns true after 3 negotiation attempts', () => {
    const escalate1 = strategies.shouldEscalate(ConflictType.WriteWrite, 2)
    const escalate2 = strategies.shouldEscalate(ConflictType.WriteWrite, 4)
    expect(escalate1).toBe(false)
    expect(escalate2).toBe(true)
  })

  it('shouldEscalate returns true for critical conflicts after 1 attempt', () => {
    const escalate = strategies.shouldEscalate(ConflictType.WriteWrite, 2)
    expect(escalate).toBe(true)
  })

  it('reportResolution sends DM to coordinator', () => {
    const coordinatorId = 'coord-1'
    ;(daemon as any).getCoordinatorId = vi.fn(() => coordinatorId)
    strategies.reportResolution('conflict-1', ConflictResolutionStrategy.Merge, ['agent-1', 'agent-2'])
    expect((daemon as any).sendDM).toHaveBeenCalled()
    const call = (daemon as any).sendDM.mock.calls[0]
    expect(call[0].recipientId).toBe(coordinatorId)
    const content = JSON.parse(call[0].content)
    expect(content.type).toBe('conflict_resolution_report')
    expect(content.conflictId).toBe('conflict-1')
  })
})
