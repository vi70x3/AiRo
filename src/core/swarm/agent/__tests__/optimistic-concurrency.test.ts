import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OptimisticConcurrency, ConcurrencyDecision, ConcurrencyAction } from '../optimistic-concurrency'
import { IDaemon } from '../../interfaces'
import { WorkingSet } from '../working-set'
import { TouchIntentHandler } from '../touch-intent-handler'
import { ConflictSeverity, FileOperation, NotificationType, Notification, TouchNotification, IntentNotification } from '@roo-code/types'

const createMockDaemon = () => {
  const agents: Record<string, any> = {}
  const notifications: Record<string, any[]> = {}
  return {
    registerAgent: vi.fn((a) => { agents[a.agentId] = a }),
    getAgent: vi.fn((id) => agents[id] ?? null),
    listAgents: vi.fn(() => Object.values(agents)),
    sendDM: vi.fn(),
    broadcast: vi.fn(),
    setCoordinatorId: vi.fn(),
    getCoordinatorId: vi.fn(() => null),
    setPlan: vi.fn(),
    getPlan: vi.fn(() => null),
    getPendingNotifications: vi.fn((agentId) => notifications[agentId] ?? []),
    unregisterAgent: vi.fn(),
    joinChannel: vi.fn(),
    leaveChannel: vi.fn(),
    sendToChannel: vi.fn(),
    setContextKey: vi.fn(),
    getContextKey: vi.fn(),
    listContextKeys: vi.fn(),
    subscribeToKey: vi.fn(),
    notifyFileTouch: vi.fn(),
    broadcastIntent: vi.fn(),
    createSnapshot: vi.fn(),
    restoreFromSnapshot: vi.fn(),
    listSnapshots: vi.fn(),
    _setNotifications: (agentId: string, notifs: any[]) => { notifications[agentId] = notifs },
  } as unknown as IDaemon
}

describe('OptimisticConcurrency', () => {
  let daemon: IDaemon
  let workingSet: WorkingSet
  let touchIntentHandler: TouchIntentHandler
  let concurrency: OptimisticConcurrency

  beforeEach(() => {
    daemon = createMockDaemon()
    workingSet = new WorkingSet(daemon, 'test-agent')
    touchIntentHandler = new TouchIntentHandler('test-agent', workingSet, daemon)
    concurrency = new OptimisticConcurrency('test-agent', workingSet, touchIntentHandler, daemon)
  })

  it('decides to proceed when no external activity and low severity', () => {
    const decision = concurrency.decideBeforeOperation(['file.ts'], 'modify')
    expect(decision.canProceed).toBe(true)
    expect(decision.shouldBlock).toBe(false)
    expect(decision.requiredActions).toContain(ConcurrencyAction.Proceed)
  })

  it('decides to block when critical conflict detected', () => {
    // Mock working set to return Critical severity
    vi.spyOn(workingSet, 'assessSeverity').mockReturnValue(ConflictSeverity.Critical)
    
    const decision = concurrency.decideBeforeOperation(['file.ts'], 'modify')
    expect(decision.canProceed).toBe(false)
    expect(decision.shouldBlock).toBe(true)
    expect(decision.requiredActions).toContain(ConcurrencyAction.Escalate)
    expect(decision.reason).toContain('Critical conflict')
  })

  it('processAndDecides proceeds when no notifications', () => {
    const decision = concurrency.processAndDecide()
    expect(decision.canProceed).toBe(true)
    expect(decision.shouldBlock).toBe(false)
  })

  it('processAndDecides blocks when touch notification shows critical severity', () => {
    // Mock touchIntentHandler to return Critical severity
    const mockResult: any = {
      notification: { filePath: 'file.ts', modifyingAgentId: 'other-agent' } as TouchNotification,
      severity: ConflictSeverity.Critical,
      shouldNegotiate: true,
    }
    vi.spyOn(touchIntentHandler, 'handleTouchNotification').mockReturnValue(mockResult)
    
    // Set up the notification in daemon
    const touchNotif: Notification = {
      notificationId: 'n1',
      type: NotificationType.Touch,
      payload: mockResult.notification,
      timestamp: Date.now(),
    }
    ;(daemon as any)._setNotifications('test-agent', [touchNotif])
    
    const decision = concurrency.processAndDecide()
    expect(decision.canProceed).toBe(false)
    expect(decision.shouldBlock).toBe(true)
    expect(decision.requiredActions).toContain(ConcurrencyAction.Escalate)
  })

  it('assessFileConcurrency returns correct assessment for file with no activity', () => {
    const assessments = concurrency.assessFileConcurrency(['file.ts'])
    expect(assessments.length).toBe(1)
    const assessment = assessments[0]
    expect(assessment.filePath).toBe('file.ts')
    expect(assessment.hasExternalActivity).toBe(false)
    expect(assessment.conflictSeverity).toBe(ConflictSeverity.None)
    expect(assessment.recommendedAction).toBe(ConcurrencyAction.Proceed)
  })

  it('assessFileConcurrency detects external activity from touch notifications', () => {
    const touchNotif: Notification = {
      notificationId: 'n1',
      type: NotificationType.Touch,
      payload: { filePath: 'file.ts', modifyingAgentId: 'other-agent', operation: 'modify' } as TouchNotification,
      timestamp: Date.now(),
    }
    ;(daemon as any)._setNotifications('test-agent', [touchNotif])
    
    const assessments = concurrency.assessFileConcurrency(['file.ts'])
    expect(assessments.length).toBe(1)
    const assessment = assessments[0]
    expect(assessment.hasExternalActivity).toBe(true)
    expect(assessment.activeAgents).toContain('other-agent')
  })

  it('assessFileConcurrency detects external activity from intent notifications', () => {
    const intentNotif: Notification = {
      notificationId: 'n1',
      type: NotificationType.Intent,
      payload: { declaringAgentId: 'other-agent', filePaths: ['file.ts'] } as IntentNotification,
      timestamp: Date.now(),
    }
    ;(daemon as any)._setNotifications('test-agent', [intentNotif])
    
    const assessments = concurrency.assessFileConcurrency(['file.ts'])
    expect(assessments.length).toBe(1)
    const assessment = assessments[0]
    expect(assessment.hasExternalActivity).toBe(true)
    expect(assessment.activeAgents).toContain('other-agent')
  })

  it('determineAction returns Proceed for None/Low severity', () => {
    const actionNone = concurrency.determineAction(ConflictSeverity.None, 'unknown')
    const actionLow = concurrency.determineAction(ConflictSeverity.Low, 'unknown')
    expect(actionNone).toBe(ConcurrencyAction.Proceed)
    expect(actionLow).toBe(ConcurrencyAction.Proceed)
  })

  it('determineAction returns Negotiate for Medium/High severity', () => {
    const actionMed = concurrency.determineAction(ConflictSeverity.Medium, 'unknown')
    const actionHigh = concurrency.determineAction(ConflictSeverity.High, 'unknown')
    expect(actionMed).toBe(ConcurrencyAction.Negotiate)
    expect(actionHigh).toBe(ConcurrencyAction.Negotiate)
  })

  it('determineAction returns Escalate for Critical severity', () => {
    const action = concurrency.determineAction(ConflictSeverity.Critical, 'unknown')
    expect(action).toBe(ConcurrencyAction.Escalate)
  })

  it('shouldEnterBlockedState returns true for High/Critical severity', () => {
    const assessments = [
      { filePath: 'f1', currentStatus: ConflictSeverity.Low, hasExternalActivity: false, activeAgents: [], conflictSeverity: ConflictSeverity.High, recommendedAction: ConcurrencyAction.Negotiate },
      { filePath: 'f2', currentStatus: ConflictSeverity.Low, hasExternalActivity: false, activeAgents: [], conflictSeverity: ConflictSeverity.Low, recommendedAction: ConcurrencyAction.Proceed },
    ]
    const shouldBlock = concurrency.shouldEnterBlockedState(assessments)
    expect(shouldBlock).toBe(true)
  })

  it('shouldEnterBlockedState returns true for >2 Medium severity conflicts', () => {
    const assessments = [
      { filePath: 'f1', currentStatus: ConflictSeverity.Low, hasExternalActivity: false, activeAgents: [], conflictSeverity: ConflictSeverity.Medium, recommendedAction: ConcurrencyAction.Negotiate },
      { filePath: 'f2', currentStatus: ConflictSeverity.Low, hasExternalActivity: false, activeAgents: [], conflictSeverity: ConflictSeverity.Medium, recommendedAction: ConcurrencyAction.Negotiate },
      { filePath: 'f3', currentStatus: ConflictSeverity.Low, hasExternalActivity: false, activeAgents: [], conflictSeverity: ConflictSeverity.Medium, recommendedAction: ConcurrencyAction.Negotiate },
      { filePath: 'f4', currentStatus: ConflictSeverity.Low, hasExternalActivity: false, activeAgents: [], conflictSeverity: ConflictSeverity.Low, recommendedAction: ConcurrencyAction.Proceed },
    ]
    const shouldBlock = concurrency.shouldEnterBlockedState(assessments)
    expect(shouldBlock).toBe(true)
  })

  it('shouldEnterBlockedState returns false for <=2 Medium severity conflicts', () => {
    const assessments = [
      { filePath: 'f1', currentStatus: ConflictSeverity.Low, hasExternalActivity: false, activeAgents: [], conflictSeverity: ConflictSeverity.Medium, recommendedAction: ConcurrencyAction.Negotiate },
      { filePath: 'f2', currentStatus: ConflictSeverity.Low, hasExternalActivity: false, activeAgents: [], conflictSeverity: ConflictSeverity.Medium, recommendedAction: ConcurrencyAction.Negotiate },
      { filePath: 'f3', currentStatus: ConflictSeverity.Low, hasExternalActivity: false, activeAgents: [], conflictSeverity: ConflictSeverity.Low, recommendedAction: ConcurrencyAction.Proceed },
    ]
    const shouldBlock = concurrency.shouldEnterBlockedState(assessments)
    expect(shouldBlock).toBe(false)
  })

  it('createDecisionFromResults processes touch and intent results correctly', () => {
    const touchResults = [{
      notification: { filePath: 'file.ts', modifyingAgentId: 'other-agent' } as TouchNotification,
      severity: ConflictSeverity.Medium,
      shouldNegotiate: true,
    }]
    const intentResults = [{
      notification: { declaringAgentId: 'other-agent', filePaths: ['file.ts'] } as IntentNotification,
      overlapPaths: ['file.ts'],
      shouldNegotiate: true,
    }]
    
    const decision = concurrency.createDecisionFromResults(touchResults, intentResults)
    expect(decision.requiredActions).toContain(ConcurrencyAction.Negotiate)
    expect(decision.coordinateWith).toContain('other-agent')
  })

  it('createDecisionFromResults blocks when multiple negotiations required', () => {
    const touchResults = [
      { notification: { filePath: 'f1.ts', modifyingAgentId: 'a1' } as TouchNotification, severity: ConflictSeverity.Medium, shouldNegotiate: true },
      { notification: { filePath: 'f2.ts', modifyingAgentId: 'a2' } as TouchNotification, severity: ConflictSeverity.Medium, shouldNegotiate: true },
      { notification: { filePath: 'f3.ts', modifyingAgentId: 'a3' } as TouchNotification, severity: ConflictSeverity.Medium, shouldNegotiate: true },
    ]
    const intentResults: any[] = []
    
    const decision = concurrency.createDecisionFromResults(touchResults, intentResults)
    expect(decision.shouldBlock).toBe(true)
    expect(decision.reason).toContain('Multiple negotiations required')
  })
})
