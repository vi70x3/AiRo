import {
  WorktreeMetadata,
  WorktreeStatus,
  ConflictInfo,
  ConflictStatus,
  MergePreparation,
  CompletionReport,
  ValidationResult,
  ValidationStatus,
  AgentLifecycleState,
} from '@roo-code/types'
import { IDaemon } from '../interfaces'

export interface MergeReadiness {
  ready: boolean
  blockers: string[]
  unresolvedConflictCount: number
  activeAgentCount: number
  validationResults: ValidationResult[]
}

export class MergePreparer {
  private daemon: IDaemon
  private worktreeScope: string
  private managerId: string
  
  constructor(daemon: IDaemon, worktreeScope: string, managerId: string)
  
  /** Prepare worktree for merge: verify agents completed, run validation, detect conflicts, create MergePreparation */
  prepareForMerge(): MergePreparation
  
  /** Check if worktree is ready for merge */
  checkMergeReadiness(): MergeReadiness
  
  /** Verify all agents in scope have completed */
  verifyAgentsCompleted(): boolean
  
  /** Get completion reports for all agents in scope */
  getAgentCompletionReports(): CompletionReport[]
  
  /** Run validation checks (simulated — check completion reports for validation results) */
  runValidation(): ValidationResult[]
  
  /** Detect conflicts with base branch (simulated — return existing tracked conflicts) */
  detectBaseConflicts(): ConflictInfo[]
  
  /** Notify Coordinator that worktree is ready for merge */
  notifyCoordinatorReady(): void
  
  /** Notify Coordinator that worktree has blockers */
  notifyCoordinatorBlocked(blockers: string[]): void
  
  /** Get worktree metadata with merge preparation info */
  getWorktreeMetadataWithMerge(): WorktreeMetadata
}