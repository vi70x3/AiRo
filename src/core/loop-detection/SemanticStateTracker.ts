import { ReasoningTurn, SemanticState } from "@roo-code/types"

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
	 * @throws Error if the turn is invalid.
	 */
	addTurn(turn: ReasoningTurn): void {
		if (!turn || typeof turn !== "object") {
			throw new Error("Invalid ReasoningTurn: must be an object")
		}
		if (!turn.id || typeof turn.id !== "string") {
			throw new Error("Invalid ReasoningTurn: missing or invalid id")
		}
		if (!Array.isArray(turn.toolPattern)) {
			throw new Error("Invalid ReasoningTurn: toolPattern must be an array")
		}
		if (!Array.isArray(turn.filesTouched)) {
			throw new Error("Invalid ReasoningTurn: filesTouched must be an array")
		}
		if (!Array.isArray(turn.hypotheses)) {
			throw new Error("Invalid ReasoningTurn: hypotheses must be an array")
		}
		if (!Array.isArray(turn.conclusions)) {
			throw new Error("Invalid ReasoningTurn: conclusions must be an array")
		}
		if (!Array.isArray(turn.stateTransitions)) {
			throw new Error("Invalid ReasoningTurn: stateTransitions must be an array")
		}
		if (typeof turn.timestamp !== "number") {
			throw new Error("Invalid ReasoningTurn: timestamp must be a number")
		}

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
