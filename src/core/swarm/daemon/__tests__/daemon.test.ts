import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Daemon } from '../daemon'
import { AgentType, AgentLifecycleState } from '@roo-code/types'

describe('Daemon', () => {
  let daemon: Daemon
  
  beforeEach(() => {
    daemon = new Daemon('test-swarm')
  })
  
  it('should create daemon with subsystems', () => {
    expect(daemon).toBeDefined()
    expect(daemon.agentRegistry).toBeDefined()
    expect(daemon.notificationQueue).toBeDefined()
    expect(daemon.channelManager).toBeDefined()
    expect(daemon.contextStore).toBeDefined()
    expect(daemon.planManager).toBeDefined()
  })
  
  it('should register and retrieve agents', () => {
    const agent = {
      agentId: 'agent-1',
      agentType: AgentType.Agent,
      state: AgentLifecycleState.Ready,
      parentId: null,
      worktreeScope: 'test-worktree',
      spawnedAt: Date.now(),
      lastHeartbeat: Date.now(),
      taskId: null,
      mode: 'test'
    }
    
    daemon.registerAgent(agent)
    const retrievedAgent = daemon.getAgent('agent-1')
    expect(retrievedAgent).toEqual(agent)
  })
  
  it('should handle coordinator ID management', () => {
    daemon.setCoordinatorId('coordinator-1')
    expect(daemon.getCoordinatorId()).toBe('coordinator-1')
  })
})