export interface ReasoningTurn {
	id: string
	toolPattern: string[] // Ordered list of tool names
	filesTouched: string[] // Files read or modified
	hypotheses: string[] // Extracted hypotheses
	conclusions: string[] // Extracted conclusions
	stateTransitions: string[] // e.g., "todo_completed:X", "error_resolved:Y"
	timestamp: number
}

export interface LoopConfidenceState {
	score: number
	consecutiveSimilarTurns: number
	lastCompressionAt: number // Timestamp of last loop-triggered compression
	cooldownActive: boolean
}

export interface SemanticState {
	turns: ReasoningTurn[]
	windowSize: number
}
