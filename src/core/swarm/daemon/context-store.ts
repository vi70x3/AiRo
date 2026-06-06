import { 
  ContextKeyEntry, 
  ContextKeyNotification
} from '@roo-code/types'

export interface CompareAndSetResult {
  success: boolean
  previousValue: unknown
  newValue: unknown
  notification: ContextKeyNotification | null
}

export interface TransactionalUpdateEntry {
  key: string
  value: unknown
}

export interface TransactionalUpdateResult {
  success: boolean
  appliedUpdates: TransactionalUpdateEntry[]
  notifications: ContextKeyNotification[]
  error: string | null
}

export interface IncrementResult {
  success: boolean
  previousValue: number
  newValue: number
  notification: ContextKeyNotification | null
}

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
    this.notifySubscribers(key, agentId, notification)
    
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

  // --- Atomic Operations ---
  
  /**
   * Compare-and-set: only update the key if its current value matches the expected value.
   * This is an optimistic concurrency primitive — agents can check that no other agent
   * has modified the value since they last read it.
   *
   * @param agentId - The agent attempting the update
   * @param key - The context key to update
   * @param expectedValue - The value the agent expects to find (if different, CAS fails)
   * @param newValue - The value to set if the expected value matches
   * @returns CompareAndSetResult indicating success/failure and the notification (if successful)
   */
  compareAndSet(agentId: string, key: string, expectedValue: unknown, newValue: unknown): CompareAndSetResult {
    const currentEntry = this.keys.get(key)
    const currentValue = currentEntry ? currentEntry.value : undefined

    // Use Object.is for comparison to handle NaN, -0, etc. correctly
    if (!Object.is(currentValue, expectedValue)) {
      return {
        success: false,
        previousValue: currentValue,
        newValue,
        notification: null,
      }
    }

    // Value matches — proceed with the set
    const notification = this.setKey(agentId, key, newValue)

    return {
      success: true,
      previousValue: expectedValue,
      newValue,
      notification,
    }
  }

  /**
   * Transactional multi-key update: apply all updates atomically.
   * If any key's CAS check fails, the entire transaction is rolled back.
   * This ensures that related context keys are always consistent.
   *
   * @param agentId - The agent attempting the transaction
   * @param updates - Array of { key, value } pairs to update
   * @param expectedValues - Optional map of key → expectedValue for CAS checks.
   *                         If provided, each key is checked before update.
   *                         If not provided, updates are applied without CAS checks.
   * @returns TransactionalUpdateResult indicating success/failure, applied updates, and notifications
   */
  transactionalUpdate(
    agentId: string,
    updates: TransactionalUpdateEntry[],
    expectedValues?: Map<string, unknown>
  ): TransactionalUpdateResult {
    // Phase 1: Validate all CAS checks (if provided)
    if (expectedValues) {
      for (const update of updates) {
        const currentEntry = this.keys.get(update.key)
        const currentValue = currentEntry ? currentEntry.value : undefined
        const expected = expectedValues.get(update.key)

        if (expected !== undefined && !Object.is(currentValue, expected)) {
          return {
            success: false,
            appliedUpdates: [],
            notifications: [],
            error: `CAS check failed for key '${update.key}': expected ${JSON.stringify(expected)}, found ${JSON.stringify(currentValue)}`,
          }
        }
      }
    }

    // Phase 2: Snapshot current state for rollback
    const snapshot: Map<string, ContextKeyEntry | undefined> = new Map()
    for (const update of updates) {
      snapshot.set(update.key, this.keys.get(update.key))
    }

    // Phase 3: Apply all updates
    const notifications: ContextKeyNotification[] = []
    const appliedUpdates: TransactionalUpdateEntry[] = []

    try {
      for (const update of updates) {
        const notification = this.setKey(agentId, update.key, update.value)
        notifications.push(notification)
        appliedUpdates.push(update)
      }

      return {
        success: true,
        appliedUpdates,
        notifications,
        error: null,
      }
    } catch (err) {
      // Phase 4: Rollback on error
      for (const [key, entry] of snapshot) {
        if (entry) {
          this.keys.set(key, entry)
        } else {
          this.keys.delete(key)
        }
      }

      return {
        success: false,
        appliedUpdates: [],
        notifications: [],
        error: `Transaction failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  /**
   * Atomic increment: add a delta to a numeric context key.
   * If the key doesn't exist, it's treated as 0 + delta.
   * If the key's current value is not a number, the operation fails.
   *
   * @param agentId - The agent performing the increment
   * @param key - The context key to increment
   * @param delta - The amount to add (can be negative for decrement)
   * @returns IncrementResult indicating success/failure and the notification (if successful)
   */
  increment(agentId: string, key: string, delta: number): IncrementResult {
    const currentEntry = this.keys.get(key)
    const currentValue = currentEntry ? currentEntry.value : undefined

    // Check that current value is a number (or undefined/missing, treated as 0)
    if (currentValue !== undefined && typeof currentValue !== 'number') {
      return {
        success: false,
        previousValue: currentValue as number,
        newValue: currentValue as number,
        notification: null,
      }
    }

    const previousNumber = (currentValue as number) ?? 0
    const newNumber = previousNumber + delta

    const notification = this.setKey(agentId, key, newNumber)

    return {
      success: true,
      previousValue: previousNumber,
      newValue: newNumber,
      notification,
    }
  }

  // --- Private Helpers ---
  
  /**
   * Notify all subscribers of a key change, excluding the setter agent.
   */
  private notifySubscribers(key: string, setterAgentId: string, notification: ContextKeyNotification): void {
    const keySubscriptions = this.subscriptions.get(key)
    if (keySubscriptions) {
      for (const [subscriberId, callback] of keySubscriptions) {
        if (subscriberId !== setterAgentId) {
          callback(notification)
        }
      }
    }
  }
}