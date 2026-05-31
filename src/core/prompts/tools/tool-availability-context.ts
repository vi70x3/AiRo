import { getNativeTools } from "./native-tools"
import { ALWAYS_AVAILABLE_TOOLS, TOOL_ALIASES } from "../../../shared/tools"

/**
 * Resolves a tool name to its canonical name.
 * If the tool name is an alias, returns the canonical tool name.
 * If it's already a canonical name or unknown, returns as-is.
 */
function resolveToolAlias(toolName: string): string {
	const canonical = TOOL_ALIASES[toolName as keyof typeof TOOL_ALIASES]
	return canonical ?? toolName
}

/**
 * All native tool names that can appear in the system prompt.
 * Derived programmatically from getNativeTools() and ALWAYS_AVAILABLE_TOOLS
 * to prevent drift from the canonical source.
 */
const ALL_NATIVE_TOOL_NAMES: string[] = Array.from(
	new Set([
		...getNativeTools().map((tool) => {
			if ("function" in tool && tool.function) {
				return tool.function.name
			}
			return ""
		}).filter(Boolean),
		...ALWAYS_AVAILABLE_TOOLS,
	]),
)

export { ALL_NATIVE_TOOL_NAMES }

/**
 * Lightweight context that encapsulates which tools are available in the current session.
 * Constructed once during prompt generation and passed to section generators.
 *
 * Alias resolution happens at construction time so all subsequent queries are O(1) Set lookups.
 */
export class ToolAvailabilityContext {
	private readonly disabledTools: Set<string>

	constructor(disabledTools: string[] | undefined | null) {
		this.disabledTools = new Set(
			(disabledTools ?? []).map((name) => resolveToolAlias(name)),
		)
	}

	/**
	 * Check if a tool is available (not disabled).
	 * Resolves aliases so disabling a legacy alias also marks the canonical tool as unavailable.
	 */
	isToolAvailable(toolName: string): boolean {
		return !this.disabledTools.has(resolveToolAlias(toolName))
	}

	/**
	 * Check if a tool is disabled.
	 * Resolves aliases so disabling a legacy alias also matches the canonical tool.
	 */
	isToolDisabled(toolName: string): boolean {
		return this.disabledTools.has(resolveToolAlias(toolName))
	}

	/**
	 * Check if at least one native tool is available.
	 * Iterates over ALL_NATIVE_TOOL_NAMES to correctly handle cases where
	 * disabledTools contains non-native tool names (MCP tools, custom tools, etc.).
	 */
	hasAnyAvailable(): boolean {
		return ALL_NATIVE_TOOL_NAMES.some((tool) => !this.disabledTools.has(tool))
	}

	/**
	 * Check if all native tools are disabled.
	 * Iterates over ALL_NATIVE_TOOL_NAMES to correctly handle cases where
	 * disabledTools contains non-native tool names (MCP tools, custom tools, etc.).
	 */
	areAllDisabled(): boolean {
		return ALL_NATIVE_TOOL_NAMES.every((tool) => this.disabledTools.has(tool))
	}

	/**
	 * Check if any tool in a category is available.
	 * Resolves aliases on both the category tool names and the disabled set
	 * so that disabling an alias (e.g. search_and_replace) correctly marks
	 * the canonical tool (e.g. edit) and its aliases (e.g. search_replace) as unavailable.
	 */
	isCategoryAvailable(toolNames: string[]): boolean {
		return toolNames.some((tool) => this.isToolAvailable(tool))
	}

	/**
	 * Get the list of disabled tool names (canonical names, aliases resolved).
	 */
	getDisabledToolNames(): string[] {
		return Array.from(this.disabledTools)
	}
}
