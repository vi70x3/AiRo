import { Notification, NotificationType, ChannelMessage } from '@roo-code/types'
import { v4 as uuidv4 } from 'uuid'
import { SoftInterruptDelivery } from './soft-interrupt-delivery'
import { Daemon } from '../daemon/daemon'

export class ChannelDelivery {
  private delivery: SoftInterruptDelivery
  private daemon: Daemon
  
  constructor(delivery: SoftInterruptDelivery, daemon: Daemon) {
    this.delivery = delivery
    this.daemon = daemon
  }
  
  /**
   * Send a message to a channel.
   * Creates a ChannelMessage, wraps it in Notifications of type Channel,
   * and delivers to all channel members except the sender.
   * Uses daemon.channelManager to get member list.
   */
  send(channelName: string, senderId: string, content: string): Notification[] {
    // Get channel members
    const channelInfo = this.daemon.channelManager.getChannelInfo(channelName)
    if (!channelInfo) {
      throw new Error(`Channel ${channelName} does not exist`)
    }
    
    const channelMessage: ChannelMessage = {
      messageId: uuidv4(),
      channelName,
      senderId,
      content,
      timestamp: Date.now(),
      recipients: channelInfo.members
    }
    
    // Deliver to all channel members except sender
    return this.delivery.deliverToRecipients(
      senderId,
      NotificationType.Channel,
      channelMessage,
      channelInfo.members,
      true // Exclude sender
    )
  }
}