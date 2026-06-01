import { describe, it, expect } from 'vitest'
import { PlanCreator, PlanInput, TaskDescription, DependencyInput } from '../plan-creation'
import { TaskStatus, DependencyType, CheckpointStatus } from '@roo-code/types'

describe('PlanCreator', () => {
  let creator: PlanCreator

  beforeEach(() => {
    creator = new PlanCreator()
  })

  describe('createPlan', () => {
    it('creates plan from simple input (1 task, no dependencies)', () => {
      const input: PlanInput = {
        description: 'Simple plan',
        taskDescriptions: [
          { description: 'Write unit tests for auth module' },
        ],
      }

      const plan = creator.createPlan(input)

      expect(plan.planId).toMatch(/^plan-/)
      expect(plan.version).toBe(1)
      expect(plan.description).toBe('Simple plan')
      expect(plan.tasks).toHaveLength(1)
      expect(plan.dependencies).toHaveLength(0)
      expect(plan.updateHistory).toHaveLength(0)
      expect(plan.tasks[0].description).toBe('Write unit tests for auth module')
      expect(plan.tasks[0].status).toBe(TaskStatus.Pending)
      expect(plan.tasks[0].taskId).toMatch(/^task-/)
    })

    it('creates plan from complex input (5 tasks, with dependencies)', () => {
      const input: PlanInput = {
        description: 'Complex plan',
        taskDescriptions: [
          { description: 'Update the login page UI' },
          { description: 'Add database migration for users' },
          { description: 'Write tests for the API' },
          { description: 'Update documentation' },
          { description: 'Deploy to production' },
        ],
        knownDependencies: [
          { fromTaskIndex: 1, toTaskIndex: 0, type: DependencyType.Hard },
          { fromTaskIndex: 2, toTaskIndex: 1, type: DependencyType.Hard },
          { fromTaskIndex: 3, toTaskIndex: 2, type: DependencyType.Soft },
          { fromTaskIndex: 4, toTaskIndex: 3, type: DependencyType.Hard },
        ],
      }

      const plan = creator.createPlan(input)

      expect(plan.tasks).toHaveLength(5)
      expect(plan.dependencies.length).toBeGreaterThanOrEqual(4)

      // Verify task IDs are unique
      const taskIds = plan.tasks.map(t => t.taskId)
      const uniqueIds = new Set(taskIds)
      expect(uniqueIds.size).toBe(taskIds.length)

      // Verify dependencies reference valid task IDs
      for (const dep of plan.dependencies) {
        expect(taskIds).toContain(dep.fromTaskId)
        expect(taskIds).toContain(dep.toTaskId)
      }
    })
  })

  describe('buildTask', () => {
    it('assigns ID, defaults for missing fields', () => {
      const input: PlanInput = {
        description: 'Test',
        taskDescriptions: [
          { description: 'A task with minimal fields' },
        ],
      }

      const plan = creator.createPlan(input)
      const task = plan.tasks[0]

      expect(task.taskId).toBeDefined()
      expect(task.taskId).toMatch(/^task-/)
      expect(task.owner).toBe('')
      expect(task.status).toBe(TaskStatus.Pending)
      expect(task.dependsOn).toEqual([])
      expect(task.blockedBy).toEqual([])
      expect(task.checkpoints).toEqual([])
      expect(task.estimatedEffort).toBe(5) // default
      expect(task.priority).toBe(5) // default
      expect(task.tags).toEqual([])
    })

    it('preserves provided fields', () => {
      const input: PlanInput = {
        description: 'Test',
        taskDescriptions: [
          {
            description: 'A task with all fields',
            scope: 'custom-scope',
            estimatedEffort: 8,
            priority: 9,
            tags: ['urgent', 'frontend'],
          },
        ],
      }

      const plan = creator.createPlan(input)
      const task = plan.tasks[0]

      expect(task.scope).toBe('custom-scope')
      expect(task.estimatedEffort).toBe(8)
      expect(task.priority).toBe(9)
      expect(task.tags).toEqual(['urgent', 'frontend'])
    })
  })

  describe('buildDependencies', () => {
    it('resolves indices to task IDs', () => {
      const input: PlanInput = {
        description: 'Test',
        taskDescriptions: [
          { description: 'Task A' },
          { description: 'Task B' },
          { description: 'Task C' },
        ],
        knownDependencies: [
          { fromTaskIndex: 0, toTaskIndex: 1, type: DependencyType.Hard },
          { fromTaskIndex: 1, toTaskIndex: 2, type: DependencyType.Soft },
        ],
      }

      const plan = creator.createPlan(input)

      // Find the dependency from Task A to Task B
      const depAB = plan.dependencies.find(
        d => d.fromTaskId === plan.tasks[0].taskId && d.toTaskId === plan.tasks[1].taskId
      )
      expect(depAB).toBeDefined()
      expect(depAB!.type).toBe(DependencyType.Hard)

      // Find the dependency from Task B to Task C
      const depBC = plan.dependencies.find(
        d => d.fromTaskId === plan.tasks[1].taskId && d.toTaskId === plan.tasks[2].taskId
      )
      expect(depBC).toBeDefined()
      expect(depBC!.type).toBe(DependencyType.Soft)
    })
  })

  describe('analyzeImplicitDependencies', () => {
    it('tasks in same scope get soft dependency', () => {
      const descriptions: TaskDescription[] = [
        { description: 'Update the login page UI', scope: 'frontend' },
        { description: 'Update the dashboard component', scope: 'frontend' },
        { description: 'Add database migration', scope: 'backend' },
      ]

      const implicitDeps = creator.analyzeImplicitDependencies(descriptions)

      // Two frontend tasks should get a soft dependency
      expect(implicitDeps).toContainEqual({
        fromTaskIndex: 0,
        toTaskIndex: 1,
        type: DependencyType.Soft,
      })

      // Backend task has no same-scope partner
      const backendDep = implicitDeps.find(d => d.fromTaskIndex === 2 || d.toTaskIndex === 2)
      expect(backendDep).toBeUndefined()
    })

    it('no implicit dependencies when all scopes are different', () => {
      const descriptions: TaskDescription[] = [
        { description: 'Task A', scope: 'scope-a' },
        { description: 'Task B', scope: 'scope-b' },
        { description: 'Task C', scope: 'scope-c' },
      ]

      const implicitDeps = creator.analyzeImplicitDependencies(descriptions)
      expect(implicitDeps).toHaveLength(0)
    })
  })

  describe('assignScopes', () => {
    it('keyword-based inference: frontend', () => {
      const descriptions: TaskDescription[] = [
        { description: 'Update the login page UI' },
        { description: 'Fix CSS styling issues' },
        { description: 'Add React component' },
      ]

      const scopes = creator.assignScopes(descriptions)
      expect(scopes.get(0)).toBe('frontend')
      expect(scopes.get(1)).toBe('frontend')
      expect(scopes.get(2)).toBe('frontend')
    })

    it('keyword-based inference: backend', () => {
      const descriptions: TaskDescription[] = [
        { description: 'Add database migration for users' },
        { description: 'Create REST API endpoint' },
        { description: 'Update server model' },
      ]

      const scopes = creator.assignScopes(descriptions)
      expect(scopes.get(0)).toBe('backend')
      expect(scopes.get(1)).toBe('backend')
      expect(scopes.get(2)).toBe('backend')
    })

    it('keyword-based inference: testing', () => {
      const descriptions: TaskDescription[] = [
        { description: 'Write unit tests for auth' },
        { description: 'Add test coverage for utils' },
      ]

      const scopes = creator.assignScopes(descriptions)
      expect(scopes.get(0)).toBe('testing')
      expect(scopes.get(1)).toBe('testing')
    })

    it('keyword-based inference: infrastructure', () => {
      const descriptions: TaskDescription[] = [
        { description: 'Update CI config' },
        { description: 'Setup deployment pipeline' },
      ]

      const scopes = creator.assignScopes(descriptions)
      expect(scopes.get(0)).toBe('infrastructure')
      expect(scopes.get(1)).toBe('infrastructure')
    })

    it('keyword-based inference: documentation', () => {
      const descriptions: TaskDescription[] = [
        { description: 'Update README documentation' },
        { description: 'Write docs for API' },
      ]

      const scopes = creator.assignScopes(descriptions)
      expect(scopes.get(0)).toBe('documentation')
      expect(scopes.get(1)).toBe('documentation')
    })

    it('fallback for unknown keywords', () => {
      const descriptions: TaskDescription[] = [
        { description: 'Do something mysterious' },
        { description: 'Another unknown task' },
      ]

      const scopes = creator.assignScopes(descriptions)
      expect(scopes.get(0)).toBe('scope-0')
      expect(scopes.get(1)).toBe('scope-1')
    })
  })

  describe('createCheckpoints', () => {
    it('creates checkpoints from descriptions', () => {
      const input: PlanInput = {
        description: 'Test',
        taskDescriptions: [
          {
            description: 'Task with checkpoints',
            checkpoints: ['Initial setup', 'Code complete', 'Tests passing'],
          },
        ],
      }

      const plan = creator.createPlan(input)
      const task = plan.tasks[0]

      expect(task.checkpoints).toHaveLength(3)
      expect(task.checkpoints[0].description).toBe('Initial setup')
      expect(task.checkpoints[0].status).toBe(CheckpointStatus.Pending)
      expect(task.checkpoints[0].completedAt).toBeNull()
      expect(task.checkpoints[0].validationResult).toBeNull()
      expect(task.checkpoints[0].checkpointId).toMatch(/^checkpoint-/)
    })
  })

  describe('plan structure', () => {
    it('plan has correct version (1), planId, updateHistory (empty)', () => {
      const input: PlanInput = {
        description: 'Test plan',
        taskDescriptions: [{ description: 'Task 1' }],
      }

      const plan = creator.createPlan(input)

      expect(plan.version).toBe(1)
      expect(plan.planId).toMatch(/^plan-/)
      expect(plan.updateHistory).toEqual([])
    })
  })
})
