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

// ─── Phase 4A: Feedback Injection ───

export interface LoopFeedback {
    compressionId: string
    confidenceScore: number
    similarityScore: number
    progressScore: number
    consecutiveSimilarTurns: number
    dominantToolPattern: string[]
    repeatedFiles: string[]
    timestamp: number
    recoveryHints: RecoveryHint[]
}

export interface RecoveryHint {
    category: "tool_diversity" | "file_exploration" | "strategy_change" | "completion_check"
    message: string
}

// ─── Phase 4A: Silent Failure Detection ───

export enum SilentFailureType {
    EmptyResponse = "empty_response",
    NoToolUse = "no_tool_use",
    TruncatedToolCall = "truncated_tool_call",
    ZeroSignal = "zero_signal",
    ToolError = "tool_error",
}

export interface SilentFailureEvent {
    type: SilentFailureType
    turnIndex: number
    timestamp: number
    details: string | Record<string, unknown>
    consecutiveCount: number
}

// ─── Phase 4B: Strategy Memory ───

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

/** Strategy memory — bounded history of strategies tried */
export interface StrategyMemory {
	/** Ordered list of strategies tried (most recent last) */
	strategies: StrategyRecord[]
	/** Map from category sequence key → count of times tried */
	sequenceFrequency: Map<string, number>
	/** Maximum number of strategies to retain */
	maxSize: number
}

/** Result of a strategy cycle detection check */
export interface StrategyCycleResult {
	/** Whether a cycle was detected */
	isCycle: boolean
	/** The previous strategy record that matches, if any */
	previousOccurrence: StrategyRecord | null
	/** The length of the cycle in strategies */
	cycleLength: number
}

// ─── Phase 4B: Wandering Detection ───

/** Wandering state — tracks non-convergent behavior */
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
