import type OpenAI from "openai"

const ASYNC_TASK_DESCRIPTION = `Create multiple new task instances in parallel, each in its own git worktree and editor tab. This tool is for the orchestrator to delegate independent subtasks that can execute simultaneously.

Each subtask will:
- Run in an isolated git worktree (separate branch)
- Appear as a own editor tab in VSCode
- Execute independently and in parallel with other subtasks
- Have its own conversation and file access scoped to the worktree

When ALL subtasks complete, their worktree branches will be automatically merged back into the main branch by a Code Merger.

CRITICAL: This tool MUST be called alone. Do NOT call this tool alongside other tools in the same message turn. All subtasks specified will be spawned simultaneously.`

const SUBTASKS_PARAMETER_DESCRIPTION = `Array of subtask specifications. Each subtask will run in parallel in its own worktree and editor tab.`

const MODE_PARAMETER_DESCRIPTION = `Slug of the mode for this subtask (e.g., code, debug, architect)`

const MESSAGE_PARAMETER_DESCRIPTION = `Initial user instructions or context for this subtask`

const TODOS_PARAMETER_DESCRIPTION = `Optional initial todo list written as a markdown checklist; required when the workspace mandates todos`

export default {
	type: "function",
	function: {
		name: "async_task",
		description: ASYNC_TASK_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				subtasks: {
					type: "array",
					description: SUBTASKS_PARAMETER_DESCRIPTION,
					items: {
						type: "object",
						properties: {
							mode: {
								type: "string",
								description: MODE_PARAMETER_DESCRIPTION,
							},
							message: {
								type: "string",
								description: MESSAGE_PARAMETER_DESCRIPTION,
							},
							todos: {
								type: ["string", "null"],
								description: TODOS_PARAMETER_DESCRIPTION,
							},
						},
						required: ["mode", "message", "todos"],
						additionalProperties: false,
					},
					minItems: 2,
				},
			},
			required: ["subtasks"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
