import { 
  AgentMetadata, 
  AgentType, 
  AgentLifecycleState,
  Notification,
  NotificationType,
  DirectMessage,
  BroadcastMessage,
  ChannelMessage,
  ChannelInfo,
  ContextKeyEntry,
  ContextKeyNotification,
  Plan,
  DaemonSnapshot,
  TouchNotification,
  IntentNotification,
  FileOperation
} from '@roo-code/types'

import { IDaemon } from '../interfaces'
import { AgentRegistry } from './agent-registry'
import { NotificationQueue } from './notification-queue'
import { ChannelManager } from './channel-manager'
import { ContextStore } from './context-store'
import { PlanManager } from './plan-manager'

export class Daemon implements IDaemon {
  public readonly agentRegistry: AgentRegistry
  public readonly notificationQueue: NotificationQueue
  public readonly channelManager: ChannelManager
  public readonly contextStore: ContextStore
  public readonly planManager: PlanManager
  
  private swarmId: string
  private coordinatorId: string | null
  
  constructor(swarmId: string) {
    this.agentRegistry = new AgentRegistry()
    this.notificationQueue = new NotificationQueue()
    this.channelManager = new ChannelManager()
    this.contextStore = new ContextStore()
    this.planManager = new PlanManager()
    
    this.swarmId = swarmId
    this.coordinatorId = null
  }
  
  // IDaemon implementation — delegate to subsystems:
  registerAgent(agent: AgentMetadata): void {
    this.agentRegistry.registerAgent(agent)
  }
  
  unregisterAgent(agentId: string): void {
    this.agentRegistry.unregisterAgent(agentId)
  }
  
  getAgent(agentId: string): AgentMetadata | undefined {
    return this.agentRegistry.getAgent(agentId)
  }
  
  listAgents(): AgentMetadata[] {
    return this.agentRegistry.listAgents()
  }
  
  sendDM(message: DirectMessage): void {
    const notification: Notification = {
      notificationId: `dm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: NotificationType.DM,
      recipientId: message.recipientId,
      payload: message,
      timestamp: Date.now(),
      delivered: false,
      acknowledged: false
    }
    
    this.notificationQueue.enqueue(message.recipientId, notification)
  }
  
  broadcast(message: BroadcastMessage): void {
    const agents = this.agentRegistry.listAgents()
    const senderId = message.senderId
    
    for (const agent of agents) {
      // Skip the sender
      if (agent.agentId === senderId) continue
      
      const notification: Notification = {
        notificationId: `broadcast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: NotificationType.Broadcast,
        recipientId: agent.agentId,
        payload: message,
        timestamp: Date.now(),
        delivered: false,
        acknowledged: false
      }
      
      this.notificationQueue.enqueue(agent.agentId, notification)
    }
  }
  
  createChannel(name: string, topic?: string): ChannelInfo {
    return this.channelManager.createChannel(name, topic)
  }
  
  joinChannel(agentId: string, name: string): void {
    this.channelManager.joinChannel(agentId, name)
  }
  
  leaveChannel(agentId: string, name: string): void {
    this.channelManager.leaveChannel(agentId, name)
  }
  
  sendToChannel(message: ChannelMessage): string[] {
    const recipients = this.channelManager.sendToChannel(message)
    
    // Create notifications for each recipient
    for (const recipientId of recipients) {
      const notification: Notification = {
        notificationId: `channel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: NotificationType.Channel,
        recipientId,
        payload: message,
        timestamp: Date.now(),
        delivered: false,
        acknowledged: false
      }
      
      this.notificationQueue.enqueue(recipientId, notification)
    }
    
    return recipients
  }
  
  listChannels(): ChannelInfo[] {
    return this.channelManager.listChannels()
  }
  
  getChannelMembers(name: string): string[] {
    return this.channelManager.getChannelMembers(name)
  }
  
  setContextKey(agentId: string, key: string, value: unknown): ContextKeyNotification {
    return this.contextStore.setKey(agentId, key, value)
  }
  
  getContextKey(key: string): ContextKeyEntry | undefined {
    return this.contextStore.getKey(key)
  }
  
  listContextKeys(): ContextKeyEntry[] {
    return this.contextStore.listKeys()
  }
  
  subscribeToKey(agentId: string, key: string, callback: (n: ContextKeyNotification) => void): void {
    this.contextStore.subscribeToKey(agentId, key, callback)
  }
  
  getPendingNotifications(agentId: string): Notification[] {
    return this.notificationQueue.getPending(agentId)
  }
  
  notifyFileTouch(agentId: string, filePath: string, operation: FileOperation): void {
    const touchNotification: TouchNotification = {
      notificationId: `touch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      filePath,
      modifyingAgentId: agentId,
      timestamp: Date.now(),
      operation
    }
    
    const agents = this.agentRegistry.listAgents()
    
    // Create a notification for each registered agent except the modifier
    for (const agent of agents) {
      if (agent.agentId === agentId) continue // Skip the modifier
      
      const notification: Notification = {
        notificationId: `touch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: NotificationType.Touch,
        recipientId: agent.agentId,
        payload: touchNotification,
        timestamp: Date.now(),
        delivered: false,
        acknowledged: false
      }
      
      this.notificationQueue.enqueue(agent.agentId, notification)
    }
  }
  
  broadcastIntent(agentId: string, filePaths: string[], toolName: string): void {
    const intentNotification: IntentNotification = {
      notificationId: `intent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      declaringAgentId: agentId,
      filePaths,
      timestamp: Date.now(),
      toolName
    }
    
    const agents = this.agentRegistry.listAgents()
    
    // Create a notification for each registered agent except the declarer
    for (const agent of agents) {
      if (agent.agentId === agentId) continue // Skip the declarer
      
      const notification: Notification = {
        notificationId: `intent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: NotificationType.Intent,
        recipientId: agent.agentId,
        payload: intentNotification,
        timestamp: Date.now(),
        delivered: false,
        acknowledged: false
      }
      
      this.notificationQueue.enqueue(agent.agentId, notification)
    }
  }
  
  setPlan(plan: Plan): void {
    this.planManager.setPlan(plan)
  }
  
  getPlan(): Plan | null {
    return this.planManager.getPlan()
  }
  
  createSnapshot(): DaemonSnapshot {
    const agents = this.agentRegistry.listAgents()
    const channels = this.channelManager.listChannels()
    const contextKeys = this.contextStore.listKeys()
    const plan = this.planManager.getPlan()
    
    // For notification queues, we need to collect all pending notifications
    // This is a simplified implementation - in a real implementation, we'd need to 
    // collect all pending notifications from all agents
    const notificationQueues: Record<string, Notification[]> = {}
    for (const agent of agents) {
      notificationQueues[agent.agentId] = this.notificationQueue.getPending(agent.agentId)
    }
    
    const snapshot: DaemonSnapshot = {
      snapshotId: `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      version: '1.0.0',
      agents,
      notificationQueues,
      channels: channels.map(c => c.name),
      contextKeys: contextKeys.reduce((acc, entry) => {
        acc[entry.key] = entry.value
        return acc
      }, {} as Record<string, unknown>),
      plan,
      swarmId: this.swarmId,
      coordinatorId: this.coordinatorId || ''
    }
    
    return snapshot
  }
  
  restoreFromSnapshot(snapshotId: string): boolean {
    // Placeholder — full implementation in Wave 10
    return false
  }
  
  listSnapshots(): string[] {
    // Placeholder — full implementation in Wave 10
    return []
  }
  
  // Additional methods:
  setCoordinatorId(coordinatorId: string): void {
    this.coordinatorId = coordinatorId
  }
  
  getCoordinatorId(): string | null {
    return this.coordinatorId
  }
  
  getSwarmId(): string {
    return this.swarmId
  }
}