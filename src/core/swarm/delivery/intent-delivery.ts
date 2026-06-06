import { Notification, NotificationType, IntentNotification } from '@roo-code/types'
import { v4 as uuidv4 } from 'uuid'
import { SoftInterruptDelivery } from './soft-interrupt-delivery'
import { Daemon } from '../daemon/daemon'

export class IntentDelivery {
  private delivery: SoftInterruptDelivery
  private daemon: Daemon
  
  constructor(delivery: SoftInterruptDelivery, daemon: Daemon) {
    this.delivery = delivery
    this.daemon = daemon
  }
  
  /**
   * Broadcast an agent's intent to modify specific files.
   * Creates an IntentNotification (declaringAgentId, filePaths[], timestamp, toolName),
   * wraps it in Notifications of type Intent,
   * and delivers to all other registered agents as soft interrupt.
   */
  broadcastIntent(declaringAgentId: string, filePaths: string[], toolName: string): Notification[] {
    const intentNotification: IntentNotification = {
      notificationId: uuidv4(),
      declaringAgentId,
      filePaths,
      timestamp: Date.now(),
      toolName
    }
    
    // Get all registered agents except the declaring agent
    const allAgentIds = this.daemon.getAllAgentIds()
    const recipientIds = allAgentIds.filter(id => id !== declaringAgentId)
    
    // Deliver to all recipients
    return this.delivery.deliverToRecipients(
      declaringAgentId,
      NotificationType.Intent,
      intentNotification,
      recipientIds,
      true // Exclude the declaring agent
    )
  }
}