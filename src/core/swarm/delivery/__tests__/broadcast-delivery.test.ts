import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BroadcastDelivery } from '../broadcast-delivery'
import { NotificationType, BroadcastMessage } from '@roo-code/types'

describe('BroadcastDelivery', () => {
  let broadcastDelivery: BroadcastDelivery
  let mockDelivery: any
  let mockDaemon: any
  
  beforeEach(() => {
    mockDaemon = {
      getAllAgentIds: vi.fn().mockReturnValue(['agent-1', 'agent-2', 'agent-3']),
      enqueueNotification: vi.fn()
    }
    
    mockDelivery = {
      deliverToRecipients: vi.fn().mockImplementation((senderId, type, payload, recipientIds) => {
        return recipientIds.map(recipientId => (
          {
            notificationId: `notif-${recipientId}-${Date.now()}`,
            type,
            recipientId,
            payload,
            timestamp: Date.now(),
            delivered: false,
            acknowledged: false
          }
        ))
      })
    }
    
    broadcastDelivery = new BroadcastDelivery(mockDelivery, mockDaemon)
  })

  describe('sender exclusion', () => {
    it('should not deliver to sender', () => {
      const notifications = broadcastDelivery.send('agent-1', 'test message')
      
      // Verify sender is NOT in the recipient list
      const recipientIds = notifications.map(n => n.recipientId)
      expect(recipientIds).not.toContain('agent-1')
      expect(recipientIds).toContain('agent-2')
      expect(recipientIds).toContain('agent-3')
    })
  })

  describe('recipient generation', () => {
    it('should deliver to all other active agents', () => {
      const notifications = broadcastDelivery.send('agent-1', 'broadcast message')
      
      // Verify all other agents received the message
      expect(notifications).toHaveLength(2)
      
      // Verify payload contains correct sender ID and content
      const payload = notifications[0].payload as BroadcastMessage
      expect(payload.senderId).toBe('agent-1')
      expect(payload.content).toBe('broadcast message')
      expect(payload.recipients).toEqual(['agent-2', 'agent-3'])
    })
  })

  describe('payload integrity', () => {
    it('should include correct sender ID, timestamp, and content', () => {
      const notifications = broadcastDelivery.send('agent-1', 'important message')
      
      // Verify payload structure
      const payload = notifications[0].payload as BroadcastMessage
      expect(payload.senderId).toBe('agent-1')
      expect(payload.content).toBe('important message')
      expect(payload.timestamp).toBeGreaterThan(0)
      expect(payload.messageId).toBeDefined()
    })
  })

  describe('single agent scenarios', () => {
    it('should handle single agent broadcast correctly', () => {
      // Mock daemon with only one agent
      mockDaemon.getAllAgentIds.mockReturnValue(['agent-1'])
      
      const notifications = broadcastDelivery.send('agent-1', 'test')
      
      // Should return empty array since no other agents exist
      expect(notifications).toHaveLength(0)
    })
  })
})