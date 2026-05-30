import { ToolAvailabilityContext } from "../tools/tool-availability-context"

/**
 * Priority list of tools to use as examples in the guidelines.
 * The first available tool is selected.
 */
const EXAMPLE_TOOL_PRIORITY: { name: string; example: string }[] = [
	{
		name: "list_files",
		example: "using the list_files tool is more effective than running a command like `ls` in the terminal",
	},
	{
		name: "read_file",
		example: "using the read_file tool is more effective than running a command like `cat` in the terminal",
	},
	{
		name: "search_files",
		example: "using the search_files tool is more effective than running a command like `grep` in the terminal",
	},
	{
		name: "execute_command",
		example: "using the execute_command tool lets you run complex operations directly",
	},
]

export function getToolUseGuidelinesSection(toolContext?: ToolAvailabilityContext): string {
	// Find the first available example tool
	let exampleText = ""
	if (toolContext) {
		const availableExample = EXAMPLE_TOOL_PRIORITY.find((e) =>
			toolContext.isToolAvailable(e.name),
		)
		if (availableExample) {
			exampleText = ` For example ${availableExample.example}.`
		}
	} else {
		// Default to list_files example when no context (backward compatible)
		exampleText =
			" For example using the list_files tool is more effective than running a command like `ls` in the terminal."
	}

	return `# Tool Use Guidelines

1. Assess what information you already have and what information you need to proceed with the task.
2. Choose the most appropriate tool based on the task and the tool descriptions provided. Assess if you need additional information to proceed, and which of the available tools would be most effective for gathering the information.${exampleText} It's critical that you think about each available tool and use the one that best fits the current step in the task.
3. If multiple actions are needed, you may use multiple tools in a single message when appropriate, or use tools iteratively across messages. Each tool use should be informed by the results of previous tool uses. Do not assume the outcome of any tool use. Each step must be informed by the previous step's result.

By carefully considering the user's response after tool executions, you can react accordingly and make informed decisions about how to proceed with the task. This iterative process helps ensure the overall success and accuracy of your work.`
}
