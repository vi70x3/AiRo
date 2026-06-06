import { describe, it, expect, beforeEach, test } from 'vitest'
import { NotificationQueue } from '../notification-queue'
import { NotificationType } from '@roo-code/types'

describe('NotificationQueue', () => {
  let notificationQueue: NotificationQueue
  
  beforeEach(() => {
    notificationQueue = new NotificationQueue()
  })
  
  it('should enqueue and dequeue notifications with proper priority', () => {
    const notification1 = {
      notificationId: 'test-1',
      type: NotificationType.DM,
      recipientId: 'agent-1',
      payload: { test: 'message' },
      timestamp: Date.now(),
      delivered: false,
      acknowledged: false
    }
    
    const notification2 = {
      notificationId: 'test-2',
      type: NotificationType.Touch,
      recipientId: 'agent-1',
      payload: { test: 'message' },
      timestamp: Date.now(),
      delivered: false,
      acknowledged: false
    }
    
    // Enqueue notifications
    notificationQueue.enqueue('agent-1', notification1)
    notificationQueue.enqueue('agent-1', notification2)
    
    // Dequeue should return touch notification first (higher priority)
    const dequeued = notificationQueue.dequeue('agent-1')
    expect(dequeued).toBeDefined()
    expect(dequeued?.type).toBe(NotificationType.Touch)
  })
  
  it('should handle notification counts and acknowledgments', () => {
    const notification = {
      notificationId: 'test-1',
      type: NotificationType.DM,
      recipientId: 'agent-1',
      payload: { test: 'message' },
      timestamp: Date.now(),
      delivered: false,
      acknowledged: false
    }
    
    // Test notification counts
    notificationQueue.enqueue('agent-1', notification)
    expect(notificationQueue.getPendingCount('agent-1')).toBe(1)
    
    // Test acknowledgment
    notificationQueue.acknowledge('agent-1', 'test-1')
  })
})