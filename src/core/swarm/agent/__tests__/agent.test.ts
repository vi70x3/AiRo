import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Agent } from '../../agent'
import {
  AgentType,
  AgentLifecycleState,
  CompletionReport,
  PlanUpdate
} from '@roo-code/types'

describe('Agent', () => {
  let consoleErrorSpy: any

  beforeEach(() => {
    // Mock console.error to avoid error messages in test output
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  // Mock daemon implementation for testing
  const createMockDaemon = () => {
    return {
      registerAgent: vi.fn(),
      unregisterAgent: vi.fn(),
      updateAgentState: vi.fn(),
      sendDM: vi.fn(),
      broadcast: vi.fn(),
      joinChannel: vi.fn(),
      leaveChannel: vi.fn(),
      sendToChannel: vi.fn(),
      setContextKey: vi.fn(),
      getCoordinatorId: vi.fn().mockReturnValue('coordinator-123'),
      setCoordinatorId: vi.fn(),
      getPendingNotifications: vi.fn(),
      getAgent: vi.fn(),
      listAgents: vi.fn(),
      createChannel: vi.fn(),
      listChannels: vi.fn(),
      getChannelMembers: vi.fn(),
      getContextKey: vi.fn(),
      listContextKeys: vi.fn(),
      subscribeToKey: vi.fn(),
      notifyFileTouch: vi.fn(),
      broadcastIntent: vi.fn(),
      createSnapshot: vi.fn(),
      restoreFromSnapshot: vi.fn(),
      listSnapshots: vi.fn(),
      setPlan: vi.fn(),
      getPlan: vi.fn(),
      setPlanVersions: vi.fn(),
      getPlanVersions: vi.fn(() => []),
    }
  }

  it('should start in Spawned state', () => {
    const mockDaemon = createMockDaemon()
    const agent = new Agent('test-agent-1', AgentType.WORKTREE, mockDaemon)
    expect(agent.state).toBe(AgentLifecycleState.Spawned)
  })

  it('should transition to Ready state', () => {
    const mockDaemon = createMockDaemon()
    const agent = new Agent('test-agent', AgentType.WORKTREE, mockDaemon)
    agent.markReady()
    expect(agent.state).toBe(AgentLifecycleState.Ready)
  })

  it('should have correct initial state', () => {
    const mockDaemon = createMockDaemon()
    const agent = new Agent('test-agent', AgentType.WORKTREE, mockDaemon)
    expect(agent.state).toBe(AgentLifecycleState.Spawned)
  })

  it('should transition between states correctly', () => {
    const mockDaemon = createMockDaemon()
    const agent = new Agent('test-agent', AgentType.WORKTREE, mockDaemon)
    
    // Test initial state
    expect(agent.state).toBe(AgentLifecycleState.Spawned)
    
    // Test transition to Ready
    agent.markReady()
    expect(agent.state).toBe(AgentLifecycleState.Ready)
  })

  it('should handle invalid state transitions', () => {
    const mockDaemon = createMockDaemon()
    const agent = new Agent('test-agent', AgentType.WORKTREE, mockDaemon)
    
    // Try to go from Spawned to Completed (invalid transition)
    expect(() => {
      agent.markCompleted()
    }).toThrow()
  })

  it('should update heartbeat on state transitions', () => {
    const mockDaemon = createMockDaemon()
    const agent = new Agent('test-agent', AgentType.WORKTREE, mockDaemon)
    
    const initialHeartbeat = agent.lastHeartbeat
    // Use vi.setSystemTime to mock Date.now for testing
    const date = new Date()
    vi.setSystemTime(date)
    
    agent.markReady()
    
    // Check that heartbeat was updated
    expect(agent.lastHeartbeat).toBeGreaterThanOrEqual(initialHeartbeat)
  })

  it('should register with daemon on construction', () => {
    const mockDaemon = createMockDaemon()
    const agent = new Agent('test-agent', AgentType.WORKTREE, mockDaemon)
    
    // Check that registerAgent was called
    expect(mockDaemon.registerAgent).toHaveBeenCalledWith(agent.toMetadata())
  })

  it('should unregister from daemon on dispose', () => {
    const mockDaemon = createMockDaemon()
    const agent = new Agent('test-agent', AgentType.WORKTREE, mockDaemon)
    agent.dispose()
    
    // Check that unregisterAgent was called
    expect(mockDaemon.unregisterAgent).toHaveBeenCalledWith('test-agent')
  })

  it('should send DM to recipient', () => {
    const mockDaemon = createMockDaemon()
    const agent = new Agent('test-agent', AgentType.WORKTREE, mockDaemon)
    agent.sendDM('recipient-123', 'test message')
    
    // Check that sendDM was called on daemon
    expect(mockDaemon.sendDM).toHaveBeenCalled()
  })

  it('should broadcast messages', () => {
    const mockDaemon = createMockDaemon()
    const agent = new Agent('test-agent', AgentType.WORKTREE, mockDaemon)
    agent.broadcast('test broadcast')
    
    // Check that broadcast was called
    expect(mockDaemon.broadcast).toHaveBeenCalledWith({
      messageId: expect.any(String),
      senderId: 'test-agent',
      content: 'test broadcast',
      timestamp: expect.any(Number),
      recipients: []
    })
  })

  it('should handle channel operations', () => {
    const mockDaemon = createMockDaemon()
    const agent = new Agent('test-agent', AgentType.WORKTREE, mockDaemon)
    agent.joinChannel('test-channel')
    agent.leaveChannel('test-channel')
    
    // Check that the methods were called
    expect(mockDaemon.joinChannel).toHaveBeenCalledWith('test-agent', 'test-channel')
    expect(mockDaemon.leaveChannel).toHaveBeenCalledWith('test-agent', 'test-channel')
  })
})