import { IAgent, IDaemon } from '../interfaces'
import {
  AgentType,
  AgentLifecycleState,
  AgentMetadata,
  Notification,
  DirectMessage,
  BroadcastMessage,
  ChannelMessage,
  CompletionReport,
  PlanUpdate,
  ContextKeyEntry,
  ContextKeyNotification,
  FileOperation,
} from '@roo-code/types'
import { validateTransition, getTransitionTrigger } from '../lifecycle'
import { v4 as uuidv4 } from 'uuid'
import { WorkingSet } from './working-set'
import { NotificationHandler, ConflictSeverity, NotificationHandlerResult } from './notification-handler'
import { TouchIntentHandler } from './touch-intent-handler'
import { ConflictStrategies, StrategyProposal } from './conflict-strategies'
import {
  OptimisticConcurrency,
  ConcurrencyDecision,
  ConcurrencyAction,
  FileConcurrencyAssessment,
} from './optimistic-concurrency'

export class Agent implements IAgent {
  public readonly agentId: string
  public readonly agentType: AgentType
  public readonly parentId: string | null
  public readonly worktreeScope: string | null

  private _state: AgentLifecycleState
  public readonly spawnedAt: number
  private _lastHeartbeat: number

  protected daemon: IDaemon

  public readonly workingSet: WorkingSet
  public readonly notificationHandler: NotificationHandler
  public readonly touchIntentHandler: TouchIntentHandler
  public readonly conflictStrategies: ConflictStrategies
  public readonly optimisticConcurrency: OptimisticConcurrency

  constructor(
    agentId: string,
    agentType: AgentType,
    daemon: IDaemon,
    parentId?: string,
    worktreeScope?: string
  ) {
    this.agentId = agentId
    this.agentType = agentType
    this.parentId = parentId ?? null
    this.worktreeScope = worktreeScope ?? null
    this._state = AgentLifecycleState.Spawned
    this.spawnedAt = Date.now()
    this._lastHeartbeat = Date.now()
    this.daemon = daemon

    this.workingSet = new WorkingSet()
    this.notificationHandler = new NotificationHandler(this.agentId, this.workingSet, this.daemon)
    this.touchIntentHandler = new TouchIntentHandler(this.agentId, this.workingSet, this.daemon)
    this.conflictStrategies = new ConflictStrategies(this.agentId, this.daemon)
    this.optimisticConcurrency = new OptimisticConcurrency(
      this.agentId,
      this.workingSet,
      this.touchIntentHandler,
      this.daemon
    )

    this.daemon.registerAgent(this.toMetadata())
  }

  // --- Lifecycle Management ---

  get state(): AgentLifecycleState {
    return this._state
  }

  get lastHeartbeat(): number {
    return this._lastHeartbeat
  }

  transitionTo(newState: AgentLifecycleState): void {
    if (!validateTransition(this._state, newState)) {
      const trigger = getTransitionTrigger(this._state, newState)
      throw new Error(
        `Invalid lifecycle transition from ${AgentLifecycleState[this._state]} to ${AgentLifecycleState[newState]}: ${trigger}`
      )
    }
    this._state = newState
    this._lastHeartbeat = Date.now()
    this.daemon.registerAgent(this.toMetadata())
  }

  markReady(): void { this.transitionTo(AgentLifecycleState.Ready) }
  startRunning(): void { this.transitionTo(AgentLifecycleState.Running) }
  markBlocked(): void { this.transitionTo(AgentLifecycleState.Blocked) }
  unblock(): void { this.transitionTo(AgentLifecycleState.Running) }
  markCompleted(): void { this.transitionTo(AgentLifecycleState.Completed) }
  markFailed(): void { this.transitionTo(AgentLifecycleState.Failed) }
  stop(): void { this.transitionTo(AgentLifecycleState.Stopped) }
  crash(): void { this.transitionTo(AgentLifecycleState.Crashed) }

  updateHeartbeat(): void {
    this._lastHeartbeat = Date.now()
  }

  toMetadata(): AgentMetadata {
    return {
      agentId: this.agentId,
      agentType: this.agentType,
      state: this._state,
      parentId: this.parentId ?? undefined,
      worktreeScope: this.worktreeScope ?? undefined,
      spawnedAt: this.spawnedAt,
      lastHeartbeat: this._lastHeartbeat,
      taskId: undefined,
      mode: undefined,
    }
  }

  // --- IAgent Communication Methods ---

  sendDM(recipientId: string, content: string): void {
    this.daemon.sendDM({
      messageId: uuidv4(),
      senderId: this.agentId,
      recipientId,
      content,
      timestamp: Date.now(),
      read: false,
    })
  }

  broadcast(content: string): void {
    this.daemon.broadcast({
      messageId: uuidv4(),
      senderId: this.agentId,
      content,
      timestamp: Date.now(),
      recipients: [],
    })
  }

  joinChannel(channelName: string): void {
    this.daemon.joinChannel(this.agentId, channelName)
  }

  leaveChannel(channelName: string): void {
    this.daemon.leaveChannel(this.agentId, channelName)
  }

  sendToChannel(channelName: string, content: string): void {
    this.daemon.sendToChannel({
      messageId: uuidv4(),
      channelName,
      senderId: this.agentId,
      content,
      timestamp: Date.now(),
      recipients: [],
    })
  }

  // --- IAgent Context Methods ---

  setContextKey(key: string, value: unknown): void {
    this.daemon.setContextKey(this.agentId, key, value)
  }

  getContextKey(key: string): ContextKeyEntry | undefined {
    return this.daemon.getContextKey(key) as ContextKeyEntry | undefined
  }

  subscribeToKey(key: string, callback: (notification: ContextKeyNotification) => void): void {
    this.daemon.subscribeToKey(this.agentId, key, callback)
  }

  // --- IAgent Notification Methods ---

  checkPendingNotifications(): Notification[] {
    return this.daemon.getPendingNotifications(this.agentId) || []
  }

  // --- IAgent Plan Methods ---

  proposePlanUpdate(update: PlanUpdate): void {
    const coordinatorId = this.daemon.getCoordinatorId()
    if (coordinatorId) {
      this.daemon.sendDM({
        messageId: uuidv4(),
        senderId: this.agentId,
        recipientId: coordinatorId,
        content: JSON.stringify(update),
        timestamp: Date.now(),
        read: false,
      })
    }
  }

  // --- IAgent Completion Methods ---

  reportCompletion(report: CompletionReport): void {
    const coordinatorId = this.daemon.getCoordinatorId()
    if (coordinatorId) {
      this.daemon.sendDM({
        messageId: uuidv4(),
        senderId: this.agentId,
        recipientId: coordinatorId,
        content: JSON.stringify(report),
        timestamp: Date.now(),
        read: false,
      })
    }
    this.markCompleted()
  }

  // --- Notification Processing ---

  processNotifications(): NotificationHandlerResult {
    return this.notificationHandler.processNotifications()
  }

  // --- Touch/Intent Methods ---

  declareIntent(filePaths: string[], toolName: string): void {
    this.touchIntentHandler.declareIntent(filePaths, toolName)
  }

  recordFileRead(filePath: string): void {
    this.touchIntentHandler.recordFileRead(filePath)
  }

  recordFileModification(filePath: string, operation: FileOperation): void {
    this.touchIntentHandler.recordFileModification(filePath, operation)
  }

  recordFileCommit(filePath: string): void {
    this.touchIntentHandler.recordFileCommit(filePath)
  }

  processPendingTouchIntent(): ReturnType<TouchIntentHandler['processPendingTouchIntent']> {
    return this.touchIntentHandler.processPendingTouchIntent()
  }

  // --- Concurrency & Conflict Methods ---

  decideBeforeOperation(filePaths: string[], operation: FileOperation): ConcurrencyDecision {
    return this.optimisticConcurrency.decideBeforeOperation(filePaths, operation)
  }

  processConcurrencyAndDecide(): ConcurrencyDecision {
    return this.optimisticConcurrency.processAndDecide()
  }

  assessFileConcurrency(filePaths: string[]): FileConcurrencyAssessment[] {
    return this.optimisticConcurrency.assessFileConcurrency(filePaths)
  }

  proposeConflictStrategy(
    conflictType: import('../worktree-manager/conflict-detector').ConflictType,
    severity: ConflictSeverity,
    conflictingAgentId: string
  ): StrategyProposal {
    return this.conflictStrategies.proposeStrategy(conflictType, severity, conflictingAgentId)
  }

  evaluateConflictProposal(proposal: StrategyProposal): ReturnType<ConflictStrategies['evaluateProposal']> {
    return this.conflictStrategies.evaluateProposal(proposal)
  }

  shouldEscalateConflict(
    conflictType: import('../worktree-manager/conflict-detector').ConflictType,
    negotiationAttempts: number
  ): boolean {
    return this.conflictStrategies.shouldEscalate(conflictType, negotiationAttempts)
  }

  reportConflictResolution(
    conflictId: string,
    strategy: import('@roo-code/types').ConflictResolutionStrategy,
    resolvedBy: string[]
  ): void {
    this.conflictStrategies.reportResolution(conflictId, strategy, resolvedBy)
  }

  // --- Cleanup ---

  dispose(): void {
    this.daemon.unregisterAgent(this.agentId)
  }
}
