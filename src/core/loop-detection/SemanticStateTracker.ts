import { ReasoningTurn, SemanticState } from "../../../packages/types/src/loop-detection"

/**
 * SemanticStateTracker manages a rolling window of ReasoningTurn objects.
 * It is responsible for maintaining the history of the agent's actions and states
 * to facilitate loop detection.
 */
export class SemanticStateTracker {
	private state: SemanticState

	constructor(windowSize: number = 10) {
		this.state = {
			turns: [],
			windowSize,
		}
	}

	/**
	 * Adds a new turn to the tracker.
	 * If the number of turns exceeds the window size, the oldest turn is removed.
	 */
	addTurn(turn: ReasoningTurn): void {
		this.state.turns.push(turn)
		if (this.state.turns.length > this.state.windowSize) {
			this.state.turns.shift()
		}
	}

	/**
	 * Returns the current set of turns in the tracker.
	 */
	getTurns(): ReasoningTurn[] {
		return [...this.state.turns]
	}

	/**
	 * Returns the window size of the tracker.
	 */
	getWindowSize(): number {
		return this.state.windowSize
	}

	/**
	 * Clears all turns from the tracker.
	 */
	clear(): void {
		this.state.turns = []
	}

	/**
	 * Returns the most recent turn, or undefined if no turns exist.
	 */
	getLatestTurn(): ReasoningTurn | undefined {
		return this.state.turns[this.state.turns.length - 1]
	}
}
