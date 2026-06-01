import {
  ChannelInfo,
  ChannelMessage,
  ChannelHistoryEntry,
  HistoryQueryOptions
} from '@roo-code/types'

export class ChannelManager {
  private channels: Map<string, ChannelInfo> = new Map()
  private memberships: Map<string, Set<string>> = new Map()
  private messageHistory: Map<string, ChannelMessage[]> = new Map()
  private maxHistorySize: number

  constructor(maxHistorySize: number = 1000) {
    this.maxHistorySize = maxHistorySize
  }

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
    this.messageHistory.set(name, [])

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

    // Store message in history
    const history = this.messageHistory.get(message.channelName)
    if (history) {
      history.push(message)
      // Evict oldest messages if exceeding max size
      if (history.length > this.maxHistorySize) {
        history.splice(0, history.length - this.maxHistorySize)
      }
    }

    // Update message count
    channel.messageCount += 1

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
    return channel.messageCount
  }

  // Message history query methods

  getHistory(channelName: string, options?: HistoryQueryOptions): ChannelMessage[] {
    const history = this.messageHistory.get(channelName)
    if (!history) {
      throw new Error(`Channel ${channelName} not found`)
    }

    let result = [...history]

    // Apply filters
    if (options?.senderId !== undefined) {
      result = result.filter(m => m.senderId === options.senderId)
    }
    if (options?.fromTimestamp !== undefined) {
      result = result.filter(m => m.timestamp >= options.fromTimestamp!)
    }
    if (options?.toTimestamp !== undefined) {
      result = result.filter(m => m.timestamp <= options.toTimestamp!)
    }

    // Apply sort
    if (options?.sortBy === 'desc') {
      result.sort((a, b) => b.timestamp - a.timestamp)
    } else {
      result.sort((a, b) => a.timestamp - b.timestamp)
    }

    // Apply offset and limit
    const offset = options?.offset ?? 0
    const limit = options?.limit
    if (limit !== undefined) {
      result = result.slice(offset, offset + limit)
    } else if (offset > 0) {
      result = result.slice(offset)
    }

    return result
  }

  getRecentMessages(channelName: string, count: number): ChannelMessage[] {
    const history = this.messageHistory.get(channelName)
    if (!history) {
      throw new Error(`Channel ${channelName} not found`)
    }

    if (count >= history.length) {
      return [...history]
    }

    return history.slice(history.length - count)
  }

  searchBySender(channelName: string, senderId: string): ChannelMessage[] {
    const history = this.messageHistory.get(channelName)
    if (!history) {
      throw new Error(`Channel ${channelName} not found`)
    }

    return history.filter(m => m.senderId === senderId)
  }

  searchByTimeRange(channelName: string, fromTimestamp: number, toTimestamp: number): ChannelMessage[] {
    const history = this.messageHistory.get(channelName)
    if (!history) {
      throw new Error(`Channel ${channelName} not found`)
    }

    return history.filter(m => m.timestamp >= fromTimestamp && m.timestamp <= toTimestamp)
  }

  getMessageCount(channelName: string): number {
    const history = this.messageHistory.get(channelName)
    if (!history) {
      throw new Error(`Channel ${channelName} not found`)
    }

    return history.length
  }

  // Snapshot support

  getChannelHistories(): ChannelHistoryEntry[] {
    const entries: ChannelHistoryEntry[] = []
    for (const [channelName, messages] of this.messageHistory.entries()) {
      if (this.channels.has(channelName)) {
        entries.push({
          channelName,
          messages: [...messages]
        })
      }
    }
    return entries
  }

  restoreChannelHistories(entries: ChannelHistoryEntry[]): void {
    for (const entry of entries) {
      // Ensure the channel exists
      if (!this.channels.has(entry.channelName)) {
        this.createChannel(entry.channelName)
      }
      this.messageHistory.set(entry.channelName, [...entry.messages])
      // Update message count on the channel
      const channel = this.channels.get(entry.channelName)
      if (channel) {
        channel.messageCount = entry.messages.length
      }
    }
  }
}
