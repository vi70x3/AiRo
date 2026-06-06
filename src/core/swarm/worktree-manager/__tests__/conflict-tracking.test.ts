import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ConflictTracker,
} from '../conflict-tracker'
import {
  NegotiationManager,
} from '../negotiation-manager'
import {
  SemanticConflictDetector,
} from '../semantic-conflict-detector'
import {
  ConflictDetector,
  ConflictType,
  ConflictSeverity,
  DetectedConflict,
} from '../conflict-detector'
import {
  AgentType,
  AgentLifecycleState,
  AgentMetadata,
  ConflictStatus,
  ConflictNegotiation,
  ConflictHistoryEntry,
  ConflictTimelineEntry,
  SemanticConflict,
  ResolutionStrategy,
} from '@roo-code/types'

// ─── Helpers ────────────────────────────────────────────────────────────────

const createMockDaemon = (agents: AgentMetadata[] = []) => {
  const agentMap: Record<string, AgentMetadata> = {}
  for (const agent of agents) {
    agentMap[agent.agentId] = agent
  }
  return {
    registerAgent: vi.fn((agent: AgentMetadata) => { agentMap[agent.agentId] = agent }),
    unregisterAgent: vi.fn((id: string) => { delete agentMap[id] }),
    getAgent: vi.fn((id: string) => agentMap[id] ?? null),
    listAgents: vi.fn(() => Object.values(agentMap)),
    sendDM: vi.fn(),
    broadcast: vi.fn(),
    setCoordinatorId: vi.fn(),
    getCoordinatorId: vi.fn().mockReturnValue('coord-1'),
    setPlan: vi.fn(),
    getPlan: vi.fn(),
    joinChannel: vi.fn(),
    leaveChannel: vi.fn(),
    sendToChannel: vi.fn(),
    setContextKey: vi.fn(),
    getContextKey: vi.fn(),
    listContextKeys: vi.fn(),
    subscribeToKey: vi.fn(),
    getPendingNotifications: vi.fn(),
    notifyFileTouch: vi.fn(),
    broadcastIntent: vi.fn(),
    createSnapshot: vi.fn(),
    restoreFromSnapshot: vi.fn(),
    listSnapshots: vi.fn(),
    setConflictHistory: vi.fn(),
    getConflictHistory: vi.fn(),
    setConflictTimeline: vi.fn(),
    getConflictTimeline: vi.fn(),
    setActiveNegotiations: vi.fn(),
    getActiveNegotiations: vi.fn(),
  }
}

const createDetectedConflict = (
  conflictId: string,
  filePath: string,
  agents: string[],
  severity: ConflictSeverity = ConflictSeverity.High,
  conflictType: ConflictType = ConflictType.WriteWrite,
): DetectedConflict => ({
  conflictId,
  filePath,
  conflictingAgents: agents,
  conflictType,
  severity,
  detectedAt: Date.now(),
  status: ConflictStatus.Detected,
})

// ─── ConflictTracker Tests ──────────────────────────────────────────────────

describe('ConflictTracker', () => {
  let mockDaemon: ReturnType<typeof createMockDaemon>
  let tracker: ConflictTracker

  beforeEach(() => {
    mockDaemon = createMockDaemon()
    tracker = new ConflictTracker(mockDaemon)
  })

  describe('trackConflict', () => {
    it('creates a history entry for a detected conflict', () => {
      const conflict = createDetectedConflict('c-1', 'src/file.ts', ['agent-1', 'agent-2'], ConflictSeverity.Critical)
      const entry = tracker.trackConflict(conflict)

      expect(entry.conflictId).toBe('c-1')
      expect(entry.severity).toBe('critical')
      expect(entry.files).toEqual(['src/file.ts'])
      expect(entry.resolutionStatus).toBe('active')
    })

    it('maps ConflictSeverity enum to string severity', () => {
      const critical = tracker.trackConflict(createDetectedConflict('c-1', 'f.ts', ['a1', 'a2'], ConflictSeverity.Critical))
      expect(critical.severity).toBe('critical')

      const high = tracker.trackConflict(createDetectedConflict('c-2', 'f.ts', ['a1', 'a2'], ConflictSeverity.High))
      expect(high.severity).toBe('high')

      const medium = tracker.trackConflict(createDetectedConflict('c-3', 'f.ts', ['a1', 'a2'], ConflictSeverity.Medium))
      expect(medium.severity).toBe('medium')

      const low = tracker.trackConflict(createDetectedConflict('c-4', 'f.ts', ['a1', 'a2'], ConflictSeverity.Low))
      expect(low.severity).toBe('low')
    })

    it('creates a timeline entry when tracking a conflict', () => {
      const conflict = createDetectedConflict('c-1', 'src/file.ts', ['agent-1', 'agent-2'])
      tracker.trackConflict(conflict)

      const timeline = tracker.getConflictTimeline()
      expect(timeline).toHaveLength(1)
      expect(timeline[0].event).toBe('detected')
      expect(timeline[0].conflictId).toBe('c-1')
    })
  })

  describe('resolveConflict', () => {
    it('marks a conflict as resolved', () => {
      const conflict = createDetectedConflict('c-1', 'src/file.ts', ['agent-1', 'agent-2'])
      tracker.trackConflict(conflict)

      const resolved = tracker.resolveConflict('c-1', 'agent-1', 'merge')
      expect(resolved).not.toBeNull()
      expect(resolved!.resolutionStatus).toBe('resolved')
      expect(resolved!.resolvedBy).toBe('agent-1')
      expect(resolved!.resolutionMethod).toBe('merge')
      expect(resolved!.resolvedAt).toBeDefined()
    })

    it('returns null for unknown conflict ID', () => {
      const result = tracker.resolveConflict('nonexistent', 'agent-1', 'merge')
      expect(result).toBeNull()
    })

    it('adds a timeline entry when resolving', () => {
      const conflict = createDetectedConflict('c-1', 'src/file.ts', ['agent-1', 'agent-2'])
      tracker.trackConflict(conflict)
      tracker.resolveConflict('c-1', 'agent-1', 'merge')

      const timeline = tracker.getConflictTimeline()
      expect(timeline).toHaveLength(2)
      expect(timeline[1].event).toBe('resolved')
    })
  })

  describe('escalateConflict', () => {
    it('marks a conflict as escalated', () => {
      const conflict = createDetectedConflict('c-1', 'src/file.ts', ['agent-1', 'agent-2'])
      tracker.trackConflict(conflict)

      const escalated = tracker.escalateConflict('c-1', 'coord-1')
      expect(escalated).not.toBeNull()
      expect(escalated!.resolutionStatus).toBe('escalated')
    })

    it('returns null for unknown conflict ID', () => {
      const result = tracker.escalateConflict('nonexistent', 'coord-1')
      expect(result).toBeNull()
    })
  })

  describe('deferConflict', () => {
    it('marks a conflict as deferred', () => {
      const conflict = createDetectedConflict('c-1', 'src/file.ts', ['agent-1', 'agent-2'])
      tracker.trackConflict(conflict)

      const deferred = tracker.deferConflict('c-1', 'agent-1')
      expect(deferred).not.toBeNull()
      expect(deferred!.resolutionStatus).toBe('deferred')
    })
  })

  describe('getConflictHistory', () => {
    it('returns conflicts for a specific agent', () => {
      const conflict1 = createDetectedConflict('c-1', 'src/file1.ts', ['agent-1', 'agent-2'])
      const conflict2 = createDetectedConflict('c-2', 'src/file2.ts', ['agent-2', 'agent-3'])
      tracker.trackConflict(conflict1)
      tracker.trackConflict(conflict2)

      const history = tracker.getConflictHistory('agent-1')
      expect(history).toHaveLength(1)
      expect(history[0].conflictId).toBe('c-1')
    })

    it('returns empty array for agent with no conflicts', () => {
      const conflict = createDetectedConflict('c-1', 'src/file.ts', ['agent-1', 'agent-2'])
      tracker.trackConflict(conflict)

      const history = tracker.getConflictHistory('agent-99')
      expect(history).toHaveLength(0)
    })
  })

  describe('getActiveConflicts', () => {
    it('returns only active conflicts', () => {
      const c1 = createDetectedConflict('c-1', 'src/file1.ts', ['a1', 'a2'])
      const c2 = createDetectedConflict('c-2', 'src/file2.ts', ['a1', 'a3'])
      const c3 = createDetectedConflict('c-3', 'src/file3.ts', ['a2', 'a3'])
      tracker.trackConflict(c1)
      tracker.trackConflict(c2)
      tracker.trackConflict(c3)

      tracker.resolveConflict('c-1', 'a1', 'merge')

      const active = tracker.getActiveConflicts()
      expect(active).toHaveLength(2)
      expect(active.every(e => e.resolutionStatus === 'active')).toBe(true)
    })

    it('returns empty array when all conflicts are resolved', () => {
      const c1 = createDetectedConflict('c-1', 'src/file.ts', ['a1', 'a2'])
      tracker.trackConflict(c1)
      tracker.resolveConflict('c-1', 'a1', 'merge')

      expect(tracker.getActiveConflicts()).toHaveLength(0)
    })
  })

  describe('getConflictTimeline', () => {
    it('returns timeline sorted by timestamp', () => {
      const c1 = createDetectedConflict('c-1', 'src/file1.ts', ['a1', 'a2'])
      c1.detectedAt = 1000
      const c2 = createDetectedConflict('c-2', 'src/file2.ts', ['a1', 'a3'])
      c2.detectedAt = 500
      tracker.trackConflict(c1)
      tracker.trackConflict(c2)

      const timeline = tracker.getConflictTimeline()
      expect(timeline).toHaveLength(2)
      expect(timeline[0].timestamp).toBe(500)
      expect(timeline[1].timestamp).toBe(1000)
    })
  })

  describe('getAgentTimeline', () => {
    it('returns timeline filtered by agent', () => {
      const c1 = createDetectedConflict('c-1', 'src/file.ts', ['agent-1', 'agent-2'])
      tracker.trackConflict(c1)

      const agent1Timeline = tracker.getAgentTimeline('agent-1')
      expect(agent1Timeline).toHaveLength(1)
      expect(agent1Timeline[0].agentId).toBe('agent-1')
    })
  })

  describe('getConflictEntry', () => {
    it('returns a specific conflict entry', () => {
      const conflict = createDetectedConflict('c-1', 'src/file.ts', ['a1', 'a2'], ConflictSeverity.Critical)
      tracker.trackConflict(conflict)

      const entry = tracker.getConflictEntry('c-1')
      expect(entry).toBeDefined()
      expect(entry!.conflictId).toBe('c-1')
      expect(entry!.severity).toBe('critical')
    })

    it('returns undefined for unknown conflict', () => {
      expect(tracker.getConflictEntry('nonexistent')).toBeUndefined()
    })
  })

  describe('snapshot persistence', () => {
    it('returns history and timeline entries for snapshot', () => {
      const conflict = createDetectedConflict('c-1', 'src/file.ts', ['a1', 'a2'])
      tracker.trackConflict(conflict)

      const historyEntries = tracker.getHistoryEntries()
      const timelineEntries = tracker.getTimelineEntries()

      expect(historyEntries).toHaveLength(1)
      expect(timelineEntries).toHaveLength(1)
    })

    it('restores from snapshot', () => {
      const conflict = createDetectedConflict('c-1', 'src/file.ts', ['a1', 'a2'])
      tracker.trackConflict(conflict)
      tracker.resolveConflict('c-1', 'a1', 'merge')

      const historyEntries = tracker.getHistoryEntries()
      const timelineEntries = tracker.getTimelineEntries()

      const newTracker = new ConflictTracker(mockDaemon)
      newTracker.restoreFromSnapshot(historyEntries, timelineEntries)

      expect(newTracker.getHistoryEntries()).toHaveLength(1)
      expect(newTracker.getTimelineEntries()).toHaveLength(2)
      expect(newTracker.getConflictEntry('c-1')!.resolutionStatus).toBe('resolved')
    })
  })

  describe('addNegotiationTimelineEntry', () => {
    it('adds a negotiation event to the timeline', () => {
      tracker.addNegotiationTimelineEntry('c-1', 'agent-1', 'negotiation_started', 'Negotiation started')

      const timeline = tracker.getConflictTimeline()
      expect(timeline).toHaveLength(1)
      expect(timeline[0].event).toBe('negotiation_started')
      expect(timeline[0].details).toBe('Negotiation started')
    })
  })
})

describe('NegotiationManager', () => {
  let mockDaemon: ReturnType<typeof createMockDaemon>
  let tracker: ConflictTracker
  let manager: NegotiationManager

  beforeEach(() => {
    mockDaemon = createMockDaemon()
    tracker = new ConflictTracker(mockDaemon)
    manager = new NegotiationManager(mockDaemon, tracker)
  })

  describe('startNegotiation', () => {
    it('creates a new negotiation with open status', () => {
      const negotiation = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])

      expect(negotiation.conflictId).toBe('c-1')
      expect(negotiation.initiator).toBe('agent-1')
      expect(negotiation.participants).toEqual(['agent-1', 'agent-2'])
      expect(negotiation.status).toBe('open')
      expect(negotiation.proposals).toHaveLength(0)
      expect(negotiation.negotiationId).toBeDefined()
    })

    it('sends DMs to all participants', () => {
      manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])

      // Should send DMs to participants (agent-1 and agent-2)
      expect(mockDaemon.sendDM).toHaveBeenCalled()
    })

    it('adds a timeline entry', () => {
      manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])

      const timeline = tracker.getConflictTimeline()
      expect(timeline.some(t => t.event === 'negotiation_started')).toBe(true)
    })
  })

  describe('submitProposal', () => {
    it('submits a proposal to an active negotiation', () => {
      const negotiation = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])

      const proposal = manager.submitProposal(negotiation.negotiationId, 'agent-1', 'merge', 'Merge both changes')

      expect(proposal).not.toBeNull()
      expect(proposal!.agentId).toBe('agent-1')
      expect(proposal!.resolutionStrategy).toBe('merge')
      expect(proposal!.description).toBe('Merge both changes')
    })

    it('updates negotiation status to proposed', () => {
      const negotiation = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])

      manager.submitProposal(negotiation.negotiationId, 'agent-1', 'merge', 'Merge')

      const updated = manager.getNegotiation(negotiation.negotiationId)
      expect(updated!.status).toBe('proposed')
      expect(updated!.proposals).toHaveLength(1)
    })

    it('returns null for unknown negotiation', () => {
      const result = manager.submitProposal('nonexistent', 'agent-1', 'merge', 'desc')
      expect(result).toBeNull()
    })

    it('returns null for closed negotiation', () => {
      const negotiation = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])
      manager.closeNegotiation(negotiation.negotiationId, 'agent-1')

      const result = manager.submitProposal(negotiation.negotiationId, 'agent-1', 'merge', 'desc')
      expect(result).toBeNull()
    })

    it('sends DMs to other participants', () => {
      const negotiation = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])
      mockDaemon.sendDM.mockClear()

      manager.submitProposal(negotiation.negotiationId, 'agent-1', 'merge', 'Merge')

      expect(mockDaemon.sendDM).toHaveBeenCalled()
    })
  })

  describe('acceptProposal', () => {
    it('accepts a proposal and marks negotiation as accepted', () => {
      const negotiation = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])
      const proposal = manager.submitProposal(negotiation.negotiationId, 'agent-1', 'merge', 'Merge')!

      const result = manager.acceptProposal(negotiation.negotiationId, proposal.proposalId, 'agent-2')

      expect(result).not.toBeNull()
      expect(result!.status).toBe('accepted')
      expect(result!.resolvedBy).toBe('agent-2')
      expect(result!.acceptedProposalId).toBe(proposal.proposalId)
      expect(result!.resolvedAt).toBeDefined()
    })

    it('returns null for unknown negotiation', () => {
      const result = manager.acceptProposal('nonexistent', 'prop-1', 'agent-1')
      expect(result).toBeNull()
    })

    it('returns null for closed negotiation', () => {
      const negotiation = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])
      manager.closeNegotiation(negotiation.negotiationId, 'agent-1')

      const result = manager.acceptProposal(negotiation.negotiationId, 'prop-1', 'agent-1')
      expect(result).toBeNull()
    })

    it('sends DMs to all participants', () => {
      const negotiation = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])
      const proposal = manager.submitProposal(negotiation.negotiationId, 'agent-1', 'merge', 'Merge')!
      mockDaemon.sendDM.mockClear()

      manager.acceptProposal(negotiation.negotiationId, proposal.proposalId, 'agent-2')

      expect(mockDaemon.sendDM).toHaveBeenCalled()
    })
  })

  describe('rejectProposal', () => {
    it('rejects a proposal and marks negotiation as rejected', () => {
      const negotiation = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])
      const proposal = manager.submitProposal(negotiation.negotiationId, 'agent-1', 'merge', 'Merge')!

      const result = manager.rejectProposal(negotiation.negotiationId, proposal.proposalId, 'agent-2', 'Not acceptable')

      expect(result).not.toBeNull()
      expect(result!.status).toBe('rejected')
    })

    it('sends DMs to all participants', () => {
      const negotiation = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])
      const proposal = manager.submitProposal(negotiation.negotiationId, 'agent-1', 'merge', 'Merge')!
      mockDaemon.sendDM.mockClear()

      manager.rejectProposal(negotiation.negotiationId, proposal.proposalId, 'agent-2', 'Not acceptable')

      expect(mockDaemon.sendDM).toHaveBeenCalled()
    })
  })

  describe('closeNegotiation', () => {
    it('closes a negotiation without resolution', () => {
      const negotiation = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])

      const result = manager.closeNegotiation(negotiation.negotiationId, 'agent-1')

      expect(result).not.toBeNull()
      expect(result!.status).toBe('closed')
      expect(result!.resolvedBy).toBe('agent-1')
    })
  })

  describe('getNegotiationStatus', () => {
    it('returns the status of a negotiation', () => {
      const negotiation = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])

      expect(manager.getNegotiationStatus(negotiation.negotiationId)).toBe('open')

      manager.submitProposal(negotiation.negotiationId, 'agent-1', 'merge', 'Merge')
      expect(manager.getNegotiationStatus(negotiation.negotiationId)).toBe('proposed')
    })

    it('returns null for unknown negotiation', () => {
      expect(manager.getNegotiationStatus('nonexistent')).toBeNull()
    })
  })

  describe('listActiveNegotiations', () => {
    it('returns only active (non-closed) negotiations', () => {
      const n1 = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])
      const n2 = manager.startNegotiation('c-2', 'agent-1', ['agent-1', 'agent-3'])
      manager.closeNegotiation(n1.negotiationId, 'agent-1')

      const active = manager.listActiveNegotiations()
      expect(active).toHaveLength(1)
      expect(active[0].negotiationId).toBe(n2.negotiationId)
    })
  })

  describe('getNegotiationsForConflict', () => {
    it('returns all negotiations for a specific conflict', () => {
      const n1 = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])
      const n2 = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-3'])
      const n3 = manager.startNegotiation('c-2', 'agent-1', ['agent-1', 'agent-2'])

      const conflictNegotiations = manager.getNegotiationsForConflict('c-1')
      expect(conflictNegotiations).toHaveLength(2)
      expect(conflictNegotiations.every(n => n.conflictId === 'c-1')).toBe(true)
    })
  })

  describe('getNegotiationsForAgent', () => {
    it('returns all negotiations where an agent is a participant', () => {
      const n1 = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])
      const n2 = manager.startNegotiation('c-2', 'agent-1', ['agent-1', 'agent-3'])
      const n3 = manager.startNegotiation('c-3', 'agent-2', ['agent-2', 'agent-3'])

      const agent1Negotiations = manager.getNegotiationsForAgent('agent-1')
      expect(agent1Negotiations).toHaveLength(2)
      expect(agent1Negotiations.every(n => n.initiator === 'agent-1' || n.participants.includes('agent-1'))).toBe(true)
    })
  })

  describe('snapshot persistence', () => {
    it('returns active negotiations for snapshot', () => {
      const n1 = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])
      const n2 = manager.startNegotiation('c-2', 'agent-1', ['agent-1', 'agent-3'])
      manager.closeNegotiation(n1.negotiationId, 'agent-1')

      const active = manager.getActiveNegotiationsForSnapshot()
      expect(active).toHaveLength(1)
      expect(active[0].negotiationId).toBe(n2.negotiationId)
    })

    it('restores negotiations from snapshot', () => {
      const n1 = manager.startNegotiation('c-1', 'agent-1', ['agent-1', 'agent-2'])
      manager.submitProposal(n1.negotiationId, 'agent-1', 'merge', 'Merge')

      const negotiations = manager.getActiveNegotiationsForSnapshot()

      const newManager = new NegotiationManager(mockDaemon, tracker)
      newManager.restoreFromSnapshot(negotiations)

      const restored = newManager.getNegotiation(n1.negotiationId)
      expect(restored).toBeDefined()
      expect(restored!.status).toBe('proposed')
      expect(restored!.proposals).toHaveLength(1)
    })
  })
})

describe('SemanticConflictDetector', () => {
  let detector: SemanticConflictDetector

  beforeEach(() => {
    detector = new SemanticConflictDetector()
  })

  describe('detectSemanticConflicts', () => {
    it('routes to appropriate detector based on file type', () => {
      // Code file
      const codeConflicts = detector.detectSemanticConflicts(
        'src/file.ts',
        'function foo() {}',
        'function foo(x: string) {}'
      )
      expect(codeConflicts).toHaveLength(1)
      expect(codeConflicts[0].type).toBe('function_signature')

      // Config file
      const configConflicts = detector.detectSemanticConflicts(
        'config.json',
        '{"key": "value1"}',
        '{"key": "value2"}'
      )
      expect(configConflicts).toHaveLength(1)
      expect(configConflicts[0].type).toBe('configuration')

      // Package.json
      const pkgConflicts = detector.detectSemanticConflicts(
        'package.json',
        '{"dependencies": {"lodash": "4.17.21"}}',
        '{"dependencies": {"lodash": "4.17.20"}}'
      )
      expect(pkgConflicts).toHaveLength(1)
      expect(pkgConflicts[0].type).toBe('dependency')
    })
  })

  describe('detectFunctionSignatureConflicts', () => {
    it('detects conflicting function signatures', () => {
      const content1 = `function add(a: number, b: number): number { return a + b }`
      const content2 = `function add(a: string, b: string): string { return a + b }`

      const conflicts = detector.detectFunctionSignatureConflicts(content1, content2, 'src/file.ts')
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('function_signature')
      expect(conflicts[0].affectedSymbols).toContain('add')
    })

    it('ignores functions with same signature', () => {
      const content1 = `function add(a: number, b: number): number { return a + b }`
      const content2 = `function add(a: number, b: number): number { return a + b }`

      const conflicts = detector.detectFunctionSignatureConflicts(content1, content2, 'src/file.ts')
      expect(conflicts).toHaveLength(0)
    })

    it('ignores functions removed by one agent', () => {
      const content1 = `function add(a: number, b: number): number { return a + b }`
      const content2 = `function subtract(a: number, b: number): number { return a - b }`

      const conflicts = detector.detectFunctionSignatureConflicts(content1, content2, 'src/file.ts')
      expect(conflicts).toHaveLength(0)
    })
  })

  describe('detectClassStructureConflicts', () => {
    it('detects conflicting inheritance', () => {
      const content1 = `class MyClass extends BaseClass {}`
      const content2 = `class MyClass extends OtherBaseClass {}`

      const conflicts = detector.detectClassStructureConflicts(content1, content2, 'src/file.ts')
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('class_structure')
      expect(conflicts[0].description).toContain('inheritance')
    })

    it('detects conflicting methods', () => {
      const content1 = `class MyClass { method1() {} method2() {} }`
      const content2 = `class MyClass { method1() {} method3() {} }`

      const conflicts = detector.detectClassStructureConflicts(content1, content2, 'src/file.ts')
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('class_structure')
      expect(conflicts[0].description).toContain('methods')
    })
  })

  describe('detectApiContractConflicts', () => {
    it('detects conflicting interface properties', () => {
      const content1 = `interface MyInterface { prop1: string; prop2: number }`
      const content2 = `interface MyInterface { prop1: string; prop3: boolean }`

      const conflicts = detector.detectApiContractConflicts(content1, content2, 'src/file.ts')
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('api_contract')
      expect(conflicts[0].description).toContain('properties')
    })

    it('detects conflicting type aliases', () => {
      const content1 = `type MyType = string | number`
      const content2 = `type MyType = boolean`

      const conflicts = detector.detectApiContractConflicts(content1, content2, 'src/file.ts')
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('api_contract')
      expect(conflicts[0].description).toContain('definitions')
    })
  })

  describe('detectConfigurationConflicts', () => {
    it('detects conflicting config values', () => {
      const content1 = '{"timeout": 1000, "retries": 3}'
      const content2 = '{"timeout": 2000, "retries": 3}'

      const conflicts = detector.detectConfigurationConflicts(content1, content2, 'config.json')
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('configuration')
      expect(conflicts[0].affectedSymbols).toContain('timeout')
    })

    it('detects nested config conflicts', () => {
      const content1 = '{"database": {"host": "localhost", "port": 5432}}'
      const content2 = '{"database": {"host": "remote", "port": 5432}}'

      const conflicts = detector.detectConfigurationConflicts(content1, content2, 'config.json')
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].affectedSymbols).toContain('database.host')
    })

    it('ignores removed keys', () => {
      const content1 = '{"key1": "value1", "key2": "value2"}'
      const content2 = '{"key1": "value1"}'

      const conflicts = detector.detectConfigurationConflicts(content1, content2, 'config.json')
      expect(conflicts).toHaveLength(0)
    })
  })

  describe('detectDependencyConflicts', () => {
    it('detects conflicting dependency versions', () => {
      const content1 = '{"dependencies": {"lodash": "4.17.21", "axios": "1.0.0"}}'
      const content2 = '{"dependencies": {"lodash": "4.17.20", "axios": "1.0.0"}}'

      const conflicts = detector.detectDependencyConflicts(content1, content2, 'package.json')
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('dependency')
      expect(conflicts[0].affectedSymbols).toContain('lodash')
    })

    it('checks devDependencies and peerDependencies', () => {
      const content1 = '{"devDependencies": {"vitest": "1.0.0"}, "peerDependencies": {"react": "18.0.0"}}'
      const content2 = '{"devDependencies": {"vitest": "2.0.0"}, "peerDependencies": {"react": "18.0.0"}}'

      const conflicts = detector.detectDependencyConflicts(content1, content2, 'package.json')
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].affectedSymbols).toContain('vitest')
    })
  })
})

describe('ConflictDetector Integration', () => {
  let mockDaemon: ReturnType<typeof createMockDaemon>
  let detector: ConflictDetector

  beforeEach(() => {
    mockDaemon = createMockDaemon()
    detector = new ConflictDetector(mockDaemon, 'scope1', 'wm-1')
  })

  describe('detectSemanticConflicts', () => {
    it('detects semantic conflicts between two file versions', () => {
      const content1 = `function add(a: number, b: number): number { return a + b }`
      const content2 = `function add(a: string, b: string): string { return a + b }`

      const conflicts = detector.detectSemanticConflicts('src/file.ts', content1, content2)
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('function_signature')
    })

    it('returns empty array for identical content', () => {
      const content1 = `function add(a: number, b: number): number { return a + b }`
      const content2 = `function add(a: number, b: number): number { return a + b }`

      const conflicts = detector.detectSemanticConflicts('src/file.ts', content1, content2)
      expect(conflicts).toHaveLength(0)
    })
  })

  describe('getSemanticDetector', () => {
    it('returns the underlying SemanticConflictDetector', () => {
      const semanticDetector = detector.getSemanticDetector()
      expect(semanticDetector).toBeInstanceOf(SemanticConflictDetector)
    })
  })
})
