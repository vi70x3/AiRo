import { LoopConfidenceState } from "../../../packages/types/src/loop-detection"

/**
 * Outcome of an intervention.
 */
export type InterventionOutcome = "success" | "partial" | "failure" | "relapsed"

/**
 * Configuration for the tracker.
 */
export interface InterventionEffectivenessConfig {
  /** Number of turns to keep in the rolling window */
  windowSize: number
  /** Callback invoked when a new score is computed */
  onScoreUpdate?: (strategy: string, score: number, confidence: number) => void
}

/**
 * Pure‑function based tracker that records outcomes per strategy and computes a
 * weighted effectiveness score over a rolling window.
 *
 * Score = Σ weight(outcome) / windowSize where weight(success)=1,
 * weight(partial)=0.5, weight(failure)=0, weight(relapsed)=0.
 * Confidence is derived from the sample size – more samples increase confidence
 * linearly up to 1.
 */
export class InterventionEffectivenessTracker {
  private readonly config: InterventionEffectivenessConfig
  private readonly history: Map<string, InterventionOutcome[]>

  constructor(config?: Partial<InterventionEffectivenessConfig>) {
    this.config = {
      windowSize: 20,
      ...config,
    }
    this.history = new Map()
  }

  /** Record an outcome for a given strategy */
  record(strategy: string, outcome: InterventionOutcome): {
    score: number
    confidence: number
  } {
    const list = this.history.get(strategy) ?? []
    list.push(outcome)
    if (list.length > this.config.windowSize) list.shift()
    this.history.set(strategy, list)

    const score = this.computeScore(list)
    const confidence = Math.min(1, list.length / this.config.windowSize)
    this.config.onScoreUpdate?.(strategy, score, confidence)
    return { score, confidence }
  }

  /** Compute the weighted score for a list of outcomes */
  private computeScore(outcomes: InterventionOutcome[]): number {
    if (outcomes.length === 0) return 0
    const weight = (o: InterventionOutcome) => {
      switch (o) {
        case "success":
          return 1
        case "partial":
          return 0.5
        case "failure":
        case "relapsed":
          return 0
      }
    }
    const total = outcomes.reduce((sum, o) => sum + weight(o), 0)
    return total / this.config.windowSize
  }

  /** Serialize the internal state for persistence */
  serialize(): string {
    const obj: Record<string, InterventionOutcome[]> = {}
    this.history.forEach((v, k) => (obj[k] = v))
    return JSON.stringify(obj)
  }

  /** Restore a previously serialized state */
  static deserialize(
    data: string,
    config?: Partial<InterventionEffectivenessConfig>,
  ): InterventionEffectivenessTracker {
    const tracker = new InterventionEffectivenessTracker(config)
    const obj = JSON.parse(data) as Record<string, InterventionOutcome[]>
    Object.entries(obj).forEach(([k, v]) => tracker.history.set(k, v))
    return tracker
  }
}

