import { McpHub } from "../../../services/mcp/McpHub"
import { ToolAvailabilityContext } from "../tools/tool-availability-context"

/**
 * Capability categories mapping tool names to human-readable phrases.
 * Used to dynamically compose the capabilities summary line.
 */
const CAPABILITY_PHASES: { tools: string[]; phrase: string }[] = [
	{ tools: ["execute_command"], phrase: "execute CLI commands on the user's computer" },
	{ tools: ["list_files"], phrase: "list files" },
	{ tools: ["read_file"], phrase: "view source code definitions" },
	{ tools: ["search_files", "codebase_search"], phrase: "regex search" },
	{ tools: ["write_to_file", "apply_diff", "edit_file", "edit", "apply_patch"], phrase: "read and write files" },
	{ tools: ["ask_followup_question"], phrase: "ask follow-up questions" },
]

/**
 * Build the dynamic capabilities summary line listing only available tool categories.
 */
function buildCapabilitiesSummary(toolContext?: ToolAvailabilityContext): string {
	if (!toolContext) {
		// Fallback to original static text when no context provided
		return "execute CLI commands on the user's computer, list files, view source code definitions, regex search, read and write files, and ask follow-up questions"
	}

	const availablePhrases = CAPABILITY_PHASES
		.filter((category) => toolContext.isCategoryAvailable(category.tools))
		.map((category) => category.phrase)

	if (availablePhrases.length === 0) {
		return "interact with the user's environment"
	}

	if (availablePhrases.length === 1) {
		return availablePhrases[0]
	}

	if (availablePhrases.length === 2) {
		return availablePhrases[0] + " and " + availablePhrases[1]
	}

	// Join with commas and "and" before the last item for proper English (3+ items)
	const last = availablePhrases[availablePhrases.length - 1]
	const rest = availablePhrases.slice(0, -1)
	return rest.join(", ") + ", and " + last
}

export function getCapabilitiesSection(cwd: string, mcpHub?: McpHub, toolContext?: ToolAvailabilityContext): string {
	const summary = buildCapabilitiesSummary(toolContext)

	let section = `====

CAPABILITIES

- You have access to tools that let you ${summary}. These tools help you effectively accomplish a wide range of tasks, such as writing code, making edits or improvements to existing files, understanding the current state of a project, performing system operations, and much more.`

	// Only include list_files-specific text if the tool is available
	if (!toolContext || toolContext.isToolAvailable("list_files")) {
		section += `\n- When the user initially gives you a task, a recursive list of all filepaths in the current workspace directory ('${cwd}') will be included in environment_details. This provides an overview of the project's file structure, offering key insights into the project from directory/file names (how developers conceptualize and organize their code) and file extensions (the language used). This can also guide decision-making on which files to explore further. If you need to further explore directories such as outside the current workspace directory, you can use the list_files tool. If you pass 'true' for the recursive parameter, it will list files recursively. Otherwise, it will list files at the top level, which is better suited for generic directories where you don't necessarily need the nested structure, like the Desktop.`
	} else {
		section += `\n- When the user initially gives you a task, a recursive list of all filepaths in the current workspace directory ('${cwd}') will be included in environment_details. This provides an overview of the project's file structure, offering key insights into the project from directory/file names (how developers conceptualize and organize their code) and file extensions (the language used). This can also guide decision-making on which files to explore further.`
	}

	// Only include execute_command paragraph if the tool is available
	if (!toolContext || toolContext.isToolAvailable("execute_command")) {
		section += `\n- You can use the execute_command tool to run commands on the user's computer whenever you feel it can help accomplish the user's task. When you need to execute a CLI command, you must provide a clear explanation of what the command does. Prefer to execute complex CLI commands over creating executable scripts, since they are more flexible and easier to run. Interactive and long-running commands are allowed, since the commands are run in the user's VSCode terminal. The user may keep commands running in the background and you will be kept updated on their status along the way. Each command you execute is run in a new terminal instance.`
	}

	// MCP section — only show if at least one MCP tool is enabled (not disabled via server config)
	if (mcpHub && hasAnyMcpToolsAvailable(mcpHub)) {
		section += `\n- You have access to MCP servers that may provide additional tools and resources. Each server may provide different capabilities that you can use to accomplish tasks more effectively.`
	}

	return section
}

/**
	* Check if any MCP tools are available across all connected servers.
	* Returns true if at least one server has at least one tool with enabledForPrompt !== false.
	*/
function hasAnyMcpToolsAvailable(mcpHub: McpHub): boolean {
	const servers = mcpHub.getServers()
	return servers.some(
		(server) => server.tools && server.tools.some((tool) => tool.enabledForPrompt !== false),
	)
}
