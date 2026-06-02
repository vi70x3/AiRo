import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IntentAvoidance } from '../intent-avoidance'
import { IDaemon } from '../../interfaces'
import { WorkingSet } from '../working-set'
import { ConflictSeverity } from '../../worktree-manager/conflict-detector'
import {
  FileOperation,
  FileStatusType,
  AgentMetadata,
  AgentType,
  AgentLifecycleState,
  Notification,
  NotificationType,
  IntentNotification,
  IntentAvoidanceStrategy,
  DirectMessage,
  BroadcastMessage,
  ChannelMessage,
  WorkingSetComparisonResult,
  ConflictSeverityLevel,
  IntentConflictDetail,
  IntentConflictReport,
  AvoidancePlan,
} from '@roo-code/types'

// Mock daemon implementation for testing IntentAvoidance
class MockDaemon implements IDaemon {
  private agents: Record<string, AgentMetadata> = {}
  private workingSets: Record<string, WorkingSet> = {}
  private notifications: Record<string, Notification[]> = {}
  
  // Agent Registry
  registerAgent(agent: AgentMetadata): void {
    this.agents[agent.agentId] = agent
  }
  unregisterAgent(agentId: string): void {
    delete this.agents[agentId]
  }
  getAgent(agentId: string): AgentMetadata | null {
    return this.agents[agentId] ?? null
  }
  listAgents(): AgentMetadata[] {
    return Object.values(this.agents)
  }
  updateAgentState(agentId: string, state: AgentLifecycleState): void {}
  
  // Working Set Management
  registerWorkingSet(agentId: string, workingSet: WorkingSet): void {
    this.workingSets[agentId] = workingSet
  }
  updateWorkingSet(agentId: string, workingSet: WorkingSet): void {
    this.workingSets[agentId] = workingSet
  }
  getWorkingSet(agentId: string): WorkingSet | undefined {
    return this.workingSets[agentId]
  }
  
  // Communication methods (no-op)
  sendDM(message: DirectMessage): void {}
  broadcast(message: BroadcastMessage): void {}
  createChannel(name: string, topic?: string): void {}
  joinChannel(agentId: string, name: string): void {}
  leaveChannel(agentId: string, name: string): void {}
  sendToChannel(message: ChannelMessage): void {}
  listChannels(): string[] {
    return []
  }
  getChannelMembers(name: string): string[] {
    return []
  }
  
  // Context keys (no-op)
  setContextKey(agentId: string, key: string, value: unknown): void {}
  getContextKey(key: string): unknown {
    return undefined
  }
  listContextKeys(): string[] {
    return []
  }
  subscribeToKey(agentId: string, key: string, callback: (newValue: unknown, oldValue: unknown) => void): void {}
  compareAndSetKey(agentId: string, key: string, expectedValue: unknown, newValue: unknown): { success: boolean } {
    return { success: true }
  }
  transactionalUpdateKeys(agentId: string, updates: { key: string; newValue: unknown }[], expectedValues?: Map<string, unknown>): { success: boolean } {
    return { success: true }
  }
  incrementKey(agentId: string, key: string, delta: number): { value: number } {
    return { value: 0 }
  }
  
  // Notification handling
  getPendingNotifications(agentId: string): Notification[] | null {
    return this.notifications[agentId] || null
  }
  notifyFileTouch(agentId: string, filePath: string, operation: FileOperation): void {}
  broadcastIntent(agentId: string, filePaths: string[], toolName: string): void {}
  
  // Notification handling
  getPendingNotifications(agentId: string): Notification[] | null {
    return this.notifications[agentId] || null
  }
  
  // Helper methods for testing
  addNotification(agentId: string, notification: Notification): void {
    if (!this.notifications[agentId]) {
      this.notifications[agentId] = []
    }
    this.notifications[agentId].push(notification)
  }
}

// Helper functions for test setup
const createMockDaemon = (): MockDaemon => {
  return new MockDaemon()
}

const createAgentMetadata = (agentId: string): AgentMetadata => ({
  agentId,
  agentType: AgentType.Worktree,
  lifecycleState: AgentLifecycleState.Running,
  workingSet: new WorkingSet(),
})

describe('IntentAvoidance', () => {
  let daemon: MockDaemon
  let intentAvoidance: IntentAvoidance
  
  beforeEach(() => {
    daemon = createMockDaemon()
    intentAvoidance = new IntentAvoidance('test-agent')
  })

  describe('checkIntentConflicts', () => {
    it('should return empty report when no conflicts', () => {
      const result = intentAvoidance.checkIntentConflicts(['file1.txt'], daemon)
      expect(result).toEqual({
        agentId: 'test-agent',
        conflicts: [],
        hasConflicts: false,
        maxSeverity: 'none'
      })
    })

    it('should detect conflicts with overlapping working sets', () => {
      const agent1 = createAgentMetadata('agent1')
      const agent2 = createAgentMetadata('agent2')
      daemon.registerAgent(agent1)
      daemon.registerAgent(agent2)
      daemon.registerWorkingSet('agent1', agent1.workingSet)
      daemon.registerWorkingSet('agent2', agent2.workingSet)
      
      agent1.workingSet.markAsIntent('file1.txt', FileOperation.Create)
      agent2.workingSet.markAsIntent('file1.txt', FileOperation.Modify)
      
      const result = intentAvoidance.checkIntentConflicts(['file1.txt'], daemon)
      expect(result.maxSeverity).toBe('medium')
      expect(result.conflicts.length).toBeGreaterThan(0)
      expect(result.hasConflicts).toBe(true)
    })
  })

  describe('suggestAlternativePaths', () => {
    it('should suggest alternative paths for conflicting files', () => {
      const conflictingPaths = ['file1.txt']
      const result = intentAvoidance.suggestAlternativePaths(conflictingPaths, daemon)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('generateAvoidancePlan', () => {
    it('should generate an avoidance plan for conflicting files', () => {
      const conflictingPaths = ['file1.txt']
      const result = intentAvoidance.generateAvoidancePlan(conflictingPaths, FileOperation.Create, daemon)
      expect(result).toHaveProperty('conflictingFiles')
      expect(result).toHaveProperty('suggestedActions')
      expect(result).toHaveProperty('strategy')
    })
  })

  describe('shouldWaitForIntent', () => {
    it('should return false when no conflicts', () => {
      const result = intentAvoidance.shouldWaitForIntent(['file1.txt'], daemon)
      expect(result).toBe(false)
    })

    it('should return true when high severity conflicts exist', () => {
      const agent1 = createAgentMetadata('agent1')
      daemon.registerAgent(agent1)
      daemon.registerWorkingSet('agent1', agent1.workingSet)
      agent1.workingSet.markAsModified('file1.txt', FileOperation.Create)
      
      const result = intentAvoidance.shouldWaitForIntent(['file1.txt'], daemon)
      expect(result).toBe(true)
    })
  })
})
