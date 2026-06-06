import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ConflictDetector,
  ConflictType,
  ConflictSeverity,
} from '../conflict-detector'
import {
  AgentType,
  AgentLifecycleState,
  AgentMetadata,
  TouchNotification,
  IntentNotification,
  FileOperation,
  ConflictStatus,
} from '@roo-code/types'

// Helper to create a mock daemon
const createMockDaemon = (agents: AgentMetadata[] = []) => {
  const agentMap: Record<string, AgentMetadata> = {}
  for (const agent of agents) {
    agentMap[agent.agentId] = agent
  }
  return {
    registerAgent: vi.fn((agent: AgentMetadata) => { agentMap[agent.agentId] = agent }),
    unregisterAgent: vi.fn((id: string) => { delete agentMap[id] }),
    getAgent: vi.fn((id: string) => agentMap[id] ?? null),
    listAgents: vi.fn(() => Object.values(agentMap)),
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

describe('ConflictDetector', () => {
  let mockDaemon: any
  let detector: ConflictDetector
  const scope = 'scope1'
  const managerId = 'wm-1'

  beforeEach(() => {
    mockDaemon = createMockDaemon()
    detector = new ConflictDetector(mockDaemon, scope, managerId)
  })

  describe('construction', () => {
    it('constructs with daemon, scope, and managerId', () => {
      expect(detector).toBeDefined()
    })
  })

  describe('detectFromTouch', () => {
    it('returns no conflicts when no other agents are working on the file', () => {
      const touch: TouchNotification = {
        notificationId: 'touch-1',
        filePath: 'src/file.ts',
        modifyingAgentId: 'agent-1',
        timestamp: Date.now(),
        operation: FileOperation.Modify,
      }

      const conflicts = detector.detectFromTouch(touch)
      expect(conflicts).toHaveLength(0)
    })

    it('detects ReadWrite conflict when one agent has read status on file', () => {
      // Register a scope agent
      const agent2 = createAgentMetadata('agent-2', scope)
      mockDaemon.registerAgent(agent2)

      // Track agent-2 as having read the file
      detector.trackFileStatus('agent-2', 'src/file.ts', 'read')

      const touch: TouchNotification = {
        notificationId: 'touch-1',
        filePath: 'src/file.ts',
        modifyingAgentId: 'agent-1',
        timestamp: Date.now(),
        operation: FileOperation.Modify,
      }

      const conflicts = detector.detectFromTouch(touch)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].conflictType).toBe(ConflictType.ReadWrite)
      expect(conflicts[0].severity).toBe(ConflictSeverity.Low)
      expect(conflicts[0].conflictingAgents).toContain('agent-1')
      expect(conflicts[0].conflictingAgents).toContain('agent-2')
      expect(conflicts[0].filePath).toBe('src/file.ts')
      expect(conflicts[0].status).toBe(ConflictStatus.Detected)
    })

    it('detects IntentWrite conflict when one agent has intent status on file', () => {
      const agent2 = createAgentMetadata('agent-2', scope)
      mockDaemon.registerAgent(agent2)

      detector.trackFileStatus('agent-2', 'src/file.ts', 'intent')

      const touch: TouchNotification = {
        notificationId: 'touch-1',
        filePath: 'src/file.ts',
        modifyingAgentId: 'agent-1',
        timestamp: Date.now(),
        operation: FileOperation.Modify,
      }

      const conflicts = detector.detectFromTouch(touch)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].conflictType).toBe(ConflictType.IntentWrite)
      expect(conflicts[0].severity).toBe(ConflictSeverity.High)
    })

    it('detects WriteWrite conflict when one agent has modified status on file', () => {
      const agent2 = createAgentMetadata('agent-2', scope)
      mockDaemon.registerAgent(agent2)

      detector.trackFileStatus('agent-2', 'src/file.ts', 'modified')

      const touch: TouchNotification = {
        notificationId: 'touch-1',
        filePath: 'src/file.ts',
        modifyingAgentId: 'agent-1',
        timestamp: Date.now(),
        operation: FileOperation.Modify,
      }

      const conflicts = detector.detectFromTouch(touch)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].conflictType).toBe(ConflictType.WriteWrite)
      expect(conflicts[0].severity).toBe(ConflictSeverity.Critical)
    })

    it('detects multiple conflicts on same file from different agents', () => {
      const agent2 = createAgentMetadata('agent-2', scope)
      const agent3 = createAgentMetadata('agent-3', scope)
      mockDaemon.registerAgent(agent2)
      mockDaemon.registerAgent(agent3)

      detector.trackFileStatus('agent-2', 'src/file.ts', 'read')
      detector.trackFileStatus('agent-3', 'src/file.ts', 'modified')

      const touch: TouchNotification = {
        notificationId: 'touch-1',
        filePath: 'src/file.ts',
        modifyingAgentId: 'agent-1',
        timestamp: Date.now(),
        operation: FileOperation.Modify,
      }

      const conflicts = detector.detectFromTouch(touch)
      expect(conflicts).toHaveLength(2)

      // One ReadWrite (Low) with agent-2, one WriteWrite (Critical) with agent-3
      const lowConflict = conflicts.find(c => c.severity === ConflictSeverity.Low)
      const criticalConflict = conflicts.find(c => c.severity === ConflictSeverity.Critical)
      expect(lowConflict).toBeDefined()
      expect(criticalConflict).toBeDefined()
    })

    it('does not detect conflicts for agents in different scopes', () => {
      const agent2 = createAgentMetadata('agent-2', 'different-scope')
      mockDaemon.registerAgent(agent2)

      detector.trackFileStatus('agent-2', 'src/file.ts', 'modified')

      const touch: TouchNotification = {
        notificationId: 'touch-1',
        filePath: 'src/file.ts',
        modifyingAgentId: 'agent-1',
        timestamp: Date.now(),
        operation: FileOperation.Modify,
      }

      const conflicts = detector.detectFromTouch(touch)
      expect(conflicts).toHaveLength(0)
    })
  })

  describe('detectFromIntent', () => {
    it('returns no conflicts when no overlap', () => {
      const agent2 = createAgentMetadata('agent-2', scope)
      mockDaemon.registerAgent(agent2)

      const intent: IntentNotification = {
        notificationId: 'intent-1',
        declaringAgentId: 'agent-1',
        filePaths: ['src/file.ts'],
        timestamp: Date.now(),
        toolName: 'write',
      }

      const conflicts = detector.detectFromIntent(intent)
      expect(conflicts).toHaveLength(0)
    })

    it('detects IntentIntent conflict when overlap with agent having intent', () => {
      const agent2 = createAgentMetadata('agent-2', scope)
      mockDaemon.registerAgent(agent2)

      detector.trackFileStatus('agent-2', 'src/file.ts', 'intent')

      const intent: IntentNotification = {
        notificationId: 'intent-1',
        declaringAgentId: 'agent-1',
        filePaths: ['src/file.ts'],
        timestamp: Date.now(),
        toolName: 'write',
      }

      const conflicts = detector.detectFromIntent(intent)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].conflictType).toBe(ConflictType.IntentIntent)
      expect(conflicts[0].severity).toBe(ConflictSeverity.Medium)
    })

    it('detects IntentWrite conflict when overlap with agent having modified', () => {
      const agent2 = createAgentMetadata('agent-2', scope)
      mockDaemon.registerAgent(agent2)

      detector.trackFileStatus('agent-2', 'src/file.ts', 'modified')

      const intent: IntentNotification = {
        notificationId: 'intent-1',
        declaringAgentId: 'agent-1',
        filePaths: ['src/file.ts'],
        timestamp: Date.now(),
        toolName: 'write',
      }

      const conflicts = detector.detectFromIntent(intent)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].conflictType).toBe(ConflictType.IntentWrite)
      expect(conflicts[0].severity).toBe(ConflictSeverity.High)
    })

    it('detects ReadWrite conflict when overlap with agent having read', () => {
      const agent2 = createAgentMetadata('agent-2', scope)
      mockDaemon.registerAgent(agent2)

      detector.trackFileStatus('agent-2', 'src/file.ts', 'read')

      const intent: IntentNotification = {
        notificationId: 'intent-1',
        declaringAgentId: 'agent-1',
        filePaths: ['src/file.ts'],
        timestamp: Date.now(),
        toolName: 'write',
      }

      const conflicts = detector.detectFromIntent(intent)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].conflictType).toBe(ConflictType.ReadWrite)
      expect(conflicts[0].severity).toBe(ConflictSeverity.Low)
    })

    it('detects conflicts for multiple files in intent', () => {
      const agent2 = createAgentMetadata('agent-2', scope)
      mockDaemon.registerAgent(agent2)

      detector.trackFileStatus('agent-2', 'src/file1.ts', 'intent')
      detector.trackFileStatus('agent-2', 'src/file2.ts', 'modified')

      const intent: IntentNotification = {
        notificationId: 'intent-1',
        declaringAgentId: 'agent-1',
        filePaths: ['src/file1.ts', 'src/file2.ts'],
        timestamp: Date.now(),
        toolName: 'write',
      }

      const conflicts = detector.detectFromIntent(intent)
      expect(conflicts).toHaveLength(2)

      const mediumConflict = conflicts.find(c => c.severity === ConflictSeverity.Medium)
      const highConflict = conflicts.find(c => c.severity === ConflictSeverity.High)
      expect(mediumConflict).toBeDefined()
      expect(highConflict).toBeDefined()
    })
  })

  describe('classifyConflict', () => {
    it('classifies WriteWrite when both have modified status', () => {
      const type = detector.classifyConflict('file.ts', 'modified', 'modified')
      expect(type).toBe(ConflictType.WriteWrite)
    })

    it('classifies IntentWrite when modifier is modified and other is intent', () => {
      const type = detector.classifyConflict('file.ts', 'modified', 'intent')
      expect(type).toBe(ConflictType.IntentWrite)
    })

    it('classifies IntentWrite when modifier is intent and other is modified', () => {
      const type = detector.classifyConflict('file.ts', 'intent', 'modified')
      expect(type).toBe(ConflictType.IntentWrite)
    })

    it('classifies IntentIntent when both have intent status', () => {
      const type = detector.classifyConflict('file.ts', 'intent', 'intent')
      expect(type).toBe(ConflictType.IntentIntent)
    })

    it('classifies ReadWrite when modifier is modified and other is read', () => {
      const type = detector.classifyConflict('file.ts', 'modified', 'read')
      expect(type).toBe(ConflictType.ReadWrite)
    })

    it('classifies ReadWrite when modifier is intent and other is read', () => {
      const type = detector.classifyConflict('file.ts', 'intent', 'read')
      expect(type).toBe(ConflictType.ReadWrite)
    })

    it('classifies ReadWrite when modifier is read and other is modified', () => {
      const type = detector.classifyConflict('file.ts', 'read', 'modified')
      expect(type).toBe(ConflictType.ReadWrite)
    })

    it('classifies ReadWrite when modifier is read and other is intent', () => {
      const type = detector.classifyConflict('file.ts', 'read', 'intent')
      expect(type).toBe(ConflictType.ReadWrite)
    })
  })

  describe('assessSeverity', () => {
    it('maps WriteWrite to Critical', () => {
      expect(detector.assessSeverity(ConflictType.WriteWrite)).toBe(ConflictSeverity.Critical)
    })

    it('maps IntentWrite to High', () => {
      expect(detector.assessSeverity(ConflictType.IntentWrite)).toBe(ConflictSeverity.High)
    })

    it('maps IntentIntent to Medium', () => {
      expect(detector.assessSeverity(ConflictType.IntentIntent)).toBe(ConflictSeverity.Medium)
    })

    it('maps ReadWrite to Low', () => {
      expect(detector.assessSeverity(ConflictType.ReadWrite)).toBe(ConflictSeverity.Low)
    })
  })

  describe('toConflictInfo', () => {
    it('converts DetectedConflict to ConflictInfo', () => {
      const detected = detector.detectFromTouch({
        notificationId: 'touch-1',
        filePath: 'src/file.ts',
        modifyingAgentId: 'agent-1',
        timestamp: Date.now(),
        operation: FileOperation.Modify,
      })

      // No conflicts since no other agents — create one manually for testing
      const conflictInfo = detector.toConflictInfo({
        conflictId: 'test-conflict-1',
        filePath: 'src/file.ts',
        conflictingAgents: ['agent-1', 'agent-2'],
        conflictType: ConflictType.WriteWrite,
        severity: ConflictSeverity.Critical,
        detectedAt: 12345,
        status: ConflictStatus.Detected,
      })

      expect(conflictInfo.conflictId).toBe('test-conflict-1')
      expect(conflictInfo.filePath).toBe('src/file.ts')
      expect(conflictInfo.conflictingAgents).toEqual(['agent-1', 'agent-2'])
      expect(conflictInfo.detectedAt).toBe(12345)
      expect(conflictInfo.status).toBe(ConflictStatus.Detected)
      expect(conflictInfo.resolution).toBeNull()
    })
  })

  describe('trackFileStatus / removeFileStatus', () => {
    it('tracks file status for an agent', () => {
      const agent2 = createAgentMetadata('agent-2', scope)
      mockDaemon.registerAgent(agent2)

      detector.trackFileStatus('agent-2', 'src/file.ts', 'modified', FileOperation.Modify)

      // Now a touch from another agent should detect a conflict
      const touch: TouchNotification = {
        notificationId: 'touch-1',
        filePath: 'src/file.ts',
        modifyingAgentId: 'agent-1',
        timestamp: Date.now(),
        operation: FileOperation.Modify,
      }

      const conflicts = detector.detectFromTouch(touch)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].conflictType).toBe(ConflictType.WriteWrite)
    })

    it('removes file status when agent commits', () => {
      const agent2 = createAgentMetadata('agent-2', scope)
      mockDaemon.registerAgent(agent2)

      detector.trackFileStatus('agent-2', 'src/file.ts', 'modified')
      detector.removeFileStatus('agent-2', 'src/file.ts')

      const touch: TouchNotification = {
        notificationId: 'touch-1',
        filePath: 'src/file.ts',
        modifyingAgentId: 'agent-1',
        timestamp: Date.now(),
        operation: FileOperation.Modify,
      }

      const conflicts = detector.detectFromTouch(touch)
      expect(conflicts).toHaveLength(0)
    })

    it('upgrades file status when tracking higher state', () => {
      const agent2 = createAgentMetadata('agent-2', scope)
      mockDaemon.registerAgent(agent2)

      detector.trackFileStatus('agent-2', 'src/file.ts', 'read')
      detector.trackFileStatus('agent-2', 'src/file.ts', 'intent')
      detector.trackFileStatus('agent-2', 'src/file.ts', 'modified')

      const touch: TouchNotification = {
        notificationId: 'touch-1',
        filePath: 'src/file.ts',
        modifyingAgentId: 'agent-1',
        timestamp: Date.now(),
        operation: FileOperation.Modify,
      }

      const conflicts = detector.detectFromTouch(touch)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].conflictType).toBe(ConflictType.WriteWrite)
    })
  })
})
