import { 
  ChannelInfo, 
  ChannelMessage 
} from '@roo-code/types'

export class ChannelManager {
  private channels: Map<string, ChannelInfo> = new Map()
  private memberships: Map<string, Set<string>> = new Map()
  
  createChannel(name: string, topic?: string): ChannelInfo {
    if (this.channels.has(name)) {
      throw new Error(`Channel with name ${name} already exists`)
    }
    
    const channelInfo: ChannelInfo = {
      name,
      topic: topic || null,
      createdAt: Date.now(),
      members: [],
      messageCount: 0
    }
    
    this.channels.set(name, channelInfo)
    this.memberships.set(name, new Set())
    
    return channelInfo
  }
  
  joinChannel(agentId: string, channelName: string): void {
    const channel = this.channels.get(channelName)
    if (!channel) {
      throw new Error(`Channel ${channelName} not found`)
    }
    
    const members = this.memberships.get(channelName)
    if (!members) {
      throw new Error(`Channel ${channelName} not found`)
    }
    
    members.add(agentId)
    channel.members = Array.from(members)
  }
  
  leaveChannel(agentId: string, channelName: string): void {
    const channel = this.channels.get(channelName)
    if (!channel) {
      throw new Error(`Channel ${channelName} not found`)
    }
    
    const members = this.memberships.get(channelName)
    if (!members) {
      throw new Error(`Channel ${channelName} not found`)
    }
    
    members.delete(agentId)
    channel.members = Array.from(members)
  }
  
  sendToChannel(message: ChannelMessage): string[] {
    const channel = this.channels.get(message.channelName)
    if (!channel) {
      throw new Error(`Channel ${message.channelName} not found`)
    }
    
    const members = this.memberships.get(message.channelName)
    if (!members) {
      throw new Error(`Channel ${message.channelName} not found`)
    }
    
    // Return list of recipient agentIds (all members except sender)
    return Array.from(members).filter(memberId => memberId !== message.senderId)
  }
  
  listChannels(): ChannelInfo[] {
    return Array.from(this.channels.values())
  }
  
  getChannelMembers(channelName: string): string[] {
    const members = this.memberships.get(channelName)
    if (!members) {
      throw new Error(`Channel ${channelName} not found`)
    }
    return Array.from(members)
  }
  
  getChannelInfo(channelName: string): ChannelInfo | undefined {
    return this.channels.get(channelName)
  }
  
  discoverChannels(keyword?: string): ChannelInfo[] {
    if (!keyword) {
      return this.listChannels()
    }
    
    return Array.from(this.channels.values()).filter(channel => 
      channel.name.includes(keyword) || 
      (channel.topic && channel.topic.includes(keyword))
    )
  }
  
  messageCount(channelName: string): number {
    const channel = this.channels.get(channelName)
    if (!channel) {
      throw new Error(`Channel ${channelName} not found`)
    }
    
    channel.messageCount += 1
    return channel.messageCount
  }
}