import { randomUUID } from "node:crypto"

import { SemanticStateTracker } from "./SemanticStateTracker"
import SimilarityScorer from "./SimilarityScorer"
import ProgressDetector from "./ProgressDetector"
import LoopConfidenceCalculator, { LoopCalculatorConfig } from "./LoopConfidenceCalculator"
import StrategyClassifier from "./StrategyClassifier"
import StrategyMemory from "./StrategyMemory"
import WanderingDetector from "./WanderingDetector"
import type {
	ReasoningTurn,
	LoopConfidenceState,
	CompressionRecoveryState,
	CompressionEvent,
	ProgressEvent,
	WanderingState,
} from "@roo-code/types"

export interface SemanticLoopDetectorConfig {
	windowSize?: number
	similarityThreshold?: number
	calculatorConfig?: Partial<LoopCalculatorConfig>
	onLoopDetected?: (event: {
		confidenceScore: number
		similarityScore: number
		progressScore: number
		consecutiveSimilarTurns: number
	}) => void
	onCompressionTriggered?: (event: { compressionId: string; confidenceScore: number; reason: string }) => void
	onRecoveryDetected?: (event: { compressionId: string; turnsToRecover: number }) => void
	onStrategyCycle?: (event: { cycleLength: number; strategySequence: string[] }) => void
	onWandering?: (event: { consecutiveWanderingTurns: number; cumulativeProgress: number }) => void
	strategyMemoryEnabled?: boolean
	strategyMemorySize?: number
	strategyBoundaryTurns?: number
	wanderingEnabled?: boolean
	wanderingConfig?: Partial<import("./WanderingDetector").WanderingConfig>
}

export default class SemanticLoopDetector {
	private readonly stateTracker: SemanticStateTracker
	private readonly similarityScorer: SimilarityScorer
	private readonly progressDetector: ProgressDetector
	private readonly confidenceCalculator: LoopConfidenceCalculator
	private readonly similarityThreshold: number
	private readonly onLoopDetected?: SemanticLoopDetectorConfig["onLoopDetected"]
	private readonly onCompressionTriggered?: SemanticLoopDetectorConfig["onCompressionTriggered"]
	private readonly onRecoveryDetected?: SemanticLoopDetectorConfig["onRecoveryDetected"]
	private readonly onStrategyCycle?: SemanticLoopDetectorConfig["onStrategyCycle"]
	private readonly onWandering?: SemanticLoopDetectorConfig["onWandering"]

	private loopConfidenceState: LoopConfidenceState
	private compressionRecoveryState: CompressionRecoveryState
	private readonly strategyClassifier: StrategyClassifier
	private readonly strategyMemory: StrategyMemory
	private readonly wanderingDetector: WanderingDetector
	private readonly strategyMemoryEnabled: boolean
	private readonly wanderingEnabled: boolean
	private globalTurnIndex: number = 0
	private lastSimilarityScore: number = 0
	private lastProgressScore: number = 0

	constructor(config?: SemanticLoopDetectorConfig) {
		this.stateTracker = new SemanticStateTracker(config?.windowSize ?? 10)
		this.similarityScorer = new SimilarityScorer()
		this.progressDetector = new ProgressDetector()
		this.confidenceCalculator = new LoopConfidenceCalculator(config?.calculatorConfig)
		this.similarityThreshold = config?.similarityThreshold ?? 0.6
		this.onLoopDetected = config?.onLoopDetected
		this.onCompressionTriggered = config?.onCompressionTriggered
		this.onRecoveryDetected = config?.onRecoveryDetected
		this.onStrategyCycle = config?.onStrategyCycle
		this.onWandering = config?.onWandering

		this.strategyMemoryEnabled = config?.strategyMemoryEnabled ?? true
		this.wanderingEnabled = config?.wanderingEnabled ?? true
		this.strategyClassifier = new StrategyClassifier(config?.strategyBoundaryTurns ?? 3)
		this.strategyMemory = new StrategyMemory(config?.strategyMemorySize ?? 20)
		this.wanderingDetector = new WanderingDetector(config?.wanderingConfig)

		this.loopConfidenceState = {
			score: 0,
			consecutiveSimilarTurns: 0,
			lastCompressionAt: 0,
			cooldownActive: false,
			lastSeenCompressionId: null,
		}

		this.compressionRecoveryState = {
			lastCompressionId: null,
			isRecovered: false,
			turnsSinceLastCompression: 0,
		}
	}

	onTurn(turn: ReasoningTurn): {
		loopConfidence: LoopConfidenceState
		similarityScore: number
		progressEvents: ProgressEvent[]
		progressScore: number
		wanderingState: WanderingState
	} {
		this.globalTurnIndex++

		// Step 1: Store the turn
		this.stateTracker.addTurn(turn)

		// Step 2: Compute similarity
		const allTurns = this.stateTracker.getTurns()
		let similarityScore: number
		if (allTurns.length < 2) {
			similarityScore = 0.0
		} else {
			const currentTurnInWindow = allTurns[allTurns.length - 1]
			const previousTurn = allTurns[allTurns.length - 2]
			similarityScore = this.similarityScorer.computeSimilarity(currentTurnInWindow, previousTurn)
		}
		this.lastSimilarityScore = similarityScore

		// Step 3: Detect progress
		const previousTurns = allTurns.slice(0, -1)
		const { events: progressEvents, score: progressScore } =
			this.progressDetector.detectProgress(turn, previousTurns)
		this.lastProgressScore = progressScore

		// Step 4: Update compression recovery counter
		if (this.compressionRecoveryState.lastCompressionId !== null) {
			this.compressionRecoveryState = {
				...this.compressionRecoveryState,
				turnsSinceLastCompression: this.compressionRecoveryState.turnsSinceLastCompression + 1,
			}
		}

		// Step 5: Calculate loop confidence
		this.loopConfidenceState = this.confidenceCalculator.calculate(
			this.loopConfidenceState,
			similarityScore,
			progressScore,
			this.compressionRecoveryState,
		)

		// Step 6: Phase 4B - Strategy classification
		if (this.strategyMemoryEnabled) {
			const strategy = this.strategyClassifier.processTurn(turn, false)
			this.strategyMemory.addStrategy(strategy)

			// Check for strategy cycles
			const cycle = this.strategyMemory.detectCycle(strategy.categorySequence)
			if (cycle.isCycle) {
				console.log(
					`[loop-detection] Strategy cycle detected: length=${cycle.cycleLength}, sequence=${strategy.categorySequence.join("->")}`,
				)
				this.onStrategyCycle?.({
					cycleLength: cycle.cycleLength,
					strategySequence: strategy.categorySequence.map((c) => String(c)),
				})
			}
		}

		// Step 7: Phase 4B - Wandering detection
		let wanderingState: WanderingState = this.wanderingDetector.getState()
		if (this.wanderingEnabled) {
			wanderingState = this.wanderingDetector.onTurnResult(similarityScore, progressScore, turn)

			if (wanderingState.isWandering) {
				console.log(
					`[loop-detection] Wandering detected: turns=${wanderingState.consecutiveWanderingTurns}, files=${wanderingState.uniqueFilesTouched}, progress=${wanderingState.cumulativeProgress}`,
				)
				this.onWandering?.({
					consecutiveWanderingTurns: wanderingState.consecutiveWanderingTurns,
					cumulativeProgress: wanderingState.cumulativeProgress,
				})
			}
		}

		// Step 8: Emit telemetry for loop detection
		if (similarityScore >= this.similarityThreshold && progressScore < 0.3) {
			console.log(
				`[loop-detection] Loop detected: confidence=${this.loopConfidenceState.score}, similarity=${similarityScore}, progress=${progressScore}`,
			)
			this.onLoopDetected?.({
				confidenceScore: this.loopConfidenceState.score,
				similarityScore,
				progressScore,
				consecutiveSimilarTurns: this.loopConfidenceState.consecutiveSimilarTurns,
			})
		}

		// Step 9: Emit telemetry for{ recovery detection
		if (
			this.compressionRecoveryState.lastCompressionId !== null &&
			!this.compressionRecoveryState.isRecovered &&
			progressScore >= 0.3
		) {
			const turnsToRecover = this.compressionRecoveryState.turnsSinceLastCompression
			console.log(`[loop-detection] Recovery detected after ${turnsToRecover} turns`)
			this.onRecoveryDetected?.({
				compressionId: this.compressionRecoveryState.lastCompressionId,
				turnsToRecover,
			})
			this.compressionRecoveryState = {
				...this.compressionRecoveryState,
				isRecovered: true,
			}
		}

		return {
			loopConfidence: this.loopConfidenceState,
			similarityScore,
			progressEvents,
			progressScore,
			wanderingState,
		}
	}

	shouldCompress(threshold: number = 0.7): boolean {
		return this.loopConfidenceState.score >= threshold && !this.loopConfidenceState.cooldownActive
	}

	onCompression(reason: string = "loop_detected"): CompressionEvent {
		const id = randomUUID()
		const timestamp = Date.now()
		const turnsAtCompression = this.stateTracker.getTurns().length

		const event: CompressionEvent = {
			id,
			reason,
			timestamp,
			turnsAtCompression,
		}

		console.log(`[loop-detection] Compression triggered: id=${id}, reason=${reason}`)
		this.onCompressionTriggered?.({
			compressionId: id,
			confidenceScore: this.loopConfidenceState.score,
			reason,
		})

		// Phase 4B: Record strategy that ended in compression
		if (this.strategyMemoryEnabled) {
			const latest = this.strategyMemory.getLatest()
			if (latest) {
				latest.endedInCompression = true
			}
		}

		this.loopConfidenceState = {
			...this.loopConfidenceState,
			lastCompressionAt: timestamp,
			cooldownActive: true,
			lastSeenCompressionId: id,
		}

		this.compressionRecoveryState = {
			lastCompressionId: id,
			isRecovered: false,
			turnsSinceLastCompression: 0,
		}

		this.stateTracker.clear()

		//Phase 4B: Reset wandering detector on compression
		if (this.wanderingEnabled) {
			this.wanderingDetector.reset()
		}

		return event
	}

	getLoopConfidenceState(): LoopConfidenceState {
		return this.loopConfidenceState
	}

	getCompressionRecoveryState(): CompressionRecoveryState {
		return this.compressionRecoveryState
	}

	getWanderingState(): WanderingState {
		return this.wanderingDetector.getState()
	}

	getStrategyMemory(): StrategyMemory {
		return this.strategyMemory
	}

	reset(): void {
		this.loopConfidenceState = {
			score: 0,
			consecutiveSimilarTurns: 0,
			lastCompressionAt: 0,
			cooldownActive: false,
			lastSeenCompressionId: null,
		}

		this.compressionRecoveryState = {
			lastCompressionId: null,
			isRecovered: false,
			turnsSinceLastCompression: 0,
		}

		this.stateTracker.clear()
		this.strategyMemory.reset()
		this.wanderingDetector.reset()
		this.globalTurnIndex = 0
		this.lastSimilarityScore = 0
		this.lastProgressScore = 0
	}

	getTurnCount(): number {
		return this.stateTracker.getTurns().length
	}

	getGlobalTurnIndex(): number {
		return this.globalTurnIndex
	}

	getLastSimilarityScore(): number {
		return this.lastSimilarityScore
	}

	getLastProgressScore(): number {
		return this.lastProgressScore
	}
}
