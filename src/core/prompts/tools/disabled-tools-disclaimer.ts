import { ToolAvailabilityContext } from "./tool-availability-context"

/**
 * Escape special regex characters in a literal string so it can be safely
 * used inside a RegExp constructor.
 */
function regexEscape(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Generate a disclaimer when custom instructions reference disabled tools.
 *
 * Scans the assembled custom instructions text for word-boundary matches
 * of disabled tool names. If any are found, returns a disclaimer string.
 * Returns null if no disabled tools are referenced.
 *
 * Tool names are regex-escaped before insertion into the word-boundary
 * pattern as defense-in-depth against pattern metacharacters.
 *
 * @param instructionsText - The assembled custom instructions text to scan
 * @param toolContext - The tool availability context
 * @returns Disclaimer string or null if no disabled tools referenced
 */
export function generateDisabledToolsDisclaimer(
	instructionsText: string,
	toolContext: ToolAvailabilityContext,
): string | null {
	const referencedDisabledTools: string[] = []

	for (const toolName of toolContext.getDisabledToolNames()) {
		// Escape the tool name to prevent regex injection, then use word-boundary
		// matching to find tool name references. This catches both bare mentions
		// and backtick-wrapped mentions while avoiding false substring matches.
		const escaped = regexEscape(toolName)
		if (new RegExp(`\\b${escaped}\\b`).test(instructionsText)) {
			referencedDisabledTools.push(toolName)
		}
	}

	if (referencedDisabledTools.length === 0) {
		return null
	}

	return `Note: The following tools referenced in your instructions are currently disabled in this session: ${referencedDisabledTools.join(", ")}. Do not attempt to use them.`
}
