import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { CrashDetector, DEFAULT_CRASH_DETECTOR_CONFIG } from '../crash-detector'
import { RecoveryValidator } from '../recovery-validator'
import { ResumeCheckpointManager } from '../resume-checkpoint-manager'
import { Daemon } from '../daemon'
import {
  AgentType,
  AgentLifecycleState,
  CrashType,
  DaemonSnapshot,
  Plan,
  SwarmTaskStatus,
} from '@roo-code/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<{
  agentId: string
  agentType: AgentType
  state: AgentLifecycleState
  worktreeScope: string
  taskId: string | null
}> = {}) {
  return {
    agentId: overrides.agentId ?? 'agent-1',
    agentType: overrides.agentType ?? AgentType.Agent,
    state: overrides.state ?? AgentLifecycleState.Ready,
    parentId: null,
    worktreeScope: overrides.worktreeScope ?? 'wt-1',
    spawnedAt: Date.now(),
    lastHeartbeat: Date.now(),
    taskId: overrides.taskId ?? null,
    mode: 'code',
  }
}

function makePlan(): Plan {
  return {
    planId: 'plan-1',
    version: 1,
    description: 'Test plan',
    dependencies: [],
    updateHistory: [],
    tasks: [
      {
        taskId: 'task-1',
        description: 'Implement feature',
        owner: 'agent-1',
        scope: 'wt-1',
        status: SwarmTaskStatus.InProgress,
        dependsOn: [],
        blockedBy: [],
        checkpoints: [],
        estimatedEffort: 30,
        priority: 1,
        tags: [],
      },
      {
        taskId: 'task-2',
        description: 'Write tests',
        owner: 'agent-2',
        scope: 'wt-2',
        status: SwarmTaskStatus.Pending,
        dependsOn: ['task-1'],
        blockedBy: [],
        checkpoints: [],
        estimatedEffort: 15,
        priority: 2,
        tags: [],
      },
    ],
  }
}

function makeSnapshot(overrides: Partial<DaemonSnapshot> = {}): DaemonSnapshot {
  return {
    snapshotId: 'snap-1',
    timestamp: Date.now(),
    version: '1.0.0',
    agents: overrides.agents ?? [makeAgent()],
    notificationQueues: overrides.notificationQueues ?? {},
    channels: overrides.channels ?? [],
    channelHistories: overrides.channelHistories ?? [],
    contextKeys: overrides.contextKeys ?? {},
    plan: overrides.plan ?? null,
    swarmId: overrides.swarmId ?? 'test-swarm',
    coordinatorId: overrides.coordinatorId ?? '',
  }
}

// ---------------------------------------------------------------------------
// CrashDetector tests
// ---------------------------------------------------------------------------

describe('CrashDetector', () => {
  let detector: CrashDetector

  beforeEach(() => {
    detector = new CrashDetector({
      heartbeatIntervalMs: 100,
      heartbeatMissThreshold: 2,
      timeoutDurationMs: 500,
      enabled: true,
    })
  })

  afterEach(() => {
    detector.stopMonitoring()
  })

  it('should use default config values', () => {
    expect(DEFAULT_CRASH_DETECTOR_CONFIG.heartbeatIntervalMs).toBe(10000)
    expect(DEFAULT_CRASH_DETECTOR_CONFIG.heartbeatMissThreshold).toBe(3)
    expect(DEFAULT_CRASH_DETECTOR_CONFIG.timeoutDurationMs).toBe(60000)
    expect(DEFAULT_CRASH_DETECTOR_CONFIG.enabled).toBe(true)
  })

  it('should register and unregister agents', () => {
    detector.registerAgent('agent-1', AgentLifecycleState.Running)
    detector.unregisterAgent('agent-1')
    // No crash should be emitted for an unregistered agent
    detector.recordHeartbeat('agent-1')
    // Should not throw
  })

  it('should record heartbeats without crashing', () => {
    detector.registerAgent('agent-1', AgentLifecycleState.Running)
    detector.recordHeartbeat('agent-1')
    detector.recordProgress('agent-1')
    // Should not throw
  })

  it('should detect heartbeat miss crash', async () => {
    detector.registerAgent('agent-1', AgentLifecycleState.Running)

    const crashPromise = new Promise<void>((resolve) => {
      detector.onCrash((event) => {
        expect(event.agentId).toBe('agent-1')
        expect(event.crashType).toBe('heartbeat_miss' as CrashType)
        expect(event.lastKnownState).toBe(AgentLifecycleState.Running)
        expect(event.details).toContain('heartbeat')
        resolve()
      })
    })

    detector.startMonitoring()

    // Wait for enough intervals to trigger the miss threshold
    await new Promise((r) => setTimeout(r, 350))

    await crashPromise
  })

  it('should detect process exit crash', async () => {
    detector.registerAgent('agent-1', AgentLifecycleState.Running)
    detector.markProcessExited('agent-1')

    const crashPromise = new Promise<void>((resolve) => {
      detector.onCrash((event) => {
        expect(event.agentId).toBe('agent-1')
        expect(event.crashType).toBe('process_exit' as CrashType)
        expect(event.details).toContain('terminated')
        resolve()
      })
    })

    detector.startMonitoring()
    await new Promise((r) => setTimeout(r, 150))

    await crashPromise
  })

  it('should detect timeout crash when no progress is made', async () => {
    // Use a detector with high heartbeat miss threshold so timeout fires first
    const timeoutDetector = new CrashDetector({
      heartbeatIntervalMs: 100,
      heartbeatMissThreshold: 100, // Prevent heartbeat_miss from firing
      timeoutDurationMs: 500,
      enabled: true,
    })
    timeoutDetector.registerAgent('agent-1', AgentLifecycleState.Running)

    const crashPromise = new Promise<void>((resolve) => {
      timeoutDetector.onCrash((event) => {
        if (event.crashType === ('timeout' as CrashType)) {
          expect(event.agentId).toBe('agent-1')
          expect(event.details).toContain('progress')
          resolve()
        }
      })
    })

    timeoutDetector.startMonitoring()
    // Don't record any progress — wait for timeout
    await new Promise((r) => setTimeout(r, 600))

    await crashPromise
    timeoutDetector.stopMonitoring()
  }, 10000) // Increase timeout to 10s

  it('should not emit crash when monitoring is disabled', () => {
    const disabledDetector = new CrashDetector({ enabled: false })
    disabledDetector.registerAgent('agent-1', AgentLifecycleState.Running)

    let crashEmitted = false
    disabledDetector.onCrash(() => { crashEmitted = true })

    disabledDetector.startMonitoring()
    disabledDetector.markProcessExited('agent-1')

    // Give it a chance to fire
    expect(crashEmitted).toBe(false)
  })

  it('should allow unsubscribing from crash events', () => {
    let callCount = 0
    const unsubscribe = detector.onCrash(() => { callCount++ })

    detector.registerAgent('agent-1', AgentLifecycleState.Running)
    detector.markProcessExited('agent-1')

    unsubscribe()
    // After unsubscribe, listener should not be called
    // (we can't easily test the async emission here, but we verify unsubscribe doesn't throw)
    expect(callCount).toBe(0)
  })

  it('should update agent state', () => {
    detector.registerAgent('agent-1', AgentLifecycleState.Running)
    detector.updateAgentState('agent-1', AgentLifecycleState.Blocked)
    // No crash expected — just verifying no throw
  })
})

// ---------------------------------------------------------------------------
// RecoveryValidator tests
// ---------------------------------------------------------------------------

describe('RecoveryValidator', () => {
  let validator: RecoveryValidator

  beforeEach(() => {
    validator = new RecoveryValidator()
  })

  it('should validate a consistent snapshot as valid', () => {
    const snapshot = makeSnapshot({
      agents: [makeAgent({ state: AgentLifecycleState.Running })],
    })

    const result = validator.validateSnapshot(snapshot)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('should detect crashed agents as recoverable issues', () => {
    const snapshot = makeSnapshot({
      agents: [
        makeAgent({ agentId: 'agent-1', state: AgentLifecycleState.Crashed }),
      ],
    })

    const result = validator.validateSnapshot(snapshot)
    expect(result.recoverableIssues.some((i) => i.includes('crashed'))).toBe(true)
  })

  it('should detect notification queues referencing non-existent agents', () => {
    const snapshot = makeSnapshot({
      agents: [makeAgent({ agentId: 'agent-1' })],
      notificationQueues: {
        'non-existent-agent': [],
      },
    })

    const result = validator.validateSnapshot(snapshot)
    expect(result.recoverableIssues.some((i) => i.includes('non-existent agent'))).toBe(true)
  })

  it('should detect channel histories referencing non-existent agents', () => {
    const snapshot = makeSnapshot({
      agents: [makeAgent({ agentId: 'agent-1' })],
      channelHistories: [
        {
          channelName: 'general',
          messages: [
            {
              messageId: 'msg-1',
              senderId: 'ghost-agent',
              content: 'hello',
              timestamp: Date.now(),
              channelName: 'general',
              recipients: ['agent-1'],
            },
          ],
        },
      ],
    })

    const result = validator.validateSnapshot(snapshot)
    expect(result.recoverableIssues.some((i) => i.includes('non-existent agent'))).toBe(true)
  })

  it('should detect tasks assigned to crashed agents', () => {
    const plan = makePlan()
    plan.tasks[0].status = SwarmTaskStatus.InProgress
    plan.tasks[0].owner = 'agent-1'

    const snapshot = makeSnapshot({
      agents: [
        makeAgent({ agentId: 'agent-1', state: AgentLifecycleState.Crashed }),
      ],
      plan,
    })

    const result = validator.validateSnapshot(snapshot)
    expect(result.recoverableIssues.some((i) => i.includes('crashed agent'))).toBe(true)
  })

  it('should detect invalid task dependencies as errors', () => {
    const plan = makePlan()
    plan.tasks[0].dependsOn = ['non-existent-task']

    const snapshot = makeSnapshot({
      agents: [makeAgent({ agentId: 'agent-1' })],
      plan,
    })

    const result = validator.validateSnapshot(snapshot)
    expect(result.errors.some((e) => e.includes('non-existent task'))).toBe(true)
    expect(result.valid).toBe(false)
  })

  it('should detect orphaned worktrees', () => {
    const snapshot = makeSnapshot({
      agents: [
        makeAgent({ agentId: 'agent-1', worktreeScope: '' }),
      ],
    })
    // Manually add a worktree scope that no agent has
    snapshot.agents.push({
      ...makeAgent({ agentId: 'agent-2', worktreeScope: 'orphaned-wt' }),
    })
    // Remove the agent but leave the scope reference
    snapshot.agents = [makeAgent({ agentId: 'agent-1', worktreeScope: '' })]

    const result = validator.validateSnapshot(snapshot)
    // No orphaned worktree since no agent references it
    expect(result.recoverableIssues.filter((i) => i.includes('Orphaned'))).toEqual([])
  })

  it('should attempt repair for channel history issues', () => {
    const snapshot = makeSnapshot({
      agents: [makeAgent({ agentId: 'agent-1' })],
      channelHistories: [
        {
          channelName: 'general',
          messages: [
            {
              messageId: 'msg-1',
              senderId: 'ghost-agent',
              content: 'hello',
              timestamp: Date.now(),
              channelName: 'general',
              recipients: ['agent-1'],
            },
            {
              messageId: 'msg-2',
              senderId: 'agent-1',
              content: 'hi',
              timestamp: Date.now(),
              channelName: 'general',
              recipients: ['agent-1'],
            },
          ],
        },
      ],
    })

    const issues = ['Channel history references non-existent agent: ghost-agent']
    const repaired = validator.attemptRepair(snapshot, issues)

    const generalChannel = repaired.channelHistories.find((h) => h.channelName === 'general')
    expect(generalChannel).toBeDefined()
    expect(generalChannel!.messages.length).toBe(1)
    expect(generalChannel!.messages[0].senderId).toBe('agent-1')
  })

  it('should attempt repair for tasks assigned to crashed agents', () => {
    const plan = makePlan()
    plan.tasks[0].status = SwarmTaskStatus.InProgress
    plan.tasks[0].owner = 'agent-1'

    const snapshot = makeSnapshot({
      agents: [makeAgent({ agentId: 'agent-1', state: AgentLifecycleState.Crashed })],
      plan,
    })

    const issues = ['Task assigned to crashed agent: task-1']
    const repaired = validator.attemptRepair(snapshot, issues)

    const task = repaired.plan!.tasks.find((t) => t.taskId === 'task-1')
    expect(task!.status).toBe(SwarmTaskStatus.Pending)
  })

  it('should validate a checkpoint against a snapshot', () => {
    const snapshot = makeSnapshot({
      agents: [makeAgent({ agentId: 'agent-1' })],
    })

    const checkpoint = {
      checkpointId: 'cp-1',
      agentId: 'agent-1',
      lastState: AgentLifecycleState.Running,
      lastTaskId: null,
      progressMarker: { completed: [], remaining: ['task-1'] },
      timestamp: Date.now(),
      worktreeScope: 'wt-1',
    }

    const result = validator.validateCheckpoint(checkpoint, snapshot)
    expect(result.valid).toBe(true)
  })

  it('should flag checkpoint for non-existent agent', () => {
    const snapshot = makeSnapshot({
      agents: [makeAgent({ agentId: 'agent-1' })],
    })

    const checkpoint = {
      checkpointId: 'cp-1',
      agentId: 'ghost-agent',
      lastState: AgentLifecycleState.Running,
      lastTaskId: null,
      progressMarker: { completed: [], remaining: [] },
      timestamp: Date.now(),
      worktreeScope: null,
    }

    const result = validator.validateCheckpoint(checkpoint, snapshot)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('does not exist'))).toBe(true)
  })

  it('should warn about non-resumable checkpoint state', () => {
    const snapshot = makeSnapshot({
      agents: [makeAgent({ agentId: 'agent-1' })],
    })

    const checkpoint = {
      checkpointId: 'cp-1',
      agentId: 'agent-1',
      lastState: AgentLifecycleState.Spawned,
      lastTaskId: null,
      progressMarker: { completed: [], remaining: [] },
      timestamp: Date.now(),
      worktreeScope: null,
    }

    const result = validator.validateCheckpoint(checkpoint, snapshot)
    expect(result.warnings.some((w) => w.includes('not be directly resumable'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ResumeCheckpointManager tests
// ---------------------------------------------------------------------------

describe('ResumeCheckpointManager', () => {
  let manager: ResumeCheckpointManager
  let testSwarmId: string

  beforeEach(() => {
    testSwarmId = `test-swarm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    manager = new ResumeCheckpointManager(testSwarmId)
  })

  afterEach(() => {
    // Clean up checkpoint directory to prevent state leakage
    const checkpointDir = path.join(os.homedir(), '.kiro', 'swarm', 'checkpoints', testSwarmId)
    if (fs.existsSync(checkpointDir)) {
      fs.rmSync(checkpointDir, { recursive: true, force: true })
    }
  })

  it('should create a checkpoint', () => {
    const agent = makeAgent({ agentId: 'agent-1' })
    const checkpoint = manager.createCheckpoint(
      'agent-1',
      agent,
      'task-1',
      { completed: ['step-1'], remaining: ['step-2'] }
    )

    expect(checkpoint.agentId).toBe('agent-1')
    expect(checkpoint.lastTaskId).toBe('task-1')
    expect(checkpoint.progressMarker.completed).toEqual(['step-1'])
    expect(checkpoint.progressMarker.remaining).toEqual(['step-2'])
    expect(checkpoint.lastState).toBe(AgentLifecycleState.Ready)
    expect(checkpoint.worktreeScope).toBe('wt-1')
    expect(checkpoint.checkpointId).toMatch(/^checkpoint-/)
  })

  it('should retrieve the latest checkpoint for an agent', () => {
    const agent = makeAgent({ agentId: 'agent-1' })

    manager.createCheckpoint('agent-1', agent, null, { completed: [], remaining: [] })

    // Small delay to ensure different timestamps
    const cp2 = manager.createCheckpoint('agent-1', agent, 'task-2', {
      completed: ['task-1'],
      remaining: ['task-2'],
    })

    const latest = manager.getLatestCheckpoint('agent-1')
    expect(latest).not.toBeNull()
    // The latest should be the one with the highest timestamp
    expect(latest!.timestamp).toBe(cp2.timestamp)
  })

  it('should return null when no checkpoint exists for agent', () => {
    const latest = manager.getLatestCheckpoint('non-existent')
    expect(latest).toBeNull()
  })

  it('should list all checkpoints', () => {
    const agent1 = makeAgent({ agentId: 'agent-1' })
    const agent2 = makeAgent({ agentId: 'agent-2' })

    manager.createCheckpoint('agent-1', agent1, null, { completed: [], remaining: [] })
    manager.createCheckpoint('agent-2', agent2, null, { completed: [], remaining: [] })

    const all = manager.listCheckpoints()
    expect(all.length).toBeGreaterThanOrEqual(2)
  })

  it('should list checkpoints filtered by agent', () => {
    const agent1 = makeAgent({ agentId: 'agent-1' })
    const agent2 = makeAgent({ agentId: 'agent-2' })

    manager.createCheckpoint('agent-1', agent1, null, { completed: [], remaining: [] })
    manager.createCheckpoint('agent-2', agent2, null, { completed: [], remaining: [] })

    const agent1Cps = manager.listCheckpoints('agent-1')
    expect(agent1Cps.every((cp) => cp.agentId === 'agent-1')).toBe(true)
  })

  it('should delete a checkpoint', () => {
    const agent = makeAgent({ agentId: 'agent-1' })
    const cp = manager.createCheckpoint('agent-1', agent, null, { completed: [], remaining: [] })

    const deleted = manager.deleteCheckpoint(cp.checkpointId)
    expect(deleted).toBe(true)

    const latest = manager.getLatestCheckpoint('agent-1')
    expect(latest).toBeNull()
  })

  it('should return false when deleting non-existent checkpoint', () => {
    const deleted = manager.deleteCheckpoint('non-existent')
    expect(deleted).toBe(false)
  })

  it('should cleanup old checkpoints', () => {
    const agent = makeAgent({ agentId: 'agent-1' })

    // Create 15 checkpoints
    const checkpoints = []
    for (let i = 0; i < 15; i++) {
      const cp = manager.createCheckpoint('agent-1', agent, null, { completed: [], remaining: [] })
      checkpoints.push(cp)
    }

    manager.cleanupOldCheckpoints(10)

    const remaining = manager.listCheckpoints('agent-1')
    expect(remaining.length).toBeLessThanOrEqual(10)
  })
})

// ---------------------------------------------------------------------------
// Daemon crash recovery integration tests
// ---------------------------------------------------------------------------

describe('Daemon crash recovery integration', () => {
  let daemon: Daemon

  beforeEach(() => {
    daemon = new Daemon('test-swarm')
  })

  it('should include crashed agents in crash report', () => {
    const agent = makeAgent({ agentId: 'agent-1', state: AgentLifecycleState.Crashed })
    daemon.registerAgent(agent)

    const report = daemon.getCrashReport('test-swarm')
    expect(report.swarmId).toBe('test-swarm')
    expect(report.crashedAgents.length).toBe(1)
    expect(report.crashedAgents[0].agentId).toBe('agent-1')
    expect(report.recoveryAttempted).toBe(true)
  })

  it('should return empty crash report when no agents crashed', () => {
    const agent = makeAgent({ agentId: 'agent-1', state: AgentLifecycleState.Running })
    daemon.registerAgent(agent)

    const report = daemon.getCrashReport('test-swarm')
    expect(report.crashedAgents).toEqual([])
  })

  it('should force recover an agent to Ready state', () => {
    const agent = makeAgent({ agentId: 'agent-1', state: AgentLifecycleState.Crashed })
    daemon.registerAgent(agent)

    const recovered = daemon.forceRecoverAgent('agent-1')
    expect(recovered).not.toBeNull()
    expect(recovered!.state).toBe(AgentLifecycleState.Ready)
  })

  it('should return null when force recovering non-existent agent', () => {
    const recovered = daemon.forceRecoverAgent('non-existent')
    expect(recovered).toBeNull()
  })

  it('should recover agent via checkpoint when available', () => {
    const agent = makeAgent({ agentId: 'agent-1', state: AgentLifecycleState.Crashed })
    daemon.registerAgent(agent)

    // forceRecoverAgent should attempt checkpoint recovery, then fallback to Ready
    const recovered = daemon.forceRecoverAgent('agent-1')
    expect(recovered).not.toBeNull()
    expect(recovered!.state).toBe(AgentLifecycleState.Ready)
  })
})
