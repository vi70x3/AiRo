# Phase 4 Architecture Design — Semantic Loop Detection Extension

## Status: RESEARCH AND DESIGN ONLY — No Implementation

---

## Table of Contents

1. [Feedback Injection Architecture](#1-feedback-injection-architecture)
2. [Strategy Memory Architecture](#2-strategy-memory-architecture)
3. [Silent Failure Detection Architecture](#3-silent-failure-detection-architecture)
4. [Wandering / Non-Convergent Behavior Detection](#4-wandering--non-convergent-behavior-detection)
5. [Integration Points](#5-integration-points)
6. [Telemetry Design](#6-telemetry-design)
7. [Risk Analysis](#7-risk-analysis)
8. [Recommendation](#8-recommendation)
9. [Phase 4C — Intervention Effectiveness & Adaptation Monitoring](#9-phase-4c--intervention-effectiveness--adaptation-monitoring)

---

## 1. Feedback Injection Architecture

### 1.1 Problem Statement

Phase 1-3 detects loops and triggers compression, but the agent receives no explicit signal about *why* compression occurred or *what it should do differently*. The agent's next API request after compression is constructed identically to any other request — it sees a condensed summary but has no structured guidance about the loop that was broken. This means the agent may immediately fall back into the same loop pattern.

### 1.2 Design Goals

- Inject structured, deterministic feedback into the agent's context after loop-triggered compression
- Provide actionable guidance without requiring LLM interpretation of free-form text
- Remain fully deterministic and provider-agnostic
- Preserve the existing Phase 1-3 compression pipeline without modification

### 1.3 Feedback Signal Model

Phase 4 introduces a new type `LoopFeedback` that captures structured information about the loop that was broken:

```typescript
// New type in packages/types/src/loop-detection.ts

export interface LoopFeedback {
	/** The compression event that triggered this feedback */
	compressionId: string
	/** The loop confidence score at time of compression (0.0–1.0) */
	confidenceScore: number
	/** The similarity score that was observed (0.0–1.0) */
	similarityScore: number
	/** The progress score at time of compression (0.0–1.0) */
	progressScore: number
	/** Number of consecutive similar turns before compression */
	consecutiveSimilarTurns: number
	/** The dominant tool pattern observed during the loop (e.g., ["read_file", "search_files"]) */
	dominantToolPattern: string[]
	/** The set of files that were repeatedly touched during the loop */
	repeatedFiles: string[]
	/** Timestamp of the compression event */
	timestamp: number
	/** Recovery hints — structured suggestions derived from loop analysis */
	recoveryHints: RecoveryHint[]
}

export interface RecoveryHint {
	/** Category of the hint */
	category: "tool_diversity" | "file_exploration" | "strategy_change" | "completion_check"
	/** Structured hint text (template, not free-form LLM output) */
	message: string
}
```

### 1.4 Feedback Generation — `FeedbackGenerator`

A new pure-function module `src/core/loop-detection/FeedbackGenerator.ts` derives `LoopFeedback` from the state that existed at the time of compression. It is a **pure function** — given the same inputs, it always produces the same output. No LLM calls, no embeddings, no randomness.

**Algorithm:**

```
function generateFeedback(
	compressionEvent: CompressionEvent,
	loopConfidence: LoopConfidenceState,
	similarityScore: number,
	progressScore: number,
	turnsAtCompression: ReasoningTurn[]
): LoopFeedback {
	// 1. Extract dominant tool pattern from the turns in the window
	//    - Count frequency of each tool across all turns
	//    - Take the top-N tools (N=3) by frequency
	dominantToolPattern = topToolsByFrequency(turnsAtCompression, 3)

	// 2. Extract repeated files — files that appear in >1 turn
	repeatedFiles = filesAppearingInMultipleTurns(turnsAtCompression)

	// 3. Generate recovery hints based on loop characteristics
	recoveryHints = []

	// Tool diversity hint: if dominant pattern has ≤2 unique tools
	if (uniqueTools(turnsAtCompression).length <= 2) {
		recoveryHints.push({
			category: "tool_diversity",
			message: `You have been primarily using ${dominantToolPattern.join(" and ")}. Consider using different tools to make progress.`
		})
	}

	// File exploration hint: if repeated files > 0 and no new files in last N turns
	if (repeatedFiles.length > 0 && !hasNewFileInLastNTurns(turnsAtCompression, 3)) {
		recoveryHints.push({
			category: "file_exploration",
			message: `You have revisited the same files (${repeatedFiles.slice(0, 3).join(", ")}) without introducing new information. Consider examining different files.`
		})
	}

	// Strategy change hint: if consecutiveSimilarTurns >= 5
	if (loopConfidence.consecutiveSimilarTurns >= 5) {
		recoveryHints.push({
			category: "strategy_change",
			message: "Your recent approach has been repetitive. Try a fundamentally different strategy."
		})
	}

	// Completion check hint: if progressScore < 0.1
	if (progressScore < 0.1) {
		recoveryHints.push({
			category: "completion_check",
			message: "If the task is complete or blocked, use attempt_completion to finish."
		})
	}

	return { compressionId, confidenceScore, similarityScore, progressScore,
	         consecutiveSimilarTurns, dominantToolPattern, repeatedFiles,
	         timestamp: compressionEvent.timestamp, recoveryHints }
}
```

### 1.5 Feedback Injection Points

Feedback is injected at **two points** in the system:

#### Point A: Environment Details Injection

The `getEnvironmentDetails()` function in `src/core/environment/getEnvironmentDetails.ts` is called on every API request (line 2537 of Task.ts). It builds a context string that is appended to the user message. This is the **primary injection point**.

**Approach:** Add an optional parameter `loopFeedback?: LoopFeedback` to `getEnvironmentDetails()`. When present, append a structured block:

```xml
<loop_feedback>
A loop was detected and context was compressed ${turnsAgo} turns ago.
Loop confidence: ${feedback.confidenceScore.toFixed(2)}
Repeated tools: ${feedback.dominantToolPattern.join(", ")}
Repeated files: ${feedback.repeatedFiles.slice(0, 5).join(", ")}

Suggestions:
${feedback.recoveryHints.map((h, i) => `${i + 1}. ${h.message}`).join("\n")}
</loop_feedback>
```

This block is injected as a `<text>` block in the user message content, alongside the existing `<environment_details>` block. It is deterministic, human-readable, and machine-parseable.

**Injection lifecycle:** The feedback is injected for `N` turns after compression (configurable, default 3), then automatically cleared. This prevents stale feedback from persisting indefinitely. A `feedbackActiveUntil` timestamp on the `LoopFeedback` object controls this.

#### Point B: Condensation Summary Augmentation

When loop-triggered compression occurs, the condensation prompt in `summarizeConversation()` (`src/core/condense/index.ts`) is augmented with loop-specific context. The existing `customCondensingPrompt` mechanism is reused — the system generates a structured prefix:

```
[LOOP RECOVERY CONTEXT]
The following conversation was condensed because a reasoning loop was detected.
Loop characteristics:
- Consecutive similar turns: ${consecutiveSimilarTurns}
- Dominant tools: ${dominantToolPattern}
- Repeated files: ${repeatedFiles}

When summarizing, preserve: (1) the original task objective, (2) any conclusions
reached before the loop began, (3) files that were modified, (4) current blockers.
[/LOOP RECOVERY CONTEXT]
```

This prefix is prepended to the condensation prompt, not injected into the conversation history itself. It guides the summarization without polluting the agent's context.

### 1.6 Configuration

New settings added to the `loopDetection` config in `packages/types/src/global-settings.ts`:

```typescript
loopDetection: z.object({
	// ... existing fields ...

	// Phase 4: Feedback Injection
	/** Enable feedback injection after loop-triggered compression. Default: true */
	feedbackEnabled: z.boolean().optional().default(true),
	/** Number of turns to inject feedback after compression. Default: 3 */
	feedbackTurns: z.number().int().min(1).max(10).optional().default(3),
	/** Maximum number of recovery hints to include. Default: 3 */
	maxRecoveryHints: z.number().int().min(1).max(5).optional().default(3),
})
```

### 1.7 Determinism Guarantees

- `FeedbackGenerator` is a pure function with no side effects
- Tool frequency counting uses deterministic sorting (alphabetical tiebreaking)
- File repetition detection uses exact string matching on paths
- Recovery hint selection uses fixed thresholds (no learned parameters)
- The feedback string is a deterministic template with no free-form generation

---

## 2. Strategy Memory Architecture

### 2.1 Problem Statement

The Phase 1-3 system has no memory of *strategies* the agent has already tried. When the agent breaks out of a loop via compression, it may try the same strategy again because it has no record of what was already attempted. This is a higher-order loop: the agent cycles through the same set of strategies (A → B → A → B) even though each individual turn-pair is not similar enough to trigger Phase 1-3 detection.

### 2.2 Design Goals

- Track strategy-level patterns across the entire task lifetime (not just the rolling window)
- Detect when the agent is cycling through previously-tried strategies
- Provide strategy-level feedback to the agent
- Keep memory bounded (not grow indefinitely with task length)
- Remain deterministic and synchronous

### 2.3 Strategy Model

A "strategy" is defined as a **coarse-grained tool category sequence** observed over a window of turns. Rather than tracking exact tool patterns (which Phase 1-3 already does), strategy memory tracks the *category-level* approach:

```typescript
// New types in packages/types/src/loop-detection.ts

/** Coarse tool categories for strategy classification */
export enum ToolCategory {
	Read = "read",           // read_file, list_files, codebase_search, search_files
	Write = "write",         // write_to_file, apply_diff, edit_file, search_and_replace
	Execute = "execute",     // execute_command, run_slash_command
	Explore = "explore",     // search_files, codebase_search, list_files
	Delegate = "delegate",   // new_task, async_task
	Complete = "complete",   // attempt_completion
	Meta = "meta",           // ask_followup_question, switch_mode
	Other = "other",         // everything else
}

/** A strategy fingerprint — coarse representation of an approach */
export interface StrategyRecord {
	/** Unique ID for this strategy instance */
	id: string
	/** The sequence of tool categories observed */
	categorySequence: ToolCategory[]
	/** Files touched during this strategy */
	filesTouched: string[]
	/** Turn indices (in the global task turn list) where this strategy was active */
	turnRange: { start: number; end: number }
	/** Whether this strategy ended in compression */
	endedInCompression: boolean
	/** Whether this strategy produced strong progress */
	producedProgress: boolean
	/** Timestamp when this strategy was recorded */
	timestamp: number
}

/** Strategy memory — bounded history of strategies tried */
export interface StrategyMemory {
	/** Ordered list of strategies tried (most recent last) */
	strategies: StrategyRecord[]
	/** Map from category sequence key → count of times tried */
	sequenceFrequency: Map<string, number>
	/** Maximum number of strategies to retain */
	maxSize: number
}
```

### 2.4 Strategy Classification — `StrategyClassifier`

A new module `src/core/loop-detection/StrategyClassifier.ts` classifies turns into coarse categories and identifies strategy boundaries.

**Algorithm:**

```
function classifyTool(toolName: string): ToolCategory {
	const readTools = ["read_file", "list_files", "codebase_search", "search_files"]
	const writeTools = ["write_to_file", "apply_diff", "edit_file", "search_and_replace", "search_replace", "apply_patch"]
	const execTools = ["execute_command", "run_slash_command"]
	const exploreTools = ["search_files", "codebase_search", "list_files"]
	const delegateTools = ["new_task", "async_task"]
	const completeTools = ["attempt_completion"]
	const metaTools = ["ask_followup_question", "switch_mode"]

	if (readTools.includes(toolName)) return ToolCategory.Read
	if (writeTools.includes(toolName)) return ToolCategory.Write
	if (execTools.includes(toolName)) return ToolCategory.Execute
	if (delegateTools.includes(toolName)) return ToolCategory.Delegate
	if (completeTools.includes(toolName)) return ToolCategory.Complete
	if (metaTools.includes(toolName)) return ToolCategory.Meta
	return ToolCategory.Other
}

function classifyStrategy(turns: ReasoningTurn[]): ToolCategory[] {
	return turns.map(t => {
		// Take the dominant category from the turn's tool pattern
		const categories = t.toolPattern.map(classifyTool)
		// Return the most frequent category in this turn
		return mostFrequent(categories) ?? ToolCategory.Other
	})
}
```

**Strategy boundary detection:** A new strategy begins when:
1. A compression event occurs (always starts a new strategy)
2. The tool category changes for 3+ consecutive turns (e.g., from all-Read to all-Write)
3. A `Delegate` or `Complete` category is encountered

### 2.5 Strategy Cycle Detection

The strategy memory detects cycles by checking if the current strategy's category sequence has been seen before:

```
function detectStrategyCycle(memory: StrategyMemory, currentSequence: ToolCategory[]): {
	isCycle: boolean
	previousOccurrence: StrategyRecord | null
	cycleLength: number
} {
	const key = currentSequence.join("->")

	// Check for exact sequence match
	for (let i = memory.strategies.length - 1; i >= 0; i--) {
		const seq = memory.strategies[i].categorySequence.join("->")
		if (seq === key) {
			return {
				isCycle: true,
				previousOccurrence: memory.strategies[i],
				cycleLength: memory.strategies.length - i
			}
		}
	}

	// Check for A-B-A-B pattern (alternating between two strategies)
	if (memory.strategies.length >= 4) {
		const last4 = memory.strategies.slice(-4)
		if (last4[0].categorySequence.join("->") === last4[2].categorySequence.join("->") &&
		    last4[1].categorySequence.join("->") === last4[3].categorySequence.join("->")) {
			return {
				isCycle: true,
				previousOccurrence: last4[0],
				cycleLength: 2
			}
		}
	}

	return { isCycle: false, previousOccurrence: null, cycleLength: 0 }
}
```

### 2.6 Bounded Memory

To prevent unbounded growth:

- `StrategyMemory.maxSize` is configurable (default: 20 strategies)
- When the limit is reached, the oldest strategy is evicted
- The `sequenceFrequency` map is bounded to 50 entries (LRU eviction)
- Each `StrategyRecord` stores file paths as a Set (deduplicated), not raw turn data
- Total memory footprint: O(maxSize × avgFilesPerStrategy) — typically < 50KB

### 2.7 Integration with Feedback Injection

When a strategy cycle is detected, the `FeedbackGenerator` produces an additional recovery hint:

```typescript
{
	category: "strategy_change",
	message: `You have tried a similar approach ${cycleLength} turn(s) ago. The previous attempt ${previousEndedInCompression ? "was compressed due to a loop" : "did not make strong progress"}. Try a different approach.`
}
```

### 2.8 Configuration

```typescript
loopDetection: z.object({
	// ... existing fields ...

	// Phase 4: Strategy Memory
	/** Enable strategy-level cycle detection. Default: true */
	strategyMemoryEnabled: z.boolean().optional().default(true),
	/** Maximum number of strategy records to retain. Default: 20 */
	strategyMemorySize: z.number().int().min(5).max(50).optional().default(20),
	/** Minimum turns before a strategy boundary is detected. Default: 3 */
	strategyBoundaryTurns: z.number().int().min(2).max(10).optional().default(3),
})
```

---

## 3. Silent Failure Detection Architecture

### 3.1 Problem Statement

The agent can produce turns that are technically valid (no API error) but contain no useful work. These "silent failures" include:

1. **Empty assistant responses** — the API returns a response with no text and no tool uses (already tracked by `consecutiveNoAssistantMessagesCount` in Task.ts line 317)
2. **No-tool-use turns** — the agent produces only text, no tool calls (already tracked by `consecutiveNoToolUseCount` in Task.ts line 316)
3. **Truncated tool calls** — the agent starts a tool call but the parameters are incomplete or malformed
4. **Zero-signal turns** — the agent uses tools but touches no files, produces no state transitions, and the tool pattern is a subset of the previous turn

These are currently handled as generic "mistake" counts. Phase 4 adds structured detection and differentiated handling.

### 3.2 Design Goals

- Classify silent failures into distinct types for targeted response
- Detect zero-signal turns that existing counters miss
- Provide specific feedback per failure type
- Remain deterministic (no LLM-based "quality" judgment)

### 3.3 Silent Failure Classification

```typescript
// New types in packages/types/src/loop-detection.ts

export enum SilentFailureType {
	/** API returned no text and no tool uses */
	EmptyResponse = "empty_response",
	/** Agent produced text but no tool calls */
	NoToolUse = "no_tool_use",
	/** Tool call was started but parameters were incomplete/malformed */
	TruncatedToolCall = "truncated_tool_call",
	/** Turn produced no new files, no state transitions, no new hypotheses */
	ZeroSignal = "zero_signal",
	/** Tool execution returned an error (tool_result is_error: true) */
	ToolError = "tool_error",
}

export interface SilentFailureEvent {
	type: SilentFailureType
	/** Turn index in the global task turn list */
	turnIndex: number
	/** Timestamp of the failure */
	timestamp: number
	/** Additional context specific to the failure type */
	details: string
	/** Number of consecutive failures of this type */
	consecutiveCount: number
}
```

### 3.4 Detection Points

Each failure type is detected at a specific point in the Task.ts execution flow:

#### 3.4.1 EmptyResponse

**Detection point:** `recursivelyMakeClineRequests()`, after the assistant message is built (around line 3286–3294 of Task.ts):

```typescript
// Existing code (line 3286-3294):
const hasTextContent = assistantMessage.length > 0
const hasToolUses = this.assistantMessageContent.some(
    (block) => block.type === "tool_use" || block.type === "mcp_tool_use"
)

if (hasTextContent || hasToolUses) {
    this.consecutiveNoAssistantMessagesCount = 0
    // ... save to history
} else {
    this.consecutiveNoAssistantMessagesCount++
    // ... handle error
}
```

**Phase 4 addition:** When `consecutiveNoAssistantMessagesCount >= 1`, emit a `SilentFailureEvent` with type `EmptyResponse`. The existing counter logic is preserved; Phase 4 adds the structured event on top.

#### 3.4.2 NoToolUse

**Detection point:** After tool use check (around line 3452–3475 of Task.ts):

```typescript
// Existing code (line 3452-3475):
const didToolUse = this.assistantMessageContent.some(
    (block) => block.type === "tool_use" || block.type === "mcp_tool_use"
)
if (!didToolUse) {
    this.consecutiveNoToolUseCount++
    // ...
}
```

**Phase 4 addition:** When `consecutiveNoToolUseCount >= 1`, emit a `SilentFailureEvent` with type `NoToolUse`.

#### 3.4.3 TruncatedToolCall

**Detection point:** In `presentAssistantMessage()` (`src/core/assistant-message/presentAssistantMessage.ts`), when a tool call block is finalized but has missing required parameters. The existing code already handles this via `sayAndCreateMissingParamError()`. Phase 4 adds structured detection:

```
Detection: A tool_use block is present but its params object is empty
or missing required parameters for that tool type.

This is detected by checking if the tool's parameter validation fails
during presentAssistantMessage() execution.
```

#### 3.4.4 ZeroSignal

**Detection point:** In the `onTurn()` pipeline of `SemanticLoopDetector`, after the `ReasoningTurn` is constructed but before similarity scoring:

```
A turn is zero-signal if ALL of the following are true:
1. filesTouched is empty AND
2. stateTransitions is empty AND
3. hypotheses is empty AND
4. conclusions is empty AND
5. toolPattern is non-empty (tools were called, but they produced nothing)

This catches cases like: execute_command with no output, or read_file
on a file that was already read in the previous turn.
```

#### 3.4.5 ToolError

**Detection point:** In `presentAssistantMessage()`, when a tool's `pushToolResult` callback is invoked with `is_error: true`. The existing code already tracks `didToolFailInCurrentTurn` (Task.ts line 2680). Phase 4 adds structured event emission.

### 3.5 Silent Failure Tracker — `SilentFailureTracker`

A new module `src/core/loop-detection/SilentFailureTracker.ts` maintains counts per failure type and emits events when thresholds are exceeded:

```typescript
export interface SilentFailureConfig {
	/** Consecutive empty responses before triggering feedback. Default: 2 */
	emptyResponseThreshold: number
	/** Consecutive no-tool-use before triggering feedback. Default: 2 */
	noToolUseThreshold: number
	/** Consecutive zero-signal turns before triggering feedback. Default: 3 */
	zeroSignalThreshold: number
	/** Consecutive tool errors before triggering feedback. Default: 3 */
	toolErrorThreshold: number
}

export default class SilentFailureTracker {
	private counts: Record<SilentFailureType, number>
	private config: SilentFailureConfig
	private history: SilentFailureEvent[]

	recordFailure(event: SilentFailureEvent): void
	getConsecutiveCount(type: SilentFailureType): number
	shouldTriggerFeedback(type: SilentFailureType): boolean
	getFeedbackMessage(type: SilentFailureType): string
	reset(): void
}
```

### 3.6 Feedback Messages per Failure Type

Each failure type has a deterministic, pre-written feedback message:

| Type | Message |
|------|---------|
| EmptyResponse | "The previous response was empty. Please provide a substantive response with either analysis or tool use." |
| NoToolUse | "You have not used any tools in your last ${N} responses. Please use tools to make progress on the task." |
| TruncatedToolCall | "A tool call was incomplete. Please ensure all required parameters are provided." |
| ZeroSignal | "Your recent tool calls did not produce observable changes. Consider whether the tools are being used effectively." |
| ToolError | "The last ${N} tool calls encountered errors. Consider an alternative approach." |

These messages are injected into the user message content as a `<text>` block, similar to the existing `formatResponse.noToolsUsed()` pattern (Task.ts line 3470).

### 3.7 Configuration

```typescript
loopDetection: z.object({
	// ... existing fields ...

	// Phase 4: Silent Failure Detection
	/** Enable silent failure detection. Default: true */
	silentFailureEnabled: z.boolean().optional().default(true),
	/** Thresholds per failure type */
	silentFailureThresholds: z.object({
		emptyResponse: z.number().int().min(1).max(5).optional().default(2),
		noToolUse: z.number().int().min(1).max(5).optional().default(2),
		zeroSignal: z.number().int().min(1).max(10).optional().default(3),
		toolError: z.number().int().min(1).max(10).optional().default(3),
	}).optional().default({}),
})
```

---

## 4. Wandering / Non-Convergent Behavior Detection

### 4.1 Problem Statement

Phase 1-3 detects **repetition loops** (A→A→A). But agents can also exhibit **wandering** — a pattern where each turn is *different* from the last (so similarity is low), but the agent is not making progress toward task completion. This manifests as:

- A→B→C→D→E where each turn touches different files but none produce state transitions
- Exploration without convergence: the agent reads many files but never writes or executes
- Tool oscillation: the agent alternates between read and search without ever modifying anything

This is the complement of the loop problem: high dissimilarity + low progress = wandering.

### 4.2 Design Goals

- Detect wandering as a distinct pattern from looping
- Use the existing Phase 1-3 signals (similarity + progress) but with different thresholds
- Provide specific feedback for wandering behavior
- Avoid false positives on legitimate exploration phases

### 4.3 Wandering Detection Model

Wandering is defined by two conditions sustained over a window of turns:

1. **Low pairwise similarity**: Each turn is dissimilar from the previous one (similarity < threshold)
2. **Low cumulative progress**: The progress score across the window is below a minimum

```typescript
// New types in packages/types/src/loop-detection.ts

export interface WanderingState {
	/** Number of consecutive turns with low similarity but also low progress */
	consecutiveWanderingTurns: number
	/** Cumulative progress score over the wandering window */
	cumulativeProgress: number
	/** Number of unique files touched during wandering */
	uniqueFilesTouched: number
	/** Number of unique tools used during wandering */
	uniqueToolsUsed: number
	/** Whether wandering has been detected (threshold exceeded) */
	isWandering: boolean
	/** Turn index where wandering started */
	wanderingStartTurn: number
}
```

### 4.4 Wandering Detector — `WanderingDetector`

A new module `src/core/loop-detection/WanderingDetector.ts`:

```typescript
export interface WanderingConfig {
	/** Similarity threshold below which a turn is "dissimilar". Default: 0.4 */
	dissimilarityThreshold: number
	/** Progress score threshold below which a turn is "low progress". Default: 0.2 */
	lowProgressThreshold: number
	/** Number of consecutive low-similarity + low-progress turns to trigger wandering. Default: 5 */
	wanderingTurnsThreshold: number
	/** Minimum unique files touched to distinguish wandering from loop. Default: 3 */
	minUniqueFiles: number
}

export default class WanderingDetector {
	private config: WanderingConfig
	private state: WanderingState

	/**
	 * Process a turn result from the SemanticLoopDetector pipeline.
	 * Called after each turn with the similarity and progress scores.
	 */
	onTurnResult(similarityScore: number, progressScore: number, turn: ReasoningTurn): WanderingState

	/**
	 * Check if the agent is currently in a wandering state.
	 */
	isWandering(): boolean

	/**
	 * Get a recovery hint if wandering is detected.
	 */
	getRecoveryHint(): RecoveryHint | null

	reset(): void
}
```

**Algorithm:**

```
onTurnResult(similarity, progress, turn):
	if similarity < config.dissimilarityThreshold && progress < config.lowProgressThreshold:
		state.cumulativeProgress += progress
		state.uniqueFilesTouched += newFilesInTurn(turn)
		state.uniqueToolsUsed += newToolsInTurn(turn)
		state.consecutiveWanderingTurns += 1
	else:
		// Reset wandering state — agent either found similarity (loop) or made progress
		reset()

	// Wandering is confirmed if:
	// 1. Consecutive wandering turns >= threshold (default 5)
	// 2. Unique files touched >= minUniqueFiles (default 3) — distinguishes from loop
	// 3. Cumulative progress < (consecutiveWanderingTurns * lowProgressThreshold * 0.5)
	if (state.consecutiveWanderingTurns >= config.wanderingTurnsThreshold &&
	    state.uniqueFilesTouched >= config.minUniqueFiles &&
	    state.cumulativeProgress < state.consecutiveWanderingTurns * config.lowProgressThreshold * 0.5) {
		state.isWandering = true
	}

	return state
```

### 4.5 Wandering vs. Legitimate Exploration

To avoid false positives on legitimate exploration (e.g., reading many files before writing), the detector uses these safeguards:

1. **Minimum unique files**: Wandering requires touching ≥3 different files. A loop touches the same files repeatedly.
2. **Cumulative progress check**: Even exploration should produce *some* progress (new conclusions, hypotheses). If cumulative progress is near zero over many turns, it's wandering.
3. **Tool diversity bonus**: If the agent uses write/execute tools during the window, the wandering counter is reduced (exploration with action is not wandering).
4. **Grace period**: The first N turns of a task (configurable, default 5) are exempt from wandering detection, since initial exploration is expected.

### 4.6 Wandering Feedback

When wandering is detected, the feedback is injected via the same mechanism as Section 1 (environment details):

```xml
<loop_feedback>
Your exploration has not converged toward a solution.
Turns without clear progress: ${state.consecutiveWanderingTurns}
Files examined: ${state.uniqueFilesTouched}
Unique tools used: ${state.uniqueToolsUsed}

Suggestions:
1. Focus on a specific file or component rather than browsing broadly.
2. If you have gathered enough information, start implementing changes.
3. If you are stuck, use ask_followup_question to clarify the task.
</loop_feedback>
```

### 4.7 Configuration

```typescript
loopDetection: z.object({
	// ... existing fields ...

	// Phase 4: Wandering Detection
	/** Enable wandering detection. Default: true */
	wanderingEnabled: z.boolean().optional().default(true),
	/** Dissimilarity threshold for wandering. Default: 0.4 */
	wanderingDissimilarityThreshold: z.number().min(0.1).max(0.8).optional().default(0.4),
	/** Low progress threshold for wandering. Default: 0.2 */
	wanderingLowProgressThreshold: z.number().min(0.05).max(0.5).optional().default(0.2),
	/** Consecutive turns to trigger wandering. Default: 5 */
	wanderingTurnsThreshold: z.number().int().min(3).max(20).optional().default(5),
	/** Minimum unique files to distinguish from loop. Default: 3 */
	wanderingMinUniqueFiles: z.number().int().min(1).max(10).optional().default(3),
	/** Grace period — turns to skip at task start. Default: 5 */
	wanderingGracePeriod: z.number().int().min(0).max(20).optional().default(5),
})
```

---

## 5. Integration Points

### 5.1 Task.ts Integration

The primary integration point is `Task.ts`. Phase 4 adds hooks at specific locations without modifying the existing control flow.

#### 5.1.1 SemanticLoopDetector Enhancement

The existing `SemanticLoopDetector.onTurn()` method is extended to also run the `WanderingDetector` and `SilentFailureTracker`:

```typescript
// In SemanticLoopDetector.onTurn(), after Step 5 (confidence calculation):

// Step 5b: Run wandering detection
this.wanderingState = this.wanderingDetector.onTurnResult(
    similarityScore,
    progressScore,
    turn
)

// Step 5c: Check for zero-signal turn
if (this.isZeroSignalTurn(turn, similarityScore, progressScore)) {
    this.silentFailureTracker.recordFailure({
        type: SilentFailureType.ZeroSignal,
        turnIndex: this.globalTurnIndex,
        timestamp: Date.now(),
        details: "Turn produced no files, state transitions, hypotheses, or conclusions",
        consecutiveCount: this.silentFailureTracker.getConsecutiveCount(SilentFailureType.zeroSignal) + 1
    })
}
```

#### 5.1.2 Compression Trigger Enhancement

When `shouldCompress()` returns true and compression is triggered, the `onCompression()` method is extended to:

1. Generate `LoopFeedback` via `FeedbackGenerator`
2. Record the strategy in `StrategyMemory`
3. Check for strategy cycles
4. Store the feedback for injection into subsequent API requests

```typescript
// In SemanticLoopDetector.onCompression():
const feedback = this.feedbackGenerator.generate(
    compressionEvent,
    this.loopConfidenceState,
    lastSimilarityScore,
    lastProgressScore,
    turnsAtCompression
)

// Record strategy
const currentStrategy = this.strategyClassifier.classify(
    this.stateTracker.getTurns(),
    compressionEvent
)
this.strategyMemory.addStrategy(currentStrategy)

// Check for cycles
const cycle = this.strategyMemory.detectCycle(currentStrategy)
if (cycle.isCycle) {
    feedback.recoveryHints.push({
        category: "strategy_change",
        message: `Similar approach tried ${cycle.cycleLength} strategies ago. Try something different.`
    })
}

// Store for injection
this.activeFeedback = feedback
this.feedbackExpiryTurn = this.globalTurnIndex + this.config.feedbackTurns
```

#### 5.1.3 Environment Details Injection

In `getEnvironmentDetails()` (`src/core/environment/getEnvironmentDetails.ts`), add the loop feedback block:

```typescript
// After building the existing environment details string:
if (loopFeedback && Date.now() < loopFeedback.timestamp + feedbackTTL) {
    const feedbackBlock = buildFeedbackBlock(loopFeedback)
    environmentDetails += "\n\n" + feedbackBlock
}
```

The `loopFeedback` parameter is passed from `recursivelyMakeClineRequests()` which reads it from the `SemanticLoopDetector`'s current state.

#### 5.1.4 Silent Failure Counter Integration

The existing counters in Task.ts (`consecutiveNoToolUseCount`, `consecutiveNoAssistantMessagesCount`) are preserved. Phase 4 adds structured event emission at the same points:

- **Line ~3294** (empty assistant response): Emit `SilentFailureEvent` with type `EmptyResponse`
- **Line ~3458** (no tool use): Emit `SilentFailureEvent` with type `NoToolUse`
- **Line ~3496** (empty assistant messages): Already handled by existing counter; Phase 4 adds event

These events are passed to the `SilentFailureTracker` which determines if feedback should be injected.

#### 5.1.5 Strategy Boundary Detection

Strategy boundaries are detected by the `StrategyClassifier` based on the `ReasoningTurn` data. The `SemanticLoopDetector` calls `StrategyClassifier.detectBoundary()` after each `onTurn()`:

```typescript
// In SemanticLoopDetector.onTurn(), after Step 1:
const boundary = this.strategyClassifier.detectBoundary(turn, previousTurn)
if (boundary.isBoundary) {
    this.strategyMemory.finalizeCurrentStrategy(this.globalTurnIndex - 1)
    this.strategyMemory.startNewStrategy(turn, this.globalTurnIndex)
}
```

### 5.2 Context Management Integration

The existing `manageContext()` function in `src/core/context-management/index.ts` is the mechanism through which loop-triggered compression is executed. Phase 4 does not modify `manageContext()` itself — it operates at a higher level:

- The decision to compress still comes from `SemanticLoopDetector.shouldCompress()`
- The compression still calls `manageContext()` with the appropriate parameters
- Phase 4 adds feedback *after* compression completes, not during

However, Phase 4 adds a new context management trigger: **wandering-triggered compression**. When `WanderingDetector.isWandering()` returns true, the system triggers a "wandering compression" that uses a different condensation prompt:

```
[WANDERING RECOVERY CONTEXT]
The agent has been exploring without converging on a solution.
${consecutiveWanderingTurns} turns examined ${uniqueFilesTouched} files
without producing meaningful state changes.

When summarizing, emphasize: (1) what information has been gathered,
(2) what the agent should focus on next, (3) what approaches have
been tried and did not work.
[/WANDERING RECOVERY CONTEXT]
```

### 5.3 Condense System Integration

The `summarizeConversation()` function in `src/core/condense/index.ts` accepts a `customCondensingPrompt` parameter. Phase 4 uses this to inject loop-specific and wandering-specific context into the condensation prompt. No changes to the condensing API call structure are needed.

### 5.4 System Prompt Integration

The `SYSTEM_PROMPT()` function in `src/core/prompts/system.ts` is extended with a new section that describes the loop feedback mechanism to the agent:

```
## Loop Recovery

If you see <loop_feedback> blocks in your context, they indicate that
a reasoning loop was detected and your context was compressed. The feedback
contains specific suggestions for breaking the loop. Follow these suggestions
to make progress.
```

This section is always included (not conditional) so the agent knows how to interpret feedback blocks.

### 5.5 Data Flow Diagram

```
Task.recursivelyMakeClineRequests()
    │
    ├── presentAssistantMessage() ──► SilentFailureTracker (tool errors, truncated calls)
    │
    ├── [after stream completes]
    │   ├── Build ReasoningTurn from assistantMessageContent
    │   ├── SemanticLoopDetector.onTurn(turn)
    │   │   ├── SemanticStateTracker.addTurn()
    │   │   ├── SimilarityScorer.computeSimilarity()
    │   │   ├── ProgressDetector.detectProgress()
    │   │   ├── LoopConfidenceCalculator.calculate()
    │   │   ├── WanderingDetector.onTurnResult()     ← NEW
    │   │   ├── SilentFailureTracker.recordFailure()  ← NEW (zero-signal)
    │   │   ├── StrategyClassifier.detectBoundary()   ← NEW
    │   │   └── Telemetry callbacks
    │   │
    │   ├── [if shouldCompress()]
    │   │   ├── SemanticLoopDetector.onCompression()
    │   │   │   ├── FeedbackGenerator.generate()      ← NEW
    │   │   │   ├── StrategyMemory.addStrategy()      ← NEW
    │   │   │   ├── StrategyMemory.detectCycle()      ← NEW
    │   │   │   └── Store activeFeedback
    │   │   └── manageContext() → summarizeConversation()
    │   │       └── [condensation prompt augmented with loop context]  ← NEW
    │   │
    │   └── [build next user message]
    │       └── getEnvironmentDetails(task, includeFeedback=true)  ← MODIFIED
    │           └── [append <loop_feedback> block if active]        ← NEW
    │
    └── [loop continues]
```

---

## 6. Telemetry Design

### 6.1 New Telemetry Events

Four new events are added to the `RooCodeEventName` enum in `packages/types/src/events.ts`:

```typescript
export enum RooCodeEventName {
    // ... existing events ...

    // Loop Detection (existing)
    LoopDetected = "loopDetected",
    LoopCompressionTriggered = "loopCompressionTriggered",
    LoopRecoveryDetected = "loopRecoveryDetected",

    // Phase 4: New Events
    LoopFeedbackInjected = "loopFeedbackInjected",
    StrategyCycleDetected = "strategyCycleDetected",
    SilentFailureDetected = "silentFailureDetected",
    WanderingDetected = "wanderingDetected",
}
```

### 6.2 Event Payload Schemas

Added to `rooCodeEventsSchema` in `packages/types/src/events.ts`:

```typescript
// Phase 4: Loop Feedback Injected
[RooCodeEventName.LoopFeedbackInjected]: z.tuple([
    z.object({
        taskId: z.string(),
        compressionId: z.string(),
        feedbackType: z.enum(["loop", "wandering", "silent_failure"]),
        hintCount: z.number(),
        consecutiveSimilarTurns: z.number(),
    }),
]),

// Phase 4: Strategy Cycle Detected
[RooCodeEventName.StrategyCycleDetected]: z.tuple([
    z.object({
        taskId: z.string(),
        cycleLength: z.number(),
        strategySequence: z.array(z.string()),
        previousCompressionId: z.string().nullable(),
    }),
]),

// Phase 4: Silent Failure Detected
[RooCodeEventName.SilentFailureDetected]: z.tuple([
    z.object({
        taskId: z.string(),
        failureType: z.enum([
            "empty_response",
            "no_tool_use",
            "truncated_tool_call",
            "zero_signal",
            "tool_error",
        ]),
        consecutiveCount: z.number(),
        turnIndex: z.number(),
    }),
]),

// Phase 4: Wandering Detected
[RooCodeEventName.WanderingDetected]: z.tuple([
    z.object({
        taskId: z.string(),
        consecutiveWanderingTurns: z.number(),
        cumulativeProgress: z.number(),
        uniqueFilesTouched: z.number(),
        uniqueToolsUsed: z.number(),
    }),
]),
```

### 6.3 Telemetry Callbacks

New callbacks added to `SemanticLoopDetectorConfig`:

```typescript
export interface SemanticLoopDetectorConfig {
    // ... existing callbacks ...

    /** Called when feedback is injected into the agent's context */
    onFeedbackInjected?: (event: {
        compressionId: string
        feedbackType: "loop" | "wandering" | "silent_failure"
        hintCount: number
    }) => void

    /** Called when a strategy cycle is detected */
    onStrategyCycle?: (event: {
        cycleLength: number
        strategySequence: string[]
    }) => void

    /** Called when a silent failure is detected */
    onSilentFailure?: (event: {
        failureType: SilentFailureType
        consecutiveCount: number
    }) => void

    /** Called when wandering is detected */
    onWandering?: (event: {
        consecutiveWanderingTurns: number
        cumulativeProgress: number
    }) => void
}
```

### 6.4 Console Logging

Each Phase 4 component adds structured console logging following the existing `[loop-detection]` prefix convention:

```
[loop-detection] Feedback injected: compressionId=${id}, hints=${count}
[loop-detection] Strategy cycle detected: length=${cycleLength}, sequence=${seq}
[loop-detection] Silent failure: type=${type}, consecutive=${count}
[loop-detection] Wandering detected: turns=${turns}, files=${files}, progress=${progress}
```

---

## 7. Risk Analysis

### 7.1 Performance Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Strategy memory grows unbounded | Low | Bounded by `maxSize` (default 20) with LRU eviction |
| Wandering detector adds per-turn overhead | Low | O(1) per turn — simple counter updates |
| Feedback string adds tokens to every API request | Medium | Feedback is injected for only N turns (default 3) after compression; string is bounded to ~500 tokens |
| Strategy classification adds per-turn overhead | Low | O(tools per turn) — simple map lookup per tool name |
| Silent failure tracking adds per-turn overhead | Low | O(1) — counter increment and threshold check |

**Estimated overhead:** < 1ms per turn for all Phase 4 components combined. The dominant cost is the feedback string injection (~500 tokens for 3 turns), which is negligible compared to typical API request sizes.

### 7.2 Correctness Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| False positive wandering detection during legitimate exploration | High | Grace period (default 5 turns), minimum unique files threshold, cumulative progress check |
| Feedback injection causes agent confusion | Medium | Feedback uses structured XML-like tags; system prompt section explains the format |
| Strategy cycle detection false positives | Medium | Requires exact category sequence match or A-B-A-B pattern over ≥4 strategies |
| Zero-signal detection fires on valid read-only turns | Low | Only fires when tools are called but produce no observable output; consecutive threshold (default 3) prevents single-turn false positives |
| Feedback TTL expires too quickly/slowly | Low | Configurable `feedbackTurns` (default 3); can be tuned per model |

### 7.3 Architectural Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Phase 4 components create tight coupling with Task.ts | Low | Components are called via the existing `SemanticLoopDetector` facade; Task.ts only interacts with the detector, not individual components |
| New config fields break existing configurations | Low | All new fields have defaults; the `.default({})` pattern on `loopDetection` ensures backward compatibility |
| Condensation prompt augmentation degrades summary quality | Medium | Augmentation is a prefix, not a replacement; the existing condensation prompt structure is preserved |
| Multiple feedback sources conflict | Low | Feedback is prioritized: loop > wandering > silent failure. Only one feedback block is injected per turn. |

### 7.4 Provider Compatibility Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Feedback injection format confuses certain models | Medium | Feedback uses simple XML-like tags (same format as existing `<environment_tags>`); tested across providers during Phase 5 |
| Strategy classification depends on tool names | Low | Tool category mapping covers all built-in tools; unknown tools map to `ToolCategory.Other` |
| Condensation prompt augmentation exceeds token limits | Low | Augmentation prefix is ~100 tokens; well within any model's context window |

### 7.5 Testing Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Wandering detection is hard to test deterministically | Medium | Wandering detector is a pure state machine; testable with synthetic turn sequences |
| Strategy cycle detection requires long sequences | Low | Tests can construct arbitrary strategy sequences; no dependency on real agent behavior |
| Silent failure detection depends on Task.ts internals | Medium | Silent failure events are emitted at well-defined points; tests can mock the emission points |

---

## 8. Recommendation

### 8.1 Recommended Approach

**Implement Phase 4 in two sub-phases:**

#### Sub-Phase 4A: Feedback Injection + Silent Failure Detection

These are the highest-value, lowest-risk components:

1. **Feedback Injection** directly addresses the core limitation of Phase 1-3: the agent doesn't know *what* to do differently after compression. This is the single most impactful addition.
2. **Silent Failure Detection** leverages existing counters in Task.ts and adds minimal new logic. It provides immediate value by giving the agent specific feedback about empty responses and no-tool-use turns.

**Estimated scope:** 4 new files, 2 modified files, ~800 lines of code, ~50 new tests.

#### Sub-Phase 4B: Strategy Memory + Wandering Detection

These are higher-complexity, higher-risk components that build on 4A:

1. **Strategy Memory** requires careful tuning of the category classification and boundary detection to avoid false positives.
2. **Wandering Detection** requires extensive testing with realistic agent behavior to calibrate thresholds.

**Estimated scope:** 3 new files, 1 modified file, ~600 lines of code, ~40 new tests.

### 8.2 Implementation Order

1. Add new type definitions to `packages/types/src/loop-detection.ts`
2. Add new config fields to `packages/types/src/global-settings.ts`
3. Add new telemetry events to `packages/types/src/events.ts`
4. Implement `FeedbackGenerator.ts` (pure function, easily testable)
5. Implement `SilentFailureTracker.ts` (state machine, easily testable)
6. Integrate feedback injection into `getEnvironmentDetails.ts`
7. Integrate silent failure detection into `Task.ts` (event emission at existing counter sites)
8. Implement `StrategyClassifier.ts` and `StrategyMemory.ts`
9. Implement `WanderingDetector.ts`
10. Extend `SemanticLoopDetector.ts` to wire all components together
11. Add system prompt section for loop feedback
12. Add condensation prompt augmentation
13. Write integration tests with synthetic turn sequences
14. Benchmark performance impact

### 8.3 Key Design Principles

1. **Preserve existing architecture**: Phase 4 components are additive. No existing Phase 1-3 code is modified except for extension points (new callbacks, new parameters with defaults).

2. **Deterministic only**: No LLM calls, no embeddings, no randomness. All components are pure functions or deterministic state machines.

3. **Provider agnostic**: No provider-specific logic. Tool category mapping covers all built-in tools; unknown tools map to `Other`.

4. **Bounded memory**: All data structures have configurable size limits. No unbounded growth.

5. **Graceful degradation**: If any Phase 4 component fails, the Phase 1-3 system continues to operate. Each component is wrapped in try-catch with fallback to no-op.

6. **Testability**: All components are independently testable with synthetic inputs. No dependency on live API calls for unit tests.

### 8.4 Success Metrics

- **Loop recovery rate**: Percentage of loop-triggered compressions after which the agent makes strong progress within 5 turns (target: > 70%)
- **Wandering detection accuracy**: Percentage of detected wandering episodes that a human reviewer agrees are non-productive (target: > 80%)
- **Silent failure detection**: Percentage of empty/no-tool-use responses that receive targeted feedback (target: > 95%)
- **Strategy cycle detection**: Percentage of detected cycles that are genuine repetitions (target: > 60%)
- **Performance overhead**: < 2ms per turn for all Phase 4 components (target: < 1ms)
- **Token overhead**: < 1000 additional tokens per compression event from feedback injection (target: ~500)

---

*Document version: 1.0*
*Phase: Research and Design*
*Implementation: Not started*
