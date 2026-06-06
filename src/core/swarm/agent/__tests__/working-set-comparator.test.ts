import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkingSetComparator } from '../working-set-comparator'
import { IDaemon } from '../../interfaces'
import { WorkingSet } from '../working-set'
import { ConflictSeverity } from '../../worktree-manager/conflict-detector'
import { FileOperation, FileStatusType, AgentMetadata, AgentType, AgentLifecycleState } from '@roo-code/types'

// Helper to create a mock daemon with working set registry support
const createMockDaemon = () => {
  const agents: Record<string, AgentMetadata> = {}
  const workingSets: Record<string, WorkingSet> = {}
  const notifications: Record<string, any[]> = {}

  return {
    registerAgent: vi.fn((a: AgentMetadata) => { agents[a.agentId] = a }),
    unregisterAgent: vi.fn((id: string) => { delete agents[id] }),
    getAgent: vi.fn((id: string) => agents[id] ?? null),
    listAgents: vi.fn(() => Object.values(agents)),
    updateAgentState: vi.fn(),
    sendDM: vi.fn(),
    broadcast: vi.fn(),
    createChannel: vi.fn(),
    joinChannel: vi.fn(),
    leaveChannel: vi.fn(),
    sendToChannel: vi.fn(),
    listChannels: vi.fn(() => []),
    getChannelMembers: vi.fn(() => []),
    setContextKey: vi.fn(),
    getContextKey: vi.fn(),
    listContextKeys: vi.fn(() => []),
    subscribeToKey: vi.fn(),
    compareAndSetKey: vi.fn(),
    transactionalUpdateKeys: vi.fn(),
    incrementKey: vi.fn(),
    getPendingNotifications: vi.fn((agentId: string) => notifications[agentId] ?? []),
    notifyFileTouch: vi.fn(),
    broadcastIntent: vi.fn(),
    registerWorkingSet: vi.fn((agentId: string, ws: WorkingSet) => { workingSets[agentId] = ws }),
    updateWorkingSet: vi.fn((agentId: string, ws: WorkingSet) => { workingSets[agentId] = ws }),
    getWorkingSet: vi.fn((agentId: string) => workingSets[agentId] ?? undefined),
    getCoordinatorId: vi.fn(() => null),
    setCoordinatorId: vi.fn(),
    setPlan: vi.fn(),
    getPlan: vi.fn(() => null),
    setPlanVersions: vi.fn(),
    getPlanVersions: vi.fn(() => []),
    createSnapshot: vi.fn(),
    restoreFromSnapshot: vi.fn(),
    listSnapshots: vi.fn(() => []),
    getCrashReport: vi.fn(),
    forceRecoverAgent: vi.fn(),
    _setNotifications: (agentId: string, notifs: any[]) => { notifications[agentId] = notifs },
    _setWorkingSet: (agentId: string, ws: WorkingSet) => { workingSets[agentId] = ws },
  } as unknown as IDaemon
}

const createAgentMetadata = (agentId: string): AgentMetadata => ({
  agentId,
  agentType: AgentType.Agent,
  state: AgentLifecycleState.Running,
  parentId: null,
  worktreeScope: 'default',
  spawnedAt: Date.now(),
  lastHeartbeat: Date.now(),
  taskId: null,
  mode: 'code',
})

describe('WorkingSetComparator', () => {
  let comparator: WorkingSetComparator
  let daemon: IDaemon

  beforeEach(() => {
    comparator = new WorkingSetComparator()
    daemon = createMockDaemon()
  })

  describe('findOverlaps', () => {
    it('should find overlapping file paths between two sets', () => {
      const localPaths = ['src/a.ts', 'src/b.ts', 'src/c.ts']
      const remotePaths = ['src/b.ts', 'src/c.ts', 'src/d.ts']

      const overlaps = comparator.findOverlaps(localPaths, remotePaths)
      expect(overlaps).toEqual(['src/b.ts', 'src/c.ts'])
    })

    it('should return empty array when no overlaps exist', () => {
      const localPaths = ['src/a.ts', 'src/b.ts']
      const remotePaths = ['src/c.ts', 'src/d.ts']

      const overlaps = comparator.findOverlaps(localPaths, remotePaths)
      expect(overlaps).toEqual([])
    })

    it('should return all paths when both sets are identical', () => {
      const localPaths = ['src/a.ts', 'src/b.ts']
      const remotePaths = ['src/a.ts', 'src/b.ts']

      const overlaps = comparator.findOverlaps(localPaths, remotePaths)
      expect(overlaps).toEqual(['src/a.ts', 'src/b.ts'])
    })

    it('should return empty array when either set is empty', () => {
      expect(comparator.findOverlaps([], ['src/a.ts'])).toEqual([])
      expect(comparator.findOverlaps(['src/a.ts'], [])).toEqual([])
      expect(comparator.findOverlaps([], [])).toEqual([])
    })
  })

  describe('assessOverlapSeverity', () => {
    it('should return "none" when there are no overlaps', () => {
      const local = new WorkingSet()
      const remote = new WorkingSet()
      const severity = comparator.assessOverlapSeverity([], local, remote)
      expect(severity).toBe('none')
    })

    it('should return "low" when overlapping files are only read in both sets', () => {
      const local = new WorkingSet()
      local.markAsRead('src/a.ts')

      const remote = new WorkingSet()
      remote.markAsRead('src/a.ts')

      const severity = comparator.assessOverlapSeverity(['src/a.ts'], local, remote)
      expect(severity).toBe('low')
    })

    it('should return "medium" when one agent has intent on overlapping file', () => {
      const local = new WorkingSet()
      local.markAsRead('src/a.ts')

      const remote = new WorkingSet()
      remote.markAsIntent('src/a.ts', FileOperation.Modify)

      const severity = comparator.assessOverlapSeverity(['src/a.ts'], local, remote)
      expect(severity).toBe('medium')
    })

    it('should return "high" when one agent has modified the overlapping file', () => {
      const local = new WorkingSet()
      local.markAsRead('src/a.ts')

      const remote = new WorkingSet()
      remote.markAsModified('src/a.ts', FileOperation.Modify)

      const severity = comparator.assessOverlapSeverity(['src/a.ts'], local, remote)
      expect(severity).toBe('high')
    })

    it('should return the maximum severity across all overlapping files', () => {
      const local = new WorkingSet()
      local.markAsRead('src/a.ts')
      local.markAsIntent('src/b.ts', FileOperation.Modify)

      const remote = new WorkingSet()
      remote.markAsModified('src/a.ts', FileOperation.Modify)
      remote.markAsRead('src/b.ts')

      // src/a.ts: local=low, remote=high → max=high
      // src/b.ts: local=medium, remote=low → max=medium
      // Overall max = high
      const severity = comparator.assessOverlapSeverity(['src/a.ts', 'src/b.ts'], local, remote)
      expect(severity).toBe('high')
    })
  })

  describe('compareWorkingSets', () => {
    it('should return no-overlap result when remote agent has no working set', () => {
      const local = new WorkingSet()
      local.markAsRead('src/a.ts')

      const result = comparator.compareWorkingSets(local, 'remote-agent', daemon)

      expect(result.remoteAgentId).toBe('remote-agent')
      expect(result.overlappingFiles).toEqual([])
      expect(result.severity).toBe('none')
      expect(result.suggestedActions).toEqual(['proceed'])
    })

    it('should return no-overlap result when working sets have no common files', () => {
      const local = new WorkingSet()
      local.markAsRead('src/local.ts')

      const remote = new WorkingSet()
      remote.markAsRead('src/remote.ts')

      // Register remote agent and working set
      daemon.registerAgent(createAgentMetadata('remote-agent'))
      (daemon as any)._setWorkingSet('remote-agent', remote)

      const result = comparator.compareWorkingSets(local, 'remote-agent', daemon)

      expect(result.remoteAgentId).toBe('remote-agent')
      expect(result.overlappingFiles).toEqual([])
      expect(result.severity).toBe('none')
    })

    it('should detect overlaps and assess severity correctly', () => {
      const local = new WorkingSet()
      local.markAsIntent('src/shared.ts', FileOperation.Modify)

      const remote = new WorkingSet()
      remote.markAsModified('src/shared.ts', FileOperation.Modify)

      daemon.registerAgent(createAgentMetadata('remote-agent'))
      (daemon as any)._setWorkingSet('remote-agent', remote)

      const result = comparator.compareWorkingSets(local, 'remote-agent', daemon)

      expect(result.remoteAgentId).toBe('remote-agent')
      expect(result.overlappingFiles).toEqual(['src/shared.ts'])
      expect(result.severity).toBe('high')
      expect(result.suggestedActions).toContain('wait')
    })

    it('should suggest coordinate action for medium severity overlaps', () => {
      const local = new WorkingSet()
      local.markAsIntent('src/shared.ts', FileOperation.Modify)

      const remote = new WorkingSet()
      remote.markAsIntent('src/shared.ts', FileOperation.Modify)

      daemon.registerAgent(createAgentMetadata('remote-agent'))
      (daemon as any)._setWorkingSet('remote-agent', remote)

      const result = comparator.compareWorkingSets(local, 'remote-agent', daemon)

      expect(result.severity).toBe('medium')
      expect(result.suggestedActions).toContain('coordinate')
    })
  })

  describe('getConflictRiskAssessment', () => {
    it('should return empty report when no other agents exist', () => {
      const local = new WorkingSet()
      local.markAsRead('src/a.ts')

      const report = comparator.getConflictRiskAssessment(local, daemon)

      expect(report.totalOverlaps).toBe(0)
      expect(report.overallSeverity).toBe('none')
      expect(Object.keys(report.perAgentResults)).toHaveLength(0)
    })

    it('should return comprehensive risk report across all agents', () => {
      const local = new WorkingSet()
      local.markAsIntent('src/shared1.ts', FileOperation.Modify)
      local.markAsRead('src/shared2.ts')

      // Agent 1: has modified shared1.ts (high severity)
      const remote1 = new WorkingSet()
      remote1.markAsModified('src/shared1.ts', FileOperation.Modify)

      // Agent 2: has read shared2.ts (low severity)
      const remote2 = new WorkingSet()
      remote2.markAsRead('src/shared2.ts')

      daemon.registerAgent(createAgentMetadata('agent-1'))
      daemon.registerAgent(createAgentMetadata('agent-2'))
      (daemon as any)._setWorkingSet('agent-1', remote1)
      (daemon as any)._setWorkingSet('agent-2', remote2)

      const report = comparator.getConflictRiskAssessment(local, daemon)

      expect(report.totalOverlaps).toBe(2)
      expect(report.overallSeverity).toBe('high')
      expect(report.perAgentResults['agent-1'].overlappingFiles).toContain('src/shared1.ts')
      expect(report.perAgentResults['agent-1'].severity).toBe('high')
      expect(report.perAgentResults['agent-2'].overlappingFiles).toContain('src/shared2.ts')
      expect(report.perAgentResults['agent-2'].severity).toBe('low')
      expect(report.details['src/shared1.ts']).toBe('medium')
      expect(report.details['src/shared2.ts']).toBe('low')
    })

    it('should handle agents with no working set registered', () => {
      const local = new WorkingSet()
      local.markAsRead('src/a.ts')

      daemon.registerAgent(createAgentMetadata('agent-no-ws'))

      const report = comparator.getConflictRiskAssessment(local, daemon)

      expect(report.totalOverlaps).toBe(0)
      expect(report.overallSeverity).toBe('none')
      expect(report.perAgentResults['agent-no-ws'].overlappingFiles).toEqual([])
    })
  })
})