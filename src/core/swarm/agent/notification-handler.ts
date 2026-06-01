import {
  Notification,
  NotificationType,
  TouchNotification,
  IntentNotification,
  DirectMessage,
  FileOperation,
  FileStatusType
} from '@roo-code/types'
import { WorkingSet, WorkingSetEntry } from './working-set'
import { IDaemon } from '../interfaces'

export enum ConflictSeverity {
  None = 'none',
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

export interface TouchHandlingResult {
  notification: TouchNotification
  severity: ConflictSeverity
  shouldNegotiate: boolean  // true if severity is Medium or High
}

export interface IntentHandlingResult {
  notification: IntentNotification
  overlapPaths: string[]
  shouldNegotiate: boolean  // true if overlap exists with intent/modified status
}

export interface NotificationHandlerResult {
  /** Notifications that were processed */
  processed: Notification[]
  /** Touch notifications that triggered conflict coordination (severity Medium+) */
  conflictTouches: TouchNotification[]
  /** Intent notifications that triggered conflict coordination */
  conflictIntents: IntentNotification[]
  /** DMs that were received */
  dms: DirectMessage[]
  /** Whether the agent should enter blocked state due to conflicts */
  shouldBlock: boolean
}

export class NotificationHandler {
  private workingSet: WorkingSet
  private daemon: IDaemon
  private agentId: string
  
  constructor(agentId: string, workingSet: WorkingSet, daemon: IDaemon) {
    this.agentId = agentId
    this.workingSet = workingSet
    this.daemon = daemon
  }
  
  /**
   * Process all pending notifications at a coordination point.
   * Returns a result indicating what was processed and any conflicts detected.
   */
  processNotifications(): NotificationHandlerResult {
    const notifications = this.daemon.getPendingNotifications(this.agentId) || []
    
    // Group notifications by type
    const touchNotifications: Notification[] = []
    const intentNotifications: Notification[] = []
    const dmNotifications: Notification[] = []
    const channelNotifications: Notification[] = []
    const broadcastNotifications: Notification[] = []
    const contextKeyNotifications: Notification[] = []
    
    for (const notification of notifications) {
      switch (notification.type) {
        case NotificationType.Touch:
          touchNotifications.push(notification)
          break
        case NotificationType.Intent:
          intentNotifications.push(notification)
          break
        case NotificationType.DM:
          dmNotifications.push(notification)
          break
        case NotificationType.Channel:
          channelNotifications.push(notification)
          break
        case NotificationType.Broadcast:
          broadcastNotifications.push(notification)
          break
        case NotificationType.ContextKey:
          contextKeyNotifications.push(notification)
          break
      }
    }
    
    // Process in priority order
    const processed: Notification[] = []
    const conflictTouches: TouchNotification[] = []
    const conflictIntents: IntentNotification[] = []
    const dms: DirectMessage[] = []
    let shouldBlock = false
    let highSeverityCount = 0
    
    // Process touch notifications
    for (const notification of touchNotifications) {
      const result = this.handleTouchNotification(notification)
      processed.push(notification)
      if (result.shouldNegotiate) {
        conflictTouches.push(result.notification)
        if (result.severity === ConflictSeverity.High) {
          highSeverityCount++
        }
      }
    }
    
    // Process intent notifications
    for (const notification of intentNotifications) {
      const result = this.handleIntentNotification(notification)
      processed.push(notification)
      if (result.shouldNegotiate) {
        conflictIntents.push(result.notification)
      }
    }
    
    // Collect DMs
    for (const notification of dmNotifications) {
      dms.push(notification.payload as DirectMessage)
    }
    
    // Determine if agent should block
    shouldBlock = highSeverityCount > 0
    
    return {
      processed,
      conflictTouches,
      conflictIntents,
      dms,
      shouldBlock
    }
  }
  
  /**
   * Handle a touch notification.
   * Check if the modified file is in our working set.
   * Assess severity and trigger DM negotiation if Medium+.
   */
  handleTouchNotification(notification: Notification): TouchHandlingResult {
    const touch = notification.payload as TouchNotification
    const severity = this.workingSet.assessSeverity(touch.filePath)
    const shouldNegotiate = severity === ConflictSeverity.Medium || severity === ConflictSeverity.High
    
    if (shouldNegotiate) {
      this.initiateNegotiation(touch.modifyingAgentId, touch.filePath, severity)
    }
    
    return {
      notification: touch,
      severity,
      shouldNegotiate
    }
  }
  
  /**
   * Handle an intent notification.
   * Check working set overlap with the declared intent paths.
   * If overlap exists with intent/modified status, trigger DM negotiation.
   */
  handleIntentNotification(notification: Notification): IntentHandlingResult {
    const intent = notification.payload as IntentNotification
    const overlaps = this.workingSet.checkOverlap(intent.filePaths)
    
    // Filter overlaps to only those with intent or modified status
    const relevantOverlaps = new Map<string, WorkingSetEntry>()
    for (const [filePath, entry] of overlaps) {
      if (entry.status === FileStatusType.Staged || entry.status === FileStatusType.Modified) {
        relevantOverlaps.set(filePath, entry)
      }
    }
    
    const overlapPaths = Array.from(relevantOverlaps.keys())
    const shouldNegotiate = overlapPaths.length > 0
    
    if (shouldNegotiate) {
      // Initiate negotiation with the declaring agent
      this.initiateNegotiation(intent.declaringAgentId, overlapPaths[0], ConflictSeverity.Medium)
    }
    
    return {
      notification: intent,
      overlapPaths: overlapPaths,
      shouldNegotiate
    }
  }
  
  /**
   * Initiate DM negotiation with another agent for conflict resolution.
   * Sends a DM to the target agent requesting coordination.
   */
  initiateNegotiation(targetAgentId: string, filePath: string, severity: ConflictSeverity): void {
    const negotiationMessage = {
      type: 'conflict_negotiation',
      filePath: filePath,
      severity: severity,
      timestamp: Date.now()
    }
    
    const dm: DirectMessage = {
      messageId: `negotiation_${Date.now()}`,
      senderId: this.agentId,
      recipientId: targetAgentId,
      content: JSON.stringify(negotiationMessage),
      timestamp: Date.now(),
      read: false
    }
    
    this.daemon.sendDM(dm)
  }
}