import { describe, it, expect, beforeEach } from 'vitest'
import { ChannelManager } from '../channel-manager'
import { ChannelMessage } from '@roo-code/types'

describe('ChannelManager', () => {
  let channelManager: ChannelManager
  
  beforeEach(() => {
    channelManager = new ChannelManager()
  })
  
  it('should create channels and manage memberships', () => {
    // Create a channel
    const channel = channelManager.createChannel('test-channel', 'Test Channel')
    expect(channel).toBeDefined()
    expect(channel.name).toBe('test-channel')
    
    // Join a channel
    channelManager.joinChannel('agent-1', 'test-channel')
    const members = channelManager.getChannelMembers('test-channel')
    expect(members).toContain('agent-1')
    
    // Leave a channel
    channelManager.leaveChannel('agent-1', 'test-channel')
    const updatedMembers = channelManager.getChannelMembers('test-channel')
    expect(updatedMembers).not.toContain('agent-1')
  })
  
  it('should handle channel messaging', () => {
    // Create a channel and add members
    channelManager.createChannel('test-channel')
    channelManager.joinChannel('agent-1', 'test-channel')
    channelManager.joinChannel('agent-2', 'test-channel')
    
    const message: ChannelMessage = {
      messageId: 'msg-1',
      channelName: 'test-channel',
      senderId: 'agent-1',
      content: 'test message',
      timestamp: Date.now(),
      recipients: []
    }
    
    // Send message to channel
    const recipients = channelManager.sendToChannel(message)
    expect(recipients).toContain('agent-2')
    expect(recipients).not.toContain('agent-1') // sender should be excluded
  })
})