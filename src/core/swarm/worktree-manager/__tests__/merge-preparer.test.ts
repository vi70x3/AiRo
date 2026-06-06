import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MergePreparer, MergeReadiness } from '../merge-preparer'
import { IDaemon } from '../../interfaces'
import { AgentLifecycleState, ConflictInfo, ConflictStatus, ValidationStatus } from '@roo-code/types'

const createMockDaemon = () => {
  const agents: Record<string, any> = {}
  return {
    registerAgent: vi.fn((a) => { agents[a.agentId] = a }),
    getAgent: vi.fn((id) => agents[id] ?? null),
    listAgents: vi.fn(() => Object.values(agents)),
    sendDM: vi.fn(),
    broadcast: vi.fn(),
    setCoordinatorId: vi.fn(),
    getCoordinatorId: vi.fn(() => null),
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

describe('MergePreparer', () => {
  let daemon: IDaemon
  let preparer: MergePreparer

  beforeEach(() => {
    daemon = createMockDaemon()
    preparer = new MergePreparer(daemon, 'scope1', 'wm-1')
  })

  it('reports ready when no conflicts and no active agents', () => {
    const readiness = preparer.checkMergeReadiness()
    expect(readiness.ready).toBe(true)
    expect(readiness.blockers).toHaveLength(0)
    expect(readiness.unresolvedConflictCount).toBe(0)
    expect(readiness.activeAgentCount).toBe(0)
  })

  it('reports not ready when unresolved conflicts exist', () => {
    const conflict: ConflictInfo = {
      conflictId: 'c1',
      filePath: 'file.ts',
      conflictingAgents: ['a1'],
      detectedAt: Date.now(),
      status: ConflictStatus.Detected,
      resolution: null,
    }
    const conflicts = new Map<string, ConflictInfo>()
    conflicts.set('c1', conflict)
    preparer.setTrackedConflicts(conflicts)

    const readiness = preparer.checkMergeReadiness()
    expect(readiness.ready).toBe(false)
    expect(readiness.unresolvedConflictCount).toBe(1)
    expect(readiness.blockers.some(b => b.includes('Unresolved conflicts'))).toBe(true)
  })

  it('reports not ready when agents are still running', () => {
    const runningAgent = {
      agentId: 'a1',
      worktreeScope: 'scope1',
      state: AgentLifecycleState.Running,
      agentType: 'agent',
    }
    ;(daemon as any).registerAgent(runningAgent)

    const readiness = preparer.checkMergeReadiness()
    expect(readiness.ready).toBe(false)
    expect(readiness.activeAgentCount).toBe(1)
    expect(readiness.blockers.some(b => b.includes('Active agents'))).toBe(true)
  })

  it('reports ready when all conflicts are resolved', () => {
    const conflict: ConflictInfo = {
      conflictId: 'c1',
      filePath: 'file.ts',
      conflictingAgents: ['a1'],
      detectedAt: Date.now(),
      status: ConflictStatus.Resolved,
      resolution: { strategy: 'merge', resolvedBy: ['wm-1'], resolvedAt: Date.now() },
    }
    const conflicts = new Map<string, ConflictInfo>()
    conflicts.set('c1', conflict)
    preparer.setTrackedConflicts(conflicts)

    const readiness = preparer.checkMergeReadiness()
    expect(readiness.ready).toBe(true)
    expect(readiness.unresolvedConflictCount).toBe(0)
  })

  it('reports not ready when agents are blocked', () => {
    const blockedAgent = {
      agentId: 'a1',
      worktreeScope: 'scope1',
      state: AgentLifecycleState.Blocked,
      agentType: 'agent',
    }
    ;(daemon as any).registerAgent(blockedAgent)

    const readiness = preparer.checkMergeReadiness()
    expect(readiness.ready).toBe(false)
    expect(readiness.activeAgentCount).toBe(1)
  })

  it('prepareForMerge returns a MergePreparation object', () => {
    const prep = preparer.prepareForMerge()
    expect(prep.worktreeId).toBe('scope1')
    expect(prep.readyForMerge).toBe(true)
    expect(prep.preparedAt).toBeGreaterThan(0)
    expect(prep.completionReports).toBeDefined()
    expect(prep.validationResults).toBeDefined()
  })

  it('prepareForMerge returns not ready when conflicts exist', () => {
    const conflict: ConflictInfo = {
      conflictId: 'c2',
      filePath: 'file2.ts',
      conflictingAgents: [],
      detectedAt: Date.now(),
      status: ConflictStatus.Detected,
      resolution: null,
    }
    const conflicts = new Map<string, ConflictInfo>()
    conflicts.set('c2', conflict)
    preparer.setTrackedConflicts(conflicts)

    const prep = preparer.prepareForMerge()
    expect(prep.readyForMerge).toBe(false)
    expect(prep.blockers.length).toBeGreaterThan(0)
  })

  it('ignores agents in other worktree scopes', () => {
    const otherAgent = {
      agentId: 'a1',
      worktreeScope: 'other-scope',
      state: AgentLifecycleState.Running,
      agentType: 'agent',
    }
    ;(daemon as any).registerAgent(otherAgent)

    const readiness = preparer.checkMergeReadiness()
    expect(readiness.activeAgentCount).toBe(0)
    expect(readiness.ready).toBe(true)
  })

  it('includes validation results in readiness check', () => {
    const readiness = preparer.checkMergeReadiness()
    expect(readiness.validationResults.length).toBeGreaterThan(0)
    // No agents assigned should produce a warning
    const warning = readiness.validationResults.find(v => v.status === ValidationStatus.Warning)
    expect(warning).toBeDefined()
    expect(warning!.message).toContain('No agents')
  })
})
