import {
	LoopConfidenceState,
	CompressionRecoveryState,
} from "../../../packages/types/src/loop-detection"

/**
 * Configuration for the LoopConfidenceCalculator.
 * All parameters have sensible defaults and can be overridden via the constructor.
 */
export interface LoopCalculatorConfig {
	/** Base amount added to confidence when similarity is high. Default: 0.1 */
	baseIncrement: number
	/** Base amount subtracted from confidence when similarity is low. Default: 0.15 */
	baseDecrement: number
	/** Similarity score threshold above which turns are considered "similar". Default: 0.6 */
	similarityThreshold: number
	/** Number of turns after a compression during which confidence cannot increase. Default: 3 */
	cooldownTurns: number
	/** Amount confidence decays per turn during cooldown. Default: 0.1 */
	cooldownDecay: number
}

const DEFAULT_CONFIG: LoopCalculatorConfig = {
	baseIncrement: 0.1,
	baseDecrement: 0.15,
	similarityThreshold: 0.6,
	cooldownTurns: 3,
	cooldownDecay: 0.1,
}

/**
 * LoopConfidenceCalculator computes an escalating confidence score that the agent
 * is stuck in a semantic loop, based on consecutive similar turns, progress
 * signals, and post-compression recovery state.
 *
 * ## Escalation Formula
 *
 * When consecutive similar turns are detected, confidence grows nonlinearly:
 *
 * ```
 * increment = baseIncrement * (1 + consecutiveSimilarTurns * 0.5)
 * ```
 *
 * This produces the sequence: 0.10, 0.15, 0.20, 0.25, ...
 *
 * ## Recovery Formula
 *
 * When a turn is dissimilar, confidence decreases proportionally to progress:
 *
 * ```
 * decrement = baseDecrement * progressScore
 * ```
 *
 * Higher progress → faster recovery. Zero progress → no recovery.
 *
 * ## Cooldown
 *
 * After a compression event, a 3-turn cooldown prevents confidence from
 * increasing and applies a flat 0.10 decay per turn regardless of similarity.
 *
 * All computation is deterministic and synchronous.
 */
export default class LoopConfidenceCalculator {
	private readonly config: LoopCalculatorConfig

	constructor(config?: Partial<LoopCalculatorConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config }
	}

	/**
	 * Calculates the updated loop confidence state.
	 *
	 * @param currentState - The current confidence state from the previous turn.
	 * @param similarityScore - Similarity score for the current turn (0.0 to 1.0).
	 * @param progressScore - Progress score for the current turn (0.0 to 1.0).
	 * @param compressionRecovery - Recovery state tracking compression events.
	 * @returns A new LoopConfidenceState with updated score and counters.
	 */
	calculate(
		currentState: LoopConfidenceState,
		similarityScore: number,
		progressScore: number,
		compressionRecovery: CompressionRecoveryState,
	): LoopConfidenceState {
		const isSimilar = similarityScore >= this.config.similarityThreshold
		const cooldownActive = this.isCooldownActive(compressionRecovery)

		// Detect new compression event by comparing against the previously seen ID in state
		const newCompression =
			compressionRecovery.lastCompressionId !== null &&
			compressionRecovery.lastCompressionId !== currentState.lastSeenCompressionId

		let score: number
		let consecutiveSimilarTurns: number

		if (newCompression || cooldownActive) {
			// Cooldown mode: decay score, prevent increase, reset consecutive counter
			score = currentState.score - this.config.cooldownDecay
			consecutiveSimilarTurns = 0
		} else if (isSimilar) {
			// Similar turn: escalate confidence nonlinearly
			const increment =
				this.config.baseIncrement * (1 + currentState.consecutiveSimilarTurns * 0.5)
			score = currentState.score + increment
			consecutiveSimilarTurns = currentState.consecutiveSimilarTurns + 1
		} else {
			// Dissimilar turn: recover confidence proportional to progress
			const decrement = this.config.baseDecrement * progressScore
			score = currentState.score - decrement
			consecutiveSimilarTurns = 0
		}

		// Clamp score to [0.0, 1.0]
		score = Math.max(0.0, Math.min(1.0, score))

		return {
			score,
			consecutiveSimilarTurns,
			lastCompressionAt: newCompression
				? Date.now()
				: currentState.lastCompressionAt,
			cooldownActive,
			lastSeenCompressionId: compressionRecovery.lastCompressionId,
		}
	}

	/**
	 * Determines whether the cooldown period is active based on compression recovery state.
	 * Cooldown is active when a compression has occurred and fewer than cooldownTurns
	 * have elapsed since.
	 */
	private isCooldownActive(compressionRecovery: CompressionRecoveryState): boolean {
		if (compressionRecovery.lastCompressionId === null) {
			return false
		}
		return compressionRecovery.turnsSinceLastCompression < this.config.cooldownTurns
	}
}
