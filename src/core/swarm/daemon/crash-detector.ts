import {
  AgentLifecycleState,
  CrashDetectedEvent,
  CrashDetectorConfig,
  CrashType,
} from '@roo-code/types'

export const DEFAULT_CRASH_DETECTOR_CONFIG: CrashDetectorConfig = {
  heartbeatIntervalMs: 10000,
  heartbeatMissThreshold: 3,
  timeoutDurationMs: 60000,
  enabled: true,
}

export class CrashDetector {
  private config: CrashDetectorConfig
  private heartbeatTimestamps: Map<string, number> = new Map()
  private progressTimestamps: Map<string, number> = new Map()
  private heartbeatMissCounts: Map<string, number> = new Map()
  private processAlive: Map<string, boolean> = new Map()
  private monitoringInterval: ReturnType<typeof setInterval> | null = null
  private crashListeners: Array<(event: CrashDetectedEvent) => void> = []
  private agentStates: Map<string, AgentLifecycleState> = new Map()

  constructor(config?: Partial<CrashDetectorConfig>) {
    this.config = { ...DEFAULT_CRASH_DETECTOR_CONFIG, ...config }
  }

  // --- Public API ---

  registerAgent(agentId: string, state: AgentLifecycleState): void {
    const now = Date.now()
    this.heartbeatTimestamps.set(agentId, now)
    this.progressTimestamps.set(agentId, now)
    this.heartbeatMissCounts.set(agentId, 0)
    this.processAlive.set(agentId, true)
    this.agentStates.set(agentId, state)
  }

  unregisterAgent(agentId: string): void {
    this.heartbeatTimestamps.delete(agentId)
    this.progressTimestamps.delete(agentId)
    this.heartbeatMissCounts.delete(agentId)
    this.processAlive.delete(agentId)
    this.agentStates.delete(agentId)
  }

  recordHeartbeat(agentId: string): void {
    const now = Date.now()
    this.heartbeatTimestamps.set(agentId, now)
    this.progressTimestamps.set(agentId, now)
    this.heartbeatMissCounts.set(agentId, 0)
  }

  recordProgress(agentId: string): void {
    this.progressTimestamps.set(agentId, Date.now())
  }

  markProcessExited(agentId: string): void {
    this.processAlive.set(agentId, false)
  }

  updateAgentState(agentId: string, state: AgentLifecycleState): void {
    this.agentStates.set(agentId, state)
  }

  onCrash(listener: (event: CrashDetectedEvent) => void): () => void {
    this.crashListeners.push(listener)
    return () => {
      const idx = this.crashListeners.indexOf(listener)
      if (idx >= 0) {
        this.crashListeners.splice(idx, 1)
      }
    }
  }

  startMonitoring(): void {
    if (!this.config.enabled) {
      return
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
    }

    this.monitoringInterval = setInterval(() => {
      this.checkForCrashes()
    }, this.config.heartbeatIntervalMs)
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
  }

  // --- Private Methods ---

  private checkForCrashes(): void {
    const now = Date.now()
    const agentIds = Array.from(this.heartbeatTimestamps.keys())

    for (const agentId of agentIds) {
      // Check heartbeat misses
      const lastHeartbeat = this.heartbeatTimestamps.get(agentId) || 0
      const timeSinceHeartbeat = now - lastHeartbeat

      if (timeSinceHeartbeat > (this.config.heartbeatMissThreshold * this.config.heartbeatIntervalMs)) {
        const missCount = (this.heartbeatMissCounts.get(agentId) || 0) + 1
        this.heartbeatMissCounts.set(agentId, missCount)

        if (missCount >= this.config.heartbeatMissThreshold) {
          this.emitCrashEvent(agentId, 'heartbeat_miss', 'Agent missed consecutive heartbeats')
          continue
        }
      } else {
        // Reset miss count if we get a heartbeat
        this.heartbeatMissCounts.set(agentId, 0)
      }

      // Check process exit
      if (!this.processAlive.get(agentId)) {
        this.emitCrashEvent(agentId, 'process_exit', 'Agent process terminated unexpectedly')
        continue
      }

      // Check timeout (no progress)
      const lastProgress = this.progressTimestamps.get(agentId) || 0
      const timeSinceProgress = now - lastProgress

      if (timeSinceProgress > this.config.timeoutDurationMs) {
        this.emitCrashEvent(agentId, 'timeout', 'Agent has not made progress within timeout period')
      }
    }
  }

  private emitCrashEvent(agentId: string, crashType: CrashType, details: string): void {
    const event: CrashDetectedEvent = {
      agentId,
      crashType,
      lastKnownState: this.agentStates.get(agentId) || AgentLifecycleState.Spawned,
      timestamp: Date.now(),
      details,
    }

    for (const listener of this.crashListeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('Error in crash listener:', error)
      }
    }
  }
}