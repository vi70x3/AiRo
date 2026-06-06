import {
  IntentConflictReport,
  IntentConflictDetail,
  AvoidancePlan,
  IntentAvoidanceStrategy,
  ConflictSeverityLevel,
  FileOperation,
  IntentNotification,
  NotificationType,
} from '@roo-code/types'
import { IDaemon } from '../interfaces'
import { WorkingSet } from './working-set'
import { ConflictSeverity } from '../worktree-manager/conflict-detector'

/**
 * Convert ConflictSeverity enum value to ConflictSeverityLevel string.
 */
function severityToLevel(severity: ConflictSeverity): ConflictSeverityLevel {
  switch (severity) {
    case ConflictSeverity.None:
      return 'none'
    case ConflictSeverity.Low:
      return 'low'
    case ConflictSeverity.Medium:
      return 'medium'
    case ConflictSeverity.High:
      return 'high'
    case ConflictSeverity.Critical:
      return 'critical'
    default:
      return 'none'
  }
}

/**
 * Rank a ConflictSeverityLevel for comparison purposes.
 */
function severityLevelRank(level: ConflictSeverityLevel): number {
  switch (level) {
    case 'none':
      return 0
    case 'low':
      return 1
    case 'medium':
      return 2
    case 'high':
      return 3
    case 'critical':
      return 4
    default:
      return 0
  }
}

/**
 * Proactive Intent Avoidance — before starting an operation, an agent checks
 * whether any other agent has declared intent on the same files, and generates
 * an avoidance plan if conflicts exist.
 */
export class IntentAvoidance {
  private agentId: string

  constructor(agentId: string) {
    this.agentId = agentId
  }

  /**
   * Before starting an operation, check if any other agent has declared intent
   * on these files. Returns an IntentConflictReport detailing which agents have
   * intent on which files, and the severity levels.
   */
  checkIntentConflicts(filePaths: string[], daemon: IDaemon): IntentConflictReport {
    const conflicts: IntentConflictDetail[] = []
    const agents = daemon.listAgents()

    for (const filePath of filePaths) {
      const conflictingAgentIds: string[] = []
      const operations: FileOperation[] = []
      let maxFileSeverity: ConflictSeverityLevel = 'none'

      for (const agent of agents) {
        if (agent.agentId === this.agentId) continue

        const remoteWorkingSet = daemon.getWorkingSet(agent.agentId)
        if (!remoteWorkingSet) continue

        if (remoteWorkingSet.has(filePath)) {
          const entry = remoteWorkingSet.getStatus(filePath)
          // Only consider it a conflict if the remote agent has intent (Staged) or modified status
          if (entry && (entry.status === 'staged' || entry.status === 'modified')) {
            conflictingAgentIds.push(agent.agentId)
            if (entry.operation) {
              operations.push(entry.operation)
            }
            const remoteSeverity = severityToLevel(remoteWorkingSet.assessSeverity(filePath))
            if (severityLevelRank(remoteSeverity) > severityLevelRank(maxFileSeverity)) {
              maxFileSeverity = remoteSeverity
            }
          }
        }
      }

      // Also check pending intent notifications for declared intents
      const notifications = daemon.getPendingNotifications(this.agentId) || []
      for (const notification of notifications) {
        if (notification.type === NotificationType.Intent) {
          const intent = notification.payload as IntentNotification
          if (intent.declaringAgentId === this.agentId) continue
          if (intent.filePaths.includes(filePath)) {
            if (!conflictingAgentIds.includes(intent.declaringAgentId)) {
              conflictingAgentIds.push(intent.declaringAgentId)
              operations.push(FileOperation.Modify)
              // Intent declarations are at least medium severity
              if (severityLevelRank('medium') > severityLevelRank(maxFileSeverity)) {
                maxFileSeverity = 'medium'
              }
            }
          }
        }
      }

      if (conflictingAgentIds.length > 0) {
        conflicts.push({
          filePath,
          conflictingAgentIds,
          severity: maxFileSeverity,
          operations,
        })
      }
    }

    const hasConflicts = conflicts.length > 0
    let maxSeverity: ConflictSeverityLevel = 'none'
    for (const conflict of conflicts) {
      if (severityLevelRank(conflict.severity) > severityLevelRank(maxSeverity)) {
        maxSeverity = conflict.severity
      }
    }

    return {
      conflicts,
      hasConflicts,
      maxSeverity,
    }
  }

  /**
   * Suggest alternative file paths or approaches to avoid conflicts.
   * For each conflicting path, generates alternative suggestions by:
   * - Adding a suffix (e.g., _alt, _v2)
   * - Suggesting a different directory
   * - Suggesting coordination with the conflicting agent
   */
  suggestAlternativePaths(conflictingPaths: string[], daemon: IDaemon): string[] {
    const alternatives: string[] = []

    for (const filePath of conflictingPaths) {
      // Generate path alternatives
      const basePath = filePath.replace(/\.[^.]+$/, '')
      const extension = filePath.match(/\.[^.]+$/)?.[0] ?? ''

      // Suffix-based alternatives
      alternatives.push(`${basePath}_alt${extension}`)
      alternatives.push(`${basePath}_v2${extension}`)

      // Directory-based alternatives
      const parts = filePath.split('/')
      if (parts.length > 1) {
        // Insert an 'alt' subdirectory before the filename
        const filename = parts[parts.length - 1]
        const dirParts = parts.slice(0, -1)
        alternatives.push([...dirParts, 'alt', filename].join('/'))
      }
    }

    return alternatives
  }

  /**
   * Generate a complete avoidance plan with safe paths, wait recommendations,
   * or coordination suggestions.
   */
  generateAvoidancePlan(
    filePaths: string[],
    operation: FileOperation,
    daemon: IDaemon
  ): AvoidancePlan {
    const conflictReport = this.checkIntentConflicts(filePaths, daemon)

    if (!conflictReport.hasConflicts) {
      return {
        safePaths: filePaths,
        conflictingPaths: [],
        waitForAgents: [],
        coordinationSuggestions: [],
        strategy: IntentAvoidanceStrategy.ProceedWithCaution,
      }
    }

    const conflictingPaths = conflictReport.conflicts.map((c) => c.filePath)
    const safePaths = filePaths.filter((p) => !conflictingPaths.includes(p))

    // Determine which agents we need to wait for or coordinate with
    const waitForAgents: string[] = []
    const coordinationSuggestions: string[] = []

    for (const conflict of conflictReport.conflicts) {
      for (const agentId of conflict.conflictingAgentIds) {
        if (conflict.severity === 'high' || conflict.severity === 'critical') {
          if (!waitForAgents.includes(agentId)) {
            waitForAgents.push(agentId)
          }
        } else {
          if (!waitForAgents.includes(agentId)) {
            coordinationSuggestions.push(
              `Coordinate with agent ${agentId} on file ${conflict.filePath} — consider partitioning work or sequential editing`
            )
          }
        }
      }
    }

    // Add alternative path suggestions for conflicting paths
    const alternatives = this.suggestAlternativePaths(conflictingPaths, daemon)
    for (const alt of alternatives) {
      coordinationSuggestions.push(`Consider using alternative path: ${alt}`)
    }

    // Determine strategy based on max severity
    let strategy: IntentAvoidanceStrategy
    switch (conflictReport.maxSeverity) {
      case 'critical':
        strategy = IntentAvoidanceStrategy.Wait
        break
      case 'high':
        strategy = IntentAvoidanceStrategy.Wait
        break
      case 'medium':
        strategy = IntentAvoidanceStrategy.Coordinate
        break
      case 'low':
        strategy = IntentAvoidanceStrategy.Redirect
        break
      default:
        strategy = IntentAvoidanceStrategy.ProceedWithCaution
        break
    }

    return {
      safePaths,
      conflictingPaths,
      waitForAgents,
      coordinationSuggestions,
      strategy,
    }
  }

  /**
   * Determine if the agent should wait for another agent's intent to clear.
   * Returns true if any conflicting intent has high or critical severity,
   * meaning the agent should wait rather than proceed.
   */
  shouldWaitForIntent(filePaths: string[], daemon: IDaemon): boolean {
    const conflictReport = this.checkIntentConflicts(filePaths, daemon)

    if (!conflictReport.hasConflicts) {
      return false
    }

    // Wait if any conflict is high or critical severity
    return conflictReport.conflicts.some(
      (c) => c.severity === 'high' || c.severity === 'critical'
    )
  }
}