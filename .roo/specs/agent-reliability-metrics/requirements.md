# Requirements Document

## Introduction

The Agent Reliability Metrics feature introduces a comprehensive metrics collection and analysis system that quantifies five dimensions of agent reliability: Diagnosis Accuracy, Hallucinated Edit Rate, Tool Efficiency, Token Efficiency, and Recovery Rate. These metrics provide objective, measurable signals about agent performance that enable data-driven improvements to prompt engineering, tool design, and agent architecture.

The system integrates with existing infrastructure at well-defined points: tool execution in `presentAssistantMessage`, API response processing in `processUsageMetrics`, task lifecycle events in `Task.ts`, loop detection signals in `src/core/loop-detection/`, and metrics display in the `TaskHeader` component. All metrics are computed deterministically from already-available data — no additional LLM calls or external services are required.

Metrics are persisted alongside task metadata, aggregated across tasks for trend analysis, and surfaced in the UI via the existing `TaskHeader` component alongside cost and token information.

## Glossary

- **Agent**: An AI-powered assistant that processes user requests and executes tasks using available tools and reasoning capabilities.
- **Diagnosis Accuracy**: The ratio of confirmed diagnoses to total diagnosis attempts. A diagnosis is "confirmed" when the agent's diagnostic claim is verified by subsequent successful implementation.
- **Hallucinated Edit**: An edit the agent claims to have made (via `Edit`, `Write`, or `MultiEdit` tool calls) where the file content does not reflect the claimed change, or where the agent reports success but the tool returned an error.
- **Tool Efficiency**: The ratio of successful tool calls to total tool calls. A tool call is "successful" when it returns a non-error result.
- **Token Efficiency**: The ratio of useful context tokens to total context tokens consumed. Useful context is approximated by tokens in API responses that lead to successful tool use.
- **Recovery Rate**: The ratio of failures from which the agent recovered to total failures. Recovery means the agent encountered a tool error but subsequently produced a successful action.
- **Metric Family**: A category of related metrics (e.g., "Diagnosis Accuracy" is a metric family containing `confirmedDiagnosis`, `totalDiagnosis`, and `diagnosisAccuracyRate`).
- **Metric Sample**: A single observation point for a metric (e.g., one tool call success/failure is a sample for Tool Efficiency).
- **Metric Aggregate**: A statistical summary of metric samples over a defined window (per-task, per-session, or per-time-period).
- **Task Execution Loop**: The core agentic loop in `recursivelyMakeClineRequests()` (line 2452 of `src/core/task/Task.ts`) that processes assistant messages, executes tools, and accumulates results.
- **presentAssistantMessage**: The function in `src/core/assistant-message/presentAssistantMessage.ts` that sequentially executes tool calls and accumulates results into `userMessageContent`.
- **AutoApprovalHandler**: The handler in `src/core/auto-approval/AutoApprovalHandler.ts` that manages automatic tool approval based on configurable rules and cost tracking.
- **InterventionEffectivenessTracker**: The tracker in `src/core/loop-detection/InterventionEffectivenessTracker.ts` that measures whether loop-breaking interventions lead to subsequent progress.
- **AdaptationFailureDetector**: The detector in `src/core/loop-detection/AdaptationFailureDetector.ts` that identifies when the agent fails to adapt its strategy after a detected loop.
- **RooCodeEventName**: The event enumeration used with `ClineProvider.emit()` to broadcast system events across the extension.
- **say()**: The method on `Task` that emits structured messages (of types like `"say"`, `"ask"`, `"reasoning"`) to the webview.

## Requirements

### Requirement 1: Diagnosis Accuracy Tracking

**User Story:** As a user, I want the system to track how accurately the agent diagnoses problems before implementing fixes, so that I can understand whether the agent truly understands the issue before it attempts changes.

#### Acceptance Criteria

1. The Diagnosis_Accuracy_Tracker SHALL record a diagnosis attempt when the agent's output contains diagnostic language (e.g., "The issue is", "The root cause", "The problem is") followed by a proposed cause or hypothesis, as detected by deterministic pattern matching.
2. The Diagnosis_Accuracy_Tracker SHALL mark a diagnosis as "confirmed" when a subsequent `Edit`, `Write`, or `MultiEdit` tool call succeeds on a file relevant to the diagnosed issue, followed by a successful test or verification step.
3. The Diagnosis_Accuracy_Tracker SHALL mark a diagnosis as "refuted" when the agent explicitly revises its diagnosis (e.g., "Actually, the issue is", "I was wrong about") or when three or more consecutive tool calls fail after the diagnosis.
4. The Diagnosis_Accuracy_Tracker SHALL compute `diagnosisAccuracyRate = confirmedDiagnoses / totalDiagnoses` per task.
5. The Diagnosis_Accuracy_Tracker SHALL integrate with the existing `consecutiveMistakeCount` on the `Task` class (line 313 of `src/core/task/Task.ts`) — when `consecutiveMistakeCount` reaches 3, the current diagnosis SHALL be marked as "refuted" if not already confirmed.
6. WHEN a new task starts, the Diagnosis_Accuracy_Tracker SHALL reset all counters to zero.
7. The Diagnosis_Accuracy_Tracker SHALL emit a `RooCodeEventName` event via `ClineProvider.emit()` when a diagnosis transitions to "confirmed" or "refuted", including the diagnosis text hash (SHA-256 of the diagnostic utterance, truncated to 8 characters) and the outcome.

### Requirement 2: Hallucinated Edit Rate Tracking

**User Story:** As a user, I want the system to detect when the agent claims to have made edits that did not actually occur, so that I can trust the agent's progress reports.

#### Acceptance Criteria

1. The Hallucinated_Edit_Detector SHALL record a "claimed edit" each time the agent calls the `Edit`, `Write`, or `MultiEdit` tool.
2. The Hallucinated_Edit_Detector SHALL classify a claimed edit as "verified" when the tool returns a success result (no error in the tool result text).
3. The Hallucinated_Edit_Detector SHALL classify a claimed edit as "hallucinated" when the tool returns an error result (e.g., "File not found", "Old string not found", "No write access") but the agent's subsequent text reports success (e.g., "Successfully updated", "Fixed the file").
4. The Hallucinated_Edit_Detector SHALL integrate with `consecutiveMistakeCountForEditFile` (line 315 of `src/core/task/Task.ts`) — when this counter increments for a specific file, the edit claim for that file SHALL be flagged as "hallucinated" if the agent subsequently reports success.
5. The Hallucinated_Edit_Detector SHALL compute `hallucinatedEditRate = hallucinatedEdits / totalClaimedEdits` per task.
6. The Hallucinated_Edit_Detector SHALL integrate with `recordToolError()` (line 4512 of `src/core/task/Task.ts`) — when `recordToolError()` is called for an edit tool, the corresponding claimed edit SHALL be marked as "hallucinated".
7. WHEN a new task starts, the Hallucinated_Edit_Detector SHALL reset all counters to zero.
8. The Hallucinated_Edit_Detector SHALL emit a `RooCodeEventName` event via `ClineProvider.emit()` when a hallucinated edit is detected, including the file path and the error type.

### Requirement 3: Tool Efficiency Tracking

**User Story:** As a user, I want the system to measure how effectively the agent uses tools, so that I can identify whether the agent is wasting actions on retries or incorrect approaches.

#### Acceptance Criteria

1. The Tool_Efficiency_Tracker SHALL record a tool call sample for every tool invocation via `presentAssistantMessage()` in `src/core/assistant-message/presentAssistantMessage.ts`, capturing: tool name, timestamp, success/failure status, and error type if failed.
2. The Tool_Efficiency_Tracker SHALL classify a tool call as "successful" when the tool result does not contain an error indicator (e.g., "File not found", "Permission denied", "Command failed").
3. The Tool_Efficiency_Tracker SHALL classify a tool call as "failed" when the tool result contains an error indicator or when `didToolFailInCurrentTurn` (line 378 of `src/core/task/Task.ts`) is `true`.
4. The Tool_Efficiency_Tracker SHALL compute `toolEfficiencyRate = successfulToolCalls / totalToolCalls` per task.
5. The Tool_Efficiency_Tracker SHALL also compute per-tool breakdowns (e.g., `EditFile.successRate`, `Bash.successRate`) for the top 10 most-used tools.
6. The Tool_Efficiency_Tracker SHALL integrate with the existing `AutoApprovalHandler` in `src/core/auto-approval/AutoApprovalHandler.ts` — auto-approved tool calls SHALL be tracked separately, and their success rate SHALL be computed independently.
7. WHEN a new task starts, the Tool_Efficiency_Tracker SHALL reset all counters to zero.
8. The Tool_Efficiency_Tracker SHALL emit a `RooCodeEventName` event via `ClineProvider.emit()` when the per-task tool efficiency rate drops below 0.5 (50%), including the current rate and the total number of tool calls.

### Requirement 4: Token Efficiency Tracking

**User Story:** As a user, I want the system to measure how efficiently the agent uses context tokens, so that I can optimize prompts and context management to reduce waste.

#### Acceptance Criteria

1. The Token_Efficiency_Tracker SHALL record context token usage per API request turn by integrating with `getApiMetrics()` from `src/shared/getApiMetrics.ts`, which provides `contextTokens`, `totalTokensIn`, `totalTokensOut`, `totalCacheWrites`, and `totalCacheReads`.
2. The Token_Efficiency_Tracker SHALL compute `cacheHitRate = totalCacheWrites / (totalCacheWrites + totalCacheReads)` per task, measuring how effectively the prompt cache is utilized.
3. The Token_Efficiency_Tracker SHALL compute `contextUtilizationRate = contextTokens / contextWindow` per API request turn, where `contextWindow` is obtained from the model configuration.
4. The Token_Efficiency_Tracker SHALL compute `tokenEfficiencyRate = usefulContextTokens / totalContextTokens` per task, where `usefulContextTokens` is approximated as the context tokens from turns that produced at least one successful tool call.
5. The Token_Efficiency_Tracker SHALL integrate with `processUsageMetrics()` in `src/api/providers/base-openai-compatible-provider.ts` — when `processUsageMetrics()` processes a response, the token efficiency tracker SHALL receive the usage data.
6. The Token_Efficiency_Tracker SHALL track token waste from failed tool calls — context tokens from turns where all tool calls failed SHALL be counted as "wasted context".
7. WHEN a new task starts, the Token_Efficiency_Tracker SHALL reset all counters to zero.
8. The Token_Efficiency_Tracker SHALL emit a `RooCodeEventName` event via `ClineProvider.emit()` when the per-task token efficiency rate drops below 0.3 (30%), including the current rate and total wasted context tokens.

### Requirement 5: Recovery Rate Tracking

**User Story:** As a user, I want the system to measure how effectively the agent recovers from failures, so that I can understand whether the agent can self-correct or gets stuck after errors.

#### Acceptance Criteria

1. The Recovery_Rate_Tracker SHALL record a "failure event" when `consecutiveMistakeCount` (line 313 of `src/core/task/Task.ts`) increments, when `didToolFailInCurrentTurn` (line 378) is set to `true`, or when `recordToolError()` (line 4512) is called.
2. The Recovery_Rate_Tracker SHALL classify a failure as "recovered" when the agent subsequently produces a successful tool call within the next 3 turns (i.e., `consecutiveMistakeCount` resets to 0 or a tool call succeeds).
3. The Recovery_Rate_Tracker SHALL classify a failure as "unrecovered" when `consecutiveMistakeCount` reaches the maximum retry threshold (currently 3) without a successful tool call, or when the task is terminated with `consecutiveMistakeCount > 0`.
4. The Recovery_Rate_Tracker SHALL compute `recoveryRate = recoveredFailures / totalFailures` per task.
5. The Recovery_Rate_Tracker SHALL integrate with the existing `InterventionEffectivenessTracker` in `src/core/loop-detection/InterventionEffectivenessTracker.ts` — when a loop-breaking intervention is applied, the recovery tracker SHALL measure whether the agent recovers within the next 5 turns.
6. The Recovery_Rate_Tracker SHALL integrate with the existing `AdaptationFailureDetector` in `src/core/loop-detection/AdaptationFailureDetector.ts` — adaptation failures SHALL be recorded as a separate failure subtype with their own recovery tracking.
7. WHEN a new task starts, the Recovery_Rate_Tracker SHALL reset all counters to zero.
8. The Recovery_Rate_Tracker SHALL emit a `RooCodeEventName` event via `ClineProvider.emit()` when a failure transitions to "recovered" or "unrecovered", including the failure type, number of recovery attempts, and outcome.

### Requirement 6: Metrics Aggregation and Persistence

**User Story:** As a user, I want reliability metrics aggregated across tasks and persisted with task metadata, so that I can track trends over time and review metrics for past tasks.

#### Acceptance Criteria

1. The Metrics_Aggregator SHALL collect per-task metric samples from all five metric families (Diagnosis Accuracy, Hallucinated Edit Rate, Tool Efficiency, Token Efficiency, Recovery Rate) at task completion or task termination.
2. The Metrics_Aggregator SHALL compute per-task aggregate values: `diagnosisAccuracyRate`, `hallucinatedEditRate`, `toolEfficiencyRate`, `tokenEfficiencyRate`, and `recoveryRate`, each as a number between 0 and 1.
3. The Metrics_Aggregator SHALL persist per-task metrics alongside existing task metadata in `src/core/task-persistence/taskMetadata.ts`, adding a `reliabilityMetrics` field to the `TaskMetadata` interface.
4. The Metrics_Aggregator SHALL compute session-level aggregates (mean, min, max, count) across all tasks in the current session, stored in memory and available via a programmatic interface.
5. The Metrics_Aggregator SHALL integrate with `getTaskWithAggregatedCosts` in `src/core/webview/webviewMessageHandler.ts` — the existing cost aggregation function SHALL be extended to include reliability metrics alongside cost data.
6. WHEN a task is resumed from persisted state, the Metrics_Aggregator SHALL restore the per-task metrics from the `reliabilityMetrics` field in the task metadata.
7. The Metrics_Aggregator SHALL emit a `RooCodeEventName` event via `ClineProvider.emit()` when task metrics are finalized, including the task ID and all five aggregate values.

### Requirement 7: Metrics Display in TaskHeader

**User Story:** As a user, I want to see reliability metrics displayed in the task header alongside cost and token information, so that I can quickly assess agent reliability for each task.

#### Acceptance Criteria

1. The TaskHeader_Extension SHALL add a reliability metrics section to the `TaskHeader` component in `webview-ui/src/components/chat/TaskHeader.tsx`, displayed when expanded (i.e., when `isTaskExpanded` is `true`).
2. The TaskHeader_Extension SHALL display the following metrics as compact, human-readable values:
   - Diagnosis Accuracy: percentage with a checkmark icon when >= 80%
   - Hallucinated Edit Rate: percentage with a warning icon when >= 20%
   - Tool Efficiency: percentage with a checkmark icon when >= 80%
   - Token Efficiency: percentage with a checkmark icon when >= 50%
   - Recovery Rate: percentage with a checkmark icon when >= 70%
3. The TaskHeader_Extension SHALL receive reliability metrics via the `TaskHeaderProps` interface, adding a new optional `reliabilityMetrics` prop of type `TaskReliabilityMetrics`.
4. The TaskHeader_Extension SHALL pass the `reliabilityMetrics` prop from `ChatView.tsx` (where `getTaskWithAggregatedCosts` is called) to the `TaskHeader` component.
5. The TaskHeader_Extension SHALL display metrics with color coding: green for good (above threshold), yellow for warning (within 20% of threshold), red for poor (below threshold).
6. WHEN reliability metrics are not available (e.g., for tasks started before this feature), the TaskHeader_Extension SHALL display a "No metrics available" placeholder instead of the metrics section.
7. The TaskHeader_Extension SHALL use Tailwind CSS classes for all styling, following the existing patterns in the component.

### Requirement 8: Configuration

**User Story:** As a system administrator, I want configurable metrics parameters so that I can enable, disable, or tune the metrics system for different use cases.

#### Acceptance Criteria

1. The Configuration_Manager SHALL add an `agentReliabilityMetrics` section to the global settings schema in `packages/types/src/global-settings.ts` with the following parameters:
   - `enabled`: boolean (default: `false`) — enables or disables the entire metrics system
   - `trackDiagnosisAccuracy`: boolean (default: `true`) — enables or disables diagnosis accuracy tracking
   - `trackHallucinatedEdits`: boolean (default: `true`) — enables or disables hallucinated edit detection
   - `trackToolEfficiency`: boolean (default: `true`) — enables or disables tool efficiency tracking
   - `trackTokenEfficiency`: boolean (default: `true`) — enables or disables token efficiency tracking
   - `trackRecoveryRate`: boolean (default: `true`) — enables or disables recovery rate tracking
   - `emitEvents`: boolean (default: `true`) — enables or disables event emission via `CooCodeEventName`
   - `perTaskRetentionLimit`: number (default: `1000`, range: `100` to `10000`) — maximum number of metric samples to retain in memory per task
2. WHEN `enabled` is `false`, the system SHALL operate with no metrics overhead — no metric samples SHALL be recorded, no events SHALL be emitted, and no metrics SHALL be displayed.
3. WHEN configuration values are not explicitly set, the Configuration_Manager SHALL use documented default values.
4. The Configuration_Manager SHALL validate each parameter independently and accept valid parameters while rejecting only invalid parameters with an error log containing the parameter name and invalid value.
5. The Configuration_Manager SHALL apply runtime configuration updates within 1 second without requiring agent restart.

### Requirement 9: Observability

**User Story:** As a system administrator, I want visibility into metrics collection behavior so that I can monitor effectiveness and troubleshoot issues.

#### Acceptance Criteria

1. The Observability_Logger SHALL log the following events with timestamp and relevant values:
   - Metric sample recorded (metric family, sample type, value)
   - Diagnosis outcome (diagnosis hash, outcome: confirmed/refuted)
   - Hallucinated edit detected (file path, error type)
   - Tool efficiency alert (current rate, total calls)
   - Token efficiency alert (current rate, wasted tokens)
   - Recovery outcome (failure type, outcome: recovered/unrecovered, attempts)
   - Metrics finalized (task ID, all five aggregate values)
2. The Observability_Logger SHALL provide metrics including: total metric samples per family per task, total diagnoses (confirmed/refuted), total hallucinated edits, total tool calls (successful/failed), total context tokens (useful/wasted), total failures (recovered/unrecovered).
3. The Observability_Logger SHALL expose metrics as structured key-value entries containing a timestamp, metric name, and numeric value.
4. The Observability_Logger SHALL exclude the following from all log entries: user message text, file contents, tool parameters containing user input, and diagnosis text (only the hash is logged).

## Out of Scope

- **Cross-session metrics persistence**: Metrics are persisted per-task and aggregated per-session only; long-term cross-session storage in external databases is out of scope.
- **Metrics visualization dashboards**: This phase focuses on per-task display in the TaskHeader; dedicated analytics dashboards are out of scope.
- **Automated metrics-driven prompt optimization**: The system collects and displays metrics but does not automatically modify prompts based on them.
- **Multi-agent metrics aggregation**: Metrics are scoped to individual agent instances; cross-agent aggregation for swarm/delegated tasks is out of scope.
- **Real-time metrics streaming**: Metrics are computed at tool execution time and aggregated at task completion; real-time streaming to external monitoring systems is out of scope.
- **LLM-based diagnosis verification**: Diagnosis confirmation is determined by tool execution outcomes (successful edit + test), not by LLM evaluation of the diagnosis quality.

## Acceptance Criteria Summary

| Req ID | Description | Key Criteria |
|--------|-------------|--------------|
| REQ-1 | Diagnosis Accuracy Tracking | Pattern-based diagnosis detection, confirmed/refuted via tool outcomes, rate computation |
| REQ-2 | Hallucinated Edit Rate Tracking | Edit claim verification via tool results, integration with consecutiveMistakeCountForEditFile |
| REQ-3 | Tool Efficiency Tracking | Per-tool success/failure tracking, AutoApprovalHandler integration, rate computation |
| REQ-4 | Token Efficiency Tracking | Cache hit rate, context utilization, useful context approximation, waste tracking |
| REQ-5 | Recovery Rate Tracking | Failure/recovery classification, integration with InterventionEffectivenessTracker |
| REQ-6 | Metrics Aggregation and Persistence | Per-task aggregates, session-level aggregates, task metadata persistence |
| REQ-7 | Metrics Display in TaskHeader | Compact display with color coding, threshold-based icons, graceful fallback |
| REQ-8 | Configuration | Enable/disable/tune via global settings with zod schema, per-family toggles |
| REQ-9 | Observability | Structured logging for all metric operations, sensitive data exclusion |
