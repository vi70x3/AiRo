export type FallbackClass = "SOFT" | "HARD" | "ABORT"

export interface AdaptationFailureConfig {
  /** Mapping of consecutive failures to fallback class */
  thresholds: { soft: number; hard: number; abort: number }
  /** Callback when threshold crossed */
  onThresholdCross?: (strategy: string, fallback: FallbackClass) => void
}

/** Pure‑function detector tracking consecutive adaptation failures */
export class AdaptationFailureDetector {
  private readonly config: AdaptationFailureConfig
  private readonly failureCount: Map<string, number>

  constructor(config?: Partial<AdaptationFailureConfig>) {
    this.config = {
      thresholds: { soft: 2, hard: 4, abort: 5 },
      ...config,
    }
    this.failureCount = new Map()
  }

  /** Record a failure for a strategy */
  recordFailure(strategy: string): FallbackClass {
    const count = (this.failureCount.get(strategy) ?? 0) + 1
    this.failureCount.set(strategy, count)
    const fallback = this.classify(count)
    this.config.onThresholdCross?.(strategy, fallback)
    return fallback
  }

  /** Reset failures (e.g., after success) */
  reset(strategy: string): void {
    this.failureCount.delete(strategy)
  }

  private classify(count: number): FallbackClass {
    if (count >= this.config.thresholds.abort) return "ABORT"
    if (count >= this.config.thresholds.hard) return "HARD"
    if (count >= this.config.thresholds.soft) return "SOFT"
    return "SOFT" // default fallback for 0‑1 failures
  }
}
