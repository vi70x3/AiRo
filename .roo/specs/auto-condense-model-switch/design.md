# Design Document - Auto-Condense on Model Switch

## Overview

The Auto-Condense on Model Switch feature detects when a user switches to a different AI model between API request turns and forces context condensing before the new model processes the conversation. This ensures the new model receives a clean, condensed summary of prior work rather than the full conversation history it has no context for. The feature integrates into the existing `attemptApiRequest()` flow in [`Task.ts`](src/core/task/Task.ts) and the existing `willManageContext()` / `manageContext()` pipeline in [`src/core/context-management/index.ts`](src/core/context-management/index.ts).

## Architecture

### Component Diagram

1. **ModelUsageTracker**: Maintains a fixed-size deque of `ModelUsageRecord` objects on the Task instance, recording which model was used for each API request turn.
2. **ModelSwitchDetector**: Compares the upcoming model against recent records to determine if a switch occurred.
3. **AutoCondenseTrigger**: Orchestrates the switch detection and forces `willManageContext()` to return `true` when a switch is detected and condensing is enabled.
4. **Existing manageContext pipeline**: Unchanged — receives the forced trigger and performs condensing as it would for a threshold-based trigger.

### Data Flow

```
User submits message with different model
        │
        ▼
submitUserMessage(providerProfile)
        │
        ▼
updateApiConfiguration() → rebuilds this.api
        │
        ▼
attemptApiRequest()
        │
        ├─► ModelUsageTracker.recordCurrentModel()   [NEW]
        │
        ├─► ModelSwitchDetector.detectSwitch()        [NEW]
        │       │
        │       ▼
        │   switchDetected: boolean
        │
        ├─► willManageContext()                        [MODIFIED]
        │       │
        │       ├── existing threshold check
        │       └── OR switchDetected                  [NEW CONDITION]
        │
        ├─► manageContext()                            [UNCHANGED]
        │
        └─► API request with (possibly condensed) history
```

## Integration Points

### 1. Task Class (`src/core/task/Task.ts`)

**ModelUsageTracker** is added as a field on the Task class. It records the current model at the start of each `attemptApiRequest()` call.

- **Location**: New field `modelUsageTracker: ModelUsageTracker` added to the Task class (near `cachedStreamingModel` at line ~390).
- **Initialization**: Created in the Task constructor.
- **Recording point**: At the top of `attemptApiRequest()`, after reading state but before the `willManageContext()` check (around line 3893, after `Task.lastGlobalApiRequestTime` is set).

**ModelSwitchDetector** logic is inlined into `attemptApiRequest()` as a helper method or inline check. It reads the current model from `this.api.getModel()` and compares it against the tracker's recent records.

- **Detection point**: Between model recording and the `willManageContext()` call (around line 3910).
- **Result**: A boolean `modelSwitchDetected` that is passed into the `willManageContext()` options.

### 2. willManageContext (`src/core/context-management/index.ts`)

The `WillManageContextOptions` type is extended with an optional `forceCondense: boolean` field. When `true`, the function returns `true` regardless of token thresholds.

- **File**: [`src/core/context-management/index.ts`](src/core/context-management/index.ts) (line 137)
- **Change**: Add `forceCondense?: boolean` to `WillManageContextOptions`.
- **Logic**: At the top of `willManageContext()`, add `if (forceCondense) return true;` before threshold calculations.

### 3. Provider State / Configuration

Two new settings are read from provider state in `attemptApiRequest()`:

- `autoCondenseOnModelSwitch` (boolean, default `true`)
- `autoCondenseModelSwitchLookback` (integer, default `1`, range `1`–`10`)

These are read alongside existing condensing settings (lines 3866–3874).

## Data Structures

### ModelUsageRecord

```typescript
interface ModelUsageRecord {
	provider: string          // e.g., "anthropic", "openai-native"
	modelId: string           // e.g., "claude-sonnet-4-20250514"
	turnIndex: number         // Monotonically increasing turn counter
}
```

### ModelUsageTracker

```typescript
class ModelUsageTracker {
	private records: ModelUsageRecord[] = []
	private maxRecords: number  // Derived from autoCondenseModelSwitchLookback

	/** Record the model for the current API request turn. */
	recordCurrentModel(provider: string, modelId: string, turnIndex: number): void {
		this.records.push({ provider, modelId, turnIndex })
		// Evict records outside the lookback window
		while (this.records.length > this.maxRecords) {
			this.records.shift()
		}
	}

	/** Get the most recent model record, or undefined if none exist. */
	getMostRecent(): ModelUsageRecord | undefined {
		return this.records[this.records.length - 1]
	}

	/** Get all records within the lookback window. */
	getRecentRecords(): readonly ModelUsageRecord[] {
		return this.records
	}

	/** Check if a given provider+modelId matches any record in the lookback window. */
	wasModelRecentlyUsed(provider: string, modelId: string): boolean {
		return this.records.some(
			(r) => r.provider === provider && r.modelId === modelId,
		)
	}
}
```

### WillManageContextOptions (Extended)

```typescript
export type WillManageContextOptions = {
	totalTokens: number
	contextWindow: number
	maxTokens?: number | null
	autoCondenseContext: boolean
	autoCondenseContextPercent: number
	profileThresholds: Record<string, number>
	currentProfileId: string
	lastMessageTokens: number
	forceCondense?: boolean  // NEW: forces context management to run
}
```

## Algorithms

### 1. Model Switch Detection

```
function detectModelSwitch(
	currentProvider: string,
	currentModelId: string,
	tracker: ModelUsageTracker,
	lookback: number,
): boolean {
	const recentRecords = tracker.getRecentRecords()
	if (recentRecords.length === 0) {
		return false  // First request, no prior model to compare
	}

	// Check if the current model matches ANY record in the lookback window
	const wasUsed = tracker.wasModelRecentlyUsed(currentProvider, currentModelId)
	return !wasUsed  // Switch = not recently used
}
```

The comparison uses the composite key `{ provider, modelId }`. Two models are considered the same only if both provider and model ID match exactly.

### 2. Forced Condense Flow

In `attemptApiRequest()`, the flow is:

```
1. Read state (including new autoCondenseOnModelSwitch, autoCondenseModelSwitchLookback)
2. Record current model in ModelUsageTracker
3. Detect model switch:
   a. Get current model: this.api.getModel() → { id, info }
   b. Get current provider: this.apiConfiguration.apiProvider
   c. Call detectModelSwitch(provider, modelId, tracker, lookback)
4. Compute contextManagementWillRun:
   a. Call willManageContext() with forceCondense = (switchDetected && autoCondenseOnModelSwitch)
5. If contextManagementWillRun:
   a. Send condenseTaskContextStarted notification
   b. Build tools, metadata, environment details
   c. Call manageContext() (unchanged)
   d. Handle result (overwrite history, emit messages)
   e. Send condenseTaskContextResponse notification
6. Proceed with API request
```

### 3. Lookback Window Behavior

- **lookback = 1** (default): Compare against only the most recent model. A switch is detected if the current model differs from the immediately preceding one.
- **lookback = N**: Compare against the last N recorded models. A switch is detected only if the current model differs from ALL N recorded models. This prevents re-condensing when cycling between a small set of models.

## Performance Constraints

- **O(1) to O(N) comparison**: Model switch detection iterates over at most `lookback` records (max 10), which is bounded and trivial.
- **No additional API calls**: The detection uses only in-memory data (`this.api.getModel()` and the tracker's record deque).
- **No impact on non-switch paths**: When no model switch occurs, the only overhead is a single `getModel()` call (which is already called later in the same function at line 3896) and a bounded array lookup.
- **Synchronous**: All detection logic is synchronous, adding no latency to the request pipeline.
- **Memory bounded**: The `ModelUsageTracker` stores at most `lookback` records (max 10), each containing three small strings/numbers.
