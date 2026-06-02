import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ContextStore } from '../context-store'
import { ContextKeyNotification } from '@roo-code/types'

describe('ContextStore Atomic Operations', () => {
  let contextStore: ContextStore

  beforeEach(() => {
    contextStore = new ContextStore()
  })

  // --- Compare-and-Set ---
  describe('compareAndSet', () => {
    it('should succeed when expected value matches current value', () => {
      contextStore.setKey('agent-1', 'counter', 5)
      const result = contextStore.compareAndSet('agent-2', 'counter', 5, 10)

      expect(result.success).toBe(true)
      expect(result.previousValue).toBe(5)
      expect(result.newValue).toBe(10)
      expect(result.notification).not.toBeNull()

      const entry = contextStore.getKey('counter')
      expect(entry?.value).toBe(10)
    })

    it('should fail when expected value does not match current value', () => {
      contextStore.setKey('agent-1', 'counter', 5)
      const result = contextStore.compareAndSet('agent-2', 'counter', 3, 10)

      expect(result.success).toBe(false)
      expect(result.previousValue).toBe(5)
      expect(result.newValue).toBe(10)
      expect(result.notification).toBeNull()

      // Value should remain unchanged
      const entry = contextStore.getKey('counter')
      expect(entry?.value).toBe(5)
    })

    it('should succeed when key does not exist and expected is undefined', () => {
      const result = contextStore.compareAndSet('agent-1', 'new-key', undefined, 'initial')

      expect(result.success).toBe(true)
      expect(result.previousValue).toBe(undefined)
      expect(result.newValue).toBe('initial')

      const entry = contextStore.getKey('new-key')
      expect(entry?.value).toBe('initial')
    })

    it('should fail when key exists but expected is undefined', () => {
      contextStore.setKey('agent-1', 'existing-key', 'some-value')
      const result = contextStore.compareAndSet('agent-2', 'existing-key', undefined, 'new-value')

      expect(result.success).toBe(false)
    })

    it('should handle NaN correctly with Object.is semantics', () => {
      contextStore.setKey('agent-1', 'nan-key', NaN)
      const result = contextStore.compareAndSet('agent-2', 'nan-key', NaN, 0)

      expect(result.success).toBe(true) // Object.is(NaN, NaN) === true
    })

    it('should handle -0 vs 0 correctly with Object.is semantics', () => {
      contextStore.setKey('agent-1', 'zero-key', 0)
      const result = contextStore.compareAndSet('agent-2', 'zero-key', -0, 1)

      expect(result.success).toBe(false) // Object.is(0, -0) === false
    })

    it('should notify subscribers on successful CAS', () => {
      contextStore.setKey('agent-1', 'shared-key', 'v1')
      const callback = vi.fn()
      contextStore.subscribeToKey('agent-3', 'shared-key', callback)

      contextStore.compareAndSet('agent-2', 'shared-key', 'v1', 'v2')

      expect(callback).toHaveBeenCalledTimes(1)
      const notification = callback.mock.calls[0][0] as ContextKeyNotification
      expect(notification.key).toBe('shared-key')
      expect(notification.oldValue).toBe('v1')
      expect(notification.newValue).toBe('v2')
    })

    it('should NOT notify subscribers on failed CAS', () => {
      contextStore.setKey('agent-1', 'shared-key', 'v1')
      const callback = vi.fn()
      contextStore.subscribeToKey('agent-3', 'shared-key', callback)

      contextStore.compareAndSet('agent-2', 'shared-key', 'wrong', 'v2')

      expect(callback).not.toHaveBeenCalled()
    })
  })

  // --- Transactional Update ---
  describe('transactionalUpdate', () => {
    it('should apply all updates atomically without CAS checks', () => {
      contextStore.setKey('agent-1', 'key-a', 'a1')
      contextStore.setKey('agent-1', 'key-b', 'b1')

      const result = contextStore.transactionalUpdate('agent-2', [
        { key: 'key-a', value: 'a2' },
        { key: 'key-b', value: 'b2' },
      ])

      expect(result.success).toBe(true)
      expect(result.appliedUpdates.length).toBe(2)
      expect(result.notifications.length).toBe(2)
      expect(result.error).toBeNull()

      expect(contextStore.getKey('key-a')?.value).toBe('a2')
      expect(contextStore.getKey('key-b')?.value).toBe('b2')
    })

    it('should apply all updates atomically with matching CAS checks', () => {
      contextStore.setKey('agent-1', 'key-a', 'a1')
      contextStore.setKey('agent-1', 'key-b', 'b1')

      const expectedValues = new Map<string, unknown>()
      expectedValues.set('key-a', 'a1')
      expectedValues.set('key-b', 'b1')

      const result = contextStore.transactionalUpdate('agent-2', [
        { key: 'key-a', value: 'a2' },
        { key: 'key-b', value: 'b2' },
      ], expectedValues)

      expect(result.success).toBe(true)
      expect(result.appliedUpdates.length).toBe(2)
      expect(contextStore.getKey('key-a')?.value).toBe('a2')
      expect(contextStore.getKey('key-b')?.value).toBe('b2')
    })

    it('should fail entire transaction when any CAS check fails', () => {
      contextStore.setKey('agent-1', 'key-a', 'a1')
      contextStore.setKey('agent-1', 'key-b', 'b1')

      const expectedValues = new Map<string, unknown>()
      expectedValues.set('key-a', 'a1')
      expectedValues.set('key-b', 'wrong') // This will fail

      const result = contextStore.transactionalUpdate('agent-2', [
        { key: 'key-a', value: 'a2' },
        { key: 'key-b', value: 'b2' },
      ], expectedValues)

      expect(result.success).toBe(false)
      expect(result.appliedUpdates.length).toBe(0)
      expect(result.notifications.length).toBe(0)
      expect(result.error).toContain('CAS check failed')

      // Values should remain unchanged
      expect(contextStore.getKey('key-a')?.value).toBe('a1')
      expect(contextStore.getKey('key-b')?.value).toBe('b1')
    })

    it('should handle updates to keys that do not yet exist', () => {
      const result = contextStore.transactionalUpdate('agent-1', [
        { key: 'new-key-1', value: 'val1' },
        { key: 'new-key-2', value: 'val2' },
      ])

      expect(result.success).toBe(true)
      expect(contextStore.getKey('new-key-1')?.value).toBe('val1')
      expect(contextStore.getKey('new-key-2')?.value).toBe('val2')
    })

    it('should notify subscribers for all updated keys', () => {
      contextStore.setKey('agent-1', 'key-a', 'a1')
      contextStore.setKey('agent-1', 'key-b', 'b1')

      const callbackA = vi.fn()
      const callbackB = vi.fn()
      contextStore.subscribeToKey('agent-3', 'key-a', callbackA)
      contextStore.subscribeToKey('agent-3', 'key-b', callbackB)

      contextStore.transactionalUpdate('agent-2', [
        { key: 'key-a', value: 'a2' },
        { key: 'key-b', value: 'b2' },
      ])

      expect(callbackA).toHaveBeenCalledTimes(1)
      expect(callbackB).toHaveBeenCalledTimes(1)
    })

    it('should skip CAS check for keys not in expectedValues map', () => {
      contextStore.setKey('agent-1', 'key-a', 'a1')
      contextStore.setKey('agent-1', 'key-b', 'b1')

      const expectedValues = new Map<string, unknown>()
      expectedValues.set('key-a', 'a1')
      // key-b not in expectedValues — no CAS check for it

      const result = contextStore.transactionalUpdate('agent-2', [
        { key: 'key-a', value: 'a2' },
        { key: 'key-b', value: 'b2' },
      ], expectedValues)

      expect(result.success).toBe(true)
      expect(contextStore.getKey('key-a')?.value).toBe('a2')
      expect(contextStore.getKey('key-b')?.value).toBe('b2')
    })
  })

  // --- Increment ---
  describe('increment', () => {
    it('should increment an existing numeric value', () => {
      contextStore.setKey('agent-1', 'counter', 5)
      const result = contextStore.increment('agent-2', 'counter', 3)

      expect(result.success).toBe(true)
      expect(result.previousValue).toBe(5)
      expect(result.newValue).toBe(8)
      expect(result.notification).not.toBeNull()

      expect(contextStore.getKey('counter')?.value).toBe(8)
    })

    it('should decrement with negative delta', () => {
      contextStore.setKey('agent-1', 'counter', 10)
      const result = contextStore.increment('agent-2', 'counter', -3)

      expect(result.success).toBe(true)
      expect(result.previousValue).toBe(10)
      expect(result.newValue).toBe(7)
    })

    it('should treat missing key as 0 + delta', () => {
      const result = contextStore.increment('agent-1', 'new-counter', 5)

      expect(result.success).toBe(true)
      expect(result.previousValue).toBe(0)
      expect(result.newValue).toBe(5)
      expect(contextStore.getKey('new-counter')?.value).toBe(5)
    })

    it('should fail when current value is not a number', () => {
      contextStore.setKey('agent-1', 'text-key', 'hello')
      const result = contextStore.increment('agent-2', 'text-key', 1)

      expect(result.success).toBe(false)
      expect(result.notification).toBeNull()

      // Value should remain unchanged
      expect(contextStore.getKey('text-key')?.value).toBe('hello')
    })

    it('should notify subscribers on successful increment', () => {
      contextStore.setKey('agent-1', 'counter', 5)
      const callback = vi.fn()
      contextStore.subscribeToKey('agent-3', 'counter', callback)

      contextStore.increment('agent-2', 'counter', 3)

      expect(callback).toHaveBeenCalledTimes(1)
      const notification = callback.mock.calls[0][0] as ContextKeyNotification
      expect(notification.oldValue).toBe(5)
      expect(notification.newValue).toBe(8)
    })

    it('should NOT notify subscribers on failed increment', () => {
      contextStore.setKey('agent-1', 'text-key', 'hello')
      const callback = vi.fn()
      contextStore.subscribeToKey('agent-3', 'text-key', callback)

      contextStore.increment('agent-2', 'text-key', 1)

      expect(callback).not.toHaveBeenCalled()
    })
  })

  // --- Subscription Notification Integration ---
  describe('subscription notifications', () => {
    it('should not notify the setter agent', () => {
      contextStore.setKey('agent-1', 'key', 'v1')
      const callback = vi.fn()
      contextStore.subscribeToKey('agent-1', 'key', callback)

      contextStore.setKey('agent-1', 'key', 'v2')

      expect(callback).not.toHaveBeenCalled()
    })

    it('should notify other subscribers when setter is different', () => {
      contextStore.setKey('agent-1', 'key', 'v1')
      const callback2 = vi.fn()
      const callback3 = vi.fn()
      contextStore.subscribeToKey('agent-2', 'key', callback2)
      contextStore.subscribeToKey('agent-3', 'key', callback3)

      contextStore.setKey('agent-1', 'key', 'v2')

      expect(callback2).toHaveBeenCalledTimes(1)
      expect(callback3).toHaveBeenCalledTimes(1)
    })

    it('should unsubscribe correctly and stop receiving notifications', () => {
      contextStore.setKey('agent-1', 'key', 'v1')
      const callback = vi.fn()
      contextStore.subscribeToKey('agent-2', 'key', callback)

      contextStore.setKey('agent-1', 'key', 'v2')
      expect(callback).toHaveBeenCalledTimes(1)

      contextStore.unsubscribeFromKey('agent-2', 'key')

      contextStore.setKey('agent-1', 'key', 'v3')
      expect(callback).toHaveBeenCalledTimes(1) // Still only 1 — no new notification
    })

    it('should handle multiple rapid updates', () => {
      contextStore.setKey('agent-1', 'key', 'v1')
      const callback = vi.fn()
      contextStore.subscribeToKey('agent-2', 'key', callback)

      contextStore.setKey('agent-1', 'key', 'v2')
      contextStore.setKey('agent-1', 'key', 'v3')
      contextStore.setKey('agent-1', 'key', 'v4')

      expect(callback).toHaveBeenCalledTimes(3)
    })
  })
})