import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ContextStore } from '../context-store'
import { ContextKeyNotification } from '@roo-code/types'

describe('ContextStore', () => {
  let contextStore: ContextStore
  
  beforeEach(() => {
    contextStore = new ContextStore()
  })
  
  it('should set and get context keys', () => {
    const notification = contextStore.setKey('agent-1', 'test-key', 'test-value')
    expect(notification).toBeDefined()
    
    const entry = contextStore.getKey('test-key')
    expect(entry).toBeDefined()
    expect(entry?.value).toBe('test-value')
    expect(entry?.setterAgentId).toBe('agent-1')
  })
  
  it('should handle subscriptions', () => {
    const callback = vi.fn()
    contextStore.subscribeToKey('agent-1', 'test-key', callback)
    
    contextStore.setKey('agent-2', 'test-key', 'new-value')
    
    // Check that callback was called
    expect(callback).toHaveBeenCalled()
  })
  
  it('should list keys', () => {
    contextStore.setKey('agent-1', 'key-1', 'value-1')
    contextStore.setKey('agent-2', 'key-2', 'value-2')
    
    const keys = contextStore.listKeys()
    expect(keys.length).toBe(2)
  })
})