import { 
  ContextKeyEntry, 
  ContextKeyNotification 
} from '@roo-code/types'

export class ContextStore {
  private keys: Map<string, ContextKeyEntry> = new Map()
  private subscriptions: Map<string, Map<string, (notification: ContextKeyNotification) => void>> = new Map()
  
  setKey(agentId: string, key: string, value: unknown): ContextKeyNotification {
    const oldEntry = this.keys.get(key)
    const oldValue = oldEntry ? oldEntry.value : undefined
    
    const newEntry: ContextKeyEntry = {
      key,
      value,
      setterAgentId: agentId,
      updatedAt: Date.now(),
      subscribers: oldEntry ? oldEntry.subscribers : []
    }
    
    this.keys.set(key, newEntry)
    
    const notification: ContextKeyNotification = {
      notificationId: `context-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      key,
      oldValue,
      newValue: value,
      setterAgentId: agentId,
      timestamp: Date.now()
    }
    
    // Notify subscribers
    const keySubscriptions = this.subscriptions.get(key)
    if (keySubscriptions) {
      for (const [subscriberId, callback] of keySubscriptions) {
        if (subscriberId !== agentId) { // Don't notify the setter
          callback(notification)
        }
      }
    }
    
    return notification
  }
  
  getKey(key: string): ContextKeyEntry | undefined {
    return this.keys.get(key)
  }
  
  listKeys(): ContextKeyEntry[] {
    return Array.from(this.keys.values())
  }
  
  subscribeToKey(agentId: string, key: string, callback: (notification: ContextKeyNotification) => void): void {
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Map())
    }
    
    this.subscriptions.get(key)!.set(agentId, callback)
    
    // Add agent to subscribers list in the key entry
    const entry = this.keys.get(key)
    if (entry) {
      if (!entry.subscribers.includes(agentId)) {
        entry.subscribers = [...entry.subscribers, agentId]
      }
    } else {
      // Create a basic entry for tracking subscribers
      this.keys.set(key, {
        key,
        value: undefined,
        setterAgentId: '',
        updatedAt: Date.now(),
        subscribers: [agentId]
      })
    }
  }
  
  unsubscribeFromKey(agentId: string, key: string): void {
    const keySubscriptions = this.subscriptions.get(key)
    if (keySubscriptions) {
      keySubscriptions.delete(agentId)
    }
    
    // Remove agent from subscribers list in the key entry
    const entry = this.keys.get(key)
    if (entry) {
      entry.subscribers = entry.subscribers.filter(id => id !== agentId)
    }
  }
  
  deleteKey(key: string): boolean {
    this.subscriptions.delete(key)
    return this.keys.delete(key)
  }
}