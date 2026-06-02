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

/** Coarse tool categories for strategy classification */
export enum ToolCategory {
	Read = "read",
	Write = "write",
	Execute = "execute",
	Explore = "explore",
	Delegate = "delegate",
	Complete = "complete",
	Meta = "meta",
	Other = "other",
}

/** A strategy fingerprint — coarse representation of an approach */
export interface StrategyRecord {
	/** Unique ID for this strategy instance */
	id: string
	/** The sequence of tool categories observed */
	categorySequence: ToolCategory[]
	/** Files touched during this strategy */
	filesTouched: string[]
	/** Turn indices (in the global task turn list) where this strategy was active */
	turnRange: { start: number; end: number }
	/** Whether this strategy ended in compression */
	endedInCompression: boolean
	/** Whether this strategy produced strong progress */
	producedProgress: boolean
	/** Timestamp when this strategy was recorded */
	timestamp: number
}

export interface WanderingState {
	/** Number of consecutive turns with low similarity but also low progress */
	consecutiveWanderingTurns: number
	/** Cumulative progress score over the wandering window */
	cumulativeProgress: number
	/** Number of unique files touched during wandering */
	uniqueFilesTouched: number
	/** Number of unique tools used during wandering */
	uniqueToolsUsed: number
	/** Whether wandering has been detected (threshold exceeded) */
	isWandering: boolean
	/** Turn index where wandering started */
	wanderingStartTurn: number
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
