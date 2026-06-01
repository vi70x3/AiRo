import {
  AgentMetadata,
  AgentType,
  ConflictInfo,
  ConflictStatus,
  FileOperation,
  TouchNotification,
  IntentNotification,
} from '@roo-code/types'
import { IDaemon } from '../interfaces'

/**
 * Classification of conflict types from the spec:
 * - Read-Write: one agent has read, another is writing
 * - Write-Write: both agents are writing the same file
 * - Intent-Intent: both agents have declared intent to modify
 * - Intent-Write: one has declared intent, another is already writing
 */
export enum ConflictType {
  ReadWrite = 'read_write',
  WriteWrite = 'write_write',
  IntentIntent = 'intent_intent',
  IntentWrite = 'intent_write',
}

/**
 * Severity levels from the spec:
 * - Critical: Write-Write conflicts (both actively modifying)
 * - High: Intent-Write (one writing, another intends to write)
 * - Medium: Intent-Intent (both intend to write)
 * - Low: Read-Write (one reading, another writing)
 */
export enum ConflictSeverity {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

/**
 * Local tracked file status type that maps to the spec's conceptual model.
 * The FileStatusType enum in @roo-code/types doesn't have "intent" or "read"
 * as values, so we maintain our own tracking.
 */
export type TrackedFileStatus = 'read' | 'intent' | 'modified' | 'committed'

export interface DetectedConflict {
  conflictId: string
  filePath: string
  conflictingAgents: string[]
  conflictType: ConflictType
  severity: ConflictSeverity
  detectedAt: number
  status: ConflictStatus
  touchNotification?: TouchNotification
  intentNotification?: IntentNotification
}

export class ConflictDetector {
  private daemon: IDaemon
  private worktreeScope: string
  private managerId: string
  // agentId → filePath → TrackedFileStatus
  private fileStatusTracking: Map<string, Map<string, TrackedFileStatus>>
  private detectedConflicts: Map<string, DetectedConflict>

  constructor(daemon: IDaemon, worktreeScope: string, managerId: string) {
    this.daemon = daemon
    this.worktreeScope = worktreeScope
    this.managerId = managerId
    this.fileStatusTracking = new Map()
    this.detectedConflicts = new Map()
  }

  /**
   * Detect conflicts from a touch notification.
   * When an agent modifies a file, check if other agents in this scope
   * are also working on that file.
   */
  detectFromTouch(touch: TouchNotification): DetectedConflict[] {
    const conflicts: DetectedConflict[] = []
    const scopeAgents = this.getScopeAgents()
    const modifierAgentId = touch.modifyingAgentId
    const filePath = touch.filePath

    for (const agent of scopeAgents) {
      // Skip the agent that is modifying
      if (agent.agentId === modifierAgentId) {
        continue
      }

      const otherStatus = this.getAgentFileStatus(agent.agentId, filePath)
      if (otherStatus === undefined) {
        // Agent not tracking this file — no conflict
        continue
      }

      // The modifier is performing a write (modified status)
      const conflictType = this.classifyConflict(filePath, 'modified', otherStatus)
      const severity = this.assessSeverity(conflictType)

      const conflict: DetectedConflict = {
        conflictId: crypto.randomUUID(),
        filePath,
        conflictingAgents: [modifierAgentId, agent.agentId],
        conflictType,
        severity,
        detectedAt: Date.now(),
        status: ConflictStatus.Detected,
        touchNotification: touch,
      }

      conflicts.push(conflict)
      this.detectedConflicts.set(conflict.conflictId, conflict)
    }

    return conflicts
  }

  /**
   * Detect conflicts from an intent notification.
   * When an agent declares intent to modify files, check if other agents
   * in this scope have already declared intent or are modifying those files.
   */
  detectFromIntent(intent: IntentNotification): DetectedConflict[] {
    const conflicts: DetectedConflict[] = []
    const scopeAgents = this.getScopeAgents()
    const declarerAgentId = intent.declaringAgentId

    for (const agent of scopeAgents) {
      // Skip the agent that is declaring intent
      if (agent.agentId === declarerAgentId) {
        continue
      }

      // Check each file path in the intent
      for (const filePath of intent.filePaths) {
        const otherStatus = this.getAgentFileStatus(agent.agentId, filePath)
        if (otherStatus === undefined) {
          // Agent not tracking this file — no conflict
          continue
        }

        // The declarer has intent status
        const conflictType = this.classifyConflict(filePath, 'intent', otherStatus)
        const severity = this.assessSeverity(conflictType)

        const conflict: DetectedConflict = {
          conflictId: crypto.randomUUID(),
          filePath,
          conflictingAgents: [declarerAgentId, agent.agentId],
          conflictType,
          severity,
          detectedAt: Date.now(),
          status: ConflictStatus.Detected,
          intentNotification: intent,
        }

        conflicts.push(conflict)
        this.detectedConflicts.set(conflict.conflictId, conflict)
      }
    }

    return conflicts
  }

  /**
   * Classify the conflict type based on the statuses of the conflicting agents.
   *
   * - If both have modified status → WriteWrite
   * - If one has modified, other has intent → IntentWrite
   * - If both have intent → IntentIntent
   * - If one has modified/intent, other has read → ReadWrite
   */
  classifyConflict(
    _filePath: string,
    modifierStatus: TrackedFileStatus,
    otherStatus: TrackedFileStatus,
  ): ConflictType {
    // Normalize: committed status doesn't participate in conflicts
    if (modifierStatus === 'committed' || otherStatus === 'committed') {
      // If either is committed, the effective status for conflict purposes
      // is lower — but this shouldn't normally be called with committed
      // since committed files are removed from tracking
      return ConflictType.ReadWrite
    }

    const isModifierWrite = modifierStatus === 'modified'
    const isModifierIntent = modifierStatus === 'intent'
    const isModifierRead = modifierStatus === 'read'

    const isOtherWrite = otherStatus === 'modified'
    const isOtherIntent = otherStatus === 'intent'
    const isOtherRead = otherStatus === 'read'

    // Both writing
    if (isModifierWrite && isOtherWrite) {
      return ConflictType.WriteWrite
    }

    // One writing, one with intent
    if ((isModifierWrite && isOtherIntent) || (isModifierIntent && isOtherWrite)) {
      return ConflictType.IntentWrite
    }

    // Both with intent
    if (isModifierIntent && isOtherIntent) {
      return ConflictType.IntentIntent
    }

    // One writing/intent, one reading
    if ((isModifierWrite && isOtherRead) || (isModifierIntent && isOtherRead) ||
        (isModifierRead && isOtherWrite) || (isModifierRead && isOtherIntent)) {
      return ConflictType.ReadWrite
    }

    // Both reading — not a conflict per the spec
    return ConflictType.ReadWrite
  }

  /**
   * Assess severity based on conflict type.
   *
   * - WriteWrite → Critical
   * - IntentWrite → High
   * - IntentIntent → Medium
   * - ReadWrite → Low
   */
  assessSeverity(conflictType: ConflictType): ConflictSeverity {
    switch (conflictType) {
      case ConflictType.WriteWrite:
        return ConflictSeverity.Critical
      case ConflictType.IntentWrite:
        return ConflictSeverity.High
      case ConflictType.IntentIntent:
        return ConflictSeverity.Medium
      case ConflictType.ReadWrite:
        return ConflictSeverity.Low
    }
  }

  /**
   * Convert a DetectedConflict to a ConflictInfo for storage.
   */
  toConflictInfo(detected: DetectedConflict): ConflictInfo {
    return {
      conflictId: detected.conflictId,
      filePath: detected.filePath,
      conflictingAgents: detected.conflictingAgents,
      detectedAt: detected.detectedAt,
      status: detected.status,
      resolution: null,
    }
  }

  /**
   * Get all detected conflicts.
   */
  getAllDetectedConflicts(): DetectedConflict[] {
    return Array.from(this.detectedConflicts.values())
  }

  /**
   * Get a specific detected conflict by ID.
   */
  getDetectedConflict(conflictId: string): DetectedConflict | undefined {
    return this.detectedConflicts.get(conflictId)
  }

  /**
   * Get all agents assigned to this worktree scope.
   */
  private getScopeAgents(): AgentMetadata[] {
    const allAgents = this.daemon.listAgents()
    return allAgents.filter(
      agent =>
        agent.worktreeScope === this.worktreeScope &&
        agent.agentType === AgentType.Agent
    )
  }

  /**
   * Check if a file path is in an agent's tracked status.
   * Returns the TrackedFileStatus if found, undefined otherwise.
   */
  private getAgentFileStatus(agentId: string, filePath: string): TrackedFileStatus | undefined {
    const agentFiles = this.fileStatusTracking.get(agentId)
    if (!agentFiles) {
      return undefined
    }
    return agentFiles.get(filePath)
  }

  /**
   * Track a file status for an agent based on notifications.
   * Updates internal tracking when touch/intent notifications are processed.
   */
  trackFileStatus(agentId: string, filePath: string, status: TrackedFileStatus, _operation?: FileOperation): void {
    let agentFiles = this.fileStatusTracking.get(agentId)
    if (!agentFiles) {
      agentFiles = new Map()
      this.fileStatusTracking.set(agentId, agentFiles)
    }
    agentFiles.set(filePath, status)
  }

  /**
   * Remove tracking for a file when an agent commits changes.
   */
  removeFileStatus(agentId: string, filePath: string): void {
    const agentFiles = this.fileStatusTracking.get(agentId)
    if (agentFiles) {
      agentFiles.delete(filePath)
      // Clean up empty maps
      if (agentFiles.size === 0) {
        this.fileStatusTracking.delete(agentId)
      }
    }
  }
}
