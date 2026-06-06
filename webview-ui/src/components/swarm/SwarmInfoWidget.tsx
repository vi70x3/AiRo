import React, { useState, useEffect, useCallback, useRef } from "react"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { vscode } from "../../utils/vscode"
import { Button } from "../../components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog"
import { Badge } from "../../components/ui/badge"
import { useEvent } from "react-use"

// Define types for the Swarm Info Widget
interface AgentNode {
  agentId: string
  agentType: 'coordinator' | 'worktree_manager' | 'agent'
  state: 'spawned' | 'ready' | 'running' | 'blocked' | 'completed' | 'failed' | 'stopped' | 'crashed'
  taskId?: string
  worktreeScope?: string
  spawnedAt?: Date
  lastHeartbeat?: Date
  position?: { x: number; y: number }
  color: string
}

interface AgentRelationship {
  parentId: string
  childId: string
  type: 'spawned' | 'manages' | 'coordinates_with'
}

interface ChannelInfo {
  channelName: string
  members: string[]
  lastMessage?: string
  lastMessageTime?: Date
}

interface SwarmState {
  swarmId: string
  coordinatorId: string
  agents: AgentNode[]
  relationships: AgentRelationship[]
  channels: ChannelInfo[]
  overallStatus: 'initializing' | 'running' | 'completing' | 'completed' | 'failed'
  startTime: Date
  activeAgents: number
  completedTasks: number
  totalTasks: number
}

interface AgentDetails {
  agentId: string
  agentType: 'coordinator' | 'worktree_manager' | 'agent'
  state: 'spawned' | 'ready' | 'running' | 'blocked' | 'completed' | 'failed' | 'stopped' | 'crashed'
  taskId?: string
  worktreeScope?: string
  spawnedAt: Date
  lastHeartbeat: Date
  channels?: string[]
  notifications?: any[]
}

// Color mapping for agent states
const stateColors: Record<string, string> = {
  spawned: '#e5e7eb',
  ready: '#3b82f6',
  running: '#10b981',
  blocked: '#f59e0b',
  completed: '#10b981',
  failed: '#ef4444',
  stopped: '#6b7280',
  crashed: '#ef4444',
}

// Type for the Swarm Info Widget component
const SwarmInfoWidget: React.FC = () => {
  const [activeTab, setActiveTab] = useState('agents');
  const { didHydrateState } = useExtensionState()
  const [swarmState, setSwarmState] = useState<SwarmState | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null)
  const [isSwarmInfoDialogOpen, setIsSwarmInfoDialogOpen] = useState(false)
  const [isChannelDialogOpen, setIsChannelDialogOpen] = useState(false)
  const [isAgentDetailsDialogOpen, setIsAgentDetailsDialogOpen] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const reconnectIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Handle message from extension
  const handleMessage = useCallback((event: MessageEvent) => {
    const message = event.data as any
    if (message.type === 'swarmState') {
      setSwarmState(message.payload)
      setConnectionError(null)
      setReconnectAttempts(0)
    } else if (message.type === 'swarmStateError') {
      setConnectionError(message.payload?.error || 'Unknown error')
    }
  }, [])

  useEvent('message', handleMessage)

  // Request swarm state from daemon on mount and when didHydrateState changes
  useEffect(() => {
    if (didHydrateState) {
      vscode.postMessage({ type: 'getSwarmState' })
    }
  }, [didHydrateState])

  // Format date for display
  const formatDate = (date: Date | undefined): string => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleString()
  }

  // Get agent details
  const getAgentDetails = useCallback((agentId: string): AgentDetails => {
    if (!swarmState) return {
      agentId,
      agentType: 'agent',
      state: 'spawned',
      spawnedAt: new Date(),
      lastHeartbeat: new Date()
    }
    
    const agent = swarmState.agents.find(a => a.agentId === agentId)
    if (!agent) return {
      agentId,
      agentType: 'agent',
      state: 'spawned',
      spawnedAt: new Date(),
      lastHeartbeat: new Date()
    }
    
    return {
      agentId,
      agentType: agent.agentType,
      state: agent.state,
      taskId: agent.taskId,
      worktreeScope: agent.worktreeScope,
      spawnedAt: agent.spawnedAt ? new Date(agent.spawnedAt) : new Date(),
      lastHeartbeat: agent.lastHeartbeat ? new Date(agent.lastHeartbeat) : new Date(),
      channels: [],
      notifications: []
    }
  }, [swarmState])

  // Render agent node
  const renderAgentNode = (agent: AgentNode) => (
    <div className="flex items-center gap-2 cursor-pointer" 
         onClick={() => setSelectedAgent(agent.agentId)}>
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stateColors[agent.state] }}></div>
      <span className="font-medium truncate max-w-[150px]">{agent.agentType === 'coordinator' ? 'Coordinator' : 
        agent.agentType === 'worktree_manager' ? 'Worktree Manager' : 'Agent'}</span>
      <span className="text-sm text-gray-500 ml-2 truncate max-w-[150px]">ID: {agent.agentId}</span>
      {agent.taskId && (
        <span className="text-sm text-gray-500 ml-2 truncate max-w-[150px]">Task: {agent.taskId}</span>
      )}
      {agent.worktreeScope && (
        <span className="text-sm text-gray-500 ml-2 truncate max-w-[150px]">Scope: {agent.worktreeScope}</span>
      )}
    </div>
  )

  // Render agent details dialog
  const renderAgentDetailsDialog = () => {
    if (!selectedAgent || !swarmState) return null
    
    const agent = swarmState.agents.find(a => a.agentId === selectedAgent)
    if (!agent) return null
    
    const details = getAgentDetails(selectedAgent)
    
    return (
      <Dialog open={isAgentDetailsDialogOpen} onOpenChange={() => setIsAgentDetailsDialogOpen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agent Details: {agent.agentType === 'coordinator' ? 'Coordinator' : 
              agent.agentType === 'worktree_manager' ? 'Worktree Manager' : 'Agent'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="font-medium">Agent ID</div>
              <div className="text-sm text-gray-500">#{details.agentId}</div>
            </div>
            <div>
              <div className="font-medium">Type</div>
              <div className="text-sm text-gray-500">{(details.agentType as string).charAt(0).toUpperCase() + (details.agentType as string).slice(1)}</div>
            </div>
            <div>
              <div className="font-medium">State</div>
              <div className="text-sm text-gray-500">{(details.state as string).charAt(0).toUpperCase() + (details.state as string).slice(1)}</div>
            </div>
            {details.taskId && (
              <div>
                <div className="font-medium">Task ID</div>
                <div className="text-sm text-gray-500">#{details.taskId}</div>
              </div>
            )}
            {details.worktreeScope && (
              <div>
                <div className="font-medium">Worktree Scope</div>
                <div className="text-sm text-gray-500">#{details.worktreeScope}</div>
              </div>
            )}
            <div>
              <div className="font-medium">Spawned At</div>
              <div className="text-sm text-gray-500">{formatDate(details.spawnedAt)}</div>
            </div>
            <div>
              <div className="font-medium">Last Heartbeat</div>
              <div className="text-sm text-gray-500">{formatDate(details.lastHeartbeat)}</div>
            </div>
            <div className="mt-4">
              <div className="font-medium">Channels</div>
              {details.channels && details.channels.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {details.channels.map((channel, index) => (
                    <Badge key={index} variant="secondary" className="text-sm">#{channel}</Badge>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 mt-2">No channels</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Render channel details dialog
  const renderChannelDialog = () => {
    if (!selectedChannel || !swarmState) return null
    
    const channel = swarmState.channels.find(c => c.channelName === selectedChannel)
    if (!channel) return null
    
    return (
      <Dialog open={isChannelDialogOpen} onOpenChange={() => setIsChannelDialogOpen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Channel Details: #{selectedChannel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="font-medium">Members</div>
              {channel.members && channel.members.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {channel.members.map((member, index) => (
                    <Badge key={index} variant="secondary" className="text-sm">#{member}</Badge>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 mt-2">No members</div>
              )}
            </div>
            {channel.lastMessage && (
              <div>
                <div className="font-medium">Last Message</div>
                <div className="text-sm text-gray-500 mt-2">"{channel.lastMessage}"</div>
              </div>
            )}
            {channel.lastMessageTime && (
              <div>
                <div className="font-medium">Last Message Time</div>
                <div className="text-sm text-gray-500 mt-2">{formatDate(channel.lastMessageTime)}</div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Render swarm info dialog
  const renderSwarmInfoDialog = () => {
    if (!swarmState) return null
    
    return (
      <Dialog open={isSwarmInfoDialogOpen} onOpenChange={() => setIsSwarmInfoDialogOpen(false)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Swarm Information</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="font-medium">Swarm ID</div>
                <div className="text-sm text-gray-500">#{swarmState.swarmId}</div>
              </div>
              <div>
                <div className="font-medium">Coordinator ID</div>
                <div className="text-sm text-gray-500">#{swarmState.coordinatorId}</div>
              </div>
              <div>
                <div className="font-medium">Overall Status</div>
                <div className="text-sm text-gray-500">{(swarmState.overallStatus as string).charAt(0).toUpperCase() + (swarmState.overallStatus as string).slice(1)}</div>
              </div>
              <div>
                <div className="font-medium">Start Time</div>
                <div className="text-sm text-gray-500">{formatDate(swarmState.startTime)}</div>
              </div>
              <div>
                <div className="font-medium">Active Agents</div>
                <div className="text-sm text-gray-500">#{swarmState.activeAgents}</div>
              </div>
              <div>
                <div className="font-medium">Completed Tasks</div>
                <div className="text-sm text-gray-500">#{swarmState.completedTasks}</div>
              </div>
              <div>
                <div className="font-medium">Total Tasks</div>
                <div className="text-sm text-gray-500">#{swarmState.totalTasks}</div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Render agent graph
  const renderAgentGraph = () => {
    if (!swarmState || swarmState.agents.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          No agents in swarm yet
        </div>
      )
    }
    
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          {swarmState.agents.map((agent) => (
            <div key={agent.agentId} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 cursor-pointer" 
                 onClick={() => setSelectedAgent(agent.agentId)}>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stateColors[agent.state] }}></div>
              <span className="font-medium truncate max-w-[150px]">{agent.agentType === 'coordinator' ? 'Coordinator' : 
                agent.agentType === 'worktree_manager' ? 'Worktree Manager' : 'Agent'}</span>
              <span className="text-sm text-gray-500 ml-2 truncate max-w-[150px]">ID: {agent.agentId}</span>
              {agent.taskId && (
                <span className="text-sm text-gray-500 ml-2 truncate max-w-[150px]">Task: {agent.taskId}</span>
              )}
              {agent.worktreeScope && (
                <span className="text-sm text-gray-500 ml-2 truncate max-w-[150px]">Scope: {agent.worktreeScope}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Render channel list
  const renderChannelList = () => {
    if (!swarmState || swarmState.channels.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          No channels available
        </div>
      )
    }
    
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          {swarmState.channels.map((channel) => (
            <div key={channel.channelName} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 cursor-pointer" 
                 onClick={() => setSelectedChannel(channel.channelName)}>
              <div className="font-medium truncate max-w-[150px]">#{channel.channelName}</div>
              <span className="text-sm text-gray-500 ml-2 truncate max-w-[150px]">Members: {channel.members.length}</span>
              {channel.lastMessage && (
                <span className="text-sm text-gray-500 ml-2 truncate max-w-[150px]">Last: {channel.lastMessage.substring(0, 20)}...</span>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Render status indicators
  const renderStatusIndicators = () => {
    if (!swarmState) return null
    
    const stateCounts = {
      spawned: 0,
      ready: 0,
      running: 0,
      blocked: 0,
      completed: 0,
      failed: 0,
      stopped: 0,
      crashed: 0,
    }
    
    swarmState.agents.forEach(agent => {
      stateCounts[agent.state]++
    })
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(stateCounts).map(([state, count]) => (
          <div key={state} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stateColors[state] }}></div>
            <span className="text-sm font-medium">{state.charAt(0).toUpperCase() + state.slice(1)}: {count}</span>
          </div>
        ))}
      </div>
    )
  }

  // Main widget component
  return (
    <div className="p-4 space-y-4">
      {connectionError && (
        <div className="text-red-500 text-sm mb-4">
          Error: {connectionError}
        </div>
      )}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 w-full">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Swarm Info</h2>
          <Button variant="outline" size="sm" onClick={() => setIsSwarmInfoDialogOpen(true)}>
            Info
          </Button>
        </div>
        <div className="space-y-4 mt-4">
            {renderStatusIndicators()}
            
            <div className="border-b border-gray-200">
              <div className="flex space-x-1 md:space-x-4 p-1 bg-gray-50 rounded-t-lg">
                <button
                  onClick={() => setActiveTab('agents')}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'agents' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Agents
                </button>
                <button
                  onClick={() => setActiveTab('channels')}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'channels' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Channels
                </button>
              </div>
              <div className="p-4">
                {activeTab === 'agents' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-medium">Agent Graph</h3>
                    </div>
                    {renderAgentGraph()}
                  </div>
                )}
                {activeTab === 'channels' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-medium">Communication Channels</h3>
                    </div>
                    {renderChannelList()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      {renderAgentDetailsDialog()}
      {renderChannelDialog()}
      {renderSwarmInfoDialog()}
    </div>
  )
}

// Export the component
export default SwarmInfoWidget