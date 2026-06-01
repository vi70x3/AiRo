import { Notification, NotificationType, DirectMessage } from '@roo-code/types'
import { v4 as uuidv4 } from 'uuid'
import { SoftInterruptDelivery } from './soft-interrupt-delivery'

export class DmDelivery {
  private delivery: SoftInterruptDelivery
  
  constructor(delivery: SoftInterruptDelivery) {
    this.delivery = delivery
  }
  
  /**
   * Send a direct message from one agent to another.
   * Creates a DirectMessage, wraps it in a Notification of type Dm,
   * and delivers it as a soft interrupt to the recipient.
   */
  send(senderId: string, recipientId: string, content: string): Notification {
    const directMessage: DirectMessage = {
      messageId: uuidv4(),
      senderId,
      recipientId,
      content,
      timestamp: Date.now(),
      read: false
    }
    
    return this.delivery.deliverToRecipient(
      recipientId,
      NotificationType.DM,
      directMessage,
      senderId
    )
  }
}