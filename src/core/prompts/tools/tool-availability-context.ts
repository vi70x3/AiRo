import { resolveToolAlias } from "./filter-tools-for-mode"

/**
 * All native tool names that can appear in the system prompt.
 * Derived from the tool definitions in native-tools/index.ts and ALWAYS_AVAILABLE_TOOLS.
 */
const ALL_NATIVE_TOOL_NAMES: string[] = [
	"access_mcp_resource",
	"apply_diff",
	"apply_patch",
	"ask_followup_question",
	"attempt_completion",
	"async_task",
	"codebase_search",
	"execute_command",
	"generate_image",
	"list_files",
	"new_task",
	"read_command_output",
	"read_file",
	"run_slash_command",
	"skill",
	"search_replace",
	"edit_file",
	"edit",
	"search_files",
	"switch_mode",
	"update_todo_list",
	"write_to_file",
]

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
	 * Get the list of disabled tool names (canonical names, aliases resolved).
	 */
	getDisabledToolNames(): string[] {
		return Array.from(this.disabledTools)
	}
}
