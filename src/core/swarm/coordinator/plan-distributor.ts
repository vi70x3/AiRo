import {
  Plan,
  Task,
  Dependency,
  SwarmTaskStatus,
  AgentMetadata,
  AgentLifecycleState,
  PlanUpdate,
  DirectMessage,
  BroadcastMessage,
} from '@roo-code/types'
import { IDaemon } from '../interfaces'

export interface PlanDistributionMessage {
  type: 'plan_distribution'
  planId: string
  version: number
  description: string
  relevantTasks: Task[]
  relevantDependencies: Dependency[]
  allTasks: Task[]
  allDependencies: Dependency[]
  checkpoints: string[]
  relatedAgents: string[]
}

export interface DistributionResult {
  distributedCount: number
  recipientIds: string[]
  broadcastSent: boolean
}

export class PlanDistributor {
  private daemon: IDaemon
  
  constructor(daemon: IDaemon) {
    this.daemon = daemon
  }
  
  /** Distribute the current plan to all active agents with personalized messages via DM + broadcast summary */
  distributePlan(plan: Plan): DistributionResult {
    const activeAgents = this.getActiveAgents()
    const recipientIds: string[] = []
    
    // Send personalized DM to each active agent
    for (const agent of activeAgents) {
      const message = this.createAgentMessage(plan, agent.agentId)
      const dm: DirectMessage = {
        messageId: `plan-dm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        senderId: this.daemon.getCoordinatorId() || 'coordinator',
        recipientId: agent.agentId,
        content: message,
        timestamp: Date.now(),
        read: false,
      }
      this.daemon.sendDM(dm)
      recipientIds.push(agent.agentId)
    }
    
    // Broadcast summary to all agents
    const broadcast: BroadcastMessage = {
      messageId: `plan-broadcast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      senderId: this.daemon.getCoordinatorId() || 'coordinator',
      content: {
        type: 'plan_update',
        planId: plan.planId,
        version: plan.version,
        description: plan.description,
        distributedCount: activeAgents.length,
      },
      timestamp: Date.now(),
      recipients: activeAgents.map(a => a.agentId),
    }
    this.daemon.broadcast(broadcast)
    
    return {
      distributedCount: activeAgents.length,
      recipientIds,
      broadcastSent: true,
    }
  }
  
  /** Distribute a plan update (only changes) to all active agents */
  distributePlanUpdate(plan: Plan, update: PlanUpdate): DistributionResult {
    const activeAgents = this.getActiveAgents()
    const recipientIds: string[] = []
    
    // Send personalized DM to each active agent
    for (const agent of activeAgents) {
      const message: PlanDistributionMessage = {
        type: 'plan_distribution',
        planId: plan.planId,
        version: plan.version,
        description: plan.description,
        relevantTasks: this.findRelevantTasks(plan, agent.agentId),
        relevantDependencies: this.findRelevantDependencies(plan, 
          this.findRelevantTasks(plan, agent.agentId).map(t => t.taskId)
        ),
        allTasks: plan.tasks,
        allDependencies: plan.dependencies,
        checkpoints: [],
        relatedAgents: this.findRelatedAgents(plan, agent.agentId),
      }
      
      const dm: DirectMessage = {
        messageId: `plan-update-dm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        senderId: this.daemon.getCoordinatorId() || 'coordinator',
        recipientId: agent.agentId,
        content: {
          type: 'plan_update',
          update,
          message,
        },
        timestamp: Date.now(),
        read: false,
      }
      this.daemon.sendDM(dm)
      recipientIds.push(agent.agentId)
    }
    
    // Broadcast summary
    const broadcast: BroadcastMessage = {
      messageId: `plan-update-broadcast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      senderId: this.daemon.getCoordinatorId() || 'coordinator',
      content: {
        type: 'plan_update',
        planId: plan.planId,
        version: plan.version,
        updateId: update.updateId,
        distributedCount: activeAgents.length,
      },
      timestamp: Date.now(),
      recipients: activeAgents.map(a => a.agentId),
    }
    this.daemon.broadcast(broadcast)
    
    return {
      distributedCount: activeAgents.length,
      recipientIds,
      broadcastSent: true,
    }
  }
  
  /** Create a personalized plan distribution message for a specific agent */
  createAgentMessage(plan: Plan, agentId: string): PlanDistributionMessage {
    const relevantTasks = this.findRelevantTasks(plan, agentId)
    const relevantTaskIds = relevantTasks.map(t => t.taskId)
    
    return {
      type: 'plan_distribution',
      planId: plan.planId,
      version: plan.version,
      description: plan.description,
      relevantTasks,
      relevantDependencies: this.findRelevantDependencies(plan, relevantTaskIds),
      allTasks: plan.tasks,
      allDependencies: plan.dependencies,
      checkpoints: [],
      relatedAgents: this.findRelatedAgents(plan, agentId),
    }
  }
  
  /** Find tasks relevant to a specific agent (owned + transitive dependents + dependencies) */
  findRelevantTasks(plan: Plan, agentId: string): Task[] {
    const relevantTaskIds = new Set<string>()
    
    // Find tasks owned by this agent
    for (const task of plan.tasks) {
      if (task.owner === agentId) {
        relevantTaskIds.add(task.taskId)
      }
    }
    
    // Build a map of task dependencies
    const taskMap = new Map<string, Task>()
    for (const task of plan.tasks) {
      taskMap.set(task.taskId, task)
    }
    
    // For each task owned by the agent, find all tasks that depend on it (directly or transitively)
    // These are "transitive dependents" - tasks that need the agent's tasks to complete
    const findDependents = (taskId: string) => {
      for (const dep of plan.dependencies) {
        if (dep.toTaskId === taskId) {
          // dep.fromTaskId depends on taskId
          relevantTaskIds.add(dep.fromTaskId)
          findDependents(dep.fromTaskId)
        }
      }
    }
    
    for (const taskId of Array.from(relevantTaskIds)) {
      findDependents(taskId)
    }
    
    // Also find tasks that this agent's tasks depend on (dependencies)
    const findDependencies = (taskId: string) => {
      const task = taskMap.get(taskId)
      if (task) {
        for (const depTaskId of task.dependsOn) {
          relevantTaskIds.add(depTaskId)
          findDependencies(depTaskId)
        }
      }
    }
    
    for (const taskId of Array.from(relevantTaskIds)) {
      findDependencies(taskId)
    }
    
    // Return all relevant tasks
    return plan.tasks.filter(t => relevantTaskIds.has(t.taskId))
  }
  
  /** Find dependencies relevant to a set of task IDs */
  findRelevantDependencies(plan: Plan, relevantTaskIds: string[]): Dependency[] {
    return plan.dependencies.filter(
      dep => relevantTaskIds.includes(dep.fromTaskId) || relevantTaskIds.includes(dep.toTaskId)
    )
  }
  
  /** Find other agents working on related tasks */
  findRelatedAgents(plan: Plan, agentId: string): string[] {
    const relatedAgentIds = new Set<string>()
    const relevantTasks = this.findRelevantTasks(plan, agentId)
    const relevantTaskIds = new Set(relevantTasks.map(t => t.taskId))
    
    // Find agents that own tasks related to this agent's tasks
    for (const task of plan.tasks) {
      // If this agent owns the task, find other agents that depend on or are depended by this task
      if (task.owner === agentId) {
        // Find tasks that depend on this task
        for (const dep of plan.dependencies) {
          if (dep.toTaskId === task.taskId) {
            const dependentTask = plan.tasks.find(t => t.taskId === dep.fromTaskId)
            if (dependentTask && dependentTask.owner !== agentId) {
              relatedAgentIds.add(dependentTask.owner)
            }
          }
        }
        
        // Find tasks this task depends on
        for (const depTaskId of task.dependsOn) {
          const dependencyTask = plan.tasks.find(t => t.taskId === depTaskId)
          if (dependencyTask && dependencyTask.owner !== agentId) {
            relatedAgentIds.add(dependencyTask.owner)
          }
        }
      }
      
      // If this task is related to the agent, find its owner
      if (relevantTaskIds.has(task.taskId) && task.owner !== agentId) {
        relatedAgentIds.add(task.owner)
      }
    }
    
    return Array.from(relatedAgentIds)
  }
  
  /** Get all active agents (not crashed, failed, or stopped) */
  getActiveAgents(): AgentMetadata[] {
    const allAgents = this.daemon.listAgents()
    return allAgents.filter(agent => 
      agent.state !== AgentLifecycleState.Crashed &&
      agent.state !== AgentLifecycleState.Failed &&
      agent.state !== AgentLifecycleState.Stopped
    )
  }
}