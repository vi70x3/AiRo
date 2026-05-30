import { z } from "zod"

/**
 * ToolGroup
 */

export const toolGroups = ["read", "edit", "command", "mcp", "modes", "custom"] as const

export const toolGroupsSchema = z.enum(toolGroups)

/**
 * Tool groups that have been removed but may still exist in user config files.
 * Used by schema preprocessing to silently strip these before validation,
 * preventing errors for users with older configs.
 */
export const deprecatedToolGroups: readonly string[] = ["browser"]

export type ToolGroup = z.infer<typeof toolGroupsSchema>

/**
 * ToolName
 */

export const toolNames = [
	"execute_command",
	"read_file",
	"read_command_output",
	"write_to_file",
	"apply_diff",
	"edit",
	"search_and_replace", // Legacy alias for "edit"
	"search_replace",
	"edit_file",
	"apply_patch",
	"search_files",
	"list_files",
	"use_mcp_tool",
	"access_mcp_resource",
	"ask_followup_question",
	"attempt_completion",
	"switch_mode",
	"new_task",
	"async_task",
	"codebase_search",
	"update_todo_list",
	"run_slash_command",
	"skill",
	"generate_image",
	"custom_tool",
] as const

export const toolNamesSchema = z.enum(toolNames)

export type ToolName = z.infer<typeof toolNamesSchema>

/**
 * Human-readable display names for each tool.
 * Used in UI contexts like the settings panel.
 */
export const toolDisplayNames: Record<ToolName, string> = {
	execute_command: "run commands",
	read_file: "read files",
	read_command_output: "read command output",
	write_to_file: "write files",
	apply_diff: "apply changes",
	edit: "edit files",
	search_and_replace: "apply changes using search and replace",
	search_replace: "apply single search and replace",
	edit_file: "edit files using search and replace",
	apply_patch: "apply patches using codex format",
	search_files: "search files",
	list_files: "list files",
	use_mcp_tool: "use mcp tools",
	access_mcp_resource: "access mcp resources",
	ask_followup_question: "ask questions",
	attempt_completion: "complete tasks",
	switch_mode: "switch modes",
	new_task: "create new task",
	async_task: "create async parallel tasks",
	codebase_search: "codebase search",
	update_todo_list: "update todo list",
	run_slash_command: "run slash command",
	skill: "load skill",
	generate_image: "generate images",
	custom_tool: "use custom tools",
} as const

/**
 * Tool group definitions for UI rendering.
 * Each entry maps a group key to its tool names and i18n label key.
 */
export const toolGroupConfig: readonly {
	groupKey: string
	labelKey: string
	tools: readonly ToolName[]
	isAlwaysAvailable?: boolean
}[] = [
	{
		groupKey: "read",
		labelKey: "settings:tools.group.read",
		tools: ["read_file", "search_files", "list_files", "codebase_search"],
	},
	{
		groupKey: "edit",
		labelKey: "settings:tools.group.edit",
		tools: [
			"apply_diff",
			"write_to_file",
			"edit",
			"search_replace",
			"search_and_replace",
			"edit_file",
			"apply_patch",
			"generate_image",
		],
	},
	{
		groupKey: "command",
		labelKey: "settings:tools.group.command",
		tools: ["execute_command", "read_command_output"],
	},
	{
		groupKey: "mcp",
		labelKey: "settings:tools.group.mcp",
		tools: ["use_mcp_tool", "access_mcp_resource"],
	},
	{
		groupKey: "modes",
		labelKey: "settings:tools.group.modes",
		tools: ["switch_mode", "new_task", "async_task"],
	},
	{
		groupKey: "custom",
		labelKey: "settings:tools.group.custom",
		tools: ["custom_tool"], // Internal tool used for executing non-native tools
	},
	{
		groupKey: "alwaysAvailable",
		labelKey: "settings:tools.group.alwaysAvailable",
		tools: ["ask_followup_question", "attempt_completion", "update_todo_list", "run_slash_command", "skill"],
		isAlwaysAvailable: true,
	},
] as const

/**
 * Tool names that are always available across all modes.
 * These are shown in a separate "Always Available" group in the UI.
 */
export const alwaysAvailableToolNames: readonly ToolName[] = [
	"ask_followup_question",
	"attempt_completion",
	"switch_mode",
	"new_task",
	"async_task",
	"update_todo_list",
	"run_slash_command",
	"skill",
] as const

/**
 * Tool names that are considered critical for basic functionality.
 * Disabling these tools will show a warning in the UI.
 */
export const criticalToolNames: readonly ToolName[] = [
	"ask_followup_question",
	"attempt_completion",
] as const

/**
 * ToolUsage
 */

export const toolUsageSchema = z.record(
	toolNamesSchema,
	z.object({
		attempts: z.number(),
		failures: z.number(),
	}),
)

export type ToolUsage = z.infer<typeof toolUsageSchema>
