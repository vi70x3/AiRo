import {
  WorkingSetComparisonResult,
  ConflictRiskReport,
  ConflictSeverityLevel,
} from '@roo-code/types'
import { IDaemon } from '../interfaces'
import { WorkingSet } from './working-set'
import { ConflictSeverity } from '../worktree-manager/conflict-detector'

/**
 * Convert ConflictSeverity enum value to ConflictSeverityLevel string.
 * The enum values are the same strings, so this is a straightforward mapping.
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

export class WorkingSetComparator {
  /**
   * Compare local agent's working set with a remote agent's working set via the daemon.
   * Retrieves the remote agent's working set from the daemon, finds overlaps,
   * assesses severity, and suggests actions.
   */
  compareWorkingSets(
    localWorkingSet: WorkingSet,
    remoteAgentId: string,
    daemon: IDaemon
  ): WorkingSetComparisonResult {
    const remoteWorkingSet = daemon.getWorkingSet(remoteAgentId)

    if (!remoteWorkingSet) {
      return {
        remoteAgentId,
        overlappingFiles: [],
        severity: 'none',
        suggestedActions: ['proceed'],
      }
    }

    const localPaths = localWorkingSet.getFilePaths()
    const remotePaths = remoteWorkingSet.getFilePaths()
    const overlaps = this.findOverlaps(localPaths, remotePaths)

    if (overlaps.length === 0) {
      return {
        remoteAgentId,
        overlappingFiles: [],
        severity: 'none',
        suggestedActions: ['proceed'],
      }
    }

    const severity = this.assessOverlapSeverity(overlaps, localWorkingSet, remoteWorkingSet)
    const suggestedActions = this.suggestActions(severity)

    return {
      remoteAgentId,
      overlappingFiles: overlaps,
      severity,
      suggestedActions,
    }
  }

  /**
   * Find file path overlaps between two sets of paths.
   * Returns the intersection of the two arrays.
   */
  findOverlaps(localPaths: string[], remotePaths: string[]): string[] {
    const remoteSet = new Set(remotePaths)
    return localPaths.filter((path) => remoteSet.has(path))
  }

  /**
   * Determine overall severity of overlaps by examining both working sets.
   * The severity is the maximum of:
   * - The local agent's severity assessment for each overlapping file
   * - The remote agent's severity assessment for each overlapping file
   */
  assessOverlapSeverity(
    overlaps: string[],
    localWorkingSet: WorkingSet,
    remoteWorkingSet: WorkingSet
  ): ConflictSeverityLevel {
    if (overlaps.length === 0) {
      return 'none'
    }

    let maxSeverity: ConflictSeverityLevel = 'none'

    for (const filePath of overlaps) {
      const localSeverity = severityToLevel(localWorkingSet.assessSeverity(filePath))
      const remoteSeverity = severityToLevel(remoteWorkingSet.assessSeverity(filePath))

      if (severityLevelRank(localSeverity) > severityLevelRank(maxSeverity)) {
        maxSeverity = localSeverity
      }
      if (severityLevelRank(remoteSeverity) > severityLevelRank(maxSeverity)) {
        maxSeverity = remoteSeverity
      }
    }

    return maxSeverity
  }

  /**
   * Get a comprehensive risk assessment comparing the local working set
   * against ALL known agents registered with the daemon.
   */
  getConflictRiskAssessment(
    localWorkingSet: WorkingSet,
    daemon: IDaemon
  ): ConflictRiskReport {
    const agents = daemon.listAgents()
    const perAgentResults: Record<string, WorkingSetComparisonResult> = {}
    const details: Record<string, ConflictSeverityLevel> = {}
    let totalOverlaps = 0
    let overallSeverity: ConflictSeverityLevel = 'none'

    for (const agent of agents) {
      const result = this.compareWorkingSets(localWorkingSet, agent.agentId, daemon)
      perAgentResults[agent.agentId] = result
      totalOverlaps += result.overlappingFiles.length

      if (severityLevelRank(result.severity) > severityLevelRank(overallSeverity)) {
        overallSeverity = result.severity
      }

      for (const filePath of result.overlappingFiles) {
        const fileSeverity = localWorkingSet.assessSeverity(filePath)
        const level = severityToLevel(fileSeverity)
        if (severityLevelRank(level) > severityLevelRank(details[filePath] ?? 'none')) {
          details[filePath] = level
        }
      }
    }

    return {
      agentId: '',
      totalOverlaps,
      overallSeverity,
      perAgentResults,
      details,
    }
  }

  /**
   * Suggest actions based on the severity level of overlaps.
   */
  private suggestActions(severity: ConflictSeverityLevel): string[] {
    switch (severity) {
      case 'none':
        return ['proceed']
      case 'low':
        return ['proceed_with_caution', 'monitor']
      case 'medium':
        return ['coordinate', 'negotiate', 'wait']
      case 'high':
        return ['wait', 'negotiate', 'escalate']
      case 'critical':
        return ['block', 'escalate', 'wait']
      default:
        return ['proceed']
    }
  }
}