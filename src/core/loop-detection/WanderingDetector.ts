import type { ReasoningTurn, WanderingState } from "@roo-code/types"

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

const INITIAL_STATE: WanderingState = {
	consecutiveWanderingTurns: 0,
	cumulativeProgress: 0,
	uniqueFilesTouched: 0,
	uniqueToolsUsed: 0,
	isWandering: false,
	wanderingStartTurn: 0,
}

/**
 * WanderingDetector identifies non-convergent behavior where each turn is
 * different from the last but no progress is made.
 *
 * Bug fix applied:
 * - Task 3.6: Move file/tool tracking before grace period check
 */
export default class WanderingDetector {
	private config: WanderingConfig
	private state: WanderingState
	private turnCount: number
	private allFilesSeen: Set<string>
	private allToolsSeen: Set<string>

	constructor(config?: Partial<WanderingConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.state = { ...INITIAL_STATE }
		this.turnCount = 0
		this.allFilesSeen = new Set()
		this.allToolsSeen = new Set()
	}

	/**
	 * Process a turn result from the SemanticLoopDetector pipeline.
	 * Called after each turn with the similarity and progress scores.
	 */
	onTurnResult(similarityScore: number, progressScore: number, turn: ReasoningTurn): WanderingState {
		this.turnCount++

		// Task 3.6: Track files and tools BEFORE the grace period check
		// so that data is accumulated even during the grace period
		for (const f of turn.filesTouched) {
			this.allFilesSeen.add(f)
		}
		for (const t of turn.toolPattern) {
			this.allToolsSeen.add(t)
		}

		// Grace period: skip detection during initial exploration
		if (this.turnCount <= this.config.gracePeriod) {
			return this.state
		}

		if (similarityScore < this.config.dissimilarityThreshold && progressScore < this.config.lowProgressThreshold) {
			// Set wanderingStartTurn when consecutiveWanderingTurns transitions from 0 to 1
			const isNewWandering = this.state.consecutiveWanderingTurns === 0
			this.state = {
				...this.state,
				consecutiveWanderingTurns: this.state.consecutiveWanderingTurns + 1,
				cumulativeProgress: this.state.cumulativeProgress + progressScore,
				uniqueFilesTouched: this.allFilesSeen.size,
				uniqueToolsUsed: this.allToolsSeen.size,
				wanderingStartTurn: isNewWandering ? this.turnCount : this.state.wanderingStartTurn,
			}
		} else {
			// Reset wandering state — agent either found similarity (loop) or made progress
			// Only reset state, not turnCount, to preserve wandering detection continuity
			this.state = { ...INITIAL_STATE }
			this.allFilesSeen.clear()
			this.allToolsSeen.clear()
		}

		// Wandering is confirmed if all conditions are met
		if (
			this.state.consecutiveWanderingTurns >= this.config.wanderingTurnsThreshold &&
			this.state.uniqueFilesTouched >= this.config.minUniqueFiles &&
			this.state.cumulativeProgress < this.state.consecutiveWanderingTurns * this.config.lowProgressThreshold * 0.5
		) {
			this.state = {
				...this.state,
				isWandering: true,
			}
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
	getRecoveryHint(): { category: "strategy_change"; message: string } | null {
		if (!this.state.isWandering) {
			return null
		}
		return {
			category: "strategy_change",
			message: `Your exploration has not converged. ${this.state.consecutiveWanderingTurns} turns examined ${this.state.uniqueFilesTouched} files without meaningful progress. Focus on a specific component or start implementing changes.`,
		}
	}

	/**
	 * Returns the current wandering state.
	 */
	getState(): WanderingState {
		return { ...this.state }
	}

	reset(): void {
		this.state = { ...INITIAL_STATE }
		this.turnCount = 0
		this.allFilesSeen.clear()
		this.allToolsSeen.clear()
	}
}
