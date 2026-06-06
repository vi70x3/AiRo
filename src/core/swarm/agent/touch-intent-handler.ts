import { randomUUID } from "node:crypto"
import {
	Notification,
	NotificationType,
	TouchNotification,
	IntentNotification,
	DirectMessage,
	FileOperation,
	FileStatusType,
} from '@roo-code/types'
import { IDaemon } from '../interfaces'
import { WorkingSet, WorkingSetEntry } from './working-set'
import { NotificationHandler, NotificationHandlerResult } from './notification-handler'
import { ConflictSeverity } from '../worktree-manager/conflict-detector'

export interface TouchHandlingResult {
	notification: TouchNotification
	severity: ConflictSeverity
	shouldNegotiate: boolean
}

export interface IntentHandlingResult {
	notification: IntentNotification
	overlapPaths: string[]
	shouldNegotiate: boolean
}

export interface TouchIntentProcessingResult {
	processedNotifications: number
	negotiationsInitiated: number
	shouldBlock: boolean
	highSeverityConflicts: number
	mediumSeverityConflicts: number
}

export class TouchIntentHandler {
	private workingSet: WorkingSet
	private daemon: IDaemon
	private agentId: string
	private notificationHandler: NotificationHandler

	constructor(agentId: string, workingSet: WorkingSet, daemon: IDaemon) {
		this.agentId = agentId
		this.workingSet = workingSet
		this.daemon = daemon
		this.notificationHandler = new NotificationHandler(agentId, workingSet, daemon)
	}

	/**
	 * Handle a touch notification.
	 * Extract TouchNotification from notification payload.
	 * Check working set severity for the file.
	 * If Medium or High, set shouldNegotiate = true.
	 */
	handleTouchNotification(notification: Notification): TouchHandlingResult {
		const touch = notification.payload as TouchNotification
		const severity = this.workingSet.assessSeverity(touch.filePath)
		const shouldNegotiate = severity === ConflictSeverity.Medium || severity === ConflictSeverity.High

		if (shouldNegotiate) {
			this.initiateNegotiation(touch.modifyingAgentId, touch.filePath, severity)
		}

		return {
			notification: touch,
			severity,
			shouldNegotiate,
		}
	}

	/**
	 * Handle an intent notification.
	 * Extract IntentNotification from notification payload.
	 * Check working set overlap with intent paths.
	 * Filter to paths with intent (Staged) or modified status.
	 * If overlap exists, set shouldNegotiate = true.
	 */
	handleIntentNotification(notification: Notification): IntentHandlingResult {
		const intent = notification.payload as IntentNotification
		const overlaps = this.workingSet.checkOverlap(intent.filePaths)

		// Filter to paths with intent (Staged) or modified status
		const relevantOverlaps = new Map<string, WorkingSetEntry>()
		for (const [filePath, entry] of overlaps) {
			if (entry.status === FileStatusType.Staged || entry.status === FileStatusType.Modified) {
				relevantOverlaps.set(filePath, entry)
			}
		}

		const overlapPaths = Array.from(relevantOverlaps.keys())
		const shouldNegotiate = overlapPaths.length > 0

		if (shouldNegotiate) {
			this.initiateNegotiation(intent.declaringAgentId, overlapPaths[0], ConflictSeverity.Medium)
		}

		return {
			notification: intent,
			overlapPaths: overlapPaths,
			shouldNegotiate,
		}
	}

	/**
	 * Send DM to target agent with structured negotiation request.
	 */
	initiateNegotiation(targetAgentId: string, filePath: string, severity: ConflictSeverity): void {
		const negotiationContent = {
			type: 'negotiation_request',
			filePath,
			severity,
			timestamp: Date.now(),
		}

		const dm: DirectMessage = {
			messageId: randomUUID(),
			senderId: this.agentId,
			recipientId: targetAgentId,
			content: JSON.stringify(negotiationContent),
			timestamp: Date.now(),
			read: false,
		}

		this.daemon.sendDM(dm)
	}

	/**
	 * Send DM to target agent with structured negotiation response.
	 */
	respondToNegotiation(
		targetAgentId: string,
		conflictId: string,
		accepted: boolean,
		proposedStrategy: string
	): void {
		const responseContent = {
			type: 'negotiation_response',
			conflictId,
			accepted,
			proposedStrategy,
			timestamp: Date.now(),
		}

		const dm: DirectMessage = {
			messageId: randomUUID(),
			senderId: this.agentId,
			recipientId: targetAgentId,
			content: JSON.stringify(responseContent),
			timestamp: Date.now(),
			read: false,
		}

		this.daemon.sendDM(dm)
	}

	/**
	 * Add files to working set as intent, broadcast intent via daemon.
	 */
	declareIntent(filePaths: string[], toolName: string): void {
		for (const filePath of filePaths) {
			this.workingSet.markAsIntent(filePath, FileOperation.Modify)
		}
		this.daemon.broadcastIntent(this.agentId, filePaths, toolName)
	}

	/**
	 * Record that a file has been read.
	 * Update working set and notify daemon.
	 */
	recordFileRead(filePath: string): void {
		this.workingSet.markAsRead(filePath)
	}

	/**
	 * Record that a file has been modified.
	 * Update working set and notify daemon.
	 */
	recordFileModification(filePath: string, operation: FileOperation): void {
		this.workingSet.markAsModified(filePath, operation)
		this.daemon.notifyFileTouch(this.agentId, filePath, operation)
	}

	/**
	 * Record that file changes have been committed.
	 * Update working set.
	 */
	recordFileCommit(filePath: string): void {
		this.workingSet.markAsCommitted(filePath)
	}

	/**
	 * Process pending touch and intent notifications.
	 * Get pending notifications from daemon, filter to touch and intent types,
	 * process each, determine shouldBlock (true if any High severity or multiple Medium severity conflicts).
	 */
	processPendingTouchIntent(): TouchIntentProcessingResult {
		const notifications = this.daemon.getPendingNotifications(this.agentId) || []
		const touchNotifications = notifications.filter(
			(n) => n.type === NotificationType.Touch
		)
		const intentNotifications = notifications.filter(
			(n) => n.type === NotificationType.Intent
		)

		let negotiationsInitiated = 0
		let highSeverityConflicts = 0
		let mediumSeverityConflicts = 0

		// Process touch notifications
		for (const notification of touchNotifications) {
			const result = this.handleTouchNotification(notification)
			if (result.shouldNegotiate) {
			  negotiationsInitiated++
			  if (result.severity === ConflictSeverity.High || result.severity === ConflictSeverity.Critical) {
			    highSeverityConflicts++
			  } else if (result.severity === ConflictSeverity.Medium) {
			    mediumSeverityConflicts++
			  }
			}
		}

		// Process intent notifications
		for (const notification of intentNotifications) {
			const result = this.handleIntentNotification(notification)
			if (result.shouldNegotiate) {
				negotiationsInitiated++
				mediumSeverityConflicts++
			}
		}

		// Determine if agent should block
		const shouldBlock = highSeverityConflicts > 0 || mediumSeverityConflicts > 1

		return {
			processedNotifications: touchNotifications.length + intentNotifications.length,
			negotiationsInitiated,
			shouldBlock,
			highSeverityConflicts,
			mediumSeverityConflicts,
		}
	}

	/**
	 * Get the current working set status for a file.
	 */
	getFileStatus(filePath: string): WorkingSetEntry | undefined {
		return this.workingSet.getStatus(filePath)
	}

	/**
	 * Check if a file is in the working set.
	 */
	hasFile(filePath: string): boolean {
		return this.workingSet.has(filePath)
	}

	/**
	 * Get all files in the working set.
	 */
	getAllFiles(): Map<string, WorkingSetEntry> {
		return this.workingSet.getAll()
	}

	/**
	 * Get all files with a specific status.
	 */
	getFilesByStatus(status: FileStatusType): Map<string, WorkingSetEntry> {
		return this.workingSet.getByStatus(status)
	}

	/**
	 * Check overlap with given file paths.
	 */
	checkOverlap(filePaths: string[]): Map<string, WorkingSetEntry> {
		return this.workingSet.checkOverlap(filePaths)
	}

	/**
	 * Clear the working set.
	 */
	clearWorkingSet(): void {
		this.workingSet.clear()
	}
}
