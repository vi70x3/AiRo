import {
  Notification,
  NotificationType,
  TouchNotification,
  IntentNotification,
  FileOperation,
} from '@roo-code/types'
import { IDaemon } from '../interfaces'
import { WorkingSet } from './working-set'
import { ConflictSeverity } from './notification-handler'
import {
  TouchIntentHandler,
  TouchHandlingResult,
  IntentHandlingResult,
} from './touch-intent-handler'

export interface ConcurrencyDecision {
  canProceed: boolean
  reason?: string
  requiredActions: ConcurrencyAction[]
  shouldBlock: boolean
  coordinateWith: string[]
}

export enum ConcurrencyAction {
  Proceed = 'proceed',
  WaitForOther = 'wait_for_other',
  Negotiate = 'negotiate',
  Rebase = 'rebase',
  Partition = 'partition',
  Escalate = 'escalate',
  Reassess = 'reassess',
}

export interface FileConcurrencyAssessment {
  filePath: string
  currentStatus: ConflictSeverity
  hasExternalActivity: boolean
  activeAgents: string[]
  conflictSeverity: ConflictSeverity
  recommendedAction: ConcurrencyAction
}

export class OptimisticConcurrency {
  private agentId: string
  private workingSet: WorkingSet
  private touchIntentHandler: TouchIntentHandler
  private daemon: IDaemon

  constructor(
    agentId: string,
    workingSet: WorkingSet,
    touchIntentHandler: TouchIntentHandler,
    daemon: IDaemon
  ) {
    this.agentId = agentId
    this.workingSet = workingSet
    this.touchIntentHandler = touchIntentHandler
    this.daemon = daemon
  }

  decideBeforeOperation(filePaths: string[], operation: FileOperation): ConcurrencyDecision {
    const assessments = this.assessFileConcurrency(filePaths)

    const allCanProceed = assessments.every(
      (a) => a.recommendedAction === ConcurrencyAction.Proceed
    )
    const anyEscalate = assessments.some(
      (a) => a.recommendedAction === ConcurrencyAction.Escalate
    )
    const anyNegotiate = assessments.some(
      (a) => a.recommendedAction === ConcurrencyAction.Negotiate
    )
    const mediumCount = assessments.filter(
      (a) => a.conflictSeverity === ConflictSeverity.Medium
    ).length

    const requiredActions: ConcurrencyAction[] = []
    const coordinateWithSet = new Set<string>()
    let shouldBlock = false
    let reason: string | undefined

    if (allCanProceed) {
      requiredActions.push(ConcurrencyAction.Proceed)
    } else if (anyEscalate) {
      requiredActions.push(ConcurrencyAction.Escalate)
      shouldBlock = true
      reason = 'Critical conflict detected — escalation required'
    } else if (anyNegotiate) {
      requiredActions.push(ConcurrencyAction.Negotiate)
      if (mediumCount > 2) {
        shouldBlock = true
        reason = `Multiple medium-severity conflicts (${mediumCount}) — blocking`
      }
    }

    for (const assessment of assessments) {
      for (const agentId of assessment.activeAgents) {
        if (agentId !== this.agentId) {
          coordinateWithSet.add(agentId)
        }
      }
      if (!requiredActions.includes(assessment.recommendedAction)) {
        requiredActions.push(assessment.recommendedAction)
      }
    }

    return {
      canProceed: !shouldBlock && !anyEscalate,
      reason,
      requiredActions: [...new Set(requiredActions)],
      shouldBlock,
      coordinateWith: Array.from(coordinateWithSet),
    }
  }

  processAndDecide(): ConcurrencyDecision {
    const notifications = this.daemon.getPendingNotifications(this.agentId) || []

    const touchNotifications = notifications.filter(
      (n) => n.type === NotificationType.Touch
    )
    const intentNotifications = notifications.filter(
      (n) => n.type === NotificationType.Intent
    )

    const touchResults: TouchHandlingResult[] = []
    const intentResults: IntentHandlingResult[] = []

    for (const notification of touchNotifications) {
      const result = this.touchIntentHandler.handleTouchNotification(notification)
      touchResults.push(result)
    }

    for (const notification of intentNotifications) {
      const result = this.touchIntentHandler.handleIntentNotification(notification)
      intentResults.push(result)
    }

    return this.createDecisionFromResults(touchResults, intentResults)
  }

  assessFileConcurrency(filePaths: string[]): FileConcurrencyAssessment[] {
    const assessments: FileConcurrencyAssessment[] = []
    const notifications = this.daemon.getPendingNotifications(this.agentId) || []

    for (const filePath of filePaths) {
      const currentStatus = this.workingSet.assessSeverity(filePath)

      // Check pending notifications for touch/intent from other agents on this file
      const activeAgents: string[] = []
      let maxSeverity = currentStatus

      for (const notification of notifications) {
        if (notification.type === NotificationType.Touch) {
          const touch = notification.payload as TouchNotification
          if (touch.filePath === filePath && touch.modifyingAgentId !== this.agentId) {
            activeAgents.push(touch.modifyingAgentId)
            const touchSeverity = this.workingSet.assessSeverity(filePath)
            if (this.severityRank(touchSeverity) > this.severityRank(maxSeverity)) {
              maxSeverity = touchSeverity
            }
          }
        } else if (notification.type === NotificationType.Intent) {
          const intent = notification.payload as IntentNotification
          if (
            intent.filePaths.includes(filePath) &&
            intent.declaringAgentId !== this.agentId
          ) {
            activeAgents.push(intent.declaringAgentId)
            const intentSeverity = ConflictSeverity.Medium
            if (this.severityRank(intentSeverity) > this.severityRank(maxSeverity)) {
              maxSeverity = intentSeverity
            }
          }
        }
      }

      const uniqueActiveAgents = [...new Set(activeAgents)]
      const hasExternalActivity = uniqueActiveAgents.length > 0
      const recommendedAction = this.determineAction(maxSeverity, 'unknown')

      assessments.push({
        filePath,
        currentStatus,
        hasExternalActivity,
        activeAgents: uniqueActiveAgents,
        conflictSeverity: hasExternalActivity ? maxSeverity : ConflictSeverity.None,
        recommendedAction,
      })
    }

    return assessments
  }

  determineAction(severity: ConflictSeverity, _conflictType: string): ConcurrencyAction {
    switch (severity) {
      case ConflictSeverity.None:
      case ConflictSeverity.Low:
        return ConcurrencyAction.Proceed
      case ConflictSeverity.Medium:
        return ConcurrencyAction.Negotiate
      case ConflictSeverity.High:
        return ConcurrencyAction.Negotiate
      case ConflictSeverity.Critical:
        return ConcurrencyAction.Escalate
      default:
        return ConcurrencyAction.Proceed
    }
  }

  shouldEnterBlockedState(assessments: FileConcurrencyAssessment[]): boolean {
    const highOrCritical = assessments.filter(
      (a) =>
        a.conflictSeverity === ConflictSeverity.High ||
        a.conflictSeverity === ConflictSeverity.Critical
    )
    if (highOrCritical.length > 0) {
      return true
    }

    const mediumCount = assessments.filter(
      (a) => a.conflictSeverity === ConflictSeverity.Medium
    ).length
    if (mediumCount > 2) {
      return true
    }

    return false
  }

  createDecisionFromResults(
    touchResults: TouchHandlingResult[],
    intentResults: IntentHandlingResult[]
  ): ConcurrencyDecision {
    const requiredActions: ConcurrencyAction[] = []
    const coordinateWithSet = new Set<string>()
    let shouldBlock = false
    let reason: string | undefined

    // Process touch results
    for (const result of touchResults) {
      if (result.severity === ConflictSeverity.High) {
        requiredActions.push(ConcurrencyAction.Negotiate)
        coordinateWithSet.add(result.notification.modifyingAgentId)
      } else if (result.severity === ConflictSeverity.Critical) {
        requiredActions.push(ConcurrencyAction.Escalate)
        coordinateWithSet.add(result.notification.modifyingAgentId)
        shouldBlock = true
      } else if (result.shouldNegotiate) {
        requiredActions.push(ConcurrencyAction.Negotiate)
        coordinateWithSet.add(result.notification.modifyingAgentId)
      } else {
        requiredActions.push(ConcurrencyAction.Proceed)
      }
    }

    // Process intent results
    for (const result of intentResults) {
      if (result.shouldNegotiate) {
        requiredActions.push(ConcurrencyAction.Negotiate)
        coordinateWithSet.add(result.notification.declaringAgentId)
      } else {
        requiredActions.push(ConcurrencyAction.Proceed)
      }
    }

    // Determine overall decision
    const hasEscalate = requiredActions.includes(ConcurrencyAction.Escalate)
    const negotiateCount = requiredActions.filter(
      (a) => a === ConcurrencyAction.Negotiate
    ).length

    if (hasEscalate) {
      shouldBlock = true
      reason = 'Critical conflict detected from touch/intent processing'
    } else if (negotiateCount > 2) {
      shouldBlock = true
      reason = `Multiple negotiations required (${negotiateCount}) — blocking`
    }

    const canProceed = !shouldBlock &&
      requiredActions.every((a) => a === ConcurrencyAction.Proceed || a === ConcurrencyAction.Negotiate)

    return {
      canProceed,
      reason,
      requiredActions: [...new Set(requiredActions)],
      shouldBlock,
      coordinateWith: Array.from(coordinateWithSet),
    }
  }

  private severityRank(severity: ConflictSeverity): number {
    switch (severity) {
      case ConflictSeverity.None:
        return 0
      case ConflictSeverity.Low:
        return 1
      case ConflictSeverity.Medium:
        return 2
      case ConflictSeverity.High:
        return 3
      case ConflictSeverity.Critical:
        return 4
      default:
        return 0
    }
  }
}
