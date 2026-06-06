/** Outcome of a relapse detection */
export type RelapseSeverity = "low" | "medium" | "high"

export interface RelapseDetectorConfig {
  /** Number of turns after an intervention to watch for relapse */
  relapseWindow: number
  /** Callback when relapse detected */
  onRelapse?: (strategy: string, severity: RelapseSeverity, turn: number) => void
}

/** Pure‑function based detector that tracks recovery turns and emits relapse events */
export class RelapseDetector {
  private readonly config: RelapseDetectorConfig
  private readonly recoveryMap: Map<string, number>

  constructor(config?: Partial<RelapseDetectorConfig>) {
    this.config = {
      relapseWindow: 10,
      ...config,
    }
    this.recoveryMap = new Map()
  }

  /** Record a successful intervention turn for a strategy */
  recordSuccess(strategy: string, turn: number): void {
    this.recoveryMap.set(strategy, turn)
  }

  /** Check for relapse given current turn and whether pattern re‑emerged */
  check(strategy: string, currentTurn: number, patternDetected: boolean): {
    relapsed: boolean
    severity?: RelapseSeverity
  } {
    const lastSuccess = this.recoveryMap.get(strategy)
    if (lastSuccess === undefined) return { relapsed: false }
    const elapsed = currentTurn - lastSuccess
    // Defensive check: reject non-monotonic turn counts (e.g., after compression resets)
    if (!patternDetected || elapsed <= 0 || elapsed > this.config.relapseWindow) {
      return { relapsed: false }
    }
    // Determine severity based on how quickly relapse occurred
    const ratio = elapsed / this.config.relapseWindow
    const severity: RelapseSeverity =
      ratio < 0.33 ? "high" : ratio < 0.66 ? "medium" : "low"
    this.config.onRelapse?.(strategy, severity, currentTurn)
    return { relapsed: true, severity }
  }
}
