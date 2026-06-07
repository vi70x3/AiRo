# Task Breakdown - Agent Reliability Metrics

## Phase 1: Foundation and Domain Models

*   [ ] Define `TaskReliabilityMetrics`, `ToolCallSample`, `DiagnosisSample`, `HallucinatedEditSample`, `RecoverySample`, and `SessionMetricsAggregate` interfaces in `packages/types/src/metrics.ts`.
*   [ ] Define `AgentReliabilityMetricsConfig` schema and type in `packages/types/src/global-settings.ts`, following the existing `loopDetection` pattern with zod schema using `.optional().default()`.
*   [ ] Add `agentReliabilityMetrics` to the `globalSettingsSchema` in `packages/types/src/global-settings.ts`.
*   [ ] Add unit tests for the `AgentReliabilityMetricsConfig` schema validation (valid config, invalid values, defaults, per-family toggles).
*   [ ] Create `src/core/metrics/` directory structure with barrel export `src/core/metrics/index.ts`.
*   [ ] Create `DiagnosisAccuracyTracker` class in `src/core/metrics/DiagnosisAccuracyTracker.ts` with pattern-based diagnosis detection and confirmation/refutation logic.
*   [ ] Add unit tests for `DiagnosisAccuracyTracker` covering diagnosis detection patterns, confirmation via successful edit, refutation via consecutive mistakes, and rate computation.

## Phase 2: Hallucinated Edit and Tool Efficiency Trackers

*   [ ] Create `HallucinatedEditDetector` class in `src/core/metrics/HallucinatedEditDetector.ts` with edit claim verification and agent success-claim cross-referencing.
*   [ ] Add unit tests for `HallucinatedEditDetector` (verified edit, hallucinated edit with agent success claim, non-edit tool passthrough, integration with `consecutiveMistakeCountForEditFile`).
*   [ ] Create `ToolEfficiencyTracker` class in `src/core/metrics/ToolEfficiencyTracker.ts` with per-tool success/failure tracking and auto-approval separation.
*   [ ] Add unit tests for `ToolEfficiencyTracker` (successful call, failed call, per-tool breakdown, auto-approval tracking, rate computation, retention limit enforcement).
*   [ ] Create `src/core/metrics/__tests__/` directory for all metrics test files.

## Phase 3: Token Efficiency and Recovery Rate Trackers

*   [ ] Create `TokenEfficiencyTracker` class in `src/core/metrics/TokenEfficiencyTracker.ts` with cache hit rate, context utilization, and useful context approximation.
*   [ ] Add unit tests for `TokenEfficiencyTracker` (cache hit rate computation, context utilization, useful context approximation, wasted context tracking, rate computation).
*   [ ] Create `RecoveryRateTracker` class in `src/core/metrics/RecoveryRateTracker.ts` with failure/recovery classification and attempt counting.
*   [ ] Add unit tests for `RecoveryRateTracker` (recovery within 3 turns, unrecovered after max attempts, pending state, rate computation, intervention-linked recovery).

## Phase 4: Metrics Collector Facade and Aggregator

*   [ ] Create `MetricsCollector` class in `src/core/metrics/MetricsCollector.ts` as the facade that owns all five trackers and provides a unified interface.
*   [ ] Create `MetricsAggregator` class in `src/core/metrics/MetricsAggregator.ts` that computes per-task and session-level aggregates.
*   [ ] Add unit tests for `MetricsCollector` (initialization, tool call recording, task reset, event emission, configuration-based enable/disable).
*   [ ] Add unit tests for `MetricsAggregator` (per-task aggregate computation, session-level aggregate computation, correct handling of zero-sample edge cases).
*   [ ] Update `src/core/metrics/index.ts` barrel export to include all tracker classes, collector, and aggregator.

## Phase 5: Integration with Task Execution Loop

*   [ ] Add `metricsCollector` property to the `Task` class in `src/core/task/Task.ts`.
*   [ ] Initialize `MetricsCollector` in `initiateTaskLoop()` (or at the start of `recursivelyMakeClineRequests()`) when `agentReliabilityMetrics.enabled` is `true`.
*   [ ] Hook into the tool execution pipeline in `presentAssistantMessage` to intercept tool results and feed them to `MetricsCollector.recordToolCall()`.
*   [ ] Integrate `DiagnosisAccuracyTracker` into the agent message processing flow — when the agent outputs text, run diagnosis detection.
*   [ ] Integrate `HallucinatedEditDetector` with `consecutiveMistakeCountForEditFile` (line 315) and `recordToolError()` (line 4512) — notify on edit tool failures.
*   [ ] Integrate `RecoveryRateTracker` with `consecutiveMistakeCount` (line 313) and `didToolFailInCurrentTurn` (line 378) — record failure events on mistake increments.
*   [ ] Add unit tests for Task integration (metrics collector initialized on task start, tool calls recorded, diagnosis detected from agent output, mistake events trigger recovery tracking).

## Phase 6: API Metrics and Loop Detection Integration

*   [ ] Integrate `TokenEfficiencyTracker` with `processUsageMetrics()` in `src/api/providers/base-openai-compatible-provider.ts` — pass usage data to the tracker on each API response.
*   [ ] Integrate `TokenEfficiencyTracker` with `getApiMetrics()` from `src/shared/getApiMetrics.ts` — consume context token data for utilization computation.
*   [ ] Integrate `RecoveryRateTracker` with `InterventionEffectivenessTracker` in `src/core/loop-detection/InterventionEffectivenessTracker.ts` — measure recovery after loop-breaking interventions.
*   [ ] Integrate `RecoveryRateTracker` with `AdaptationFailureDetector` in `src/core/loop-detection/AdaptationFailureDetector.ts` — record adaptation failures as a separate subtype.
*   [ ] Integrate `ToolEfficiencyTracker` with `AutoApprovalHandler` in `src/core/auto-approval/AutoApprovalHandler.ts` — register callback for auto-approved tool call tracking.
*   [ ] Add unit tests for API metrics integration (usage data flows to tracker, context tokens tracked, cache metrics computed).
*   [ ] Add unit tests for loop detection integration (intervention recovery measured, adaptation failures recorded, auto-approved calls tracked separately).

## Phase 7: Task Persistence and Webview Integration

*   [ ] Add `reliabilityMetrics` field to the `TaskMetadata` interface in `src/core/task-persistence/taskMetadata.ts`.
*   [ ] Serialize per-task metrics aggregates into task metadata on task completion.
*   [ ] Restore per-task metrics from task metadata on task resume.
*   [ ] Extend `getTaskWithAggregatedCosts` in `src/core/webview/webviewMessageHandler.ts` to include reliability metrics alongside cost data.
*   [ ] Add unit tests for persistence round-trip (serialize metrics, deserialize, verify equality).
*   [ ] Add unit tests for webview message handler integration (metrics included in response, graceful handling when metrics unavailable).

## Phase 8: TaskHeader UI Integration

*   [ ] Add `reliabilityMetrics` optional prop to `TaskHeaderProps` in `webview-ui/src/components/chat/TaskHeader.tsx`.
*   [ ] Create reliability metrics display component within `TaskHeader` with compact, color-coded metric indicators.
*   [ ] Implement threshold-based icons: checkmark for good, warning for near-threshold, alert for poor.
*   [ ] Pass `reliabilityMetrics` prop from `ChatView.tsx` to `TaskHeader` (alongside existing `tokensIn`, `tokensOut`, `totalCost` props).
*   [ ] Display "No metrics available" placeholder when `reliabilityMetrics` is not provided.
*   [ ] Add unit tests for TaskHeader metrics display (all metrics displayed, color coding, threshold icons, missing metrics placeholder).
*   [ ] Verify Tailwind CSS classes follow existing patterns in the component (no inline styles).

## Phase 9: Configuration and Observability

*   [ ] Add structured logging for metric samples, diagnosis outcomes, hallucinated edits, efficiency alerts, and recovery outcomes using the existing logging infrastructure.
*   [ ] Add metrics counters: total samples per family, diagnoses (confirmed/refuted), hallucinated edits, tool calls (successful/failed), context tokens (useful/wasted), failures (recovered/unrecovered).
*   [ ] Ensure all log entries exclude sensitive data per REQ-9 (no user message text, no file contents, no large payloads, diagnosis text replaced with hash).
*   [ ] Add `RooCodeEventName` event types for metrics events (diagnosis outcome, hallucinated edit detected, efficiency alert, recovery outcome, metrics finalized).
*   [ ] Add unit tests for observability (correct event logging, metrics accumulation, sensitive data exclusion, event emission).
*   [ ] Verify runtime configuration updates work without agent restart (toggle enabled/disable, adjust per-family toggles, adjust retention limit).

## Phase 10: End-to-End Verification

*   [ ] Create integration test: full task lifecycle with metrics enabled (diagnosis -> edit -> test -> completion, verify all five metric families produce valid aggregates).
*   [ ] Create integration test: agent makes hallucinated edit claim, system detects it.
*   [ ] Create integration test: agent encounters failures, system tracks recovery rate correctly.
*   [ ] Create integration test: metrics disabled produces zero overhead (no samples recorded, no events emitted).
*   [ ] Create integration test: metrics persisted and restored across task resume.
*   [ ] Run existing test suite to verify no regressions in `Task.ts`, `presentAssistantMessage`, `loop-detection/`, `auto-approval/`, and `task-persistence/`.
*   [ ] Benchmark performance impact: measure tool execution latency with and overhead metrics enabled (target: < 1ms per tool call).
