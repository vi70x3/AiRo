export { WorktreeManager } from './worktree-manager'
export { ConflictDetector, ConflictType, ConflictSeverity, DetectedConflict, TrackedFileStatus } from './conflict-detector'
export { ConflictResolver, NegotiationResponse, NegotiationResult, NegotiationState } from './conflict-resolver'
export { MergePreparer, MergeReadiness } from './merge-preparer'
export { CrossWorktreeCoordinator, CrossWorktreeConflict, InterWorktreeDag, InterWorktreeEdge } from './cross-worktree-coordinator'
export { GitOperations, IGitOperations, MergeResult, CleanStatus, ChangedFile, WorktreeEntry, FileChangeStatus } from './git-operations'
export {
  WorktreeError,
  WorktreeAlreadyExistsError,
  BranchNameConflictError,
  WorktreeNotEmptyError,
  MergeConflictError,
  GitOperationError,
} from './worktree-errors'
