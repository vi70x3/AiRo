import { ToolCategory } from "../../../packages/types/src/loop-detection"
import type { ReasoningTurn, CompressionEvent } from "../../../packages/types/src/loop-detection"

/**
 * StrategyClassifier classifies turns into coarse categories and identifies
 * strategy boundaries.
 *
 * Bug fixes applied:
 * - Task 3.2: Added "search_replace" and "apply_patch" cases to classifyTool
 * - Task 3.3: Replaced deprecated .substr(2, 5) with .slice(2, 7)
 */
export default class StrategyClassifier {
	/**
	 * Classifies a tool name into a coarse category.
	 */
	classifyTool(toolName: string): ToolCategory {
		const readTools = ["read_file", "list_files", "codebase_search", "search_files"]
		const writeTools = ["write_to_file", "apply_diff", "edit_file", "search_and_replace", "search_replace", "apply_patch"]
		const execTools = ["execute_command", "run_slash_command"]
		const exploreTools = ["search_files", "codebase_search", "list_files"]
		const delegateTools = ["new_task", "async_task"]
		const completeTools = ["attempt_completion"]
		const metaTools = ["ask_followup_question", "switch_mode"]

		if (readTools.includes(toolName)) return ToolCategory.Read
		if (writeTools.includes(toolName)) return ToolCategory.Write
		if (execTools.includes(toolName)) return ToolCategory.Execute
		if (delegateTools.includes(toolName)) return ToolCategory.Delegate
		if (completeTools.includes(toolName)) return ToolCategory.Complete
		if (metaTools.includes(toolName)) return ToolCategory.Meta
		return ToolCategory.Other
	}

	/**
	 * Classifies a sequence of turns into a category sequence.
	 */
	classifyStrategy(turns: ReasoningTurn[]): ToolCategory[] {
		return turns.map((t) => {
			const categories = t.toolPattern.map((tool) => this.classifyTool(tool))
			return this.mostFrequent(categories) ?? ToolCategory.Other
		})
	}

	/**
	 * Detects whether a strategy boundary exists between the current turn
	 * and the previous turn.
	 */
	detectBoundary(
		turn: ReasoningTurn,
		previousTurn: ReasoningTurn | undefined,
		compressionEvent: CompressionEvent | null,
	): { isBoundary: boolean; reason: string } {
		// Compression always starts a new strategy
		if (compressionEvent) {
			return { isBoundary: true, reason: "compression" }
		}

		if (!previousTurn) {
			return { isBoundary: true, reason: "first_turn" }
		}

		const currentCategory = this.classifyTool(turn.toolPattern[0] ?? "")
		const previousCategory = this.classifyTool(previousTurn.toolPattern[0] ?? "")

		// Delegate or Complete categories always mark a boundary
		if (currentCategory === ToolCategory.Delegate || currentCategory === ToolCategory.Complete) {
			return { isBoundary: true, reason: "delegate_or_complete" }
		}

		// Category change
		if (currentCategory !== previousCategory) {
			return { isBoundary: true, reason: "category_change" }
		}

		return { isBoundary: false, reason: "none" }
	}

	/**
	 * Extracts the most frequent element from an array.
	 */
	private mostFrequent(arr: ToolCategory[]): ToolCategory | null {
		if (arr.length === 0) return null

		const counts = new Map<ToolCategory, number>()
		for (const item of arr) {
			counts.set(item, (counts.get(item) ?? 0) + 1)
		}

		let maxCount = 0
		let maxItem: ToolCategory | null = null
		for (const [item, count] of counts) {
			if (count > maxCount) {
				maxCount = count
				maxItem = item
			}
		}
		return maxItem
	}
}
