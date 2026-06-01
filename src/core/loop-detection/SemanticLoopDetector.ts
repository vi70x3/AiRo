import { randomUUID } from "node:crypto"

import { SemanticStateTracker } from "./SemanticStateTracker"
import SimilarityScorer from "./SimilarityScorer"
import ProgressDetector from "./ProgressDetector"
import LoopConfidenceCalculator, { LoopCalculatorConfig } from "./LoopConfidenceCalculator"
import type {
	ReasoningTurn,
	LoopConfidenceState,
	CompressionRecoveryState,
	CompressionEvent,
	ProgressEvent,
} from "../../../packages/types/src/loop-detection"

/**
 * Configuration for the SemanticLoopDetector.
 */
export interface SemanticLoopDetectorConfig {
	/** Number of turns to retain in the rolling window. Default: 10 */
	windowSize?: number
	/** Similarity threshold above which turns are considered "similar". Default: 0.6 */
	similarityThreshold?: number
	/** Partial configuration for the internal LoopConfidenceCalculator. */
	calculatorConfig?: Partial<LoopCalculatorConfig>
}

/**
 * SemanticLoopDetector is the main orchestrator for the semantic loop detection
 * system. It wires together four components into a sequential pipeline:
 *
 * ```
 * ReasoningTurn
 *   → SemanticStateTracker  (store turn in rolling window)
 *   → SimilarityScorer      (compare current turn vs most recent previous turn)
 *   → ProgressDetector      (evaluate whether the turn shows meaningful progress)
 *   → LoopConfidenceCalculator (update loop confidence score)
 *   → LoopConfidenceState   (output for telemetry / compression decisions)
 * ```
 *
 * ### Lifecycle
 *
 * 1. Construct with optional config overrides.
 * 2. Call `onTurn()` after each agent turn (after tool execution, before next API request).
 * 3. Call `shouldCompress()` to check if compression should be triggered.
 * 4. Call `shouldCompress()` to check if compression should be triggered.
 * 5. Call `onCompression()` to generate a compression event and reset state.
 * 6. Call `reset()` when starting a new task to clear all state.
 *
 * ### State Management
 *
 * All mutable state is held in explicit fields (`loopConfidenceState`,
 * `compressionRecoveryState`) and is never hidden. The detector is fully
 * deterministic given the same sequence of turns.
 */
export default class SemanticLoopDetector {
	private readonly stateTracker: SemanticStateTracker
	private readonly similarityScorer: SimilarityScorer
	private readonly progressDetector: ProgressDetector
	private readonly confidenceCalculator: LoopConfidenceCalculator

	private loopConfidenceState: LoopConfidenceState
	private compressionRecoveryState: CompressionRecoveryState

	constructor(config?: SemanticLoopDetectorConfig) {
		this.stateTracker = new SemanticStateTracker(config?.windowSize ?? 10)
		this.similarityScorer = new SimilarityScorer()
		this.progressDetector = new ProgressDetector()
		this.confidenceCalculator = new LoopConfidenceCalculator(config?.calculatorConfig)

		// Note: lastCompressionAt is typed as `number` (not nullable) in the
		// existing type definition, so we use 0 to represent "no compression yet".
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

	/**
	 * Process a new reasoning turn through the detection pipeline.
	 *
	 * Pipeline steps:
	 * 1. Store the turn in the state tracker.
	 * 2. Compute similarity against the most recent previous turn (0.0 if first turn).
	 * 3. Detect progress events by comparing against all previous turns in the window.
	 * 4. Update compression recovery counter if a compression has occurred.
	 * 5. Calculate updated loop confidence.
	 *
	 * @param turn - The reasoning turn to process.
	 * @returns The updated loop confidence, similarity score, progress events, and progress score.
	 */
	onTurn(turn: ReasoningTurn): {
		loopConfidence: LoopConfidenceState
		similarityScore: number
		progressEvents: ProgressEvent[]
		progressScore: number
	} {
		// Step 1: Store the turn
		this.stateTracker.addTurn(turn)

		// Step 2: Compute similarity against the most recent previous turn.
		// getTurns() returns all turns in the window including the one just added,
		// so we compare the current turn (last element) against the one before it.
		const allTurns = this.stateTracker.getTurns()
		let similarityScore: number
		if (allTurns.length < 2) {
			// First turn in the window — no previous turn to compare against.
			similarityScore = 0.0
		} else {
			const currentTurnInWindow = allTurns[allTurns.length - 1]
			const previousTurn = allTurns[allTurns.length - 2]
			similarityScore = this.similarityScorer.computeSimilarity(currentTurnInWindow, previousTurn)
		}

		// Step 3: Detect progress by comparing the current turn against all
		// previous turns in the window (excluding the current turn itself).
		const previousTurns = allTurns.slice(0, -1)
		const { events: progressEvents, score: progressScore } =
			this.progressDetector.detectProgress(turn, previousTurns)

		// Step 4: Update compression recovery counter.
		// If a compression has occurred (lastCompressionId is set), increment
		// the turnsSinceLastCompression counter on each new turn.
		if (this.compressionRecoveryState.lastCompressionId !== null) {
			this.compressionRecoveryState = {
				...this.compressionRecoveryState,
				turnsSinceLastCompression: this.compressionRecoveryState.turnsSinceLastCompression + 1,
			}
		}

		// Step 5: Calculate updated loop confidence using the calculator.
		this.loopConfidenceState = this.confidenceCalculator.calculate(
			this.loopConfidenceState,
			similarityScore,
			progressScore,
			this.compressionRecoveryState,
		)

		return {
			loopConfidence: this.loopConfidenceState,
			similarityScore,
			progressEvents,
			progressScore,
		}
	}

	/**
	 * Check whether compression should be triggered based on the current
	 * loop confidence score.
	 *
	 * Compression is recommended when the confidence score exceeds the
	 * threshold AND the cooldown period from a previous compression is
	 * not active.
	 *
	 * @param threshold - Confidence threshold (0.0–1.0). Default: 0.7
	 * @returns `true` if compression should be triggered.
	 */
	shouldCompress(threshold: number = 0.7): boolean {
		return this.loopConfidenceState.score >= threshold && !this.loopConfidenceState.cooldownActive
	}

	/**
	 * Record a compression event and reset internal state.
	 *
	 * This method:
	 * 1. Generates a unique compression event ID using `crypto.randomUUID()`.
	 * 2. Creates a `CompressionEvent` with the provided reason, current timestamp,
	 *    and the number of turns at the time of compression.
	 * 3. Updates `loopConfidenceState` to mark the compression timestamp and
	 *    activate the cooldown.
	 * 4. Updates `compressionRecoveryState` to track the new compression and
	 *    reset the recovery counter.
	 * 5. Clears the state tracker's rolling window.
	 *
	 * @param reason - Human-readable reason for the compression. Default: "loop_detected"
	 * @returns The generated `CompressionEvent`.
	 */
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

		// Update loop confidence state: mark compression timestamp and activate cooldown.
		this.loopConfidenceState = {
			...this.loopConfidenceState,
			lastCompressionAt: timestamp,
			cooldownActive: true,
			lastSeenCompressionId: id,
		}

		// Update compression recovery state: track the new compression and reset recovery.
		this.compressionRecoveryState = {
			lastCompressionId: id,
			isRecovered: false,
			turnsSinceLastCompression: 0,
		}

		// Clear the state tracker's rolling window so future similarity
		// comparisons start fresh after compression.
		this.stateTracker.clear()

		return event
	}

	/**
	 * Get the current loop confidence state (read-only snapshot).
	 *
	 * @returns The current `LoopConfidenceState`.
	 */
	getLoopConfidenceState(): LoopConfidenceState {
		return this.loopConfidenceState
	}

	/**
	 * Get the current compression recovery state (read-only snapshot).
	 *
	 * @returns The current `CompressionRecoveryState`.
	 */
	getCompressionRecoveryState(): CompressionRecoveryState {
		return this.compressionRecoveryState
	}

	/**
	 * Reset all internal state to initial values, as if the detector
	 * were freshly constructed.
	 *
	 * Call this when starting a new task to clear accumulated state
	 * from previous tasks.
	 */
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
	}

	/**
	 * Get the number of turns currently stored in the rolling window.
	 *
	 * @returns The number of turns in the state tracker's window.
	 */
	getTurnCount(): number {
		return this.stateTracker.getTurns().length
	}
}