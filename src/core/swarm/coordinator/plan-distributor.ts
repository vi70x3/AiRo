import {
  Plan,
  Task,
  Dependency,
  TaskStatus,
  AgentMetadata,
  AgentLifecycleState,
  PlanUpdate,
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
  
  constructor(daemon: IDaemon)
  
  /** Distribute the current plan to all active agents with personalized messages via DM + broadcast summary */
  distributePlan(plan: Plan): DistributionResult
  
  /** Distribute a plan update (only changes) to all active agents */
  distributePlanUpdate(plan: Plan, update: PlanUpdate): DistributionResult
  
  /** Create a personalized plan distribution message for a specific agent */
  createAgentMessage(plan: Plan, agentId: string): PlanDistributionMessage
  
  /** Find tasks relevant to a specific agent (owned + transitive dependents + dependencies) */
  findRelevantTasks(plan: Plan, agentId: string): Task[]
  
  /** Find dependencies relevant to a set of task IDs */
  findRelevantDependencies(plan: Plan, relevantTaskIds: string[]): Dependency[]
  
  /** Find other agents working on related tasks */
  findRelatedAgents(plan: Plan, agentId: string): string[]
  
  /** Get all active agents (not crashed, failed, or stopped) */
  getActiveAgents(): AgentMetadata[]
}