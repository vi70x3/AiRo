import { Notification, NotificationType, BroadcastMessage } from '@roo-code/types'
import { v4 as uuidv4 } from 'uuid'
import { SoftInterruptDelivery } from './soft-interrupt-delivery'
import { Daemon } from '../daemon/daemon'

export class BroadcastDelivery {
  private delivery: SoftInterruptDelivery
  private daemon: Daemon
  
  constructor(delivery: SoftInterruptDelivery, daemon: Daemon) {
    this.delivery = delivery
    this.daemon = daemon
  }
  
  /**
   * Broadcast a message from one agent to all other agents.
   * Creates a BroadcastMessage, wraps it in Notifications of type Broadcast,
   * and delivers to all registered agents except the sender.
   */
  send(senderId: string, content: string): Notification[] {
    const broadcastMessage: BroadcastMessage = {
      messageId: uuidv4(),
      senderId,
      content,
      timestamp: Date.now(),
      recipients: []
    }
    
    // Get all registered agents except the sender
    const allAgentIds = this.daemon.getAllAgentIds()
    const recipientIds = allAgentIds.filter(id => id !== senderId)
    
    // Update recipients in the message
    broadcastMessage.recipients = recipientIds
    
    // Deliver to all recipients
    return this.delivery.deliverToRecipients(
      senderId,
      NotificationType.Broadcast,
      broadcastMessage,
      recipientIds,
      false // Don't exclude sender since we already filtered
    )
  }
}