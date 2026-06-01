import { 
  AgentMetadata, 
  AgentType, 
  AgentLifecycleState 
} from '@roo-code/types'

export class AgentRegistry {
  private agents: Map<string, AgentMetadata> = new Map()
  
  registerAgent(agent: AgentMetadata): void {
    if (this.agents.has(agent.agentId)) {
      throw new Error(`Agent with ID ${agent.agentId} is already registered`)
    }
    this.agents.set(agent.agentId, agent)
  }
  
  unregisterAgent(agentId: string): void {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent with ID ${agentId} not found`)
    }
    this.agents.delete(agentId)
  }
  
  getAgent(agentId: string): AgentMetadata | undefined {
    return this.agents.get(agentId)
  }
  
  listAgents(): AgentMetadata[] {
    return Array.from(this.agents.values())
  }
  
  listAgentsByType(type: AgentType): AgentMetadata[] {
    return Array.from(this.agents.values()).filter(agent => agent.agentType === type)
  }
  
  listAgentsByWorktree(worktreeScope: string): AgentMetadata[] {
    return Array.from(this.agents.values()).filter(agent => agent.worktreeScope === worktreeScope)
  }
  
  updateAgentState(agentId: string, state: AgentLifecycleState): void {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent with ID ${agentId} not found`)
    }
    agent.state = state
  }
  
  updateAgentHeartbeat(agentId: string): void {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent with ID ${agentId} not found`)
    }
    agent.lastHeartbeat = Date.now()
  }
}