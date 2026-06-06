import { IDaemon } from '../interfaces'
import {
  AgentType,
  AgentLifecycleState,
  AgentMetadata,
  Task,
  Plan,
} from '@roo-code/types'
import { WorktreeDecision } from './worktree-decision'

export interface SpawnResult {
  /** Successfully spawned agents */
  spawned: AgentMetadata[]
  /** Tasks that couldn't be assigned (no available scope/agent) */
  unassigned: string[]
  /** Worktree managers spawned */
  worktreeManagers: AgentMetadata[]
}

export class SpawnManager {
  private daemon: IDaemon
  private coordinatorId: string
  private spawnedAgentsList: AgentMetadata[]
  private spawnedWMs: AgentMetadata[]

  constructor(daemon: IDaemon, coordinatorId: string) {
    this.daemon = daemon
    this.coordinatorId = coordinatorId
    this.spawnedAgentsList = []
    this.spawnedWMs = []
  }

  /**
   * Spawn agents for all tasks in the plan based on worktree decision.
   * If worktrees are used: spawn WorktreeManagers first, then assign agents to scopes.
   * If no worktrees: spawn all agents in the main workspace.
   */
  spawnAgentsForPlan(plan: Plan, worktreeDecision: WorktreeDecision): SpawnResult {
    const spawned: AgentMetadata[] = []
    const unassigned: string[] = []
    const worktreeManagers: AgentMetadata[] = []

    if (worktreeDecision.useWorktrees) {
      // Spawn a WorktreeManager for each scope
      const scopeToWM = new Map<string, AgentMetadata>()
      for (const scope of worktreeDecision.scopeAssignments.keys()) {
        const wm = this.spawnWorktreeManager(scope)
        scopeToWM.set(scope, wm)
        worktreeManagers.push(wm)
      }

      // For each task, determine its scope and spawn an Agent assigned to that scope
      for (const task of plan.tasks) {
        const taskScope = task.scope
        const wm = scopeToWM.get(taskScope)
        if (wm) {
          const agent = this.spawnAgent(task.taskId, taskScope)
          spawned.push(agent)
        } else {
          // Task scope not in worktree decision — unassigned
          unassigned.push(task.taskId)
        }
      }
    } else {
      // No worktrees: spawn all agents in the main workspace
      for (const task of plan.tasks) {
        const agent = this.spawnAgent(task.taskId)
        spawned.push(agent)
      }
    }

    return {
      spawned,
      unassigned,
      worktreeManagers,
    }
  }

  /**
   * Spawn a single WorktreeManager for a specific scope.
   * Creates the WM metadata, registers with daemon, assigns to scope.
   * Returns the WM metadata.
   */
  spawnWorktreeManager(scope: string): AgentMetadata {
    const wmId = crypto.randomUUID()
    const wmMetadata: AgentMetadata = {
      agentId: wmId,
      agentType: AgentType.WorktreeManager,
      state: AgentLifecycleState.Spawned,
      parentId: this.coordinatorId,
      worktreeScope: scope,
      spawnedAt: Date.now(),
      lastHeartbeat: Date.now(),
      taskId: null,
      mode: '',
    }
    this.daemon.registerAgent(wmMetadata)
    this.spawnedWMs.push(wmMetadata)
    return wmMetadata
  }

  /**
   * Spawn a single Agent for a specific task.
   * Optionally assigns to a worktree scope.
   * Returns the agent metadata.
   */
  spawnAgent(taskId: string, worktreeScope?: string): AgentMetadata {
    const agentId = crypto.randomUUID()
    const agentMetadata: AgentMetadata = {
      agentId,
      agentType: AgentType.Agent,
      state: AgentLifecycleState.Spawned,
      parentId: this.coordinatorId,
      worktreeScope: worktreeScope ?? '',
      spawnedAt: Date.now(),
      lastHeartbeat: Date.now(),
      taskId,
      mode: '',
    }
    this.daemon.registerAgent(agentMetadata)
    this.spawnedAgentsList.push(agentMetadata)
    return agentMetadata
  }

  /**
   * Assign tasks to agents based on scope.
   * Maps each task to the appropriate worktree scope.
   * Returns a map of agentId → taskId assignments.
   */
  assignTasksToScopes(tasks: Task[], scopeAssignments: Map<string, string[]>): Map<string, string> {
    const assignments = new Map<string, string>()

    // Build a map of taskId → agentId for spawned agents
    const taskToAgent = new Map<string, string>()
    for (const agent of this.spawnedAgentsList) {
      if (agent.taskId) {
        taskToAgent.set(agent.taskId, agent.agentId)
      }
    }

    // For each scope's task assignments, map taskId → agentId
    for (const [, taskIds] of scopeAssignments) {
      for (const taskId of taskIds) {
        const agentId = taskToAgent.get(taskId)
        if (agentId) {
          assignments.set(agentId, taskId)
        }
      }
    }

    return assignments
  }

  /**
   * Get all agents spawned by this coordinator.
   */
  getSpawnedAgents(): AgentMetadata[] {
    return [...this.spawnedAgentsList]
  }

  /**
   * Get all worktree managers spawned by this coordinator.
   */
  getSpawnedWorktreeManagers(): AgentMetadata[] {
    return [...this.spawnedWMs]
  }

  /**
   * Check if an agent can be spawned for a given task.
   * Validates that the task exists in the plan and isn't already assigned.
   */
  canSpawnAgent(taskId: string, plan: Plan): boolean {
    // Check that the task exists in the plan
    const task = plan.tasks.find(t => t.taskId === taskId)
    if (!task) {
      return false
    }

    // Check that the task isn't already assigned to a spawned agent
    const alreadyAssigned = this.spawnedAgentsList.some(a => a.taskId === taskId)
    if (alreadyAssigned) {
      return false
    }

    return true
  }
}
