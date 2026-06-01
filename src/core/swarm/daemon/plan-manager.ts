import { 
  Plan, 
  Task, 
  SwarmTaskStatus, 
  PlanUpdate 
} from '@roo-code/types'

export class PlanManager {
  private plan: Plan | null = null
  
  setPlan(plan: Plan): void {
    this.plan = plan
  }
  
  getPlan(): Plan | null {
    return this.plan
  }
  
  getTask(taskId: string): Task | undefined {
    if (!this.plan) {
      return undefined
    }
    
    return this.plan.tasks.find(task => task.taskId === taskId)
  }
  
  updateTaskStatus(taskId: string, status: SwarmTaskStatus): void {
    if (!this.plan) {
      throw new Error('No plan set')
    }
    
    const task = this.plan.tasks.find(t => t.taskId === taskId)
    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`)
    }
    
    task.status = status
  }
  
  addPlanUpdateToHistory(update: PlanUpdate): void {
    if (!this.plan) {
      throw new Error('No plan set')
    }
    
    this.plan.updateHistory.push(update)
  }
  
  getPlanVersion(): number {
    return this.plan ? this.plan.version : 0
  }
  
  incrementPlanVersion(): number {
    if (!this.plan) {
      throw new Error('No plan set')
    }
    
    this.plan.version += 1
    return this.plan.version
  }
}