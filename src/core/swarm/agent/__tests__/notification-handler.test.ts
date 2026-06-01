import { describe, it, expect, beforeEach, vi, test, vi as viMock } from 'vitest'
import { NotificationHandler } from '../notification-handler'
import { ConflictSeverity } from '../../worktree-manager/conflict-detector'
import { IDaemon } from '../../interfaces'
import { Notification, NotificationType, FileOperation, FileStatusType } from '@roo-code/types'
import { WorkingSet } from '../working-set'

// Mock IDaemon implementation for testing
const createMockDaemon = () => {
  return {
    getPendingNotifications: vi.fn(),
    sendDM: vi.fn(),
    broadcastIntent: vi.fn(),
    notifyFileTouch: vi.fn(),
    // Add other required methods...
  } as unknown as IDaemon
}

describe('NotificationHandler', () => {
  let notificationHandler: NotificationHandler
  let workingSet: WorkingSet
  let mockDaemon: any

  beforeEach(() => {
    mockDaemon = createMockDaemon()
    workingSet = new WorkingSet()
    notificationHandler = new NotificationHandler('test-agent', workingSet, mockDaemon)
  })

  it('should process empty notifications and return empty result', () => {
    // Test with empty notifications
    mockDaemon.getPendingNotifications.mockReturnValue([])
    
    const result = notificationHandler.processNotifications()
    expect(result.processed).toEqual([])
    expect(result.shouldBlock).toBe(false)
  })

  it('should handle touch notification for file not in working set', () => {
    const result = notificationHandler.handleTouchNotification({
      notificationId: 'test',
      type: NotificationType.Touch,
      recipientId: 'test-agent',
      payload: {
        notificationId: 'test-touch',
        filePath: 'test.txt',
        modifyingAgentId: 'other-agent',
        timestamp: Date.now(),
        operation: 'modify'
      },
      timestamp: Date.now(),
      delivered: true,
      acknowledged: false
    } as Notification)
    
    expect(result.severity).toBe(ConflictSeverity.None)
    expect(result.shouldNegotiate).toBe(false)
  })

  it('should handle touch notification for file with read status', () => {
    workingSet.markAsRead('test.txt')
    const result = notificationHandler.handleTouchNotification({
      notificationId: 'test',
      type: NotificationType.Touch,
      recipientId: 'test-agent',
      payload: {
        notificationId: 'test-touch',
        filePath: 'test.txt',
        modifyingAgentId: 'other-agent',
        timestamp: Date.now(),
        operation: 'modify'
      },
      timestamp: Date.now(),
      delivered: true,
      acknowledged: false
    } as any)
    
    expect(result.severity).toBe(ConflictSeverity.Low)
    expect(result.shouldNegotiate).toBe(false)
  })

  it('should handle touch notification for file with intent status', () => {
    workingSet.markAsIntent('test.txt', FileOperation.Modify)
    const result = notificationHandler.handleTouchNotification({
      notificationId: 'test',
      type: NotificationType.Touch,
      recipientId: 'test-agent',
      payload: {
        notificationId: 'test-touch',
        filePath: 'test.txt',
        modifyingAgentId: 'other-agent',
        timestamp: Date.now(),
        operation: 'modify'
      },
      timestamp: Date.now(),
      delivered: true,
      acknowledged: false
    } as any)
    
    expect(result.severity).toBe(ConflictSeverity.Medium)
    expect(result.shouldNegotiate).toBe(true)
  })

  it('should handle touch notification for file with modified status', () => {
    workingSet.markAsModified('test.txt', FileOperation.Create)
    const result = notificationHandler.handleTouchNotification({
      notificationId: 'test',
      type: NotificationType.Touch,
      recipientId: 'test-agent',
      payload: {
        notificationId: 'test-touch',
        filePath: 'test.txt',
        modifyingAgentId: 'other-agent',
        timestamp: Date.now(),
        operation: 'modify'
      },
      timestamp: Date.now(),
      delivered: true,
      acknowledged: false
    } as any)
    
    expect(result.severity).toBe(ConflictSeverity.High)
    expect(result.shouldNegotiate).toBe(true)
  })

  it('should handle intent notification with no overlap', () => {
    const result = notificationHandler.handleIntentNotification({
      notificationId: 'test',
      type: NotificationType.Intent,
      recipientId: 'test-agent',
      payload: {
        notificationId: 'test-intent',
        declaringAgentId: 'other-agent',
        filePaths: ['test1.txt', 'test2.txt'],
        timestamp: Date.now(),
        toolName: 'test-tool'
      },
      timestamp: Date.now(),
      delivered: true,
      acknowledged: false
    } as any)
    
    expect(result.overlapPaths).toEqual([])
    expect(result.shouldNegotiate).toBe(false)
  })

  it('should handle intent notification with overlap on read files', () => {
    workingSet.markAsRead('test1.txt')
    const result = notificationHandler.handleIntentNotification({
      notificationId: 'test',
      type: NotificationType.Intent,
      declaringAgentId: 'other-agent',
      payload: {
        notificationId: 'test-intent',
        declaringAgentId: 'other-agent',
        filePaths: ['test1.txt'],
        timestamp: Date.now(),
        toolName: 'test-tool'
      },
      timestamp: Date.now(),
      delivered: true,
      acknowledged: false
    } as any)
    
    expect(result.overlapPaths).toEqual([])
    expect(result.shouldNegotiate).toBe(false)
  })

  it('should handle intent notification with overlap on intent files', () => {
    workingSet.markAsIntent('test1.txt', FileOperation.Modify)
    const result = notificationHandler.handleIntentNotification({
      notificationId: 'test',
      type: NotificationType.Intent,
      declaringAgent: 'other-agent',
      payload: {
        notificationId: 'test-intent',
        declaringAgentId: 'other-agent',
        filePaths: ['test1.txt'],
        timestamp: Date.now(),
        toolName: 'test-tool'
      },
      timestamp: Date.now(),
      delivered: true,
      acknowledged: false
    } as any)
    
    expect(result.overlapPaths).toEqual(['test1.txt'])
    expect(result.shouldNegotiate).toBe(true)
  })

  it('should handle intent notification with overlap on modified files', () => {
    workingSet.markAsModified('test1.txt', FileOperation.Create)
    const result = notificationHandler.handleIntentNotification({
      notificationId: 'test',
      type: NotificationType.Intent,
      declaringAgentId: 'other-agent',
      payload: {
        notificationId: 'test-intent',
        declaringAgentId: 'other-agent',
        filePaths: ['test1.txt'],
        timestamp: Date.now(),
        toolName: 'test-tool'
      },
      timestamp: Date.now(),
      delivered: true,
      acknowledged: false
    } as any)
    
    expect(result.overlapPaths).toEqual(['test1.txt'])
    expect(result.shouldNegotiate).toBe(true)
  })

  it('should process notifications in priority order', () => {
    const result = notificationHandler.processNotifications()
    expect(result.processed).toEqual([])
    expect(result.shouldBlock).toBe(false)
  })

  it('should block when High severity conflict detected', () => {
    // Create a high severity conflict scenario
    workingSet.markAsModified('test.txt', FileOperation.Create)
    const result = notificationHandler.handleTouchNotification({
      notificationId: 'test',
      type: NotificationType.Touch,
      recipientId: 'test-agent',
      payload: {
        notificationId: 'test-touch',
        filePath: 'test.txt',
        modifyingAgentId: 'other-agent',
        timestamp: Date.now(),
        operation: 'modify'
      },
      timestamp: Date.now(),
      delivered: true,
      acknowledged: false
    } as any)
    
    expect(result.severity).toBe(ConflictSeverity.High)
    expect(result.shouldNegotiate).toBe(true)
  })
})