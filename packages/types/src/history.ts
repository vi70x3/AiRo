import { z } from "zod"

/**
 * HistoryItem
 */

export const historyItemSchema = z.object({
	id: z.string(),
	rootTaskId: z.string().optional(),
	parentTaskId: z.string().optional(),
	number: z.number(),
	ts: z.number(),
	task: z.string(),
	tokensIn: z.number(),
	tokensOut: z.number(),
	cacheWrites: z.number().optional(),
	cacheReads: z.number().optional(),
	totalCost: z.number(),
	size: z.number().optional(),
	workspace: z.string().optional(),
	mode: z.string().optional(),
	apiConfigName: z.string().optional(), // Provider profile name for sticky profile feature
	status: z.enum(["active", "completed", "delegated", "merging"]).optional(),
	delegatedToId: z.string().optional(), // Last child this parent delegated to
	childIds: z.array(z.string()).optional(), // All children spawned by this task
	awaitingChildId: z.string().optional(), // Child currently awaited (set when delegated)
	completedByChildId: z.string().optional(), // Child that completed and resumed this parent
	completionResultSummary: z.string().optional(), // Summary from completed child

	// Async subtask fields
	asyncChildIds: z.array(z.string()).optional(), // All async children spawned by this task
	asyncSubtaskResults: z.array(
		z.object({
			childId: z.string(),
			branchName: z.string(),
			worktreePath: z.string(),
			completionResult: z.string().optional(),
			status: z.enum(["completed", "failed"]),
		}),
	).optional(),
	mergeStatus: z.enum(["pending", "in_progress", "completed", "failed"]).optional(),
	mergeSummary: z.string().optional(), // Summary of merge results
})

export type HistoryItem = z.infer<typeof historyItemSchema>
