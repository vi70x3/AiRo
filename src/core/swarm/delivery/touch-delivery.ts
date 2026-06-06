import { Notification, NotificationType, TouchNotification } from '@roo-code/types'
import { v4 as uuidv4 } from 'uuid'
import { SoftInterruptDelivery } from './soft-interrupt-delivery'
import { Daemon } from '../daemon/daemon'

export class TouchDelivery {
  private delivery: SoftInterruptDelivery
  private daemon: Daemon
  
  constructor(delivery: SoftInterruptDelivery, daemon: Daemon) {
    this.delivery = delivery
    this.daemon = daemon
  }
  
  /**
   * Auto-sent when an agent modifies a file.
   * Creates a TouchNotification (filePath, modifyingAgentId, timestamp, operation),
   * wraps it in Notifications of type Touch,
   * and delivers to all other registered agents as soft interrupt.
   */
  notify(modifyingAgentId: string, filePath: string, operation: 'create' | 'modify' | 'delete'): Notification[] {
    const touchNotification: TouchNotification = {
      notificationId: uuidv4(),
      filePath,
      modifyingAgentId,
      timestamp: Date.now(),
      operation
    }
    
    // Get all registered agents except the modifying agent
    const allAgentIds = this.daemon.getAllAgentIds()
    const recipientIds = allAgentIds.filter(id => id !== modifyingAgentId)
    
    // Deliver to all recipients
    return this.delivery.deliverToRecipients(
      modifyingAgentId,
      NotificationType.Touch,
      touchNotification,
      recipientIds,
      true // Exclude the modifying agent
    )
  }
}