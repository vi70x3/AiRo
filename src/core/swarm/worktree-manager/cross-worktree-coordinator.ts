import {
  AgentMetadata,
  ConflictInfo,
  ConflictResolution,
  ConflictResolutionStrategy,
  WorktreeMetadata,
  WorktreeStatus,
  Plan,
  Task,
  Dependency,
} from '@roo-code/types'
import { IDaemon } from '../interfaces'

export interface CrossWorktreeConflict {
  conflict: ConflictInfo
  involvedScopes: string[]
  involvedManagerIds: string[]
  escalated: boolean
}

export interface InterWorktreeDag {
  nodes: string[]
  edges: InterWorktreeEdge[]
}

export interface InterWorktreeEdge {
  fromScope: string
  toScope: string
  taskIds: string[]
  dependencyType: string
}

export class CrossWorktreeCoordinator {
  private daemon: IDaemon
  
  constructor(daemon: IDaemon)
  
  /** Detect conflicts spanning multiple worktree scopes */
  detectCrossWorktreeConflicts(): CrossWorktreeConflict[]
  
  /** Coordinate resolution of a cross-worktree conflict (Coordinator handles these) */
  coordinateCrossWorktreeResolution(conflict: CrossWorktreeConflict): ConflictResolution
  
  /** Determine merge order via topological sort of inter-worktree dependency DAG */
  determineMergeOrder(worktrees: WorktreeMetadata[], plan: Plan): string[]
  
  /** Build inter-worktree dependency DAG from plan */
  buildInterWorktreeDependencyDag(plan: Plan): InterWorktreeDag
  
  /** Get all worktree managers */
  getWorktreeManagers(): AgentMetadata[]
  
  /** Get worktree metadata for a specific scope */
  getWorktreeMetadata(scope: string): WorktreeMetadata | undefined
  
  /** Notify all worktree managers about a cross-worktree conflict */
  notifyWorktreeManagers(conflict: CrossWorktreeConflict): void
}