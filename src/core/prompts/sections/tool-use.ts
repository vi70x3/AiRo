import { ToolAvailabilityContext } from "../tools/tool-availability-context"

export function getSharedToolUseSection(toolContext?: ToolAvailabilityContext): string {
	// When all tools are disabled, return minimal content
	if (toolContext && toolContext.areAllDisabled()) {
		return `====

TOOL USE

No tools are available in the current session. Respond directly to the user without attempting tool calls.`
	}

	// Standard content (backward compatible when toolContext is undefined)
	return `====

TOOL USE

You have access to a set of tools that are executed upon the user's approval. Use the provider-native tool-calling mechanism. Do not include XML markup or examples. You must call at least one tool per assistant response. Prefer calling as many tools as are reasonably needed in a single response to reduce back-and-forth and complete tasks faster.`
}
