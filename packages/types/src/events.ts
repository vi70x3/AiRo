import { z } from "zod"

import { clineMessageSchema, queuedMessageSchema, tokenUsageSchema } from "./message.js"
import { modelInfoSchema } from "./model.js"
import { toolNamesSchema, toolUsageSchema } from "./tool.js"

/**
 * RooCodeEventName
 */

export enum RooCodeEventName {
	// Task Provider Lifecycle
	TaskCreated = "taskCreated",

	// Task Lifecycle
	TaskStarted = "taskStarted",
	TaskCompleted = "taskCompleted",
	TaskAborted = "taskAborted",
	TaskFocused = "taskFocused",
	TaskUnfocused = "taskUnfocused",
	TaskActive = "taskActive",
	TaskInteractive = "taskInteractive",
	TaskResumable = "taskResumable",
	TaskIdle = "taskIdle",

	// Subtask Lifecycle
	TaskPaused = "taskPaused",
	TaskUnpaused = "taskUnpaused",
	TaskSpawned = "taskSpawned",
	TaskDelegated = "taskDelegated",
	TaskDelegationCompleted = "taskDelegationCompleted",
	TaskDelegationResumed = "taskDelegationResumed",

	// Async Subtask Lifecycle
	AsyncSubtaskSpawned = "asyncSubtaskSpawned",
	AsyncSubtaskCompleted = "asyncSubtaskCompleted",
	AsyncSubtaskFailed = "asyncSubtaskFailed",
	AsyncSubtasksAllCompleted = "asyncSubtasksAllCompleted",

	// Merge Lifecycle
	MergeStarted = "mergeStarted",
	MergeCompleted = "mergeCompleted",
	MergeFailed = "mergeFailed",

	// Task Execution
	Message = "message",
	TaskModeSwitched = "taskModeSwitched",
	TaskAskResponded = "taskAskResponded",
	TaskUserMessage = "taskUserMessage",
	QueuedMessagesUpdated = "queuedMessagesUpdated",

	// Task Analytics
	TaskTokenUsageUpdated = "taskTokenUsageUpdated",
	TaskToolFailed = "taskToolFailed",

	// Configuration Changes
	ModeChanged = "modeChanged",
	ProviderProfileChanged = "providerProfileChanged",

	// Query Responses
	CommandsResponse = "commandsResponse",
	ModesResponse = "modesResponse",
	ModelsResponse = "modelsResponse",

	// Loop Detection
	LoopDetected = "loopDetected",
	LoopCompressionTriggered = "loopCompressionTriggered",
	LoopRecoveryDetected = "loopRecoveryDetected",
}

/**
 * RooCodeEvents
 */

export const rooCodeEventsSchema = z.object({
	[RooCodeEventName.TaskCreated]: z.tuple([z.string()]),

	[RooCodeEventName.TaskStarted]: z.tuple([z.string()]),
	[RooCodeEventName.TaskCompleted]: z.tuple([
		z.string(),
		tokenUsageSchema,
		toolUsageSchema,
		z.object({
			isSubtask: z.boolean(),
		}),
	]),
	[RooCodeEventName.TaskAborted]: z.tuple([z.string()]),
	[RooCodeEventName.TaskFocused]: z.tuple([z.string()]),
	[RooCodeEventName.TaskUnfocused]: z.tuple([z.string()]),
	[RooCodeEventName.TaskActive]: z.tuple([z.string()]),
	[RooCodeEventName.TaskInteractive]: z.tuple([z.string()]),
	[RooCodeEventName.TaskResumable]: z.tuple([z.string()]),
	[RooCodeEventName.TaskIdle]: z.tuple([z.string()]),

	[RooCodeEventName.TaskPaused]: z.tuple([z.string()]),
	[RooCodeEventName.TaskUnpaused]: z.tuple([z.string()]),
	[RooCodeEventName.TaskSpawned]: z.tuple([z.string(), z.string()]),
	[RooCodeEventName.TaskDelegated]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // childTaskId
	]),
	[RooCodeEventName.TaskDelegationCompleted]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // childTaskId
		z.string(), // completionResultSummary
	]),
	[RooCodeEventName.TaskDelegationResumed]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // childTaskId
	]),

	// Async Subtask Lifecycle
	[RooCodeEventName.AsyncSubtaskSpawned]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // childTaskId
		z.string(), // worktreePath
		z.string(), // branchName
	]),
	[RooCodeEventName.AsyncSubtaskCompleted]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // childTaskId
		z.string(), // completionResult
	]),
	[RooCodeEventName.AsyncSubtaskFailed]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // childTaskId
		z.string(), // error
	]),
	[RooCodeEventName.AsyncSubtasksAllCompleted]: z.tuple([
		z.string(), // parentTaskId
	]),

	// Merge Lifecycle
	[RooCodeEventName.MergeStarted]: z.tuple([
		z.string(), // parentTaskId
	]),
	[RooCodeEventName.MergeCompleted]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // mergeSummary
	]),
	[RooCodeEventName.MergeFailed]: z.tuple([
		z.string(), // parentTaskId
		z.string(), // error
	]),

	[RooCodeEventName.Message]: z.tuple([
		z.object({
			taskId: z.string(),
			action: z.union([z.literal("created"), z.literal("updated")]),
			message: clineMessageSchema,
		}),
	]),
	[RooCodeEventName.TaskModeSwitched]: z.tuple([z.string(), z.string()]),
	[RooCodeEventName.TaskAskResponded]: z.tuple([z.string()]),
	[RooCodeEventName.TaskUserMessage]: z.tuple([z.string()]),
	[RooCodeEventName.QueuedMessagesUpdated]: z.tuple([z.string(), z.array(queuedMessageSchema)]),

	[RooCodeEventName.TaskToolFailed]: z.tuple([z.string(), toolNamesSchema, z.string()]),
	[RooCodeEventName.TaskTokenUsageUpdated]: z.tuple([z.string(), tokenUsageSchema, toolUsageSchema]),

	[RooCodeEventName.ModeChanged]: z.tuple([z.string()]),
	[RooCodeEventName.ProviderProfileChanged]: z.tuple([z.object({ name: z.string(), provider: z.string() })]),

	[RooCodeEventName.CommandsResponse]: z.tuple([
		z.array(
			z.object({
				name: z.string(),
				source: z.enum(["global", "project", "built-in"]),
				filePath: z.string().optional(),
				description: z.string().optional(),
				argumentHint: z.string().optional(),
			}),
		),
	]),
	[RooCodeEventName.ModesResponse]: z.tuple([z.array(z.object({ slug: z.string(), name: z.string() }))]),
	[RooCodeEventName.ModelsResponse]: z.tuple([z.record(z.string(), modelInfoSchema)]),

	// Loop Detection
	[RooCodeEventName.LoopDetected]: z.tuple([
		z.object({
			taskId: z.string(),
			confidenceScore: z.number(),
			similarityScore: z.number(),
			progressScore: z.number(),
			consecutiveSimilarTurns: z.number(),
		}),
	]),
	[RooCodeEventName.LoopCompressionTriggered]: z.tuple([
		z.object({
			taskId: z.string(),
			compressionId: z.string(),
			confidenceScore: z.number(),
			reason: z.string(),
		}),
	]),
	[RooCodeEventName.LoopRecoveryDetected]: z.tuple([
		z.object({
			taskId: z.string(),
			compressionId: z.string(),
			turnsToRecover: z.number(),
		}),
	]),
})

export type RooCodeEvents = z.infer<typeof rooCodeEventsSchema>

/**
 * TaskEvent
 */

export const taskEventSchema = z.discriminatedUnion("eventName", [
	// Task Provider Lifecycle
	z.object({
		eventName: z.literal(RooCodeEventName.TaskCreated),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskCreated],
		taskId: z.number().optional(),
	}),

	// Task Lifecycle
	z.object({
		eventName: z.literal(RooCodeEventName.TaskStarted),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskStarted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.TaskCompleted),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskCompleted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.TaskAborted),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskAborted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.TaskFocused),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskFocused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.TaskUnfocused),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskUnfocused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.TaskActive),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskActive],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.TaskInteractive),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskInteractive],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.TaskResumable),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskResumable],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.TaskIdle),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskIdle],
		taskId: z.number().optional(),
	}),

	// Subtask Lifecycle
	z.object({
		eventName: z.literal(RooCodeEventName.TaskPaused),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskPaused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.TaskUnpaused),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskUnpaused],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.TaskSpawned),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskSpawned],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.TaskDelegated),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskDelegated],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.TaskDelegationCompleted),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskDelegationCompleted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.TaskDelegationResumed),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskDelegationResumed],
		taskId: z.number().optional(),
	}),

	// Async Subtask Lifecycle
	z.object({
		eventName: z.literal(RooCodeEventName.AsyncSubtaskSpawned),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.AsyncSubtaskSpawned],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.AsyncSubtaskCompleted),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.AsyncSubtaskCompleted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.AsyncSubtaskFailed),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.AsyncSubtaskFailed],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.AsyncSubtasksAllCompleted),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.AsyncSubtasksAllCompleted],
		taskId: z.number().optional(),
	}),

	// Merge Lifecycle
	z.object({
		eventName: z.literal(RooCodeEventName.MergeStarted),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.MergeStarted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.MergeCompleted),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.MergeCompleted],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.MergeFailed),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.MergeFailed],
		taskId: z.number().optional(),
	}),

	// Task Execution
	z.object({
		eventName: z.literal(RooCodeEventName.Message),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.Message],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.TaskModeSwitched),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskModeSwitched],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.TaskAskResponded),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskAskResponded],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.QueuedMessagesUpdated),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.QueuedMessagesUpdated],
		taskId: z.number().optional(),
	}),

	// Task Analytics
	z.object({
		eventName: z.literal(RooCodeEventName.TaskToolFailed),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskToolFailed],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.TaskTokenUsageUpdated),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.TaskTokenUsageUpdated],
		taskId: z.number().optional(),
	}),

	// Query Responses
	z.object({
		eventName: z.literal(RooCodeEventName.CommandsResponse),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.CommandsResponse],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.ModesResponse),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.ModesResponse],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.ModelsResponse),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.ModelsResponse],
		taskId: z.number().optional(),
	}),

	// Loop Detection
	z.object({
		eventName: z.literal(RooCodeEventName.LoopDetected),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.LoopDetected],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.LoopCompressionTriggered),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.LoopCompressionTriggered],
		taskId: z.number().optional(),
	}),
	z.object({
		eventName: z.literal(RooCodeEventName.LoopRecoveryDetected),
		payload: rooCodeEventsSchema.shape[RooCodeEventName.LoopRecoveryDetected],
		taskId: z.number().optional(),
	}),
])

export type TaskEvent = z.infer<typeof taskEventSchema>
