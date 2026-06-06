import { 
  Notification, 
  NotificationType 
} from '@roo-code/types'

export class NotificationQueue {
  private queues: Map<string, Map<NotificationType, Notification[]>> = new Map()
  
  enqueue(agentId: string, notification: Notification): void {
    if (!this.queues.has(agentId)) {
      this.queues.set(agentId, new Map())
    }
    
    const agentQueues = this.queues.get(agentId)!
    if (!agentQueues.has(notification.type)) {
      agentQueues.set(notification.type, [])
    }
    
    agentQueues.get(notification.type)!.push(notification)
  }
  
  dequeue(agentId: string): Notification | undefined {
    const agentQueues = this.queues.get(agentId)
    if (!agentQueues) {
      return undefined
    }
    
    // Priority order: Touch → Intent → DM → Channel → Broadcast → ContextKey
    const priorityOrder = [
      NotificationType.Touch,
      NotificationType.Intent,
      NotificationType.DM,
      NotificationType.Channel,
      NotificationType.Broadcast,
      NotificationType.ContextKey
    ]
    
    for (const type of priorityOrder) {
      const queue = agentQueues.get(type)
      if (queue && queue.length > 0) {
        return queue.shift()
      }
    }
    
    return undefined
  }
  
  getPending(agentId: string): Notification[] {
    const agentQueues = this.queues.get(agentId)
    if (!agentQueues) {
      return []
    }
    
    // Return all pending notifications ordered by priority
    const priorityOrder = [
      NotificationType.Touch,
      NotificationType.Intent,
      NotificationType.DM,
      NotificationType.Channel,
      NotificationType.Broadcast,
      NotificationType.ContextKey
    ]
    
    const result: Notification[] = []
    for (const type of priorityOrder) {
      const queue = agentQueues.get(type)
      if (queue) {
        result.push(...queue)
      }
    }
    
    return result
  }
  
  getPendingByType(agentId: string, type: NotificationType): Notification[] {
    const agentQueues = this.queues.get(agentId)
    if (!agentQueues) {
      return []
    }
    
    const queue = agentQueues.get(type)
    return queue ? [...queue] : []
  }
  
  acknowledge(agentId: string, notificationId: string): void {
    const agentQueues = this.queues.get(agentId)
    if (!agentQueues) {
      return
    }
    
    for (const [type, queue] of agentQueues) {
      const index = queue.findIndex(n => n.notificationId === notificationId)
      if (index !== -1) {
        queue[index].acknowledged = true
        return
      }
    }
  }
  
  getPendingCount(agentId: string): number {
    const agentQueues = this.queues.get(agentId)
    if (!agentQueues) {
      return 0
    }
    
    let count = 0
    for (const queue of agentQueues.values()) {
      count += queue.length
    }
    return count
  }
  
  getPendingCountByType(agentId: string, type: NotificationType): number {
    const agentQueues = this.queues.get(agentId)
    if (!agentQueues) {
      return 0
    }
    
    const queue = agentQueues.get(type)
    return queue ? queue.length : 0
  }
  
  clear(agentId: string): void {
    this.queues.delete(agentId)
  }
}