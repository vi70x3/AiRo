import { 
  Notification, 
  NotificationType, 
  DirectMessage, 
  BroadcastMessage, 
  ChannelMessage, 
  TouchNotification, 
  IntentNotification,
  ContextKeyNotification
} from '@roo-code/types'
import { v4 as uuidv4 } from 'uuid'
import { Daemon } from '../daemon/daemon'

export interface ProcessedNotifications {
  touch: Notification[]
  intent: Notification[]
  dm: Notification[]
  channel: Notification[]
  broadcast: Notification[]
  contextKey: Notification[]
  all: Notification[]
}

export class SoftInterruptDelivery {
  private daemon: Daemon
  
  constructor(daemon: Daemon) {
    this.daemon = daemon
  }
  
  /**
   * Core delivery algorithm from the spec:
   * 1. Determine recipients
   * 2. Acquire queue lock (implicit via Map operations in single-threaded JS)
   * 3. Append notification FIFO per type per agent
   * 4. Release lock
   * 5. Increment counter
   * 6. Return immediately (non-blocking)
   */
  deliverToRecipients(
    senderId: string,
    type: NotificationType,
    payload: unknown,
    recipientIds: string[],
    excludeSender: boolean = true
  ): Notification[] {
    const notifications: Notification[] = []
    const recipients = excludeSender 
      ? recipientIds.filter(id => id !== senderId)
      : recipientIds
    
    for (const recipientId of recipients) {
      const notification: Notification = {
        notificationId: uuidv4(),
        type,
        recipientId,
        payload,
        timestamp: Date.now(),
        delivered: false,
        acknowledged: false
      }
      notifications.push(notification)
      this.daemon.enqueueNotification(recipientId, notification)
    }
    
    return notifications
  }
  
  /**
   * Deliver to a single recipient
   */
  deliverToRecipient(
    recipientId: string,
    type: NotificationType,
    payload: unknown,
    senderId: string
  ): Notification {
    const notification: Notification = {
      notificationId: uuidv4(),
      type,
      recipientId,
      payload,
      timestamp: Date.now(),
      delivered: false,
      acknowledged: false
    }
    
    this.daemon.enqueueNotification(recipientId, notification)
    return notification
  }
  
  /**
   * Check pending notifications for an agent (spec: checkPendingNotifications)
   * Marks notifications as delivered when retrieved
   */
  checkPending(agentId: string): Notification[] {
    const pending = this.daemon.getPendingNotifications(agentId)
    // Mark notifications as delivered
    for (const notification of pending) {
      notification.delivered = true
    }
    return pending
  }
  
  /**
   * Process notifications at coordination points (spec: processNotifications)
   * Groups notifications by type and processes in priority order:
   * touch → intent → DMs → channel → broadcast → context_key
   * Returns grouped notifications ready for agent processing
   */
  processPending(agentId: string): ProcessedNotifications {
    const pending = this.checkPending(agentId)
    
    // Group notifications by type
    const grouped: {
      touch: Notification[] = [],
      intent: Notification[] = [],
      dm: Notification[] = [],
      channel: Notification[] = [],
      broadcast: Notification[] = [],
      contextKey: Notification[] = []
    } = {
      touch: [],
      intent: [],
      dm: [],
      channel: [],
      broadcast: [],
      contextKey: [],
      all: pending
    }
    
    // Categorize notifications by type
    for (const notification of pending) {
      switch (notification.type) {
        case NotificationType.Touch:
          grouped.touch.push(notification)
          break
        case NotificationType.Intent:
          grouped.intent.push(notification)
          break
        case NotificationType.DM:
          grouped.dm.push(notification)
          break
        case NotificationType.Channel:
          grouped.channel.push(notification)
          break
        case NotificationType.Broadcast:
          grouped.broadcast.push(notification)
          break
        case NotificationType.ContextKey:
          grouped.contextKey.push(notification)
          break
      }
    }
    
    return grouped
  }
}