# Requirements Document

## Introduction

The Agent State Management feature replaces the current implicit state model — where the agent's notion of reality is derived solely from conversation history — with an explicit, deterministic Execution State Graph. Every action produces verifiable evidence, and the system validates agent claims against that evidence before accepting them. This eliminates the root cause of agent unreliability: the agent's ability to claim "diagnosed", "fixed", "tested", "committed", or "pushed" when none of those actions actually occurred.

This feature integrates with the existing loop-detection infrastructure in `src/core/loop-detection/` and the task execution loop in `src/core/task/Task.ts`. All state transitions are deterministic — no LLM calls are made to infer state. Tools update state; the agent never does.

## Glossary

- **Agent**: An AI-powered assistant that processes user requests and executes tasks using available tools and reasoning capabilities.
- **Execution State Graph**: A deterministic, machine-maintained representation of where the agent is in the task lifecycle (diagnosis, implementation, testing, VCS).
- **Evidence**: A verifiable record that a specific action (file read, file edit, command execution, test run, git commit, git push) actually occurred, produced by the tool execution layer.
- **Claim Validation**: The process of verifying that the agent's textual claims ("Fix applied", "Tests passing") match the evidence registry before accepting them as true.
- **Completion Validation**: The process of verifying that all required phases (diagnosis confirmed, implementation verified, testing passed) have reached their required states before allowing the agent to declare a task complete.
- **Context Condensation**: The process of summarizing and condensing reasoning history into a compact representation via `summarizeConversation()` in `src/core/condense/index.ts`.
- **Evidence Summary**: A condensed representation of the evidence registry that survives context condensation, preserving the fact that actions occurred without preserving full detail.
- **Task Execution Loop**: The core agentic loop in `recursivelyMakeClineRequests()` (line 2452 of `src/core/task/Task.ts`) that processes assistant messages, executes tools, and accumulates results.
- **NativeToolCallParser**: The streaming tool call parser in `src/core/assistant-message/NativeToolCallParser.ts` that processes tool call events during API streaming.
- **presentAssistantMessage**: The function in `src/core/assistant-message/` that sequentially executes tool calls and accumulates results into `userMessageContent`.

## Requirements

### Requirement 1: Execution State Graph

**User Story:** As a user, I want the system to maintain an explicit, deterministic record of task execution progress so that the agent cannot claim it has completed steps it has not actually performed.

#### Acceptance Criteria

1. THE Execution_State_Graph SHALL maintain the following phase states with the specified valid values:
   - `diagnosis.status`: `"not_started" | "investigating" | "hypothesis" | "confirmed"`
   - `implementation.status`: `"not_started" | "editing" | "edited" | "verified"`
   - `testing.status`: `"not_started" | "running" | "passed" | "failed"`
   - `vcs.status`: `"none" | "committed" | "pushed"`
2. THE Execution_State_Graph SHALL initialize all phases to their `"not_started"` (or `"none"` for `vcs`) values when a new task begins.
3. THE Execution_State_Graph SHALL only be updated by tool execution events — the agent's textual claims SHALL NOT directly modify state.
4. WHEN a tool execution event is received, THE Execution_State_Graph SHALL deterministically compute the new state based on the tool type and result, without any LLM inference.
5. THE Execution_State_Graph SHALL be serializable to JSON and persisted as part of the task state (for task resume across sessions).
6. IF the agent session terminates and resumes, THEN THE Execution_State_Graph SHALL be restored from persisted state.

### Requirement 2: Evidence Registry

**User Story:** As a user, I want every agent action to produce a verifiable evidence record so that the system can distinguish between actions the agent claims to have taken and actions it actually took.

#### Acceptance Criteria

1. THE Evidence_Registry SHALL record an evidence entry for every tool execution with the following attributes:
   - `id`: unique string identifier (UUID v4)
   - `timestamp`: Unix epoch milliseconds
   - `type`: one of `"file_read" | "file_edit" | "command" | "test" | "git_commit" | "git_push"`
   - `payload`: structured data containing tool-specific details (e.g., file path for file_edit, exit code for command, commit hash for git_commit)
2. THE Evidence_Registry SHALL store evidence entries in chronological order.
3. THE Evidence_Registry SHALL be append-only — evidence entries cannot be modified or deleted after creation.
4. WHEN a tool execution completes successfully, THE Evidence_Registry SHALL record the evidence entry before the result is returned to the agent.
5. WHEN a tool execution fails, THE Evidence_Registry SHALL record the evidence entry with the failure details in the payload.
6. THE Evidence_Registry SHALL be accessible via a programmatic interface for claim validation and observability.
7. THE Evidence_Registry SHALL be serializable to JSON and persisted as part of the task state.

### Requirement 3: Claim Validation Layer

**User Story:** As a user, I want the system to reject the agent's claims about actions taken when no evidence exists, preventing false progress reports.

#### Acceptance Criteria

1. THE Claim_Validator SHALL maintain a mapping from claim types to required evidence types:
   - `"fix_applied"` requires evidence of type `"file_edit"`
   - `"tests_passed"` requires evidence of type `"test"` with payload indicating success (exit code 0)
   - `"committed"` requires evidence of type `"git_commit"`
   - `"pushed"` requires evidence of type `"git_push"`
2. WHEN the agent outputs a claim (e.g., "Fix applied", "Tests passing"), THE Claim_Validator SHALL check the Evidence_Registry for matching evidence.
3. IF no matching evidence exists for a claim, THEN THE Claim_Validator SHALL reject the claim and inject a corrective message into the conversation indicating the claim could not be verified.
4. IF matching evidence exists for a claim, THEN THE Claim_Validator SHALL accept the claim and allow it to proceed.
5. THE Claim_Validator SHALL operate deterministically — no LLM calls are made to validate claims.
6. THE Claim_Validator SHALL log all claim validation results (accepted/rejected) for observability, including the claim text, required evidence type, and validation outcome.

### Requirement 4: Completion Validator

**User Story:** As a user, I want the system to prevent the agent from declaring a task complete unless all required phases have actually been completed, so that I am not misled into thinking an issue is resolved when it is not.

#### Acceptance Criteria

1. THE Completion_Validator SHALL require the following conditions to be met before allowing the agent to declare a task resolved:
   - `diagnosis.status === "confirmed"`
   - `implementation.status === "verified"`
   - `testing.status === "passed"`
2. WHEN the agent calls `attempt_completion` or outputs language indicating task resolution, THE Completion_Validator SHALL check the Execution_State_Graph for the required conditions.
3. IF the required conditions are not met, THEN THE Completion_Validator SHALL block the completion and inject a message specifying which phases have not reached their required states.
4. IF the required conditions are met, THEN THE Completion_Validator SHALL allow the completion to proceed.
5. THE Completion_Validator SHALL operate deterministically — no LLM calls are made to validate completion.
6. THE Completion_Validator SHALL log all completion validation attempts with timestamp, current state, and validation outcome.

### Requirement 5: Evidence Survival Through Condensation

**User Story:** As a user, I want evidence of actions taken to survive context condensation so that the agent (and the system) can still verify what happened after context is compressed.

#### Acceptance Criteria

1. THE Evidence_Summarizer SHALL produce an evidence summary from the Evidence_Registry containing:
   - Count of evidence entries by type
   - List of unique file paths from `"file_edit"` evidence
   - List of unique file paths from `"file_read"` evidence
   - Most recent `"test"` evidence result (pass/fail)
   - Most recent `"git_commit"` evidence (commit hash)
   - Most recent `"git_push"` evidence (remote/branch)
2. WHEN context condensation is triggered (via `summarizeConversation()` in `src/core/condense/index.ts`), THE Evidence_Summarizer SHALL generate the evidence summary and inject it into the condensation prompt as structured context.
3. THE evidence summary SHALL be included in the condensed summary output so that post-condensation, the agent and system retain knowledge of what actions were taken.
4. THE Execution_State_Graph state SHALL be preserved across condensation — the state graph is not reset or modified during condensation.
5. IF condensation fails, THEN THE Evidence_Registry and Execution_State_Graph SHALL remain unchanged.

### Requirement 6: Integration with Task Execution Loop

**User Story:** As a developer, I want the state management system integrated into the existing task execution loop so that state tracking happens automatically during normal agent operation.

#### Acceptance Criteria

1. THE Task_Execution_Loop (`recursivelyMakeClineRequests` in `src/core/task/Task.ts`) SHALL initialize the Execution_State_Graph and Evidence_Registry at the start of each task.
2. WHEN `presentAssistantMessage` executes a tool and produces a result, THE system SHALL extract the tool execution event and update both the Evidence_Registry and Execution_State_Graph.
3. THE state update SHALL happen synchronously as part of the tool execution pipeline — the agent cannot proceed to the next turn without state being updated.
4. THE Execution_State_Graph SHALL be included in the environment details injected into every API request via `getEnvironmentDetails()` in `src/core/environment/getEnvironmentDetails.ts`, so the agent always sees the current machine state.
5. THE state management system SHALL integrate with the existing `SemanticLoopDetector` in `src/core/loop-detection/SemanticLoopDetector.ts` — the loop detector SHALL be able to consume Execution_State_Graph transitions as additional signals for progress detection.
6. THE state management system SHALL NOT introduce blocking operations or additional API calls into the task execution loop.

### Requirement 7: Configuration

**User Story:** As a system administrator, I want configurable state management parameters so that I can enable, disable, or tune the feature for different use cases.

#### Acceptance Criteria

1. THE Configuration_Manager SHALL add an `agentStateManagement` section to the global settings schema in `packages/types/src/global-settings.ts` with the following parameters:
   - `enabled`: boolean (default: `false`) — enables or disables the entire state management system
   - `validateClaims`: boolean (default: `true`) — enables or disables claim validation
   - `validateCompletion`: boolean (default: `true`) — enables or disables completion validation
   - `evidenceRetentionLimit`: number (default: `1000`, range: `100` to `10000`) — maximum number of evidence entries to retain in memory per task
2. WHEN `enabled` is `false`, THE system SHALL operate with no state tracking overhead — the Execution_State_Graph and Evidence_Registry SHALL not be instantiated.
3. WHEN configuration values are not explicitly set, THE Configuration_Manager SHALL use documented default values.
4. THE Configuration_Manager SHALL validate each parameter independently and accept valid parameters while rejecting only invalid parameters with an error log containing the parameter name and invalid value.
5. THE Configuration_Manager SHALL apply runtime configuration updates within 1 second without requiring agent restart.

### Requirement 8: Observability

**User Story:** As a system administrator, I want visibility into state management behavior so that I can monitor effectiveness and troubleshoot issues.

#### Acceptance Criteria

1. THE Observability_Logger SHALL log the following events with timestamp and relevant values:
   - State transition (phase, old status, new status, triggering evidence ID)
   - Claim validation (claim type, required evidence, outcome)
   - Completion validation (current state, required state, outcome)
   - Evidence registry overflow (when `evidenceRetentionLimit` is reached)
   - Condensation with evidence summary (evidence count before/after summarization)
2. THE Observability_Logger SHALL provide metrics including: total state transitions per task, total claims validated (accepted/rejected), total completion validations (allowed/blocked), and evidence registry size.
3. THE Observability_Logger SHALL expose metrics as structured key-value entries containing a timestamp, metric name, and numeric value.
4. THE Observability_Logger SHALL exclude the following from all log entries: user message text, file contents, tool parameters containing user input, and evidence payloads larger than 1KB.

## Out of Scope

- **Multi-agent state coordination**: State management for swarm/delegated tasks is covered in the Swarm Architecture spec.
- **State persistence to external databases**: State is persisted to task files only; no external database integration.
- **State visualization UI**: A future phase may add UI indicators for state, but this phase focuses on the backend system.
- **Automatic state rollback**: The system detects and reports invalid claims but does not automatically revert agent actions.
- **Cross-task evidence aggregation**: Evidence is scoped to individual tasks; cross-task analytics are out of scope.
- **LLM-based state inference**: All state transitions are deterministic; no ML models are used to infer state from agent text.

## Acceptance Criteria Summary

| Req ID | Description | Key Criteria |
|--------|-------------|--------------|
| REQ-1 | Execution State Graph | Deterministic state tracking across 4 phases, serializable, persisted |
| REQ-2 | Evidence Registry | Append-only evidence records for every tool execution |
| REQ-3 | Claim Validation | Reject agent claims without supporting evidence |
| REQ-4 | Completion Validation | Block task completion unless all phases reach required states |
| REQ-5 | Evidence Survival | Evidence summaries preserved through context condensation |
| REQ-6 | Task Loop Integration | State updates synchronous in tool execution pipeline |
| REQ-7 | Configuration | Enable/disable/tune via global settings with zod schema |
| REQ-8 | Observability | Structured logging and metrics for all state operations |
