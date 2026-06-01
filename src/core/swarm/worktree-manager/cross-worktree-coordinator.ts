import {
  AgentMetadata,
  AgentType,
  ConflictInfo,
  ConflictResolution,
  ConflictResolutionStrategy,
  WorktreeMetadata,
  WorktreeStatus,
  Plan,
  Task,
  Dependency,
  DependencyType,
  Notification,
  NotificationType,
  TouchNotification,
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
  private crossWorktreeConflicts: Map<string, CrossWorktreeConflict>

  constructor(daemon: IDaemon) {
    this.daemon = daemon
    this.crossWorktreeConflicts = new Map()
  }

  /** Detect conflicts spanning multiple worktree scopes */
  detectCrossWorktreeConflicts(): CrossWorktreeConflict[] {
    const agents = this.daemon.listAgents()
    const worktreeManagers = agents.filter(
      (a) => a.agentType === AgentType.WorktreeManager
    )
    const regularAgents = agents.filter((a) => a.agentType === AgentType.Agent)

    // Group agents by worktree scope
    const scopeToAgents: Map<string, AgentMetadata[]> = new Map()
    for (const agent of regularAgents) {
      const scope = agent.worktreeScope
      if (scope) {
        const agentsInScope = scopeToAgents.get(scope) || []
        agentsInScope.push(agent)
        scopeToAgents.set(scope, agentsInScope)
      }
    }

    // Get pending touch notifications from daemon
    const allNotifications: Notification[] = []
    for (const agent of agents) {
      const pending = this.daemon.getPendingNotifications(agent.agentId)
      if (pending) {
        allNotifications.push(...pending)
      }
    }

    // Find touch notifications that indicate cross-worktree conflicts
    const touchNotifications = allNotifications.filter(
      (n) => n.type === NotificationType.Touch
    ) as Notification<TouchNotification>[]

    // Track files being modified by scope
    const fileModificationsByScope: Map<string, Set<string>> = new Map()
    for (const notification of touchNotifications) {
      const touch = notification.payload as TouchNotification
      const modifyingAgent = this.daemon.getAgent(touch.modifyingAgentId)
      if (modifyingAgent?.worktreeScope) {
        const scope = modifyingAgent.worktreeScope
        const files = fileModificationsByScope.get(scope) || new Set()
        files.add(touch.filePath)
        fileModificationsByScope.set(scope, files)
      }
    }

    // Find files modified in multiple scopes
    const fileToScopes: Map<string, string[]> = new Map()
    for (const [scope, files] of fileModificationsByScope.entries()) {
      for (const file of files) {
        const scopes = fileToScopes.get(file) || []
        scopes.push(scope)
        fileToScopes.set(file, scopes)
      }
    }

    // Build cross-worktree conflicts
    const conflicts: CrossWorktreeConflict[] = []
    for (const [filePath, scopes] of fileToScopes.entries()) {
      if (scopes.length > 1) {
        // This file is being modified in multiple scopes - cross-worktree conflict
        const involvedManagerIds: string[] = []
        for (const scope of scopes) {
          const managers = worktreeManagers.filter((m) => m.worktreeScope === scope)
          for (const m of managers) {
            if (!involvedManagerIds.includes(m.agentId)) {
              involvedManagerIds.push(m.agentId)
            }
          }
        }

        // Find conflicting agents
        const conflictingAgents: string[] = []
        for (const agent of regularAgents) {
          if (scopes.includes(agent.worktreeScope || '')) {
            conflictingAgents.push(agent.agentId)
          }
        }

        const conflict: CrossWorktreeConflict = {
          conflict: {
            conflictId: `cross-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            filePath,
            conflictingAgents,
            detectedAt: Date.now(),
            status: 'detected',
            resolution: null,
          },
          involvedScopes: scopes,
          involvedManagerIds,
          escalated: false,
        }

        conflicts.push(conflict)
        this.crossWorktreeConflicts.set(conflict.conflict.conflictId, conflict)
      }
    }

    return conflicts
  }

  /** Coordinate resolution of a cross-worktree conflict (Coordinator handles these) */
  coordinateCrossWorktreeResolution(conflict: CrossWorktreeConflict): ConflictResolution {
    // Mark as escalated since Coordinator handles cross-worktree conflicts
    const updatedConflict = { ...conflict, escalated: true }
    this.crossWorktreeConflicts.set(updatedConflict.conflict.conflictId, updatedConflict)

    // Notify all involved worktree managers
    this.notifyWorktreeManagers(updatedConflict)

    // Create resolution with merge strategy
    const resolution: ConflictResolution = {
      strategy: 'merge',
      resolvedBy: updatedConflict.involvedManagerIds,
      resolvedAt: Date.now(),
      notes: `Cross-worktree conflict escalated to Coordinator for resolution`,
    }

    // Update conflict with resolution
    const resolvedConflict = {
      ...updatedConflict,
      conflict: { ...updatedConflict.conflict, resolution },
    }
    this.crossWorktreeConflicts.set(resolvedConflict.conflict.conflictId, resolvedConflict)

    return resolution
  }

  /** Determine merge order via topological sort of inter-worktree dependency DAG */
  determineMergeOrder(worktrees: WorktreeMetadata[], plan: Plan): string[] {
    const dag = this.buildInterWorktreeDependencyDag(plan)

    // Topological sort using Kahn's algorithm
    const inDegree: Map<string, number> = new Map()
    const adjacency: Map<string, string[]> = new Map()

    // Initialize
    for (const node of dag.nodes) {
      inDegree.set(node, 0)
      adjacency.set(node, [])
    }

    // Build adjacency list and calculate in-degrees
    for (const edge of dag.edges) {
      adjacency.get(edge.fromScope)?.push(edge.toScope)
      const toDegree = inDegree.get(edge.toScope) || 0
      inDegree.set(edge.toScope, toDegree + 1)
    }

    // Find all nodes with no incoming edges
    const queue: string[] = []
    for (const [node, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(node)
      }
    }

    // Process queue
    const result: string[] = []
    while (queue.length > 0) {
      const current = queue.shift()!
      result.push(current)

      for (const neighbor of adjacency.get(current) || []) {
        const degree = inDegree.get(neighbor)!
        inDegree.set(neighbor, degree - 1)
        if (degree - 1 === 0) {
          queue.push(neighbor)
        }
      }
    }

    // If there are remaining nodes, there's a cycle - add them anyway
    for (const node of dag.nodes) {
      if (!result.includes(node)) {
        result.push(node)
      }
    }

    return result
  }

  /** Build inter-worktree dependency DAG from plan */
  buildInterWorktreeDependencyDag(plan: Plan): InterWorktreeDag {
    const nodes: string[] = []
    const edges: InterWorktreeEdge[] = []

    // Get unique scopes from tasks
    const scopeToTasks: Map<string, string[]> = new Map()
    for (const task of plan.tasks) {
      const scope = task.scope || 'main'
      if (!nodes.includes(scope)) {
        nodes.push(scope)
      }
      const tasks = scopeToTasks.get(scope) || []
      tasks.push(task.taskId)
      scopeToTasks.set(scope, tasks)
    }

    // Build edges from dependencies
    // When t2 depends on t1, t1 must be merged first, so edge goes from t1's scope to t2's scope
    for (const dependency of plan.dependencies) {
      const fromTask = plan.tasks.find((t) => t.taskId === dependency.fromTaskId)
      const toTask = plan.tasks.find((t) => t.taskId === dependency.toTaskId)

      if (fromTask && toTask) {
        const dependentScope = fromTask.scope || 'main'
        const dependencyScope = toTask.scope || 'main'

        if (dependentScope !== dependencyScope) {
          // Find existing edge or create new one
          // Edge direction: from dependencyScope (must be merged first) to dependentScope
          let edge = edges.find(
            (e) => e.fromScope === dependencyScope && e.toScope === dependentScope
          )
          if (!edge) {
            edge = {
              fromScope: dependencyScope,
              toScope: dependentScope,
              taskIds: [],
              dependencyType: dependency.type === DependencyType.Hard ? 'hard' : 'soft',
            }
            edges.push(edge)
          }
          if (!edge.taskIds.includes(dependency.fromTaskId)) {
            edge.taskIds.push(dependency.fromTaskId)
          }
          if (!edge.taskIds.includes(dependency.toTaskId)) {
            edge.taskIds.push(dependency.toTaskId)
          }
        }
      }
    }

    return { nodes, edges }
  }

  /** Get all worktree managers */
  getWorktreeManagers(): AgentMetadata[] {
    const agents = this.daemon.listAgents()
    return agents.filter((a) => a.agentType === AgentType.WorktreeManager)
  }

  /** Get worktree metadata for a specific scope */
  getWorktreeMetadata(scope: string): WorktreeMetadata | undefined {
    const managers = this.getWorktreeManagers()
    const manager = managers.find((m) => m.worktreeScope === scope)
    if (!manager) {
      return undefined
    }

    // Build worktree metadata from manager info
    return {
      worktreeId: scope,
      path: `/.kiro/worktrees/${scope}`,
      branchName: `feature/${scope}`,
      baseBranch: 'main',
      managerId: manager.agentId,
      assignedAgents: [],
      status: WorktreeStatus.Active,
      conflicts: [],
      mergePreparation: null,
    }
  }

  /** Notify all worktree managers about a cross-worktree conflict */
  notifyWorktreeManagers(conflict: CrossWorktreeConflict): void {
    const managerIds = conflict.involvedManagerIds

    for (const managerId of managerIds) {
      this.daemon.sendDM({
        messageId: `cross-conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        senderId: this.daemon.getCoordinatorId() || 'system',
        recipientId: managerId,
        content: JSON.stringify({
          type: 'cross_worktree_conflict',
          conflict: conflict.conflict,
          involvedScopes: conflict.involvedScopes,
        }),
        timestamp: Date.now(),
        read: false,
      })
    }
  }
}