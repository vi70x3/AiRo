import { describe, it, expect, beforeEach } from 'vitest'
import { ChannelManager } from '../../daemon/channel-manager'
import { ChannelMessage } from '@roo-code/types'

describe('ChannelManager - Message History', () => {
  let channelManager: ChannelManager

  beforeEach(() => {
    channelManager = new ChannelManager(100) // Small history size for testing
  })

  describe('Message Storage', () => {
    it('should store messages in channel history', () => {
      channelManager.createChannel('test-channel')
      
      const message1: ChannelMessage = {
        messageId: 'msg-1',
        channelName: 'test-channel',
        senderId: 'agent-1',
        content: 'Hello',
        timestamp: 1000,
        recipients: ['agent-2']
      }

      const message2: ChannelMessage = {
        messageId: 'msg-2',
        channelName: 'test-channel',
        senderId: 'agent-2',
        content: 'World',
        timestamp: 2000,
        recipients: ['agent-1']
      }

      // Send messages
      channelManager.sendToChannel(message1)
      channelManager.sendToChannel(message2)

      // Check message count
      expect(channelManager.getMessageCount('test-channel')).toBe(2)

      // Check history
      const history = channelManager.getHistory('test-channel')
      expect(history).toHaveLength(2)
      expect(history[0]).toEqual(message1)
      expect(history[1]).toEqual(message2)
    })

    it('should evict oldest messages when exceeding max history size', () => {
      channelManager = new ChannelManager(2) // Very small size for testing
      channelManager.createChannel('test-channel')

      // Send more messages than max size
      for (let i = 0; i < 5; i++) {
        const message: ChannelMessage = {
          messageId: `msg-${i}`,
          channelName: 'test-channel',
          senderId: 'agent-1',
          content: `Message ${i}`,
          timestamp: 1000 + i,
          recipients: ['agent-2']
        }
        channelManager.sendToChannel(message)
      }

      // Should only have 2 most recent messages
      const history = channelManager.getHistory('test-channel')
      expect(history).toHaveLength(2)
      expect(history[0].messageId).toBe('msg-3')
      expect(history[1].messageId).toBe('msg-4')
    })
  })

  describe('Query Methods', () => {
    beforeEach(() => {
      channelManager.createChannel('test-channel')
      
      // Add test messages
      const messages: ChannelMessage[] = [
        {
          messageId: 'msg-1',
          channelName: 'test-channel',
          senderId: 'agent-1',
          content: 'Hello',
          timestamp: 1000,
          recipients: ['agent-2']
        },
        {
          messageId: 'msg-2',
          channelName: 'test-channel',
          senderId: 'agent-2',
          content: 'World',
          timestamp: 2000,
          recipients: ['agent-1']
        },
        {
          messageId: 'msg-3',
          channelName: 'test-channel',
          senderId: 'agent-1',
          content: 'Test',
          timestamp: 3000,
          recipients: ['agent-2']
        }
      ]

      for (const message of messages) {
        channelManager.sendToChannel(message)
      }
    })

    it('getHistory should return all messages by default', () => {
      const history = channelManager.getHistory('test-channel')
      expect(history).toHaveLength(3)
    })

    it('getHistory should support limit and offset', () => {
      const history = channelManager.getHistory('test-channel', { limit: 2, offset: 1 })
      expect(history).toHaveLength(2)
      expect(history[0].messageId).toBe('msg-2')
      expect(history[1].messageId).toBe('msg-3')
    })

    it('getHistory should filter by senderId', () => {
      const history = channelManager.getHistory('test-channel', { senderId: 'agent-1' })
      expect(history).toHaveLength(2)
      expect(history[0].senderId).toBe('agent-1')
      expect(history[1].senderId).toBe('agent-1')
    })

    it('getHistory should filter by time range', () => {
      const history = channelManager.getHistory('test-channel', {
        fromTimestamp: 1500,
        toTimestamp: 2500
      })
      expect(history).toHaveLength(1)
      expect(history[0].messageId).toBe('msg-2')
    })

    it('getHistory should sort by timestamp', () => {
      const historyAsc = channelManager.getHistory('test-channel', { sortBy: 'asc' })
      expect(historyAsc[0].timestamp).toBe(1000)
      expect(historyAsc[2].timestamp).toBe(3000)

      const historyDesc = channelManager.getHistory('test-channel', { sortBy: 'desc' })
      expect(historyDesc[0].timestamp).toBe(3000)
      expect(historyDesc[2].timestamp).toBe(1000)
    })

    it('getRecentMessages should return most recent messages', () => {
      const recent = channelManager.getRecentMessages('test-channel', 2)
      expect(recent).toHaveLength(2)
      expect(recent[0].messageId).toBe('msg-2')
      expect(recent[1].messageId).toBe('msg-3')
    })

    it('searchBySender should filter messages by sender', () => {
      const messages = channelManager.searchBySender('test-channel', 'agent-1')
      expect(messages).toHaveLength(2)
      expect(messages[0].senderId).toBe('agent-1')
      expect(messages[1].senderId).toBe('agent-1')
    })

    it('searchByTimeRange should filter messages by time range', () => {
      const messages = channelManager.searchByTimeRange('test-channel', 1500, 2500)
      expect(messages).toHaveLength(1)
      expect(messages[0].messageId).toBe('msg-2')
    })
  })

  describe('Snapshot Support', () => {
    it('should serialize and deserialize channel histories', () => {
      channelManager.createChannel('test-channel')
      
      const message: ChannelMessage = {
        messageId: 'msg-1',
        channelName: 'test-channel',
        senderId: 'agent-1',
        content: 'Test message',
        timestamp: 1000,
        recipients: ['agent-2']
      }

      channelManager.sendToChannel(message)

      // Get channel histories
      const histories = channelManager.getChannelHistories()
      expect(histories).toHaveLength(1)
      expect(histories[0].channelName).toBe('test-channel')
      expect(histories[0].messages).toHaveLength(1)
      expect(histories[0].messages[0]).toEqual(message)

      // Create new channel manager and restore
      const newChannelManager = new ChannelManager()
      newChannelManager.restoreChannelHistories(histories)

      // Verify restoration
      const restoredHistory = newChannelManager.getHistory('test-channel')
      expect(restoredHistory).toHaveLength(1)
      expect(restoredHistory[0]).toEqual(message)
    })
  })

  describe('Error Handling', () => {
    it('should throw error for non-existent channel', () => {
      expect(() => channelManager.getHistory('non-existent')).toThrow('Channel non-existent not found')
      expect(() => channelManager.getMessageCount('non-existent')).toThrow('Channel non-existent not found')
    })
  })
})
