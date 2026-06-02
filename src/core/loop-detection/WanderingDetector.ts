import type { ReasoningTurn, WanderingState, RecoveryHint } from "@roo-code/types"

/**
 * Configuration for the WanderingDetector.
 */
export interface WanderingConfig {
	/** Similarity threshold below which a turn is "dissimilar". Default: 0.4 */
	dissimilarityThreshold: number
	/** Progress score threshold below which a turn is "low progress". Default: 0.2 */
	lowProgressThreshold: number
	/** Number of consecutive low-similarity + low-progress turns to trigger wandering. Default: 5 */
	wanderingTurnsThreshold: number
	/** Minimum unique files touched to distinguish wandering from loop. Default: 3 */
	minUniqueFiles: number
	/** Grace period — turns to skip at task start. Default: 5 */
	gracePeriod: number
}

const DEFAULT_CONFIG: WanderingConfig = {
	dissimilarityThreshold: 0.4,
	lowProgressThreshold: 0.2,
	wanderingTurnsThreshold: 5,
	minUniqueFiles: 3,
	gracePeriod: 5,
}

const DEFAULT_STATE: WanderingState = {
	consecutiveWanderingTurns: 0,
	cumulativeProgress: 0,
	uniqueFilesTouched: 0,
	uniqueToolsUsed: 0,
	isWandering: false,
	wanderingStartTurn: 0,
}

/**
 * WanderingDetector identifies non-convergent behavior patterns where
 * each turn is different from the last (low similarity) but no progress
 * is being made toward task completion.
 *
 * This is the complement of the loop problem:
 * - Loop: high similarity + low progress
 * - Wandering: low similarity + low progress
 *
 * The detector is a pure state machine — given the same sequence of inputs,
 * it always produces the same output.
 */
export default class WanderingDetector {
	private config: WanderingConfig
	private state: WanderingState
	private turnCount: number = 0
	private allFilesSeen: Set<string> = new Set()
	private allToolsSeen: Set<string> = new Set()

	constructor(config?: Partial<WanderingConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.state = { ...DEFAULT_STATE }
	}

	/**
	 * Process a turn result from the SemanticLoopDetector pipeline.
	 * Called after each turn with the similarity and progress scores.
	 *
	 * @param similarityScore - The similarity score for this turn (0.0–1.0)
	 * @param progressScore - The progress score for this turn (0.0–1.0)
	 * @param turn - The reasoning turn that was processed
	 * @returns The updated wandering state
	 */
	onTurnResult(similarityScore: number, progressScore: number, turn: ReasoningTurn): WanderingState {
		this.turnCount++

		// Grace period: skip initial turns where exploration is expected.
		if (this.turnCount <= this.config.gracePeriod) {
			return this.state
		}

		// Track unique files and tools.
		for (const f of turn.filesTouched) {
			this.allFilesSeen.add(f)
		}
		for (const t of turn.toolPattern) {
			this.allToolsSeen.add(t)
		}

		// Check if this turn is low-similarity AND low-progress.
		if (
			similarityScore < this.config.dissimilarityThreshold &&
			progressScore < this.config.lowProgressThreshold
		) {
			this.state.consecutiveWanderingTurns++
			this.state.cumulativeProgress += progressScore
			this.state.uniqueFilesTouched = this.allFilesSeen.size
			this.state.uniqueToolsUsed = this.allToolsSeen.size

			// Record the start of wandering.
			if (this.state.consecutiveWanderingTurns === 1) {
				this.state.wanderingStartTurn = this.turnCount
			}
		} else {
			// Reset wandering state — agent either found similarity (loop) or made progress.
			this.resetTracking()
		}

		// Check if wandering is confirmed.
		const cumulativeThreshold =
			this.state.consecutiveWanderingTurns * this.config.lowProgressThreshold * 0.5

		if (
			this.state.consecutiveWanderingTurns >= this.config.wanderingTurnsThreshold &&
			this.state.uniqueFilesTouched >= this.config.minUniqueFiles &&
			this.state.cumulativeProgress < cumulativeThreshold
		) {
			this.state.isWandering = true
		}

		return this.state
	}

	/**
	 * Check if the agent is currently in a wandering state.
	 */
	isWandering(): boolean {
		return this.state.isWandering
	}

	/**
	 * Get a recovery hint if wandering is detected.
	 */
	getRecoveryHint(): RecoveryHint | null {
		if (!this.state.isWandering) {
			return null
		}

		return {
			category: "strategy_change",
			message: `Your exploration has not converged toward a solution. ${this.state.consecutiveWanderingTurns} turns examined ${this.state.uniqueFilesTouched} files without meaningful progress. Focus on a specific component, start implementing changes, or use ask_followup_question if stuck.`,
		}
	}

	/**
	 * Get the current wandering state.
	 */
	getState(): WanderingState {
		return { ...this.state }
	}

	/**
	 * Reset the tracking state (but not the turn count or seen sets).
	 */
	private resetTracking(): void {
		this.state = {
			...this.state,
			consecutiveWanderingTurns: 0,
			cumulativeProgress: 0,
			uniqueFilesTouched: 0,
			uniqueToolsUsed: 0,
			isWandering: false,
			wanderingStartTurn: 0,
		}
	}

	/**
	 * Full reset including turn count and seen sets.
	 */
	reset(): void {
		this.state = { ...DEFAULT_STATE }
		this.turnCount = 0
		this.allFilesSeen = new Set()
		this.allToolsSeen = new Set()
	}
}
