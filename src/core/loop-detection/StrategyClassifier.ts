import { type ReasoningTurn, type StrategyRecord, ToolCategory } from "@roo-code/types"

/**
 * Mapping of tool names to their coarse-grained categories.
 * Uses string literals to avoid module-level enum resolution issues.
 * Priority: first match wins (Read > Write > Execute > Explore > Delegate > Complete > Meta > Other).
 */
function classifyTool(toolName: string): ToolCategory {
	switch (toolName) {
		case "read_file":
		case "list_files":
			return ToolCategory.Read
		case "write_to_file":
		case "apply_diff":
		case "edit_file":
		case "search_and_replace":
			return ToolCategory.Write
		case "execute_command":
		case "run_slash_command":
			return ToolCategory.Execute
		case "codebase_search":
		case "search_files":
			return ToolCategory.Explore
		case "new_task":
		case "async_task":
			return ToolCategory.Delegate
		case "attempt_completion":
			return ToolCategory.Complete
		case "ask_followup_question":
		case "switch_mode":
			return ToolCategory.Meta
		default:
			return ToolCategory.Other
	}
}

/**
 * Classify a turn into a single dominant ToolCategory based on its toolPattern.
 * The most frequent category in the turn is returned; ties are broken by priority order.
 */
function classifyTurn(turn: ReasoningTurn): ToolCategory {
	const counts: Partial<Record<ToolCategory, number>> = {}

	for (const tool of turn.toolPattern) {
		const cat = classifyTool(tool)
		counts[cat] = (counts[cat] ?? 0) + 1
	}

	let best: ToolCategory = ToolCategory.Other
	let bestCount = -1
	for (const cat of Object.values(ToolCategory)) {
		const count = counts[cat] ?? 0
		if (count > bestCount) {
			best = cat as ToolCategory
			bestCount = count
		}
	}
	return best
}

/**
 * StrategyClassifier groups consecutive turns into strategies based on category changes.
 * A new strategy begins when:
 *   1. A compression event occurs (handled externally).
 *   2. The dominant category changes for `boundaryTurns` consecutive turns.
 *   3. A delegate or complete category is encountered.
 */
export default class StrategyClassifier {
	private readonly boundaryTurns: number
	private currentStrategy: StrategyRecord | null = null
	private turnIndex: number = 0
	private recentCategories: ToolCategory[] = []

	constructor(boundaryTurns: number = 3) {
		this.boundaryTurns = boundaryTurns
	}

	/**
	 * Process a new turn and return the (possibly new) current strategy.
	 */
	processTurn(turn: ReasoningTurn, compressionOccurred: boolean = false): StrategyRecord {
		this.turnIndex++

		const cat = classifyTurn(turn)
		this.recentCategories.push(cat)
		if (this.recentCategories.length > this.boundaryTurns) {
			this.recentCategories.shift()
		}

		// Determine if a boundary is detected.
		let boundary = false
		if (compressionOccurred) {
			boundary = true
		} else if (cat === ToolCategory.Delegate || cat === ToolCategory.Complete) {
			boundary = true
		} else if (this.recentCategories.length === this.boundaryTurns) {
			const allSame = this.recentCategories.every((c) => c === this.recentCategories[0])
			if (!allSame) {
				boundary = true
			}
		}

		if (boundary || this.currentStrategy === null) {
			// Finalize previous strategy if exists.
			if (this.currentStrategy) {
				this.currentStrategy.turnRange.end = this.turnIndex - 1
			}

			// Start a new strategy.
			const newStrategy: StrategyRecord = {
				id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
				categorySequence: [cat],
				filesTouched: [...turn.filesTouched],
				turnRange: { start: this.turnIndex, end: this.turnIndex },
				endedInCompression: compressionOccurred,
				producedProgress: false,
				timestamp: Date.now(),
			}
			this.currentStrategy = newStrategy
		} else {
			// Extend existing strategy.
			this.currentStrategy.categorySequence.push(cat)
			this.currentStrategy.filesTouched.push(...turn.filesTouched)
			this.currentStrategy.turnRange.end = this.turnIndex
		}

		return this.currentStrategy!
}
}
