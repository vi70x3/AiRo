import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentRegistry } from '../agent-registry'
import { AgentType, AgentLifecycleState } from '@roo-code/types'

describe('AgentRegistry', () => {
  let agentRegistry: AgentRegistry
  
  beforeEach(() => {
    agentRegistry = new AgentRegistry()
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
    
    agentRegistry.registerAgent(agent)
    const retrievedAgent = agentRegistry.getAgent('agent-1')
    expect(retrievedAgent).toEqual(agent)
  })
  
  it('should prevent duplicate agent registration', () => {
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
    
    agentRegistry.registerAgent(agent)
    
    expect(() => {
      agentRegistry.registerAgent(agent)
    }).toThrow()
  })
  
  it('should update agent state and heartbeat', () => {
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
    
    agentRegistry.registerAgent(agent)
    agentRegistry.updateAgentState('agent-1', AgentLifecycleState.Running)
    agentRegistry.updateAgentHeartbeat('agent-1')
    
    expect(agentRegistry.getAgent('agent-1')).not.toBeNull()
  })
  
  it('should list agents by type and worktree', () => {
    const agent1 = {
      agentId: 'agent-1',
      agentType: AgentType.Coordinator,
      state: AgentLifecycleState.Ready,
      parentId: null,
      worktreeScope: 'test-worktree',
      spawnedAt: Date.now(),
      lastHeartbeat: Date.now(),
      taskId: null,
      mode: 'test'
    }
    
    const agent2 = {
      agentId: 'agent-2',
      agentType: AgentType.WorktreeManager,
      state: AgentLifecycleState.Ready,
      parentId: null,
      worktreeScope: 'test-worktree',
      spawnedAt: Date.now(),
      lastHeartbeat: Date.now(),
      taskId: null,
      mode: 'test'
    }
    
    agentRegistry.registerAgent(agent1)
    agentRegistry.registerAgent(agent2)
    
    const agents = agentRegistry.listAgents()
    expect(agents.length).toBe(2)
    
    const agentType = agentRegistry.listAgentsByType(AgentType.Coordinator)
    expect(agentType.length).toBe(1)
    
    const worktreeAgents = agentRegistry.listAgentsByWorktree('test-worktree')
    expect(worktreeAgents.length).toBe(2)
  })
})