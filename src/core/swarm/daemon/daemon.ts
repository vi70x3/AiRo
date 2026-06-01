import {
  AgentMetadata,
  AgentLifecycleState,
  Notification,
  NotificationType,
  DirectMessage,
  BroadcastMessage,
  ChannelMessage,
  ChannelHistoryEntry,
  ContextKeyNotification,
  DaemonSnapshot,
  Plan,
  TouchNotification,
  IntentNotification,
  FileOperation,
  CrashReport,
  CrashDetectedEvent,
  CrashedAgentInfo,
  RecoveryResult,
} from '@roo-code/types'

import { IDaemon } from '../interfaces'
import { AgentRegistry } from './agent-registry'
import { NotificationQueue } from './notification-queue'
import { ChannelManager } from './channel-manager'
import { ContextStore } from './context-store'
import { PlanManager } from './plan-manager'
import { CrashDetector } from './crash-detector'
import { RecoveryValidator } from './recovery-validator'
import { ResumeCheckpointManager } from './resume-checkpoint-manager'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

interface SnapshotMetadata {
  snapshotId: string
  timestamp: number
  version: string
}

export class Daemon implements IDaemon {
  // Public properties (accessed by tests)
  public agentRegistry: AgentRegistry
  public notificationQueue: NotificationQueue
  public channelManager: ChannelManager
  public contextStore: ContextStore
  public planManager: PlanManager

  // Private properties
  private crashDetector: CrashDetector
  private recoveryValidator: RecoveryValidator
  private checkpointManager: ResumeCheckpointManager
  private coordinatorId: string | null = null
  private swarmId: string
  private snapshotsDir: string
  private snapshots: Map<string, SnapshotMetadata> = new Map()

  constructor(swarmId: string) {
    this.swarmId = swarmId
    this.agentRegistry = new AgentRegistry()
    this.notificationQueue = new NotificationQueue()
    this.channelManager = new ChannelManager()
    this.contextStore = new ContextStore()
    this.planManager = new PlanManager()
    this.crashDetector = new CrashDetector()
    this.recoveryValidator = new RecoveryValidator()
    this.checkpointManager = new ResumeCheckpointManager(swarmId)

    this.snapshotsDir = path.join(os.homedir(), '.kiro', 'swarm', 'snapshots', swarmId)
    this.ensureSnapshotsDir()

    // Wire crash detector to daemon lifecycle
    this.crashDetector.onCrash((event) => {
      this.handleCrashDetected(event)
    })
  }

  // --- Agent Registry Methods ---
  registerAgent(agent: AgentMetadata): void {
    this.agentRegistry.registerAgent(agent)
    this.crashDetector.registerAgent(agent.agentId, agent.state)
  }

  unregisterAgent(agentId: string): void {
    this.agentRegistry.unregisterAgent(agentId)
    this.crashDetector.unregisterAgent(agentId)
    this.notificationQueue.clear(agentId)
  }

  getAgent(agentId: string): AgentMetadata | null {
    return this.agentRegistry.getAgent(agentId) ?? null
  }

  listAgents(): AgentMetadata[] {
    return this.agentRegistry.listAgents()
  }

  updateAgentState(agentId: string, state: AgentLifecycleState): void {
    this.agentRegistry.updateAgentState(agentId, state)
    this.crashDetector.updateAgentState(agentId, state)
  }

  // --- Communication Methods ---
  sendDM(message: DirectMessage): void {
    const notification: Notification = {
      notificationId: `dm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: NotificationType.DM,
      recipientId: message.recipientId,
      payload: message,
      timestamp: message.timestamp,
      delivered: false,
      acknowledged: false,
    }
    this.notificationQueue.enqueue(message.recipientId, notification)
  }

  broadcast(message: BroadcastMessage): void {
    const agents = this.agentRegistry.listAgents()
    for (const agent of agents) {
      if (agent.agentId !== message.senderId) {
        const notification: Notification = {
          notificationId: `bc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: NotificationType.Broadcast,
          recipientId: agent.agentId,
          payload: message,
          timestamp: message.timestamp,
          delivered: false,
          acknowledged: false,
        }
        this.notificationQueue.enqueue(agent.agentId, notification)
      }
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
    for (const recipientId of recipients) {
      const notification: Notification = {
        notificationId: `ch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: NotificationType.Channel,
        recipientId,
        payload: message,
        timestamp: message.timestamp,
        delivered: false,
        acknowledged: false,
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

  // --- Context Key Methods ---
  setContextKey(agentId: string, key: string, value: unknown): void {
    this.contextStore.setKey(agentId, key, value)
  }

  getContextKey(key: string): unknown {
    const entry = this.contextStore.getKey(key)
    return entry ? entry.value : undefined
  }

  listContextKeys(): string[] {
    return this.contextStore.listKeys().map(entry => entry.key)
  }

  subscribeToKey(agentId: string, key: string, callback: (newValue: unknown, oldValue: unknown) => void): void {
    this.contextStore.subscribeToKey(agentId, key, (notification: ContextKeyNotification) => {
      callback(notification.newValue, notification.oldValue)
    })
  }

  // --- Notification Methods ---
  getPendingNotifications(agentId: string): Notification[] | null {
    const agent = this.agentRegistry.getAgent(agentId)
    if (!agent) {
      return null
    }
    return this.notificationQueue.getPending(agentId)
  }

  // --- Touch/Intent Methods ---
  notifyFileTouch(agentId: string, filePath: string, operation: FileOperation): void {
    const touchPayload: TouchNotification = {
      notificationId: `touch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      modifyingAgentId: agentId,
      filePath,
      operation,
      timestamp: Date.now(),
    }
    const agents = this.agentRegistry.listAgents()
    for (const agent of agents) {
      if (agent.agentId !== agentId) {
        const notification: Notification = {
          notificationId: `touch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: NotificationType.Touch,
          recipientId: agent.agentId,
          payload: touchPayload,
          timestamp: Date.now(),
          delivered: false,
          acknowledged: false,
        }
        this.notificationQueue.enqueue(agent.agentId, notification)
      }
    }
  }

  broadcastIntent(agentId: string, filePaths: string[], toolName: string): void {
    const intentPayload: IntentNotification = {
      notificationId: `intent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      declaringAgentId: agentId,
      filePaths,
      toolName,
      timestamp: Date.now(),
    }
    const agents = this.agentRegistry.listAgents()
    for (const agent of agents) {
      if (agent.agentId !== agentId) {
        const notification: Notification = {
          notificationId: `intent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: NotificationType.Intent,
          recipientId: agent.agentId,
          payload: intentPayload,
          timestamp: Date.now(),
          delivered: false,
          acknowledged: false,
        }
        this.notificationQueue.enqueue(agent.agentId, notification)
      }
    }
  }

  // --- Coordinator Methods ---
  getCoordinatorId(): string | null {
    return this.coordinatorId
  }

  setCoordinatorId(coordinatorId: string): void {
    this.coordinatorId = coordinatorId
  }

  // --- Plan Methods ---
  setPlan(plan: Plan): void {
    this.planManager.setPlan(plan)
  }

  getPlan(): Plan | null {
    return this.planManager.getPlan()
  }

  // --- Snapshot Methods ---
  createSnapshot(): DaemonSnapshot {
    const snapshotId = `snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Build notification queues from registered agents
    const notificationQueues: Record<string, Notification[]> = {}
    const agents = this.agentRegistry.listAgents()
    for (const agent of agents) {
      const pending = this.notificationQueue.getPending(agent.agentId)
      if (pending.length > 0) {
        notificationQueues[agent.agentId] = pending
      }
    }

    // Build context keys
    const contextKeys: Record<string, unknown> = {}
    for (const entry of this.contextStore.listKeys()) {
      contextKeys[entry.key] = entry.value
    }

    const snapshot: DaemonSnapshot = {
      snapshotId,
      timestamp: Date.now(),
      version: '1.0.0',
      agents,
      notificationQueues,
      channels: this.channelManager.listChannels().map(c => c.name),
      channelHistories: this.channelManager.getChannelHistories(),
      contextKeys,
      plan: this.planManager.getPlan(),
      swarmId: this.swarmId,
      coordinatorId: this.coordinatorId ?? '',
    }

    // Persist snapshot metadata
    const metadata: SnapshotMetadata = {
      snapshotId,
      timestamp: snapshot.timestamp,
      version: snapshot.version,
    }
    this.snapshots.set(snapshotId, metadata)
    this.persistSnapshot(snapshot)

    return snapshot
  }

  restoreFromSnapshot(snapshotId: string): void {
    const snapshotPath = path.join(this.snapshotsDir, `${snapshotId}.json`)
    if (!fs.existsSync(snapshotPath)) {
      throw new Error(`Snapshot ${snapshotId} not found`)
    }

    const raw = fs.readFileSync(snapshotPath, 'utf-8')
    const snapshot: DaemonSnapshot = JSON.parse(raw)

    // Restore agents
    for (const agent of snapshot.agents) {
      this.agentRegistry.registerAgent(agent)
    }

    // Restore notification queues
    for (const [agentId, notifications] of Object.entries(snapshot.notificationQueues)) {
      for (const notification of notifications) {
        this.notificationQueue.enqueue(agentId, notification)
      }
    }

    // Restore channels and histories
    for (const channelName of snapshot.channels) {
      try {
        this.channelManager.createChannel(channelName)
      } catch {
        // Channel already exists, skip
      }
    }
    this.channelManager.restoreChannelHistories(snapshot.channelHistories)

    // Restore context keys
    for (const [key, value] of Object.entries(snapshot.contextKeys)) {
      this.contextStore.setKey('', key, value)
    }

    // Restore plan
    if (snapshot.plan) {
      this.planManager.setPlan(snapshot.plan)
    }

    // Restore coordinator ID
    this.coordinatorId = snapshot.coordinatorId || null
  }

  listSnapshots(): string[] {
    if (!fs.existsSync(this.snapshotsDir)) {
      return []
    }
    return fs.readdirSync(this.snapshotsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
  }

  // --- Crash Recovery Methods ---
  getCrashReport(swarmId: string): CrashReport {
    const crashedAgents: CrashedAgentInfo[] = []
    const recoveryResults: RecoveryResult[] = []

    const agents = this.agentRegistry.listAgents()
    for (const agent of agents) {
      if (agent.state === AgentLifecycleState.Crashed) {
        crashedAgents.push({
          agentId: agent.agentId,
          crashType: 'heartbeat_miss',
          crashedAt: agent.lastHeartbeat,
          lastKnownState: agent.state,
          lastTaskId: agent.taskId,
        })

        const checkpoint = this.checkpointManager.getLatestCheckpoint(agent.agentId)
        if (checkpoint) {
          recoveryResults.push({
            agentId: agent.agentId,
            success: true,
            method: 'resume_checkpoint',
            details: `Recovered via checkpoint ${checkpoint.checkpointId}`,
          })
        } else {
          recoveryResults.push({
            agentId: agent.agentId,
            success: true,
            method: 'reassign_task',
            details: `No checkpoint available, task will be reassigned`,
          })
        }
      }
    }

    return {
      swarmId,
      timestamp: Date.now(),
      crashedAgents,
      recoveryAttempted: crashedAgents.length > 0,
      recoveryResults,
    }
  }

  forceRecoverAgent(agentId: string): AgentMetadata | null {
    const agent = this.agentRegistry.getAgent(agentId)
    if (!agent) {
      return null
    }

    // Try checkpoint recovery first
    const checkpoint = this.checkpointManager.getLatestCheckpoint(agentId)
    if (checkpoint) {
      const snapshot = this.createSnapshot()
      const validation = this.recoveryValidator.validateCheckpoint(checkpoint, snapshot)
      if (validation.valid) {
        this.agentRegistry.updateAgentState(agentId, AgentLifecycleState.Ready)
        return this.agentRegistry.getAgent(agentId) ?? null
      }
    }

    // Fallback: reset to Ready state
    this.agentRegistry.updateAgentState(agentId, AgentLifecycleState.Ready)
    return this.agentRegistry.getAgent(agentId) ?? null
  }

  // --- Private Methods ---
  private handleCrashDetected(event: CrashDetectedEvent): void {
    this.agentRegistry.updateAgentState(event.agentId, AgentLifecycleState.Crashed)

    const agent = this.agentRegistry.getAgent(event.agentId)
    if (agent) {
      this.checkpointManager.createCheckpoint(
        event.agentId,
        agent,
        agent.taskId,
        { completed: [], remaining: [] }
      )
    }
  }

  private ensureSnapshotsDir(): void {
    if (!fs.existsSync(this.snapshotsDir)) {
      fs.mkdirSync(this.snapshotsDir, { recursive: true })
    }
  }

  private persistSnapshot(snapshot: DaemonSnapshot): void {
    const filePath = path.join(this.snapshotsDir, `${snapshot.snapshotId}.json`)
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2))
  }
}