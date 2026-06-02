import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MergePreparationIntegration } from '../merge-preparation-integration'
import {
  Plan,
  Task,
  CompletionReport,
  AgentLifecycleState,
  AgentType,
  MergePreparationAction,
  ValidationStatus,
} from '@roo-code/types'

const createMockDaemon = () => {
  const agents: Record<string, any> = {}
  let coordinatorId: string | null = null
  return {
    registerAgent: vi.fn((agent: any) => { agents[agent.agentId] = agent }),
    unregisterAgent: vi.fn((id: string) => { delete agents[id] }),
    getAgent: vi.fn((id: string) => agents[id] ?? null),
    updateAgentState: vi.fn(),
    sendDM: vi.fn(),
    broadcast: vi.fn(),
    setCoordinatorId: vi.fn((id: string) => { coordinatorId = id }),
    getCoordinatorId: vi.fn(() => coordinatorId),
    setPlan: vi.fn(),
    getPlan: vi.fn(),
    setPlanVersions: vi.fn(),
    getPlanVersions: vi.fn(() => []),
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

const createPlan = (tasks: Task[]): Plan => ({
  planId: 'plan-1',
  version: 1,
  tasks,
  dependencies: [],
  description: 'Test plan',
  updateHistory: [],
})

const createTask = (taskId: string, scope: string, status: string = 'pending'): Task => ({
  taskId,
  description: `Task ${taskId}`,
  owner: 'agent-1',
  scope,
  status: status as any,
  dependsOn: [],
  blockedBy: [],
  checkpoints: [],
  estimatedEffort: 1,
  priority: 1,
  tags: [],
})

describe('MergePreparationIntegration', () => {
  let mockDaemon: any
  let integration: MergePreparationIntegration

  beforeEach(() => {
    mockDaemon = createMockDaemon()
    mockDaemon.setCoordinatorId('coord-1')
    integration = new MergePreparationIntegration(mockDaemon, 'coord-1')
  })

  describe('checkMergeReadinessForPlan', () => {
    it('returns ready for a plan with no agents', () => {
      const plan = createPlan([
        createTask('t1', 'scope-a', 'completed'),
      ])

      const result = integration.checkMergeReadinessForPlan(plan)

      expect(result.ready).toBe(true)
      expect(result.blockers).toHaveLength(0)
    })

    it('returns not ready when agents are still active', () => {
      const plan = createPlan([
        createTask('t1', 'scope-a', 'completed'),
      ])

      // Register an active agent in the same scope
      mockDaemon.registerAgent({
        agentId: 'agent-1',
        agentType: AgentType.Agent,
        state: AgentLifecycleState.Running,
        worktreeScope: 'scope-a',
      })

      const result = integration.checkMergeReadinessForPlan(plan)

      expect(result.ready).toBe(false)
      expect(result.blockers.some((b) => b.includes('active agent'))).toBe(true)
      expect(result.activeAgentCount).toBeGreaterThan(0)
    })

    it('returns not ready when tasks are incomplete', () => {
      const plan = createPlan([
        createTask('t1', 'scope-a', 'in_progress'),
      ])

      const result = integration.checkMergeReadinessForPlan(plan)

      expect(result.ready).toBe(false)
      expect(result.blockers.some((b) => b.includes('not completed'))).toBe(true)
    })

    it('returns ready when all tasks completed and no active agents', () => {
      const plan = createPlan([
        createTask('t1', 'scope-a', 'completed'),
        createTask('t2', 'scope-b', 'completed'),
      ])

      const result = integration.checkMergeReadinessForPlan(plan)

      expect(result.ready).toBe(true)
      expect(result.blockers).toHaveLength(0)
    })
  })

  describe('initiateMergePreparation', () => {
    it('returns a MergePreparationResult', () => {
      const plan = createPlan([
        createTask('t1', 'scope-a', 'completed'),
      ])

      const result = integration.initiateMergePreparation(plan)

      expect(result.worktreeId).toBe('plan-1')
      expect(result.readyForMerge).toBe(true)
      expect(result.preparedAt).toBeGreaterThan(0)
      expect(result.blockers).toHaveLength(0)
    })

    it('includes blockers when not ready', () => {
      const plan = createPlan([
        createTask('t1', 'scope-a', 'in_progress'),
      ])

      const result = integration.initiateMergePreparation(plan)

      expect(result.readyForMerge).toBe(false)
      expect(result.blockers.length).toBeGreaterThan(0)
    })
  })

  describe('handleTaskCompletionForMerge', () => {
    it('returns notify action when not all tasks are done', () => {
      const plan = createPlan([
        createTask('t1', 'scope-a', 'completed'),
        createTask('t2', 'scope-b', 'pending'),
      ])

      const report: CompletionReport = {
        reportId: 'r1',
        agentId: 'agent-1',
        taskId: 't1',
        timestamp: Date.now(),
        outcome: 'success' as any,
        changes: [],
        validationResults: [],
        blockers: [],
        duration: 100,
      }

      const actions = integration.handleTaskCompletionForMerge(report, plan)

      expect(actions.some((a) => a.type === 'notify')).toBe(true)
    })

    it('returns auto_merge action when all tasks done and ready', () => {
      const plan = createPlan([
        createTask('t1', 'scope-a', 'completed'),
      ])

      const report: CompletionReport = {
        reportId: 'r1',
        agentId: 'agent-1',
        taskId: 't1',
        timestamp: Date.now(),
        outcome: 'success' as any,
        changes: [],
        validationResults: [],
        blockers: [],
        duration: 100,
      }

      const actions = integration.handleTaskCompletionForMerge(report, plan)

      expect(actions.some((a) => a.type === 'auto_merge')).toBe(true)
    })

    it('returns block action when all tasks done but agents active', () => {
      const plan = createPlan([
        createTask('t1', 'scope-a', 'completed'),
      ])

      // Register an active agent
      mockDaemon.registerAgent({
        agentId: 'agent-2',
        agentType: AgentType.Agent,
        state: AgentLifecycleState.Running,
        worktreeScope: 'scope-a',
      })

      const report: CompletionReport = {
        reportId: 'r1',
        agentId: 'agent-1',
        taskId: 't1',
        timestamp: Date.now(),
        outcome: 'success' as any,
        changes: [],
        validationResults: [],
        blockers: [],
        duration: 100,
      }

      const actions = integration.handleTaskCompletionForMerge(report, plan)

      expect(actions.some((a) => a.type === 'block')).toBe(true)
    })
  })

  describe('getMergePreparationStatus', () => {
    it('returns ready status when all clear', () => {
      const plan = createPlan([
        createTask('t1', 'scope-a', 'completed'),
      ])

      const status = integration.getMergePreparationStatus(plan)

      expect(status.status).toBe('ready')
      expect(status.actions.some((a) => a.type === 'auto_merge')).toBe(true)
    })

    it('returns blocked status when there are blockers', () => {
      const plan = createPlan([
        createTask('t1', 'scope-a', 'in_progress'),
      ])

      const status = integration.getMergePreparationStatus(plan)

      expect(status.status).toBe('blocked')
      expect(status.actions.some((a) => a.type === 'block')).toBe(true)
    })
  })

  describe('shouldAutoMerge', () => {
    it('returns true when ready and report is success', () => {
      const readiness = {
        ready: true,
        blockers: [],
        unresolvedConflictCount: 0,
        activeAgentCount: 0,
        validationResults: [
          { checkName: 'test', status: ValidationStatus.Passed, message: 'ok' },
        ],
      }

      const report: CompletionReport = {
        reportId: 'r1',
        agentId: 'agent-1',
        taskId: 't1',
        timestamp: Date.now(),
        outcome: 'success' as any,
        changes: [],
        validationResults: [],
        blockers: [],
        duration: 100,
      }

      expect(integration.shouldAutoMerge(readiness, report)).toBe(true)
    })

    it('returns false when readiness is not ready', () => {
      const readiness = {
        ready: false,
        blockers: ['some blocker'],
        unresolvedConflictCount: 0,
        activeAgentCount: 0,
        validationResults: [],
      }

      const report: CompletionReport = {
        reportId: 'r1',
        agentId: 'agent-1',
        taskId: 't1',
        timestamp: Date.now(),
        outcome: 'success' as any,
        changes: [],
        validationResults: [],
        blockers: [],
        duration: 100,
      }

      expect(integration.shouldAutoMerge(readiness, report)).toBe(false)
    })

    it('returns false when report outcome is not success', () => {
      const readiness = {
        ready: true,
        blockers: [],
        unresolvedConflictCount: 0,
        activeAgentCount: 0,
        validationResults: [
          { checkName: 'test', status: ValidationStatus.Passed, message: 'ok' },
        ],
      }

      const report: CompletionReport = {
        reportId: 'r1',
        agentId: 'agent-1',
        taskId: 't1',
        timestamp: Date.now(),
        outcome: 'failure' as any,
        changes: [],
        validationResults: [],
        blockers: [],
        duration: 100,
      }

      expect(integration.shouldAutoMerge(readiness, report)).toBe(false)
    })

    it('returns false when validations have not all passed', () => {
      const readiness = {
        ready: true,
        blockers: [],
        unresolvedConflictCount: 0,
        activeAgentCount: 0,
        validationResults: [
          { checkName: 'test', status: ValidationStatus.Failed, message: 'fail' },
        ],
      }

      const report: CompletionReport = {
        reportId: 'r1',
        agentId: 'agent-1',
        taskId: 't1',
        timestamp: Date.now(),
        outcome: 'success' as any,
        changes: [],
        validationResults: [],
        blockers: [],
        duration: 100,
      }

      expect(integration.shouldAutoMerge(readiness, report)).toBe(false)
    })
  })
})
