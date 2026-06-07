# Task Breakdown - Agent State Management

## Phase 1: Foundation and Domain Models

*   [ ] Define `ExecutionStateGraph`, `Evidence`, `EvidenceType`, `EvidencePayload`, `StateTransition`, and `EvidenceSummary` interfaces in `packages/types/src/loop-detection.ts`.
*   [ ] Define `AgentStateManagementConfig` schema and type in `packages/types/src/global-settings.ts`, following the existing `loopDetection` pattern with zod schema using `.optional().default()`.
*   [ ] Add `agentStateManagement` to the `globalSettingsSchema` in `packages/types/src/global-settings.ts`.
*   [ ] Add unit tests for the `AgentStateManagementConfig` schema validation (valid config, invalid values, defaults).
*   [ ] Create `StateTransitionEngine` class in `src/core/state-management/StateTransitionEngine.ts` with the transition table as a pure function.
*   [ ] Add unit tests for `StateTransitionEngine` covering all transition rules from the design document.
*   [ ] Create `EvidenceRegistry` class in `src/core/state-management/EvidenceRegistry.ts` with append-only semantics and query-by-type support.
*   [ ] Add unit tests for `EvidenceRegistry` (add entries, query by type, enforce retention limit, verify append-only).

## Phase 2: Validation and Evidence Summarization

*   [ ] Create `ClaimValidator` class in `src/core/state-management/ClaimValidator.ts` with deterministic claim classification and evidence checking.
*   [ ] Add unit tests for `ClaimValidator` (accept valid claims, reject invalid claims, handle unknown claim types, test-specific pass/fail logic).
*   [ ] Create `CompletionValidator` class in `src/core/state-management/CompletionValidator.ts` with state graph checking against required phase states.
*   [ ] Add unit tests for `CompletionValidator` (allow when all phases met, block when phases incomplete, report specific incomplete phases).
*   [ ] Create `EvidenceSummarizer` class in `src/core/state-management/EvidenceSummarizer.ts` that produces `EvidenceSummary` from the evidence registry.
*   [ ] Add unit tests for `EvidenceSummarizer` (correct counts, file lists, last test/commit/push extraction, empty registry handling).
*   [ ] Create `src/core/state-management/index.ts` barrel export for all state management modules.

## Phase 3: Integration with Task Execution Loop

*   [ ] Add `executionStateGraph` and `evidenceRegistry` properties to the `Task` class in `src/core/task/Task.ts`.
*   [ ] Initialize both in `initiateTaskLoop()` (or at the start of `recursivelyMakeClineRequests()`) when `agentStateManagement.enabled` is `true`.
*   [ ] Hook into the tool execution pipeline in `presentAssistantMessage` to intercept tool results and feed them to the `StateTransitionEngine` and `EvidenceRegistry`.
*   [ ] Integrate `ClaimValidator` into the agent message processing flow — when the agent outputs text containing claims, validate them before presenting the message to the user.
*   [ ] Integrate `CompletionValidator` into the `attempt_completion` tool handler — block completion if required phases are not met.
*   [ ] Add unit tests for the Task integration (state initialized on task start, state updated on tool execution, evidence recorded for each tool call).

## Phase 4: Environment Details and Condensation Integration

*   [ ] Modify `getEnvironmentDetails()` in `src/core/environment/getEnvironmentDetails.ts` to append the Execution State Graph as an `<execution_state>` block when state management is enabled.
*   [ ] Modify `summarizeConversation()` in `src/core/condense/index.ts` to accept and inject the evidence summary into the condensation prompt.
*   [ ] Ensure the Execution State Graph is preserved across condensation (not reset or modified).
*   [ ] Add unit tests for environment details injection (state block present when enabled, absent when disabled, correct format).
*   [ ] Add unit tests for condensation integration (evidence summary in prompt, state graph preserved, graceful handling when state management disabled).

## Phase 5: Loop Detection Integration

*   [ ] Modify `SemanticLoopDetector` in `src/core/loop-detection/SemanticLoopDetector.ts` to accept Execution State Graph transitions as additional progress signals.
*   [ ] Map state transitions to the existing `ProgressTier` enum: phase start transitions (e.g., `not_started` -> `investigating`) count as Medium Progress; phase completion transitions (e.g., `edited` -> `verified`) count as Strong Progress.
*   [ ] Add unit tests for loop detection integration (state transitions affect progress scoring, no regression in existing loop detection behavior).

## Phase 6: Configuration and Observability

*   [ ] Add structured logging for state transitions, claim validations, and completion validations using the existing logging infrastructure.
*   [ ] Add metrics counters: total state transitions, claims validated (accepted/rejected), completion validations (allowed/blocked), evidence registry size.
*   [ ] Ensure all log entries exclude sensitive data per REQ-8 (no user message text, no file contents, no large payloads).
*   [ ] Add unit tests for observability (correct event logging, metrics accumulation, sensitive data exclusion).
*   [ ] Verify runtime configuration updates work without agent restart (toggle enabled/disabled, adjust retention limit).

## Phase 7: Task Persistence

*   [ ] Add Execution State Graph serialization to the task persistence layer (`src/core/task-persistence/`).
*   [ ] Add Evidence Summary serialization alongside the state graph.
*   [ ] On task resume, restore the Execution State Graph and Evidence Summary from persisted data.
*   [ ] Add unit tests for persistence round-trip (serialize state + evidence summary, deserialize, verify equality).

## Phase 8: End-to-End Verification

*   [ ] Create integration test: full task lifecycle with state management enabled (diagnosis -> implementation -> testing -> VCS -> completion).
*   [ ] Create integration test: agent makes false claim, system rejects it.
*   [ ] Create integration test: agent attempts premature completion, system blocks it.
*   [ ] Create integration test: context condensation preserves evidence summary and state graph.
*   [ ] Create integration test: state management disabled produces zero overhead.
*   [ ] Run existing test suite to verify no regressions in `Task.ts`, `condense/index.ts`, `context-management/index.ts`, and `loop-detection/`.
*   [ ] Benchmark performance impact: measure tool execution latency with and without state management enabled.
