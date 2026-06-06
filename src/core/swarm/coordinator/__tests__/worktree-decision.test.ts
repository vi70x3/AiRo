import { describe, it, expect } from 'vitest'
import { WorktreeDecider, ConflictRisk, ScopeSeparation } from '../worktree-decision'
import { Task, Dependency, DependencyType, TaskStatus } from '@roo-code/types'

// Helper to create tasks with specific scopes
const createTasks = (scopes: string[]): Task[] =>
  scopes.map((scope, i) => ({
    taskId: `task-${i}`,
    description: `Task ${i}`,
    owner: '',
    scope,
    status: TaskStatus.Pending,
    dependsOn: [],
    blockedBy: [],
    checkpoints: [],
    estimatedEffort: 5,
    priority: 5,
    tags: [],
  }))

// Helper to create cross-scope dependencies
const createCrossScopeDeps = (tasks: Task[], crossScopePairs: [number, number][]): Dependency[] => {
  const deps: Dependency[] = []
  for (const [fromIdx, toIdx] of crossScopePairs) {
    deps.push({
      fromTaskId: tasks[fromIdx].taskId,
      toTaskId: tasks[toIdx].taskId,
      type: DependencyType.Hard,
    })
  }
  return deps
}

describe('WorktreeDecider', () => {
  let decider: WorktreeDecider

  beforeEach(() => {
    decider = new WorktreeDecider()
  })

  describe('decide', () => {
    it('decides: <3 tasks → no worktrees', () => {
      const tasks = createTasks(['frontend', 'backend'])
      const decision = decider.decide(tasks, [])

      expect(decision.useWorktrees).toBe(false)
      expect(decision.reason).toBe('Fewer than 3 tasks, worktrees not beneficial')
      expect(decision.worktreeCount).toBe(0)
      expect(decision.scopeAssignments.size).toBe(0)
    })

    it('decides: >50% scope overlap → no worktrees', () => {
      // 4 tasks, 3 in same scope = 75% overlap
      const tasks = createTasks(['frontend', 'frontend', 'frontend', 'backend'])
      const decision = decider.decide(tasks, [])

      expect(decision.useWorktrees).toBe(false)
      expect(decision.reason).toBe('High file overlap (>50%), merge cost too high')
      expect(decision.worktreeCount).toBe(0)
    })

    it('decides: clear scope separation + high conflict risk → use worktrees', () => {
      // 5 tasks, all different scopes = clear separation
      const tasks = createTasks(['frontend', 'backend', 'testing', 'infrastructure', 'documentation'])
      // Add many cross-scope dependencies to trigger high conflict risk
      const deps: Dependency[] = [
        { fromTaskId: 'task-0', toTaskId: 'task-1', type: DependencyType.Hard },
        { fromTaskId: 'task-1', toTaskId: 'task-2', type: DependencyType.Hard },
        { fromTaskId: 'task-2', toTaskId: 'task-3', type: DependencyType.Hard },
        { fromTaskId: 'task-3', toTaskId: 'task-4', type: DependencyType.Hard },
      ]

      const decision = decider.decide(tasks, deps)

      expect(decision.useWorktrees).toBe(true)
      expect(decision.worktreeCount).toBe(5)
    })

    it('decides: unclear scope separation → no worktrees', () => {
      // 5 tasks, all same scope = unclear separation
      const tasks = createTasks(['frontend', 'frontend', 'frontend', 'frontend', 'frontend'])
      const decision = decider.decide(tasks, [])

      expect(decision.useWorktrees).toBe(false)
      // This hits the >50% overlap check first
      expect(decision.reason).toBe('High file overlap (>50%), merge cost too high')
    })

    it('decides: moderate scope separation + medium conflict risk → use worktrees', () => {
      // 4 tasks, 2 scopes = 0.5 ratio = moderate separation
      const tasks = createTasks(['frontend', 'frontend', 'backend', 'backend'])
      // Add some cross-scope dependencies for medium conflict risk
      const deps: Dependency[] = [
        { fromTaskId: 'task-0', toTaskId: 'task-2', type: DependencyType.Hard },
      ]

      const decision = decider.decide(tasks, deps)

      expect(decision.useWorktrees).toBe(true)
      expect(decision.worktreeCount).toBe(2)
    })
  })

  describe('calculateScopeOverlap', () => {
    it('all same scope = 1.0', () => {
      const tasks = createTasks(['frontend', 'frontend', 'frontend'])
      const overlap = decider.calculateScopeOverlap(tasks)
      expect(overlap).toBe(1.0)
    })

    it('evenly distributed = low', () => {
      const tasks = createTasks(['frontend', 'backend', 'testing'])
      const overlap = decider.calculateScopeOverlap(tasks)
      expect(overlap).toBeCloseTo(0.333, 2)
    })

    it('two scopes, one dominant', () => {
      const tasks = createTasks(['frontend', 'frontend', 'frontend', 'backend'])
      const overlap = decider.calculateScopeOverlap(tasks)
      expect(overlap).toBe(0.75)
    })

    it('empty tasks = 0', () => {
      const overlap = decider.calculateScopeOverlap([])
      expect(overlap).toBe(0)
    })
  })

  describe('assessConflictRisk', () => {
    it('many cross-scope deps = High', () => {
      const tasks = createTasks(['frontend', 'backend', 'testing', 'infrastructure'])
      // 4 deps, 3 cross-scope = 75% > 30%
      const deps: Dependency[] = [
        { fromTaskId: 'task-0', toTaskId: 'task-1', type: DependencyType.Hard },
        { fromTaskId: 'task-1', toTaskId: 'task-2', type: DependencyType.Hard },
        { fromTaskId: 'task-2', toTaskId: 'task-3', type: DependencyType.Hard },
        { fromTaskId: 'task-0', toTaskId: 'task-3', type: DependencyType.Hard },
      ]

      const risk = decider.assessConflictRisk(tasks, deps)
      expect(risk).toBe(ConflictRisk.High)
    })

    it('no cross-scope deps = Low', () => {
      // Use same-scope tasks so the dependency is within one scope
      const tasks = createTasks(['frontend', 'frontend', 'backend'])
      const deps: Dependency[] = [
        { fromTaskId: 'task-0', toTaskId: 'task-1', type: DependencyType.Hard },
      ]

      const risk = decider.assessConflictRisk(tasks, deps)
      expect(risk).toBe(ConflictRisk.Low)
    })

    it('no dependencies = Low', () => {
      const tasks = createTasks(['frontend', 'backend'])
      const risk = decider.assessConflictRisk(tasks, [])
      expect(risk).toBe(ConflictRisk.Low)
    })

    it('some cross-scope deps = Medium', () => {
      // 5 tasks: 3 frontend, 2 backend
      // task-0=frontend, task-1=frontend, task-2=frontend, task-3=backend, task-4=backend
      const tasks = createTasks(['frontend', 'frontend', 'frontend', 'backend', 'backend'])
      // 10 deps: 3 cross-scope out of 10 = 30% → Medium (>10%, ≤30%)
      const deps: Dependency[] = [
        // Same-scope deps (7 total)
        { fromTaskId: 'task-0', toTaskId: 'task-1', type: DependencyType.Hard }, // frontend→frontend
        { fromTaskId: 'task-1', toTaskId: 'task-2', type: DependencyType.Hard }, // frontend→frontend
        { fromTaskId: 'task-0', toTaskId: 'task-2', type: DependencyType.Hard }, // frontend→frontend
        { fromTaskId: 'task-3', toTaskId: 'task-4', type: DependencyType.Hard }, // backend→backend
        { fromTaskId: 'task-2', toTaskId: 'task-1', type: DependencyType.Hard }, // frontend→frontend
        { fromTaskId: 'task-1', toTaskId: 'task-0', type: DependencyType.Hard }, // frontend→frontend
        { fromTaskId: 'task-4', toTaskId: 'task-3', type: DependencyType.Hard }, // backend→backend
        // Cross-scope deps (3 total)
        { fromTaskId: 'task-0', toTaskId: 'task-3', type: DependencyType.Hard }, // frontend→backend
        { fromTaskId: 'task-1', toTaskId: 'task-4', type: DependencyType.Hard }, // frontend→backend
        { fromTaskId: 'task-2', toTaskId: 'task-3', type: DependencyType.Hard }, // frontend→backend
      ]

      const risk = decider.assessConflictRisk(tasks, deps)
      expect(risk).toBe(ConflictRisk.Medium)
    })
  })

  describe('assessScopeSeparation', () => {
    it('many distinct scopes = Clear', () => {
      // 5 tasks, 5 unique scopes = 1.0 > 0.5 → Clear
      const tasks = createTasks(['frontend', 'backend', 'testing', 'infra', 'docs'])
      const separation = decider.assessScopeSeparation(tasks)
      expect(separation).toBe(ScopeSeparation.Clear)
    })

    it('all same scope = Unclear', () => {
      // 5 tasks, 1 unique scope = 0.2 → Unclear (not > 0.2)
      const tasks = createTasks(['frontend', 'frontend', 'frontend', 'frontend', 'frontend'])
      const separation = decider.assessScopeSeparation(tasks)
      expect(separation).toBe(ScopeSeparation.Unclear)
    })

    it('moderate separation', () => {
      // 4 tasks, 2 unique scopes = 0.5 → Moderate (>0.2, not >0.5)
      const tasks = createTasks(['frontend', 'frontend', 'backend', 'backend'])
      const separation = decider.assessScopeSeparation(tasks)
      expect(separation).toBe(ScopeSeparation.Moderate)
    })

    it('empty tasks = Unclear', () => {
      const separation = decider.assessScopeSeparation([])
      expect(separation).toBe(ScopeSeparation.Unclear)
    })
  })

  describe('assignScopesToWorktrees', () => {
    it('groups tasks by scope', () => {
      const tasks = createTasks(['frontend', 'backend', 'frontend', 'backend', 'testing'])
      const assignments = decider.assignScopesToWorktrees(tasks)

      expect(assignments.size).toBe(3)
      expect(assignments.get('frontend')).toEqual(['task-0', 'task-2'])
      expect(assignments.get('backend')).toEqual(['task-1', 'task-3'])
      expect(assignments.get('testing')).toEqual(['task-4'])
    })

    it('single scope gets all tasks', () => {
      const tasks = createTasks(['frontend', 'frontend', 'frontend'])
      const assignments = decider.assignScopesToWorktrees(tasks)

      expect(assignments.size).toBe(1)
      expect(assignments.get('frontend')).toEqual(['task-0', 'task-1', 'task-2'])
    })

    it('empty tasks = empty map', () => {
      const assignments = decider.assignScopesToWorktrees([])
      expect(assignments.size).toBe(0)
    })
  })
})
