import {
  ConflictHistoryEntry,
  ConflictTimelineEntry,
  ConflictResolutionMethod,
} from '@roo-code/types'
import { IDaemon } from '../interfaces'
import { DetectedConflict, ConflictSeverity } from './conflict-detector'

/**
 * ConflictTracker maintains a conflict history per agent/worktree.
 * It tracks conflicts over time and provides history queries.
 *
 * Design notes:
 * - Lightweight: does NOT store full file contents, only metadata
 * - Persisted to daemon snapshots via getHistoryEntries() / getTimelineEntries()
 * - Thread-safe for single-threaded Node.js event loop
 */
export class ConflictTracker {
  private daemon: IDaemon
  private history: Map<string, ConflictHistoryEntry>
  private timeline: ConflictTimelineEntry[]

  constructor(daemon: IDaemon) {
    this.daemon = daemon
    this.history = new Map()
    this.timeline = []
  }

  /**
   * Track a newly detected conflict in the history.
   * Creates a ConflictHistoryEntry and a timeline entry.
   */
  trackConflict(conflict: DetectedConflict): ConflictHistoryEntry {
    const entry: ConflictHistoryEntry = {
      conflictId: conflict.conflictId,
      timestamp: conflict.detectedAt,
      severity: this.mapSeverity(conflict.severity),
      files: [conflict.filePath],
      resolutionStatus: 'active',
    }

    this.history.set(conflict.conflictId, entry)

    // Add timeline entry for detection
    this.addTimelineEntry({
      conflictId: conflict.conflictId,
      agentId: conflict.conflictingAgents[0] ?? 'unknown',
      worktreeScope: '',
      timestamp: conflict.detectedAt,
      event: 'detected',
      details: `Conflict detected on ${conflict.filePath} between ${conflict.conflictingAgents.join(', ')}`,
    })

    return entry
  }

  /**
   * Mark a conflict as resolved in the history.
   */
  resolveConflict(
    conflictId: string,
    resolvedBy: string,
    method: ConflictResolutionMethod,
  ): ConflictHistoryEntry | null {
    const entry = this.history.get(conflictId)
    if (!entry) {
      return null
    }

    entry.resolutionStatus = 'resolved'
    entry.resolvedBy = resolvedBy
    entry.resolvedAt = Date.now()
    entry.resolutionMethod = method
    this.history.set(conflictId, entry)

    this.addTimelineEntry({
      conflictId,
      agentId: resolvedBy,
      worktreeScope: '',
      timestamp: Date.now(),
      event: 'resolved',
      details: `Conflict resolved by ${resolvedBy} using ${method}`,
    })

    return entry
  }

  /**
   * Mark a conflict as escalated in the history.
   */
  escalateConflict(conflictId: string, escalatedBy: string): ConflictHistoryEntry | null {
    const entry = this.history.get(conflictId)
    if (!entry) {
      return null
    }

    entry.resolutionStatus = 'escalated'
    this.history.set(conflictId, entry)

    this.addTimelineEntry({
      conflictId,
      agentId: escalatedBy,
      worktreeScope: '',
      timestamp: Date.now(),
      event: 'escalated',
      details: `Conflict escalated by ${escalatedBy}`,
    })

    return entry
  }

  /**
   * Mark a conflict as deferred in the history.
   */
  deferConflict(conflictId: string, deferredBy: string): ConflictHistoryEntry | null {
    const entry = this.history.get(conflictId)
    if (!entry) {
      return null
    }

    entry.resolutionStatus = 'deferred'
    this.history.set(conflictId, entry)

    return entry
  }

  /**
   * Get the full conflict history for a specific agent.
   * Returns all conflicts where the agent was involved.
   */
  getConflictHistory(agentId: string): ConflictHistoryEntry[] {
    const result: ConflictHistoryEntry[] = []
    for (const entry of this.history.values()) {
      // Check if this agent is in the timeline for this conflict
      const agentTimeline = this.timeline.filter(
        (t) => t.conflictId === entry.conflictId && t.agentId === agentId,
      )
      if (agentTimeline.length > 0) {
        result.push(entry)
      }
    }
    return result
  }

  /**
   * Get all currently active (unresolved) conflicts.
   */
  getActiveConflicts(): ConflictHistoryEntry[] {
    const result: ConflictHistoryEntry[] = []
    for (const entry of this.history.values()) {
      if (entry.resolutionStatus === 'active') {
        result.push(entry)
      }
    }
    return result
  }

  /**
   * Get the full conflict timeline sorted by timestamp.
   */
  getConflictTimeline(): ConflictTimelineEntry[] {
    return [...this.timeline].sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Get the conflict timeline filtered by agent.
   */
  getAgentTimeline(agentId: string): ConflictTimelineEntry[] {
    return this.timeline
      .filter((t) => t.agentId === agentId)
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Get a specific conflict history entry by ID.
   */
  getConflictEntry(conflictId: string): ConflictHistoryEntry | undefined {
    return this.history.get(conflictId)
  }

  /**
   * Get all history entries for snapshot persistence.
   */
  getHistoryEntries(): ConflictHistoryEntry[] {
    return Array.from(this.history.values())
  }

  /**
   * Get all timeline entries for snapshot persistence.
   */
  getTimelineEntries(): ConflictTimelineEntry[] {
    return [...this.timeline]
  }

  /**
   * Restore history from a snapshot.
   */
  restoreFromSnapshot(
    historyEntries: ConflictHistoryEntry[],
    timelineEntries: ConflictTimelineEntry[],
  ): void {
    this.history.clear()
    this.timeline = []

    for (const entry of historyEntries) {
      this.history.set(entry.conflictId, entry)
    }
    this.timeline = [...timelineEntries]
  }

  /**
   * Add a timeline entry for a negotiation event.
   */
  addNegotiationTimelineEntry(
    conflictId: string,
    agentId: string,
    event: ConflictTimelineEntry['event'],
    details: string,
  ): void {
    this.addTimelineEntry({
      conflictId,
      agentId,
      worktreeScope: '',
      timestamp: Date.now(),
      event,
      details,
    })
  }

  /**
   * Internal helper to add a timeline entry.
   */
  private addTimelineEntry(entry: ConflictTimelineEntry): void {
    this.timeline.push(entry)
  }

  /**
   * Map ConflictSeverity enum to the string severity used in history.
   */
  private mapSeverity(severity: ConflictSeverity): ConflictHistoryEntry['severity'] {
    switch (severity) {
      case ConflictSeverity.Critical:
        return 'critical'
      case ConflictSeverity.High:
        return 'high'
      case ConflictSeverity.Medium:
        return 'medium'
      case ConflictSeverity.Low:
        return 'low'
      default:
        return 'low'
    }
  }
}
