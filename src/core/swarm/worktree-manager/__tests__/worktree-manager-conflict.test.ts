import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorktreeManager } from '../worktree-manager'
import { ConflictDetector, ConflictType, ConflictSeverity } from '../conflict-detector'
import {
  AgentType,
  AgentLifecycleState,
  AgentMetadata,
  TouchNotification,
  IntentNotification,
  FileOperation,
  ConflictStatus,
} from '@roo-code/types'

// Mock daemon
const createMockDaemon = () => {
  const agents: Record<string, any> = {}
  let coordinatorId: string | null = null
  return {
    registerAgent: vi.fn((agent: any) => { agents[agent.agentId] = agent }),
    getAgent: vi.fn((id: string) => agents[id] ?? null),
    setCoordinatorId: vi.fn((id: string) => { coordinatorId = id }),
    getCoordinatorId: vi.fn(() => coordinatorId),
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

// Helper to create agent metadata
const createAgentMetadata = (
  agentId: string,
  worktreeScope: string,
  agentType: AgentType = AgentType.Agent,
): AgentMetadata => ({
  agentId,
  agentType,
  state: AgentLifecycleState.Running,
  parentId: 'coord-1',
  worktreeScope,
  spawnedAt: Date.now(),
  lastHeartbeat: Date.now(),
  taskId: null,
  mode: '',
})

describe('WorktreeManager Conflict Integration', () => {
  let mockDaemon: any
  let manager: WorktreeManager

  beforeEach(() => {
    mockDaemon = createMockDaemon()
    manager = new WorktreeManager('wm-1', mockDaemon, 'coord-1', 'scope1', '/tmp/wt1', 'feature-branch')
  })

  it('has conflictDetector property that is a ConflictDetector instance', () => {
    expect(manager.conflictDetector).toBeInstanceOf(ConflictDetector)
  })

  describe('processTouchNotification', () => {
    it('detects conflicts and adds to tracking when another agent is working on file', () => {
      // Register a scope agent
      const agent2 = createAgentMetadata('agent-2', 'scope1')
      mockDaemon.registerAgent(agent2)

      // Pre-track agent-2 as having modified the file
      manager.conflictDetector.trackFileStatus('agent-2', 'src/file.ts', 'modified')

      const touch: TouchNotification = {
        notificationId: 'touch-1',
        filePath: 'src/file.ts',
        modifyingAgentId: 'agent-1',
        timestamp: Date.now(),
        operation: FileOperation.Modify,
      }

      const conflicts = manager.processTouchNotification(touch)

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].conflictType).toBe(ConflictType.WriteWrite)
      expect(conflicts[0].severity).toBe(ConflictSeverity.Critical)

      // Conflict should be added to tracking
      const allConflicts = manager.getAllConflicts()
      expect(allConflicts).toHaveLength(1)
      expect(allConflicts[0].filePath).toBe('src/file.ts')
      expect(allConflicts[0].status).toBe(ConflictStatus.Detected)
    })

    it('tracks the modifier file status after processing', () => {
      // Register the modifier agent in the daemon as a scope agent
      const agent1 = createAgentMetadata('agent-1', 'scope1')
      mockDaemon.registerAgent(agent1)

      const touch: TouchNotification = {
        notificationId: 'touch-1',
        filePath: 'src/file.ts',
        modifyingAgentId: 'agent-1',
        timestamp: Date.now(),
        operation: FileOperation.Modify,
      }

      manager.processTouchNotification(touch)

      // Now another touch on the same file should detect a conflict with agent-1
      const agent2 = createAgentMetadata('agent-2', 'scope1')
      mockDaemon.registerAgent(agent2)

      const touch2: TouchNotification = {
        notificationId: 'touch-2',
        filePath: 'src/file.ts',
        modifyingAgentId: 'agent-2',
        timestamp: Date.now(),
        operation: FileOperation.Modify,
      }

      const conflicts = manager.processTouchNotification(touch2)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].conflictType).toBe(ConflictType.WriteWrite)
    })

    it('returns no conflicts when no other agents in scope are working on file', () => {
      const touch: TouchNotification = {
        notificationId: 'touch-1',
        filePath: 'src/file.ts',
        modifyingAgentId: 'agent-1',
        timestamp: Date.now(),
        operation: FileOperation.Modify,
      }

      const conflicts = manager.processTouchNotification(touch)
      expect(conflicts).toHaveLength(0)
    })
  })

  describe('processIntentNotification', () => {
    it('detects conflicts and adds to tracking when another agent has intent on file', () => {
      const agent2 = createAgentMetadata('agent-2', 'scope1')
      mockDaemon.registerAgent(agent2)

      // Pre-track agent-2 as having intent on the file
      manager.conflictDetector.trackFileStatus('agent-2', 'src/file.ts', 'intent')

      const intent: IntentNotification = {
        notificationId: 'intent-1',
        declaringAgentId: 'agent-1',
        filePaths: ['src/file.ts'],
        timestamp: Date.now(),
        toolName: 'write',
      }

      const conflicts = manager.processIntentNotification(intent)

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].conflictType).toBe(ConflictType.IntentIntent)
      expect(conflicts[0].severity).toBe(ConflictSeverity.Medium)

      // Conflict should be added to tracking
      const allConflicts = manager.getAllConflicts()
      expect(allConflicts).toHaveLength(1)
    })

    it('tracks the declarer intent for each file', () => {
      // Register the declarer agent in the daemon as a scope agent
      const agent1 = createAgentMetadata('agent-1', 'scope1')
      mockDaemon.registerAgent(agent1)

      const intent: IntentNotification = {
        notificationId: 'intent-1',
        declaringAgentId: 'agent-1',
        filePaths: ['src/file1.ts', 'src/file2.ts'],
        timestamp: Date.now(),
        toolName: 'write',
      }

      manager.processIntentNotification(intent)

      // Now another intent on the same files should detect conflicts
      const agent2 = createAgentMetadata('agent-2', 'scope1')
      mockDaemon.registerAgent(agent2)

      const intent2: IntentNotification = {
        notificationId: 'intent-2',
        declaringAgentId: 'agent-2',
        filePaths: ['src/file1.ts'],
        timestamp: Date.now(),
        toolName: 'write',
      }

      const conflicts = manager.processIntentNotification(intent2)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].conflictType).toBe(ConflictType.IntentIntent)
    })

    it('returns no conflicts when no overlap', () => {
      const intent: IntentNotification = {
        notificationId: 'intent-1',
        declaringAgentId: 'agent-1',
        filePaths: ['src/file.ts'],
        timestamp: Date.now(),
        toolName: 'write',
      }

      const conflicts = manager.processIntentNotification(intent)
      expect(conflicts).toHaveLength(0)
    })
  })

  describe('detectConflicts uses conflictDetector', () => {
    it('returns conflicts from conflictDetector', () => {
      const agent2 = createAgentMetadata('agent-2', 'scope1')
      mockDaemon.registerAgent(agent2)

      // Pre-track and process a touch to generate a conflict
      manager.conflictDetector.trackFileStatus('agent-2', 'src/file.ts', 'modified')

      const touch: TouchNotification = {
        notificationId: 'touch-1',
        filePath: 'src/file.ts',
        modifyingAgentId: 'agent-1',
        timestamp: Date.now(),
        operation: FileOperation.Modify,
      }

      manager.processTouchNotification(touch)

      // detectConflicts should return the conflict
      const conflicts = manager.detectConflicts()
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].filePath).toBe('src/file.ts')
      expect(conflicts[0].conflictingAgents).toContain('agent-1')
      expect(conflicts[0].conflictingAgents).toContain('agent-2')
    })
  })
})
