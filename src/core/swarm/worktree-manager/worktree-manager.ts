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
import { GitOperations, IGitOperations, MergeResult, CleanStatus, ChangedFile, WorktreeEntry } from './git-operations'
import {
  WorktreeAlreadyExistsError,
  BranchNameConflictError,
  WorktreeNotEmptyError,
  MergeConflictError,
  GitOperationError,
} from './worktree-errors'

export class WorktreeManager extends Agent implements IWorktreeManager {
  private _worktreePath: string
  private _branchName: string
  private _baseBranch: string
  private _assignedAgents: Set<string>
  private conflicts: Map<string, ConflictInfo>
  private mergePreparation: MergePreparation | null
  private gitOps: IGitOperations

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
    baseBranch: string = 'main',
    gitOps?: IGitOperations,
  ) {
    super(agentId, AgentType.WorktreeManager, daemon, parentId, worktreeScope)
    this._worktreePath = worktreePath
    this._branchName = branchName
    this._baseBranch = baseBranch
    this._assignedAgents = new Set()
    this.conflicts = new Map()
    this.mergePreparation = null
    this.gitOps = gitOps ?? new GitOperations()
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

  // --- Git Worktree Operations (R13) ---

  /**
   * Create a new git worktree for an agent's isolated workspace.
   * Runs `git worktree add` to create a new worktree directory and branch.
   * @throws WorktreeAlreadyExistsError if the worktree path already exists
   * @throws BranchNameConflictError if the branch name already exists
   * @throws GitOperationError if the git command fails
   */
  async createWorktree(worktreePath: string, branchName: string, baseBranch?: string): Promise<void> {
    const base = baseBranch ?? this._baseBranch
    await this.gitOps.createWorktree(worktreePath, branchName, base)
  }

  /**
   * Remove a git worktree and clean up the associated branch.
   * Runs `git worktree remove` and deletes the branch.
   * @throws WorktreeNotEmptyError if the worktree has uncommitted changes and force is false
   * @throws GitOperationError if the git command fails
   */
  async removeWorktree(worktreePath: string, branchName: string, force: boolean = false): Promise<void> {
    await this.gitOps.removeWorktree(worktreePath, branchName, force)
  }

  /**
   * Merge changes from this worktree's branch back into the base branch.
   * This is the primary merge operation for integrating agent work.
   * @throws MergeConflictError if the merge results in conflicts
   * @throws GitOperationError if the git command fails
   */
  async mergeWorktree(): Promise<MergeResult> {
    return this.gitOps.mergeBranch(this._branchName, this._baseBranch, this._worktreePath)
  }

  /**
   * Merge a specific source branch into a target branch within a worktree.
   * Useful for cross-worktree merges directed by the coordinator.
   * @throws MergeConflictError if the merge results in conflicts
   * @throws GitOperationError if the git command fails
   */
  async mergeBranch(sourceBranch: string, targetBranch: string): Promise<MergeResult> {
    return this.gitOps.mergeBranch(sourceBranch, targetBranch, this._worktreePath)
  }

  /**
   * Abort an in-progress merge in this worktree.
   */
  async abortMerge(): Promise<void> {
    await this.gitOps.abortMerge(this._worktreePath)
  }

  /**
   * List all existing git worktrees in the repository.
   */
  async listWorktrees(): Promise<WorktreeEntry[]> {
    return this.gitOps.listWorktrees()
  }

  /**
   * Create a new branch from a base branch (without creating a worktree).
   * @throws BranchNameConflictError if the branch name already exists
   */
  async createBranch(branchName: string, baseBranch?: string): Promise<void> {
    const base = baseBranch ?? this._baseBranch
    await this.gitOps.createBranch(branchName, base)
  }

  /**
   * Delete a branch.
   */
  async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
    await this.gitOps.deleteBranch(branchName, force)
  }

  /**
   * Check if a branch exists in the repository.
   */
  async branchExists(branchName: string): Promise<boolean> {
    return this.gitOps.branchExists(branchName)
  }

  /**
   * Get the current branch name in this worktree.
   */
  async getCurrentBranch(): Promise<string> {
    return this.gitOps.getCurrentBranch(this._worktreePath)
  }

  // --- Worktree Status Queries (R13) ---

  /**
   * Check if this worktree's working directory is clean (no uncommitted changes).
   */
  async isWorktreeClean(): Promise<CleanStatus> {
    return this.gitOps.isWorktreeClean(this._worktreePath)
  }

  /**
   * Check if this worktree has unresolved merge conflicts.
   */
  async hasMergeConflicts(): Promise<boolean> {
    return this.gitOps.hasMergeConflicts(this._worktreePath)
  }

  /**
   * Get list of conflicted files in this worktree.
   */
  async getConflictedFiles(): Promise<string[]> {
    return this.gitOps.getConflictedFiles(this._worktreePath)
  }

  /**
   * List files changed in this worktree compared to the base branch.
   */
  async listChangedFiles(): Promise<ChangedFile[]> {
    return this.gitOps.listChangedFiles(this._worktreePath, this._baseBranch)
  }

  /**
   * Stage all changes in this worktree.
   */
  async stageAll(): Promise<void> {
    await this.gitOps.stageAll(this._worktreePath)
  }

  /**
   * Commit staged changes in this worktree.
   */
  async commit(message: string): Promise<void> {
    await this.gitOps.commit(this._worktreePath, message)
  }

  /**
   * Get the git repository root directory.
   */
  async getRepoRoot(): Promise<string> {
    return this.gitOps.getRepoRoot()
  }

  // --- Worktree Metadata ---

  getWorktreeMetadata(): WorktreeMetadata {
    return {
      worktreeId: this.worktreeScope ?? '',
      path: this._worktreePath,
      branchName: this._branchName,
      baseBranch: this._baseBranch,
      managerId: this.agentId,
      assignedAgents: this.assignedAgents,
      status: WorktreeStatus.Active,
      conflicts: Array.from(this.conflicts.values()),
      mergePreparation: this.mergePreparation,
    }
  }
}
