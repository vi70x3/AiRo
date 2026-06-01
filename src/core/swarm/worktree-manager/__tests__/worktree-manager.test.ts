import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorktreeManager } from '../worktree-manager'
import { Agent } from '../../agent/agent'
import {
  AgentType,
  AgentLifecycleState,
  ConflictInfo,
  ConflictStatus,
  ConflictResolutionStrategy,
  WorktreeMetadata,
} from '@roo-code/types'

// Mock daemon
const createMockDaemon = () => {
  const agents: Record<string, any> = {}
  let coordinatorId: string | null = null
  return {
    registerAgent: vi.fn((agent) => { agents[agent.agentId] = agent }),
    getAgent: vi.fn((id) => agents[id] ?? null),
    setCoordinatorId: vi.fn((id) => { coordinatorId = id }),
    getCoordinatorId: vi.fn(() => coordinatorId),
    // stub other methods
    sendDM: vi.fn(),
    broadcast: vi.fn(),
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
    setPlan: vi.fn(),
    getPlan: vi.fn(),
    listAgents: vi.fn(() => Object.values(agents)),
    updateAgentState: vi.fn(),
  }
}

describe('WorktreeManager', () => {
  let mockDaemon: any
  let manager: WorktreeManager

  beforeEach(() => {
    mockDaemon = createMockDaemon()
    manager = new WorktreeManager('wm-1', mockDaemon, 'coord-1', 'scope1', '/tmp/wt1', 'feature-branch')
  })

  it('initializes with correct properties', () => {
    expect(manager.worktreePath).toBe('/tmp/wt1')
    expect(manager.branchName).toBe('feature-branch')
    expect(manager.state).toBe(AgentLifecycleState.Ready)
  })

  it('assigns and removes agents', () => {
    manager.assignAgent('a1')
    manager.assignAgent('a2')
    expect(manager.assignedAgents).toEqual(['a1', 'a2'])
    manager.removeAgent('a1')
    expect(manager.assignedAgents).toEqual(['a2'])
  })

  it('detects conflicts (returns tracked)', () => {
    const conflict: ConflictInfo = {
      conflictId: 'c1',
      filePath: 'file.ts',
      conflictingAgents: ['a1'],
      detectedAt: Date.now(),
      status: ConflictStatus.Detected,
      resolution: null,
    }
    manager.addConflict(conflict)
    const conflicts = manager.detectConflicts()
    expect(conflicts).toContainEqual(conflict)
  })

  it('coordinates resolution for non-escalated conflict', () => {
    const conflict: ConflictInfo = {
      conflictId: 'c2',
      filePath: 'file2.ts',
      conflictingAgents: ['a1', 'a2'],
      detectedAt: Date.now(),
      status: ConflictStatus.Negotiating,
      resolution: null,
    }
    manager.addConflict(conflict)
    const resolution = manager.coordinateResolution('c2')
    expect(resolution).not.toBeNull()
    expect(resolution?.strategy).toBe(ConflictResolutionStrategy.Merge)
    const updated = manager.getConflict('c2')
    expect(updated?.status).toBe(ConflictStatus.Resolved)
  })

  it('returns null for escalated conflict', () => {
    const conflict: ConflictInfo = {
      conflictId: 'c3',
      filePath: 'file3.ts',
      conflictingAgents: [],
      detectedAt: Date.now(),
      status: ConflictStatus.Escalated,
      resolution: null,
    }
    manager.addConflict(conflict)
    const res = manager.coordinateResolution('c3')
    expect(res).toBeNull()
  })

  it('prepares for merge when agents completed and no conflicts', () => {
    // No agents assigned, no conflicts
    const prep = manager.prepareForMerge()
    expect(prep.readyForMerge).toBe(true)
  })

  it('prepares for merge not ready when unresolved conflicts', () => {
    const conflict: ConflictInfo = {
      conflictId: 'c4',
      filePath: 'file4.ts',
      conflictingAgents: [],
      detectedAt: Date.now(),
      status: ConflictStatus.Detected,
      resolution: null,
    }
    manager.addConflict(conflict)
    const prep = manager.prepareForMerge()
    expect(prep.readyForMerge).toBe(false)
  })

  it('escalates conflict and sends DM to coordinator', () => {
    const conflict: ConflictInfo = {
      conflictId: 'c5',
      filePath: 'file5.ts',
      conflictingAgents: [],
      detectedAt: Date.now(),
      status: ConflictStatus.Detected,
      resolution: null,
    }
    manager.addConflict(conflict)
    // set coordinator id in daemon
    mockDaemon.setCoordinatorId('coord-1')
    manager.escalateConflict('c5')
    const escalated = manager.getConflict('c5')
    expect(escalated?.status).toBe(ConflictStatus.Escalated)
    expect(mockDaemon.sendDM).toHaveBeenCalled()
  })

  it('returns correct worktree metadata', () => {
    const meta: WorktreeMetadata = manager.getWorktreeMetadata()
    expect(meta.worktreeId).toBe('scope1')
    expect(meta.path).toBe('/tmp/wt1')
    expect(meta.branchName).toBe('feature-branch')
    expect(meta.managerId).toBe('wm-1')
    expect(meta.status).toBe('active' as any)
  })
})
