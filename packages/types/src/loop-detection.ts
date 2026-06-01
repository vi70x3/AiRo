export interface ReasoningTurn {
	id: string
	toolPattern: string[] // Ordered list of tool names
	filesTouched: string[] // Files read or modified (unique paths)
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
	lastSeenCompressionId: string | null // Tracks the last compression ID seen, making the calculator pure
}

export interface SemanticState {
	turns: ReasoningTurn[]
	windowSize: number
}

export enum ProgressTier {
	Strong = "strong",
	Medium = "medium",
	Weak = "weak",
}

export interface ProgressEvent {
	type: string // e.g., "file_created", "hypothesis_new"
	tier: ProgressTier
	details: string
	timestamp: number
}

export interface CompressionEvent {
	id: string
	reason: string
	timestamp: number
	turnsAtCompression: number
}

export interface CompressionRecoveryState {
	lastCompressionId: string | null
	isRecovered: boolean
	turnsSinceLastCompression: number
}
