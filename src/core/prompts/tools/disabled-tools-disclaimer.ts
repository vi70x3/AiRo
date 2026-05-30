import { ToolAvailabilityContext } from "./tool-availability-context"

/**
 * Generate a disclaimer when custom instructions reference disabled tools.
 *
 * Scans the assembled custom instructions text for word-boundary matches
 * of disabled tool names. If any are found, returns a disclaimer string.
 * Returns null if no disabled tools are referenced.
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
		// Word-boundary match to find tool name references
		// This catches both bare mentions and backtick-wrapped mentions
		if (new RegExp(`\\b${toolName}\\b`).test(instructionsText)) {
			referencedDisabledTools.push(toolName)
		}
	}

	if (referencedDisabledTools.length === 0) {
		return null
	}

	return `Note: The following tools referenced in your instructions are currently disabled in this session: ${referencedDisabledTools.join(", ")}. Do not attempt to use them.`
}
