import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
	TouchIntentHandler,
	TouchHandlingResult,
	IntentHandlingResult,
	TouchIntentProcessingResult,
} from '../touch-intent-handler'
import { WorkingSet } from '../working-set'
import {
	Notification,
	NotificationType,
	FileOperation,
	FileStatusType,
} from '@roo-code/types'
import { ConflictSeverity } from '../../worktree-manager/conflict-detector'

// Helper to create a mock daemon
const createMockDaemon = () => {
	const sentDMs: any[] = []
	const broadcasts: any[] = []
	return {
		getPendingNotifications: vi.fn(),
		sendDM: vi.fn((msg: any) => { sentDMs.push(msg) }),
		broadcastIntent: vi.fn((...args: any[]) => { broadcasts.push(args) }),
		notifyFileTouch: vi.fn(),
		getSentDMs: () => sentDMs,
		getBroadcasts: () => broadcasts,
		clearSentDMs: () => { sentDMs.length = 0 },
		clearBroadcasts: () => { broadcasts.length = 0 },
		registerAgent: vi.fn(),
		unregisterAgent: vi.fn(),
		getAgent: vi.fn(),
		listAgents: vi.fn(() => []),
		broadcast: vi.fn(),
		setCoordinatorId: vi.fn(),
		getCoordinatorId: vi.fn(),
		setPlan: vi.fn(),
		getPlan: vi.fn(),
		joinChannel: vi.fn(),
		leaveChannel: vi.fn(),
		sendToChannel: vi.fn(),
		setContextKey: vi.fn(),
		getContextKey: vi.fn(),
		listContextKeys: vi.fn(),
		subscribeToKey: vi.fn(),
		createSnapshot: vi.fn(),
		restoreFromSnapshot: vi.fn(),
		listSnapshots: vi.fn(),
	}
}

// Helper to create a touch notification
const createTouchNotification = (
	overrides: Partial<{
		notificationId: string
		filePath: string
		modifyingAgentId: string
		operation: 'create' | 'modify' | 'delete'
	}> = {},
): Notification => {
	const now = Date.now()
	return {
		notificationId: overrides.notificationId ?? 'touch-1',
		type: NotificationType.Touch,
		recipientId: 'test-agent',
		payload: {
			notificationId: overrides.notificationId ?? 'touch-1',
			filePath: overrides.filePath ?? 'src/file.ts',
			modifyingAgentId: overrides.modifyingAgentId ?? 'other-agent',
			timestamp: now,
			operation: overrides.operation ?? 'modify',
		},
		timestamp: now,
		delivered: true,
		acknowledged: false,
	}
}

// Helper to create an intent notification
const createIntentNotification = (
	overrides: Partial<{
		notificationId: string
		declaringAgentId: string
		filePaths: string[]
		toolName: string
	}> = {},
): Notification => {
	const now = Date.now()
	return {
		notificationId: overrides.notificationId ?? 'intent-1',
		type: NotificationType.Intent,
		recipientId: 'test-agent',
		payload: {
			notificationId: overrides.notificationId ?? 'intent-1',
			declaringAgentId: overrides.declaringAgentId ?? 'other-agent',
			filePaths: overrides.filePaths ?? ['src/file.ts'],
			timestamp: now,
			toolName: overrides.toolName ?? 'write',
		},
		timestamp: now,
		delivered: true,
		acknowledged: false,
	}
}

describe('TouchIntentHandler', () => {
	let mockDaemon: ReturnType<typeof createMockDaemon>
	let workingSet: WorkingSet
	let handler: TouchIntentHandler

	beforeEach(() => {
		mockDaemon = createMockDaemon()
		workingSet = new WorkingSet()
		handler = new TouchIntentHandler('test-agent', workingSet, mockDaemon)
	})

	describe('handleTouchNotification', () => {
		it('file not in working set → severity None, no negotiation', () => {
			const notification = createTouchNotification({ filePath: 'src/unknown.ts' })
			const result = handler.handleTouchNotification(notification)

			expect(result.severity).toBe(ConflictSeverity.None)
			expect(result.shouldNegotiate).toBe(false)
			expect(result.notification.filePath).toBe('src/unknown.ts')
		})

		it('file with read status → severity Low, no negotiation', () => {
			workingSet.markAsRead('src/file.ts')
			const notification = createTouchNotification({ filePath: 'src/file.ts' })
			const result = handler.handleTouchNotification(notification)

			expect(result.severity).toBe(ConflictSeverity.Low)
			expect(result.shouldNegotiate).toBe(false)
		})

		it('file with intent status → severity Medium, should negotiate', () => {
			workingSet.markAsIntent('src/file.ts', FileOperation.Modify)
			const notification = createTouchNotification({ filePath: 'src/file.ts' })
			const result = handler.handleTouchNotification(notification)

			expect(result.severity).toBe(ConflictSeverity.Medium)
			expect(result.shouldNegotiate).toBe(true)
		})

		it('file with modified status → severity High, should negotiate', () => {
			workingSet.markAsModified('src/file.ts', FileOperation.Modify)
			const notification = createTouchNotification({ filePath: 'src/file.ts' })
			const result = handler.handleTouchNotification(notification)

			expect(result.severity).toBe(ConflictSeverity.High)
			expect(result.shouldNegotiate).toBe(true)
		})
	})

	describe('handleIntentNotification', () => {
		it('no overlap → no negotiation', () => {
			const notification = createIntentNotification({
				filePaths: ['src/other.ts'],
			})
			const result = handler.handleIntentNotification(notification)

			expect(result.overlapPaths).toEqual([])
			expect(result.shouldNegotiate).toBe(false)
		})

		it('overlap with intent status → should negotiate', () => {
			workingSet.markAsIntent('src/file.ts', FileOperation.Modify)
			const notification = createIntentNotification({
				filePaths: ['src/file.ts'],
			})
			const result = handler.handleIntentNotification(notification)

			expect(result.overlapPaths).toContain('src/file.ts')
			expect(result.shouldNegotiate).toBe(true)
		})

		it('overlap with modified status → should negotiate', () => {
			workingSet.markAsModified('src/file.ts', FileOperation.Modify)
			const notification = createIntentNotification({
				filePaths: ['src/file.ts'],
			})
			const result = handler.handleIntentNotification(notification)

			expect(result.overlapPaths).toContain('src/file.ts')
			expect(result.shouldNegotiate).toBe(true)
		})

		it('overlap with read status only → no negotiation', () => {
			workingSet.markAsRead('src/file.ts')
			const notification = createIntentNotification({
				filePaths: ['src/file.ts'],
			})
			const result = handler.handleIntentNotification(notification)

			expect(result.overlapPaths).toEqual([])
			expect(result.shouldNegotiate).toBe(false)
		})
	})

	describe('initiateNegotiation', () => {
		it('sends DM to target agent', () => {
			mockDaemon.clearSentDMs()
			handler.initiateNegotiation('target-agent', 'src/file.ts', ConflictSeverity.High)

			const sentDMs = mockDaemon.getSentDMs()
			expect(sentDMs).toHaveLength(1)
			expect(sentDMs[0].recipientId).toBe('target-agent')
			expect(sentDMs[0].senderId).toBe('test-agent')

			const content = JSON.parse(sentDMs[0].content)
			expect(content.type).toBe('negotiation_request')
			expect(content.filePath).toBe('src/file.ts')
			expect(content.severity).toBe(ConflictSeverity.High)
		})
	})

	describe('respondToNegotiation', () => {
		it('sends DM response', () => {
			mockDaemon.clearSentDMs()
			handler.respondToNegotiation('target-agent', 'conflict-1', true, 'merge')

			const sentDMs = mockDaemon.getSentDMs()
			expect(sentDMs).toHaveLength(1)
			expect(sentDMs[0].recipientId).toBe('target-agent')
			expect(sentDMs[0].senderId).toBe('test-agent')

			const content = JSON.parse(sentDMs[0].content)
			expect(content.type).toBe('negotiation_response')
			expect(content.conflictId).toBe('conflict-1')
			expect(content.accepted).toBe(true)
			expect(content.proposedStrategy).toBe('merge')
		})
	})

	describe('declareIntent', () => {
		it('adds to working set, broadcasts intent', () => {
			handler.declareIntent(['src/file1.ts', 'src/file2.ts'], 'write')

			// Check working set was updated
			expect(workingSet.has('src/file1.ts')).toBe(true)
			expect(workingSet.has('src/file2.ts')).toBe(true)

			const entry1 = workingSet.getStatus('src/file1.ts')
			expect(entry1?.status).toBe(FileStatusType.Staged)

			// Check broadcast was sent
			const broadcasts = mockDaemon.getBroadcasts()
			expect(broadcasts).toHaveLength(1)
			expect(broadcasts[0][0]).toBe('test-agent')
			expect(broadcasts[0][1]).toEqual(['src/file1.ts', 'src/file2.ts'])
			expect(broadcasts[0][2]).toBe('write')
		})
	})

	describe('recordFileRead', () => {
		it('updates working set', () => {
			handler.recordFileRead('src/file.ts')

			expect(workingSet.has('src/file.ts')).toBe(true)
			const entry = workingSet.getStatus('src/file.ts')
			expect(entry?.status).toBe(FileStatusType.Unmodified)
		})
	})

	describe('recordFileModification', () => {
		it('updates working set and daemon', () => {
			handler.recordFileModification('src/file.ts', FileOperation.Modify)

			const entry = workingSet.getStatus('src/file.ts')
			expect(entry?.status).toBe(FileStatusType.Modified)
			expect(entry?.operation).toBe(FileOperation.Modify)

			expect(mockDaemon.notifyFileTouch).toHaveBeenCalledWith(
				'test-agent',
				'src/file.ts',
				FileOperation.Modify,
			)
		})
	})

	describe('recordFileCommit', () => {
		it('updates working set', () => {
			workingSet.markAsModified('src/file.ts', FileOperation.Modify)
			handler.recordFileCommit('src/file.ts')

			const entry = workingSet.getStatus('src/file.ts')
			expect(entry?.status).toBe(FileStatusType.Committed)
		})
	})

	describe('processPendingTouchIntent', () => {
		it('processes all touch/intent notifications', () => {
			const touchNotif = createTouchNotification({
				notificationId: 'touch-1',
				filePath: 'src/file.ts',
				modifyingAgentId: 'agent-2',
			})
			const intentNotif = createIntentNotification({
				notificationId: 'intent-1',
				declaringAgentId: 'agent-3',
				filePaths: ['src/other.ts'],
			})

			mockDaemon.getPendingNotifications.mockReturnValue([touchNotif, intentNotif])

			const result = handler.processPendingTouchIntent()

			expect(result.processedNotifications).toBe(2)
		})

		it('determines shouldBlock for high severity conflicts', () => {
			// Set up a file with modified status so touch triggers High severity
			workingSet.markAsModified('src/file.ts', FileOperation.Modify)

			const touchNotif = createTouchNotification({
				notificationId: 'touch-1',
				filePath: 'src/file.ts',
				modifyingAgentId: 'agent-2',
			})

			mockDaemon.getPendingNotifications.mockReturnValue([touchNotif])

			const result = handler.processPendingTouchIntent()

			expect(result.highSeverityConflicts).toBeGreaterThan(0)
			expect(result.shouldBlock).toBe(true)
		})

		it('shouldBlock is false when no high severity and single medium', () => {
			// Set up a file with intent status so touch triggers Medium severity
			workingSet.markAsIntent('src/file.ts', FileOperation.Modify)

			const touchNotif = createTouchNotification({
				notificationId: 'touch-1',
				filePath: 'src/file.ts',
				modifyingAgentId: 'agent-2',
			})

			mockDaemon.getPendingNotifications.mockReturnValue([touchNotif])

			const result = handler.processPendingTouchIntent()

			expect(result.highSeverityConflicts).toBe(0)
			expect(result.mediumSeverityConflicts).toBe(1)
			expect(result.shouldBlock).toBe(false)
		})

		it('shouldBlock is true when multiple medium severity conflicts', () => {
			// Set up two files with intent status
			workingSet.markAsIntent('src/file1.ts', FileOperation.Modify)
			workingSet.markAsIntent('src/file2.ts', FileOperation.Modify)

			const touchNotif1 = createTouchNotification({
				notificationId: 'touch-1',
				filePath: 'src/file1.ts',
				modifyingAgentId: 'agent-2',
			})
			const touchNotif2 = createTouchNotification({
				notificationId: 'touch-2',
				filePath: 'src/file2.ts',
				modifyingAgentId: 'agent-3',
			})

			mockDaemon.getPendingNotifications.mockReturnValue([touchNotif1, touchNotif2])

			const result = handler.processPendingTouchIntent()

			expect(result.mediumSeverityConflicts).toBeGreaterThan(1)
			expect(result.shouldBlock).toBe(true)
		})

		it('returns zero counts when no pending notifications', () => {
			mockDaemon.getPendingNotifications.mockReturnValue([])

			const result = handler.processPendingTouchIntent()

			expect(result.processedNotifications).toBe(0)
			expect(result.negotiationsInitiated).toBe(0)
			expect(result.shouldBlock).toBe(false)
			expect(result.highSeverityConflicts).toBe(0)
			expect(result.mediumSeverityConflicts).toBe(0)
		})
	})

	describe('getFileStatus', () => {
		it('returns working set entry for tracked file', () => {
			workingSet.markAsModified('src/file.ts', FileOperation.Modify)
			const status = handler.getFileStatus('src/file.ts')
			expect(status).toBeDefined()
			expect(status?.status).toBe(FileStatusType.Modified)
		})

		it('returns undefined for untracked file', () => {
			const status = handler.getFileStatus('src/unknown.ts')
			expect(status).toBeUndefined()
		})
	})

	describe('hasFile', () => {
		it('returns true for tracked file', () => {
			workingSet.markAsRead('src/file.ts')
			expect(handler.hasFile('src/file.ts')).toBe(true)
		})

		it('returns false for untracked file', () => {
			expect(handler.hasFile('src/unknown.ts')).toBe(false)
		})
	})

	describe('getAllFiles', () => {
		it('returns all files in working set', () => {
			workingSet.markAsRead('src/file1.ts')
			workingSet.markAsModified('src/file2.ts', FileOperation.Modify)

			const allFiles = handler.getAllFiles()
			expect(allFiles.size).toBe(2)
			expect(allFiles.has('src/file1.ts')).toBe(true)
			expect(allFiles.has('src/file2.ts')).toBe(true)
		})
	})

	describe('getFilesByStatus', () => {
		it('returns only files with specified status', () => {
			workingSet.markAsRead('src/file1.ts')
			workingSet.markAsModified('src/file2.ts', FileOperation.Modify)
			workingSet.markAsModified('src/file3.ts', FileOperation.Create)

			const modifiedFiles = handler.getFilesByStatus(FileStatusType.Modified)
			expect(modifiedFiles.size).toBe(2)
			expect(modifiedFiles.has('src/file2.ts')).toBe(true)
			expect(modifiedFiles.has('src/file3.ts')).toBe(true)
			expect(modifiedFiles.has('src/file1.ts')).toBe(false)
		})
	})

	describe('checkOverlap', () => {
		it('returns overlapping entries', () => {
			workingSet.markAsModified('src/file1.ts', FileOperation.Modify)
			workingSet.markAsRead('src/file2.ts')

			const overlaps = handler.checkOverlap(['src/file1.ts', 'src/file2.ts', 'src/file3.ts'])
			expect(overlaps.size).toBe(2)
			expect(overlaps.has('src/file1.ts')).toBe(true)
			expect(overlaps.has('src/file2.ts')).toBe(true)
			expect(overlaps.has('src/file3.ts')).toBe(false)
		})
	})

	describe('clearWorkingSet', () => {
		it('removes all files from working set', () => {
			workingSet.markAsRead('src/file1.ts')
			workingSet.markAsModified('src/file2.ts', FileOperation.Modify)

			handler.clearWorkingSet()

			expect(workingSet.size()).toBe(0)
			expect(handler.getAllFiles().size).toBe(0)
		})
	})
})
