import { Agent } from '../agent/agent'
import { IWorktreeManager, IDaemon } from '../interfaces'
import {
  AgentType,
  AgentLifecycleState,
  AgentMetadata,
  ConflictInfo,
  ConflictStatus,
  ConflictResolution,
  ConflictResolutionStrategy,
  WorktreeMetadata,
  WorktreeStatus,
  MergePreparation,
  TouchNotification,
  IntentNotification,
} from '@roo-code/types'
import { ConflictDetector, DetectedConflict, ConflictType, ConflictSeverity } from './conflict-detector'
import { ConflictResolver } from './conflict-resolver'
import { MergePreparer, MergeReadiness } from './merge-preparer'
import { CrossWorktreeCoordinator, CrossWorktreeConflict } from './cross-worktree-coordinator'

export class WorktreeManager extends Agent implements IWorktreeManager {
  private _worktreePath: string
  private _branchName: string
  private _assignedAgents: Set<string>
  private conflicts: Map<string, ConflictInfo>
  private mergePreparation: MergePreparation | null

  public readonly conflictDetector: ConflictDetector
  public readonly conflictResolver: ConflictResolver
  public readonly mergePreparer: MergePreparer
  public readonly crossWorktreeCoordinator: CrossWorktreeCoordinator

  constructor(
    agentId: string,
    daemon: IDaemon,
    parentId: string,
    worktreeScope: string,
    worktreePath: string,
    branchName: string,
  ) {
    super(agentId, AgentType.WorktreeManager, daemon, parentId, worktreeScope)
    this._worktreePath = worktreePath
    this._branchName = branchName
    this._assignedAgents = new Set()
    this.conflicts = new Map()
    this.mergePreparation = null
    this.conflictDetector = new ConflictDetector(this.daemon, worktreeScope, this.agentId)
    this.conflictResolver = new ConflictResolver(this.daemon)
    this.mergePreparer = new MergePreparer(this.daemon, worktreeScope, this.agentId)
    this.crossWorktreeCoordinator = new CrossWorktreeCoordinator(this.daemon)
    this.markReady()
  }

  // --- IWorktreeManager Properties ---

  get worktreePath(): string {
    return this._worktreePath
  }

  get branchName(): string {
    return this._branchName
  }

  get assignedAgents(): string[] {
    return Array.from(this._assignedAgents)
  }

  // --- Agent Assignment ---

  assignAgent(agentId: string): void {
    this._assignedAgents.add(agentId)
  }

  removeAgent(agentId: string): void {
    this._assignedAgents.delete(agentId)
  }

  // --- IWorktreeManager Conflict Methods ---

  detectConflicts(): ConflictInfo[] {
    return Array.from(this.conflicts.values())
  }

  coordinateResolution(conflictId: string): ConflictResolution | null {
    const conflict = this.conflicts.get(conflictId)
    if (!conflict) return null

    if (conflict.status === ConflictStatus.Escalated) {
      return null
    }

    const detectedConflict: DetectedConflict = {
      conflictId: conflict.conflictId,
      filePath: conflict.filePath,
      conflictingAgents: conflict.conflictingAgents,
      conflictType: ConflictType.ReadWrite,
      severity: ConflictSeverity.Low,
      detectedAt: conflict.detectedAt,
      status: conflict.status,
    }
    const result = this.conflictResolver.resolveConflict(detectedConflict)

    if (result.resolved) {
      const resolution: ConflictResolution = {
        strategy: result.strategy ?? ConflictResolutionStrategy.Merge,
        resolvedBy: [this.agentId],
        resolvedAt: Date.now(),
      }

      conflict.status = ConflictStatus.Resolved
      conflict.resolution = resolution
      this.conflicts.set(conflictId, conflict)

      return resolution
    }

    return null
  }

  resolveConflict(conflict: DetectedConflict): {
    resolved: boolean
    strategy: ConflictResolutionStrategy | null
    negotiationId: string | null
  } {
    return this.conflictResolver.resolveConflict(conflict)
  }

  prepareForMerge(): MergePreparation {
    this.mergePreparer.setTrackedConflicts(this.conflicts)
    const preparation = this.mergePreparer.prepareForMerge()
    this.mergePreparation = preparation
    return preparation
  }

  checkMergeReadiness(): MergeReadiness {
    this.mergePreparer.setTrackedConflicts(this.conflicts)
    return this.mergePreparer.checkMergeReadiness()
  }

  // --- Cross-Worktree Coordination ---

  detectCrossWorktreeConflicts(): CrossWorktreeConflict[] {
    return this.crossWorktreeCoordinator.detectCrossWorktreeConflicts()
  }

  coordinateCrossWorktreeResolution(conflict: CrossWorktreeConflict): ConflictResolution {
    return this.crossWorktreeCoordinator.coordinateCrossWorktreeResolution(conflict)
  }

  determineMergeOrder(worktrees: WorktreeMetadata[], plan: import('@roo-code/types').Plan): string[] {
    return this.crossWorktreeCoordinator.determineMergeOrder(worktrees, plan)
  }

  // --- Conflict Tracking ---

  addConflict(conflict: ConflictInfo): void {
    this.conflicts.set(conflict.conflictId, conflict)
  }

  getConflict(conflictId: string): ConflictInfo | undefined {
    return this.conflicts.get(conflictId)
  }

  getAllConflicts(): ConflictInfo[] {
    return Array.from(this.conflicts.values())
  }

  getUnresolvedConflicts(): ConflictInfo[] {
    return Array.from(this.conflicts.values())
      .filter(c => c.status !== ConflictStatus.Resolved)
  }

  escalateConflict(conflictId: string): void {
    const conflict = this.conflicts.get(conflictId)
    if (!conflict) return

    conflict.status = ConflictStatus.Escalated
    this.conflicts.set(conflictId, conflict)

    const coordinatorId = this.daemon.getCoordinatorId()
    if (coordinatorId) {
      this.sendDM(coordinatorId, JSON.stringify({
        type: 'conflict_escalation',
        conflictId,
        filePath: conflict.filePath,
        conflictingAgents: conflict.conflictingAgents,
      }))
    }
  }

  // --- Notification Processing ---

  processTouchNotification(touch: TouchNotification): DetectedConflict[] {
    const conflicts = this.conflictDetector.detectFromTouch(touch)
    for (const conflict of conflicts) {
      this.addConflict(this.conflictDetector.toConflictInfo(conflict))
    }
    this.conflictDetector.trackFileStatus(touch.modifyingAgentId, touch.filePath, 'modified', touch.operation)
    return conflicts
  }

  processIntentNotification(intent: IntentNotification): DetectedConflict[] {
    const conflicts = this.conflictDetector.detectFromIntent(intent)
    for (const conflict of conflicts) {
      this.addConflict(this.conflictDetector.toConflictInfo(conflict))
    }
    for (const filePath of intent.filePaths) {
      this.conflictDetector.trackFileStatus(intent.declaringAgentId, filePath, 'intent')
    }
    return conflicts
  }

  // --- Worktree Metadata ---

  getWorktreeMetadata(): WorktreeMetadata {
    return {
      worktreeId: this.worktreeScope ?? '',
      path: this._worktreePath,
      branchName: this._branchName,
      baseBranch: 'main',
      managerId: this.agentId,
      assignedAgents: this.assignedAgents,
      status: WorktreeStatus.Active,
      conflicts: Array.from(this.conflicts.values()),
      mergePreparation: this.mergePreparation,
    }
  }
}
