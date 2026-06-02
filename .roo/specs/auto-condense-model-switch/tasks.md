# Task Breakdown - Auto-Condense on Model Switch

## Phase 1: Data Structures and ModelUsageTracker

- [x] Define `ModelUsageRecord` interface in `@roo-code/types` (or locally in `src/core/task/` if not shared).
- [x] Create `ModelUsageTracker` class in `src/core/task/ModelUsageTracker.ts` with:
  - `recordCurrentModel(provider, modelId, turnIndex)` method
  - `getMostRecent()` method
  - `getRecentRecords()` method
  - `wasModelRecentlyUsed(provider, modelId)` method
  - Bounded deque eviction based on `maxRecords`
- [x] Add unit tests for `ModelUsageTracker` covering:
  - Recording and retrieval of model records
  - Bounded eviction when max records exceeded
  - `wasModelRecentlyUsed` with matching and non-matching provider/modelId
  - Empty tracker behavior (first request, no prior records)

## Phase 2: Configuration and Type Extensions

- [ ] Add `autoCondenseOnModelSwitch` (boolean, default `true`) to the provider state type / settings.
- [ ] Add `autoCondenseModelSwitchLookback` (integer, default `1`, range `1`–`10`) to the provider state type / settings.
- [ ] Add `forceCondense?: boolean` to `WillManageContextOptions` in [`src/core/context-management/index.ts`](src/core/context-management/index.ts).
- [ ] Add `forceCondense` to `ContextManagementOptions` in [`src/core/context-management/index.ts`](src/core/context-management/index.ts).
- [ ] Add validation for `autoCondenseModelSwitchLookback` (must be integer in range 1–10, fall back to default on invalid values).

## Phase 3: Core Detection Logic

- [ ] Add `modelUsageTracker: ModelUsageTracker` field to the Task class in [`src/core/task/Task.ts`](src/core/task/Task.ts).
- [ ] Initialize `ModelUsageTracker` in the Task constructor with `maxRecords` from configuration.
- [ ] Add a `turnIndex` counter field to the Task class, incremented at the start of each `attemptApiRequest()` call.
- [ ] Implement model switch detection logic in `attemptApiRequest()`:
  - Read `autoCondenseOnModelSwitch` and `autoCondenseModelSwitchLookback` from state.
  - Call `modelUsageTracker.recordCurrentModel()` with current provider and model ID.
  - Call `modelUsageTracker.wasModelRecentlyUsed()` to detect switch.
  - Compute `modelSwitchDetected` boolean.
- [ ] Pass `forceCondense: modelSwitchDetected && autoCondenseOnModelSwitch` to `willManageContext()`.

## Phase 4: willManageContext and manageContext Integration

- [ ] Modify `willManageContext()` in [`src/core/context-management/index.ts`](src/core/context-management/index.ts) to return `true` immediately when `forceCondense` is `true`.
- [ ] Pass `forceCondense` through to `manageContext()` via `ContextManagementOptions`.
- [ ] In `manageContext()`, when `forceCondense` is `true` and `autoCondenseContext` is `true`, skip the threshold check and proceed directly to `summarizeConversation()`.
- [ ] In `manageContext()`, when `forceCondense` is `true` and `autoCondenseContext` is `false`, log an informational message and skip condensing (existing truncation fallback remains available if tokens exceed `allowedTokens`).

## Phase 5: Edge Cases and Guardrails

- [ ] Add guard: if `apiConversationHistory` has fewer than 2 messages, skip forced condensing even when `forceCondense` is `true`.
- [ ] Add guard: if `this.api.getModel()` returns `undefined` for model ID, log warning and skip switch detection.
- [ ] Handle the case where a prior condensed summary already exists — ensure the condensing prompt includes the prior summary as input.
- [ ] Ensure the `condenseTaskContextStarted` / `condenseTaskContextResponse` webview notifications are sent when model-switch condensing runs (verify existing conditional logic covers the forced path).
- [ ] Ensure `say("condense_context", ...)` and `say("condense_context_error", ...)` messages are emitted correctly for model-switch-triggered condensing.

## Phase 6: Testing

- [ ] Add unit tests for `willManageContext()` with `forceCondense: true` — verify it returns `true` regardless of token counts.
- [ ] Add unit tests for `willManageContext()` with `forceCondense: false` — verify existing threshold logic is unchanged.
- [ ] Add integration tests for `attemptApiRequest()` covering:
  - Same model used twice: no forced condensing
  - Different model on second request: forced condensing triggered
  - `autoCondenseOnModelSwitch: false`: no forced condensing even on model switch
  - `autoCondenseModelSwitchLookback: 2`: cycling between two models does not re-condense
  - First API request: no forced condensing (no prior model record)
  - Model switch with `autoCondenseContext: false`: logs info, no condensing
- [ ] Add test for `ModelUsageTracker` eviction behavior with various lookback values.
- [ ] Verify existing condensing tests still pass (no regression in threshold-based condensing).

## Phase 7: Observability

- [ ] Add a `say("model_switch_detected", ...)` informational message (or log entry) when a model switch is detected and condensing is triggered, including the previous and new model IDs.
- [ ] Ensure the existing `ContextCondense` metadata emitted via `say("condense_context", ...)` is identical for model-switch and threshold-based triggers.
- [ ] Add a console log entry when `autoCondenseOnModelSwitch` is `false` and a model switch is detected, indicating condensing was skipped.
