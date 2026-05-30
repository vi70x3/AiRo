import { ToolAvailabilityContext } from "./tool-availability-context"

/**
 * Registry of regex patterns that match common tool references in mode instructions.
 * Each entry maps a canonical tool name to an array of patterns.
 *
 * Two pattern types:
 * 1. Bullet-point lines: Remove the entire line if it's primarily about this tool
 *    (e.g., "- Use `edit` to make changes"). Uses word-boundary check on the
 *    backtick-wrapped name to avoid matching other tools on the same line.
 * 2. Inline references: Remove just the backtick-wrapped tool name, preserving
 *    the rest of the line content.
 *
 * Patterns are applied in order: bullet-point removal first, then inline cleanup.
 */
const TOOL_REFERENCE_PATTERNS: Record<string, RegExp[]> = {
	execute_command: [
		// Bullet point lines primarily about execute_command
		/^[^\n]*`execute_command`[^\n]*(?:\r?\n|$)/gm,
	],
	list_files: [
		/^[^\n]*`list_files`[^\n]*(?:\r?\n|$)/gm,
	],
	read_file: [
		/^[^\n]*`read_file`[^\n]*(?:\r?\n|$)/gm,
	],
	search_files: [
		/^[^\n]*`search_files`[^\n]*(?:\r?\n|$)/gm,
	],
	codebase_search: [
		/^[^\n]*`codebase_search`[^\n]*(?:\r?\n|$)/gm,
	],
	write_to_file: [
		/^[^\n]*`write_to_file`[^\n]*(?:\r?\n|$)/gm,
	],
	apply_diff: [
		/^[^\n]*`apply_diff`[^\n]*(?:\r?\n|$)/gm,
	],
	edit: [
		// Match bullet points about `edit` but NOT `edit_file` — use negative lookahead
		/^[^\n]*`edit`(?![_a-zA-Z])[^\n]*(?:\r?\n|$)/gm,
	],
	search_replace: [
		/^[^\n]*`search_replace`[^\n]*(?:\r?\n|$)/gm,
	],
	edit_file: [
		/^[^\n]*`edit_file`[^\n]*(?:\r?\n|$)/gm,
	],
	apply_patch: [
		/^[^\n]*`apply_patch`[^\n]*(?:\r?\n|$)/gm,
	],
	generate_image: [
		/^[^\n]*`generate_image`[^\n]*(?:\r?\n|$)/gm,
	],
	run_slash_command: [
		/^[^\n]*`run_slash_command`[^\n]*(?:\r?\n|$)/gm,
	],
	async_task: [
		/^[^\n]*`async_task`[^\n]*(?:\r?\n|$)/gm,
	],
	new_task: [
		/^[^\n]*`new_task`[^\n]*(?:\r?\n|$)/gm,
	],
	switch_mode: [
		/^[^\n]*`switch_mode`[^\n]*(?:\r?\n|$)/gm,
	],
	ask_followup_question: [
		/^[^\n]*`ask_followup_question`[^\n]*(?:\r?\n|$)/gm,
	],
	attempt_completion: [
		/^[^\n]*`attempt_completion`[^\n]*(?:\r?\n|$)/gm,
	],
	update_todo_list: [
		/^[^\n]*`update_todo_list`[^\n]*(?:\r?\n|$)/gm,
	],
	skill: [
		/^[^\n]*`skill`[^\n]*(?:\r?\n|$)/gm,
	],
}

/**
 * Strip references to disabled tools from mode baseInstructions.
 *
 * For each disabled tool, applies the corresponding regex patterns from
 * TOOL_REFERENCE_PATTERNS to remove lines that primarily reference the tool.
 * After all removals, collapses excessive blank lines.
 *
 * The patterns use backtick-wrapped tool names (`` `tool_name` ``) to avoid
 * false matches against plain text. The `edit` pattern uses a negative
 * lookahead to avoid matching `edit_file` when processing the `edit` tool.
 *
 * @param instructions - The mode baseInstructions text to process
 * @param toolContext - The tool availability context
 * @returns The instructions with disabled tool references removed
 */
export function stripDisabledToolReferences(
	instructions: string,
	toolContext: ToolAvailabilityContext,
): string {
	let result = instructions

	for (const toolName of toolContext.getDisabledToolNames()) {
		const patterns = TOOL_REFERENCE_PATTERNS[toolName]
		if (patterns) {
			for (const pattern of patterns) {
				result = result.replace(pattern, "")
			}
		}
	}

	// Clean up excessive blank lines left by removals (3+ newlines -> 2)
	result = result.replace(/\n{3,}/g, "\n\n")

	return result.trim()
}
