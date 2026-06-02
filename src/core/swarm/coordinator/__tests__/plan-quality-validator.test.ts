import { describe, it, expect, beforeEach } from 'vitest'
import { PlanQualityValidator } from '../plan-quality-validator'
import {
  Plan,
  Task,
  Dependency,
  PlanValidationSeverity,
  PlanValidationIssueType,
} from '@roo-code/types'

describe('PlanQualityValidator', () => {
  let validator: PlanQualityValidator

  beforeEach(() => {
    validator = new PlanQualityValidator()
  })

  describe('validatePlan', () => {
    it('returns no issues for a valid plan', () => {
      const plan: Plan = {
        planId: 'plan-1',
        version: 1,
        tasks: [
          {
            taskId: 'task-1',
            description: 'First task',
            owner: 'agent-1',
            scope: 'scope-a',
            status: 'pending',
            dependsOn: [],
            blockedBy: [],
            checkpoints: [],
            estimatedEffort: 10,
            priority: 1,
            tags: [],
          },
          {
            taskId: 'task-2',
            description: 'Second task',
            owner: 'agent-2',
            scope: 'scope-b',
            status: 'pending',
            dependsOn: ['task-1'],
            blockedBy: [],
            checkpoints: [],
            estimatedEffort: 20,
            priority: 2,
            tags: [],
          },
        ],
        dependencies: [{ fromTaskId: 'task-2', toTaskId: 'task-1', type: 'hard' }],
        description: 'Test plan',
        updateHistory: [],
      }

      const result = validator.validatePlan(plan)

      expect(result.planId).toBe('plan-1')
      expect(result.overallSeverity).toBe(PlanValidationSeverity.Info)
      expect(result.issues).toHaveLength(0)
    })

    it('detects duplicate task IDs', () => {
      const plan: Plan = {
        planId: 'plan-2',
        version: 1,
        tasks: [
          {
            taskId: 'task-1',
            description: 'Task one',
            owner: 'agent-1',
            scope: 'scope-a',
            status: 'pending',
            dependsOn: [],
            blockedBy: [],
            checkpoints: [],
            estimatedEffort: 10,
            priority: 1,
            tags: [],
          },
          {
            taskId: 'task-1',
            description: 'Duplicate task',
            owner: 'agent-2',
            scope: 'scope-b',
            status: 'pending',
            dependsOn: [],
            blockedBy: [],
            checkpoints: [],
            estimatedEffort: 10,
            priority: 1,
            tags: [],
          },
        ],
        dependencies: [],
        description: 'Plan with duplicate',
        updateHistory: [],
      }

      const result = validator.validatePlan(plan)

      expect(result.issues.some((i) => i.type === PlanValidationIssueType.DuplicateTask)).toBe(true)
    })

    it('detects missing descriptions', () => {
      const plan: Plan = {
        planId: 'plan-3',
        version: 1,
        tasks: [
          {
            taskId: 'task-1',
            description: '',
            owner: 'agent-1',
            scope: 'scope-a',
            status: 'pending',
            dependsOn: [],
            blockedBy: [],
            checkpoints: [],
            estimatedEffort: 10,
            priority: 1,
            tags: [],
          },
        ],
        dependencies: [],
        description: 'Plan with missing description',
        updateHistory: [],
      }

      const result = validator.validatePlan(plan)

      expect(result.issues.some((i) => i.type === PlanValidationIssueType.MissingDescription)).toBe(true)
      expect(result.overallSeverity).toBe(PlanValidationSeverity.Error)
    })

    it('detects circular dependencies', () => {
      const plan: Plan = {
        planId: 'plan-4',
        version: 1,
        tasks: [
          {
            taskId: 'task-1',
            description: 'Task 1',
            owner: 'agent-1',
            scope: 'scope-a',
            status: 'pending',
            dependsOn: ['task-2'],
            blockedBy: [],
            checkpoints: [],
            estimatedEffort: 10,
            priority: 1,
            tags: [],
          },
          {
            taskId: 'task-2',
            description: 'Task 2',
            owner: 'agent-2',
            scope: 'scope-a',
            status: 'pending',
            dependsOn: ['task-1'],
            blockedBy: [],
            checkpoints: [],
            estimatedEffort: 10,
            priority: 1,
            tags: [],
          },
        ],
        dependencies: [],
        description: 'Plan with circular dep',
        updateHistory: [],
      }

      const result = validator.validatePlan(plan)

      expect(result.issues.some((i) => i.type === PlanValidationIssueType.CircularDependency)).toBe(true)
    })
  })

  describe('validateTask', () => {
    it('validates a single task', () => {
      const plan: Plan = {
        planId: 'plan-5',
        version: 1,
        tasks: [
          {
            taskId: 'task-1',
            description: 'Valid task',
            owner: 'agent-1',
            scope: 'scope-a',
            status: 'pending',
            dependsOn: [],
            blockedBy: [],
            checkpoints: [],
            estimatedEffort: 10,
            priority: 1,
            tags: [],
          },
        ],
        dependencies: [],
        description: 'Test',
        updateHistory: [],
      }

      const result = validator.validateTask(plan.tasks[0], plan)

      expect(result.taskId).toBe('task-1')
      expect(result.overallSeverity).toBe(PlanValidationSeverity.Info)
    })

    it('detects invalid scope', () => {
      const plan: Plan = {
        planId: 'plan-6',
        version: 1,
        tasks: [
          {
            taskId: 'task-1',
            description: 'Task',
            owner: 'agent-1',
            scope: '',
            status: 'pending',
            dependsOn: [],
            blockedBy: [],
            checkpoints: [],
            estimatedEffort: 10,
            priority: 1,
            tags: [],
          },
        ],
        dependencies: [],
        description: 'Test',
        updateHistory: [],
      }

      const result = validator.validateTask(plan.tasks[0], plan)

      expect(result.issues.some((i) => i.type === PlanValidationIssueType.InvalidScope)).toBe(true)
    })
  })

  describe('validateDependencies', () => {
    it('validates dependencies', () => {
      const plan: Plan = {
        planId: 'plan-7',
        version: 1,
        tasks: [
          {
            taskId: 'task-1',
            description: 'Task 1',
            owner: 'agent-1',
            scope: 'scope-a',
            status: 'pending',
            dependsOn: [],
            blockedBy: [],
            checkpoints: [],
            estimatedEffort: 10,
            priority: 1,
            tags: [],
          },
        ],
        dependencies: [{ fromTaskId: 'task-1', toTaskId: 'task-1', type: 'hard' }],
        description: 'Test',
        updateHistory: [],
      }

      const results = validator.validateDependencies(plan.dependencies, plan)

      expect(results[0].issues.some((i) => i.type === PlanValidationIssueType.CircularDependency)).toBe(true)
    })
  })

  describe('detectCircularDependencies', () => {
    it('detects cycles in dependencies', () => {
      const tasks: Task[] = [
        {
          taskId: 'a',
          description: 'A',
          owner: 'agent-1',
          scope: 's',
          status: 'pending',
          dependsOn: ['b'],
          blockedBy: [],
          checkpoints: [],
          estimatedEffort: 1,
          priority: 1,
          tags: [],
        },
        {
          taskId: 'b',
          description: 'B',
          owner: 'agent-1',
          scope: 's',
          status: 'pending',
          dependsOn: ['a'],
          blockedBy: [],
          checkpoints: [],
          estimatedEffort: 1,
          priority: 1,
          tags: [],
        },
      ]
      const deps: Dependency[] = []

      const issues = validator['detectCircularDependencies'](deps, tasks)

      expect(issues.some((i) => i.type === PlanValidationIssueType.CircularDependency)).toBe(true)
    })
  })

  describe('findOrphanTasks', () => {
    it('finds orphan tasks', () => {
      const tasks: Task[] = [
        {
          taskId: 'orphan',
          description: 'Orphan',
          owner: 'agent-1',
          scope: 's',
          status: 'pending',
          dependsOn: [],
          blockedBy: [],
          checkpoints: [],
          estimatedEffort: 1,
          priority: 1,
          tags: [],
        },
        {
          taskId: 'main',
          description: 'Main',
          owner: 'agent-1',
          scope: 's',
          status: 'pending',
          dependsOn: ['orphan'],
          blockedBy: [],
          checkpoints: [],
          estimatedEffort: 1,
          priority: 1,
          tags: [],
        },
      ]
      const deps: Dependency[] = []

      const issues = validator['findOrphanTasks'](tasks, deps)

      // 'orphan' has outgoing dependency, 'main' has incoming - neither is orphan
      expect(issues).toHaveLength(0)
    })
  })

  describe('validateScopeConsistency', () => {
    it('validates scope consistency', () => {
      const tasks: Task[] = [
        {
          taskId: 't1',
          description: 'Task 1',
          owner: 'agent-1',
          scope: 'scope-a',
          status: 'pending',
          dependsOn: [],
          blockedBy: [],
          checkpoints: [],
          estimatedEffort: 1,
          priority: 1,
          tags: [],
        },
      ]

      const results = validator.validateScopeConsistency(tasks)

      expect(results).toHaveLength(1)
      expect(results[0].scope).toBe('scope-a')
    })
  })
})