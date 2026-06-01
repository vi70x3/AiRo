import { describe, it, expect, beforeEach, test } from 'vitest'
import { PlanManager } from '../plan-manager'
import { Plan, Task, TaskStatus, PlanUpdate } from '@roo-code/types'

describe('PlanManager', () => {
  let planManager: PlanManager
  
  beforeEach(() => {
    planManager = new PlanManager()
  })
  
  it('should set and get plan', () => {
    // Test with a simple plan
    const plan: Plan = {
      planId: 'test-plan',
      version: 1,
      tasks: [],
      dependencies: [],
      description: 'Test plan',
      updateHistory: []
    }
    
    planManager.setPlan(plan)
    expect(planManager.getPlan()).toBeDefined()
    expect(planManager.getPlan()).toEqual(plan)
  })
  
  it('should update task status', () => {
    const plan: Plan = {
      planId: 'test-plan',
      version: 1,
      tasks: [{
        taskId: 'task-1',
        description: 'Test task',
        owner: 'agent-1',
        scope: 'test-scope',
        status: TaskStatus.Pending,
        dependsOn: [],
        blockedBy: [],
        checkpoints: [],
        estimatedEffort: 10,
        priority: 1,
        tags: []
      }],
      dependencies: [],
      description: 'Test plan',
      updateHistory: []
    }
    
    planManager.setPlan(plan)
    planManager.updateTaskStatus('task-1', TaskStatus.InProgress)
    
    const task = planManager.getTask('task-1')
    expect(task).toBeDefined()
    expect(task?.status).toBe(TaskStatus.InProgress)
  })
})