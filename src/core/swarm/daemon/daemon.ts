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
  ChannelHistoryEntry,
  ContextKeyEntry,
  ContextKeyNotification,
  DaemonSnapshot,
  HistoryQueryOptions,
  Plan,
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
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

interface SnapshotMetadata {
  snapshotId: string
  timestamp: number
  version: string
}

export class Daemon implements IDaemon {
  private agentRegistry: AgentRegistry
  private notificationQueue: NotificationQueue
  private channelManager: ChannelManager
  private contextStore: ContextStore
  private planManager: PlanManager
  
  private swarmId: string
  private coordinatorId: string | null
  private snapshotDir: string
  private snapshotInterval: NodeJS.Timeout | null
  private isRunning: boolean

  constructor(swarmId: string, maxHistorySize: number = 1000) {
    this.agentRegistry = new AgentRegistry()
    this.notificationQueue = new NotificationQueue()
    this.channelManager = new ChannelManager(maxHistorySize)
    this.contextStore = new ContextStore()
    this.planManager = new PlanManager()
    
    this.swarmId = swarmId
    this.coordinatorId = null
    this.snapshotDir = path.join(os.homedir(), '.kiro', 'swarm', 'snapshots', swarmId)
    this.snapshotInterval = null
    this.isRunning = false
    
    // Ensure snapshot directory exists
    this.ensureSnapshotDir()
  }
  
  // IDaemon implementation — delegate to subsystems:
  registerAgent(agent: AgentMetadata): void {
    this.agentRegistry.registerAgent(agent)
  }
  
  unregisterAgent(agentId: string): void {
    this.agentRegistry.unregisterAgent(agentId)
  }
  
  getAgent(agentId: string): AgentMetadata | null {
    const agent = this.agentRegistry.getAgent(agentId)
    return agent || null
  }
  
  listAgents(): AgentMetadata[] {
    return this.agentRegistry.listAgents()
  }
  
  updateAgentState(agentId: string, state: AgentLifecycleState): void {
    this.agentRegistry.updateAgentState(agentId, state)
  }
  
  getAllAgentIds(): string[] {
    return this.agentRegistry.getAllAgentIds()
  }
  
  enqueueNotification(agentId: string, notification: Notification): void {
    this.notificationQueue.enqueue(agentId, notification)
  }
  
  getChannelInfo(name: string): ChannelInfo | undefined {
    return this.channelManager.getChannelInfo(name)
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
  
  createChannel(name: string, topic?: string): void {
    this.channelManager.createChannel(name, topic)
  }
  
  joinChannel(agentId: string, name: string): void {
    this.channelManager.joinChannel(agentId, name)
  }
  
  leaveChannel(agentId: string, name: string): void {
    this.channelManager.leaveChannel(agentId, name)
  }
  
  sendToChannel(message: ChannelMessage): void {
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
  }
  
  listChannels(): string[] {
    return this.channelManager.listChannels().map(c => c.name)
  }
  
  getChannelMembers(name: string): string[] {
    return this.channelManager.getChannelMembers(name)
  }

  // Channel history methods
  getChannelHistory(channelName: string, options?: HistoryQueryOptions): ChannelMessage[] {
    return this.channelManager.getHistory(channelName, options)
  }

  getRecentChannelMessages(channelName: string, count: number): ChannelMessage[] {
    return this.channelManager.getRecentMessages(channelName, count)
  }

  searchChannelBySender(channelName: string, senderId: string): ChannelMessage[] {
    return this.channelManager.searchBySender(channelName, senderId)
  }

  searchChannelByTimeRange(channelName: string, fromTimestamp: number, toTimestamp: number): ChannelMessage[] {
    return this.channelManager.searchByTimeRange(channelName, fromTimestamp, toTimestamp)
  }

  getChannelMessageCount(channelName: string): number {
    return this.channelManager.getMessageCount(channelName)
  }

  setContextKey(agentId: string, key: string, value: unknown): ContextKeyNotification {
    return this.contextStore.setKey(agentId, key, value)
  }
  
  getContextKey(key: string): ContextKeyEntry | undefined {
    return this.contextStore.getKey(key)
  }
  
  listContextKeys(): string[] {
    return this.contextStore.listKeys().map(k => k.key)
  }
  
  subscribeToKey(agentId: string, key: string, callback: (newValue: unknown, oldValue: unknown) => void): void {
    // Wrap the callback to match ContextStore's expected signature
    this.contextStore.subscribeToKey(agentId, key, (notification: ContextKeyNotification) => {
      callback(notification.newValue, notification.oldValue)
    })
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
    
    const channelHistories = this.channelManager.getChannelHistories()

    const snapshot: DaemonSnapshot = {
      snapshotId: `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      version: '1.0.0',
      agents,
      notificationQueues,
      channels: channels.map(c => c.name),
      channelHistories,
      contextKeys: contextKeys.reduce((acc, entry) => {
        acc[entry.key] = entry.value
        return acc
      }, {} as Record<string, unknown>),
      plan,
      swarmId: this.swarmId,
      coordinatorId: this.coordinatorId || ''
    }
    
    // Persist snapshot to disk
    this.persistSnapshot(snapshot)
    
    return snapshot
  }
  
  restoreFromSnapshot(snapshotId: string): void {
    try {
      const snapshotPath = this.getSnapshotPath(snapshotId)
      
      if (!fs.existsSync(snapshotPath)) {
        return
      }
      
      const snapshotData = fs.readFileSync(snapshotPath, 'utf-8')
      const snapshot: DaemonSnapshot = JSON.parse(snapshotData)
      
      // Restore agent registry
      this.agentRegistry = new AgentRegistry()
      for (const agent of snapshot.agents) {
        this.agentRegistry.registerAgent(agent)
      }
      
      // Restore notification queues
      this.notificationQueue = new NotificationQueue()
      for (const [agentId, notifications] of Object.entries(snapshot.notificationQueues)) {
        const notificationList = notifications as Notification[]
        for (const notification of notificationList) {
          this.notificationQueue.enqueue(agentId, notification)
        }
      }
      
      // Restore channels
      this.channelManager = new ChannelManager()
      for (const channelName of snapshot.channels) {
        this.channelManager.createChannel(channelName)
      }

      // Restore channel histories
      if (snapshot.channelHistories) {
        this.channelManager.restoreChannelHistories(snapshot.channelHistories)
      }

      // Restore context keys
      this.contextStore = new ContextStore()
      for (const [key, value] of Object.entries(snapshot.contextKeys)) {
        // Restore context keys - we need an agentId, use coordinatorId or first agent
        const agentId = snapshot.coordinatorId || snapshot.agents[0]?.agentId || 'system'
        this.contextStore.setKey(agentId, key, value)
      }
      
      // Restore plan
      if (snapshot.plan) {
        this.planManager.setPlan(snapshot.plan)
      }
      
      // Restore coordinatorId
      this.coordinatorId = snapshot.coordinatorId || null
    } catch (error) {
      console.error('Failed to restore snapshot:', error)
    }
  }
  
  listSnapshots(): string[] {
    try {
      if (!fs.existsSync(this.snapshotDir)) {
        return []
      }
      
      const files = fs.readdirSync(this.snapshotDir)
      return files.filter(f => f.endsWith('.json')).sort()
    } catch (error) {
      console.error('Failed to list snapshots:', error)
      return []
    }
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
  
  // Snapshot persistence methods
  private ensureSnapshotDir(): void {
    if (!fs.existsSync(this.snapshotDir)) {
      fs.mkdirSync(this.snapshotDir, { recursive: true })
    }
  }
  
  private getSnapshotPath(snapshotId: string): string {
    return path.join(this.snapshotDir, `${snapshotId}.json`)
  }
  
  private persistSnapshot(snapshot: DaemonSnapshot): void {
    try {
      this.ensureSnapshotDir()
      const snapshotPath = this.getSnapshotPath(snapshot.snapshotId)
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2))
      this.pruneOldSnapshots()
    } catch (error) {
      console.error('Failed to persist snapshot:', error)
    }
  }
  
  private pruneOldSnapshots(): void {
    try {
      if (!fs.existsSync(this.snapshotDir)) {
        return
      }
      
      const files = fs.readdirSync(this.snapshotDir)
        .filter(f => f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: path.join(this.snapshotDir, f),
          stat: fs.statSync(path.join(this.snapshotDir, f))
        }))
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
      
      // Keep only the last 10 snapshots
      if (files.length > 10) {
        for (const file of files.slice(10)) {
          fs.unlinkSync(file.path)
        }
      }
    } catch (error) {
      console.error('Failed to prune old snapshots:', error)
    }
  }
  
  // Periodic snapshot scheduling
  startPeriodicSnapshots(intervalMs: number = 30000): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval)
    }
    this.isRunning = true
    this.snapshotInterval = setInterval(() => {
      this.createSnapshot()
    }, intervalMs)
  }
  
  stopPeriodicSnapshots(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval)
      this.snapshotInterval = null
    }
    this.isRunning = false
  }
  
  // Final snapshot on swarm completion
  completeSwarm(): void {
    this.stopPeriodicSnapshots()
    this.createSnapshot()
  }
  
  isPeriodicSnapshotRunning(): boolean {
    return this.isRunning && this.snapshotInterval !== null
  }
}