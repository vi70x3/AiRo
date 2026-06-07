# Requirements Document

## Introduction

The Long-Horizon Memory feature provides agents with a structured, persistent memory that survives context condensation. Instead of injecting the full todo list and raw conversation history into every agent turn, the system injects a compressed summary of the agent's objective, findings, hypotheses, edits, tests, and blockers. This eliminates the repeated injection of redundant context, preserves structured information across condensations, and enables the agent to "remember" what it learned 50 turns ago without re-reading the conversation.

## Glossary

- **Agent**: An AI-powered assistant that processes user requests and executes tasks using available tools and reasoning capabilities.
- **TaskMemory**: A structured summary of a task's progress, containing objective, findings, hypotheses, edits, tests, and blockers. Stored outside conversation history to survive condensation.
- **Memory Compaction**: The process of archiving old or resolved findings from TaskMemory to keep the injected summary within token budgets.
- **Compressed Summary**: A minimal representation of TaskMemory injected into the agent's context, containing only the most essential fields (objective, top finding, status).
- **Context Condensation**: The process of summarizing and condensing conversation history into a compact representation via the condense system.
- **Task Metadata**: Persistent data stored per-task in the task directory, including file context tracking data and TaskMemory.
- **FileContextTracker**: The existing system that tracks files read/edited during a task and persists them as task metadata.
- **Condense**: The operation that replaces conversation history with a flat text summary when context limits are approached.

## Requirements

### Requirement 1: TaskMemory Data Model

**User Story:** As a user, I want the agent to maintain a structured memory of task progress so that critical information is not lost when context is condensed.

#### Acceptance Criteria

1. THE TaskMemory system SHALL define a `TaskMemory` interface containing the following fields: `objective` (string, non-empty), `findings` (array of strings, each non-empty), `hypotheses` (array of strings, each non-empty), `edits` (array of strings describing file changes, each non-empty), `tests` (array of strings describing test results, each non-empty), and `blockers` (array of strings, each non-empty).
2. THE TaskMemory system SHALL define a `TaskMemoryStatus` enum with values: `active`, `diagnosis_confirmed`, `resolved`, and `abandoned`.
3. THE TaskMemory system SHALL define a `CompressedSummary` interface containing: `objective` (string), `finding` (string — the most recent or highest-priority finding), and `status` (TaskMemoryStatus).
4. THE TaskMemory system SHALL store all new types in `packages/types/src/loop-detection.ts`.
5. THE TaskMemory system SHALL define a zod schema `taskMemorySchema` for serialization and validation of TaskMemory objects.
6. THE TaskMemory system SHALL define a zod schema `compressedSummarySchema` for serialization and validation of CompressedSummary objects.
7. IF a TaskMemory object fails validation against the zod schema, THEN THE system SHALL reject the object and log an error with the validation failure details.

### Requirement 2: TaskMemory Storage and Persistence

**User Story:** As a user, I want task memory to persist across context condensations and task resume operations so that the agent can pick up where it left off.

#### Acceptance Criteria

1. THE TaskMemory storage SHALL persist TaskMemory as part of the task metadata stored in the task directory (alongside the existing `files_in_context` data).
2. THE TaskMemory storage SHALL serialize TaskMemory to JSON for persistence, ensuring compatibility with the existing task persistence mechanism (`safeWriteJson`).
3. THE TaskMemory storage SHALL deserialize TaskMemory from JSON on task resume, restoring the full structured memory.
4. THE TaskMemory storage SHALL store TaskMemory in a dedicated field `task_memory` within the task metadata file, separate from `files_in_context`.
5. WHEN a task is resumed from history, THE TaskMemory storage SHALL load the persisted TaskMemory and make it available for compressed summary injection.
6. IF no TaskMemory exists for a task (legacy or new task), THEN THE TaskMemory storage SHALL initialize an empty TaskMemory with an empty `objective` and empty arrays for all list fields.
7. THE TaskMemory storage SHALL use atomic write operations (safeWriteJson) to prevent corruption during concurrent access.

### Requirement 3: TaskMemory Updates via Tool Signals

**User Story:** As a user, I want task memory to be updated automatically based on concrete tool signals so that the memory reflects actual progress rather than agent claims.

#### Acceptance Criteria

1. THE TaskMemory update mechanism SHALL add to `findings` when a tool result contains evidence of a previously unknown state (e.g., search results revealing a bug, file read revealing unexpected content).
2. THE TaskMemory update mechanism SHALL add to `edits` when a file write, edit, or diff operation completes successfully (e.g., `"ChatRow.tsx: added expansion logic"`).
3. THE TaskMemory update mechanism SHALL add to `tests` when a test execution completes, recording the result (e.g., `"vitest: passed 12/12 tests"` or `"vitest: failed — 1 test timeout"`).
4. THE TaskMemory update mechanism SHALL add to `blockers` when a tool execution fails with an error that prevents forward progress (e.g., `"build failed: missing dependency X"`).
5. THE TaskMemory update mechanism SHALL remove from `blockers` when a subsequent action resolves the blocker.
6. THE TaskMemory update mechanism SHALL set `objective` from the initial user request or from an explicit `attempt_completion` task description.
7. THE TaskMemory update mechanism SHALL NOT update TaskMemory based on agent textual claims alone — updates MUST be triggered by tool result signals (file operations, test executions, search results, error responses).
8. WHEN a finding is superseded by new evidence, THE TaskMemory update mechanism SHALL archive the old finding rather than deleting it, preserving the reasoning history.

### Requirement 4: Compressed Summary Injection

**User Story:** As a user, I want the agent to receive a compressed summary of task memory instead of full conversation history so that context is used efficiently.

#### Acceptance Criteria

1. THE Compressed Summary injection SHALL generate a `CompressedSummary` from the current TaskMemory, containing only: the `objective`, the most recent or highest-priority `finding`, and the current `status`.
2. THE Compressed Summary injection SHALL inject the compressed summary into the agent's context as a structured JSON block within a `<task_memory>` tag.
3. THE Compressed Summary injection SHALL inject the compressed summary at the beginning of the agent's context (after the system prompt, before conversation history).
4. THE Compressed Summary injection SHALL limit the injected summary to a maximum of 200 tokens to minimize context overhead.
5. WHEN the full TaskMemory contains more than 5 findings, THE Compressed Summary injection SHALL include only the 3 most recent findings in the compressed summary.
6. WHEN the full TaskMemory contains more than 3 blockers, THE Compressed Summary injection SHALL include only the 2 highest-priority blockers in the compressed summary.
7. THE Compressed Summary injection SHALL NOT inject the full conversation history, full todo list, or raw tool outputs — only the compressed summary.

### Requirement 5: Memory Compaction

**User Story:** As a user, I want old findings to be automatically archived so that the task memory remains manageable over long-running tasks.

#### Acceptance Criteria

1. THE Memory Compaction mechanism SHALL archive findings that have been marked as `resolved` or `abandoned` when the total number of findings exceeds a configurable threshold (default: 20).
2. THE Memory Compaction mechanism SHALL archive edits older than a configurable number of turns (default: 30 turns) from the current position.
3. THE Memory Compaction mechanism SHALL move archived items to an `archivedFindings` and `archivedEdits` array within TaskMemory, preserving them without injecting them into context.
4. THE Memory Compaction mechanism SHALL run automatically before each compressed summary injection.
5. THE Memory Compaction mechanism SHALL be configurable via `memoryCompaction` settings: `maxFindings` (range: 5-100, default: 20), `maxEdits` (range: 10-200, default: 50), `archiveAfterTurns` (range: 5-100, default: 30).
6. IF memory compaction is disabled via configuration, THEN THE system SHALL skip compaction and inject the full (uncompressed) findings and edits up to the token limit.

### Requirement 6: Configuration

**User Story:** As a system administrator, I want configurable long-horizon memory parameters so that I can tune the feature for different task complexities and context budgets.

#### Acceptance Criteria

1. THE Configuration system SHALL add a `longHorizonMemory` field to the `globalSettingsSchema` in `packages/types/src/global-settings.ts`.
2. THE `longHorizonMemory` configuration SHALL contain: `enabled` (boolean, default: true), `maxFindings` (number, range: 5-100, default: 20), `maxEdits` (number, range: 10-200, default: 50), `archiveAfterTurns` (number, range: 5-100, default: 30), `injectionTokenLimit` (number, range: 50-500, default: 200), and `compactBeforeInjection` (boolean, default: true).
3. THE Configuration system SHALL use zod schemas with `.optional().default()` following the existing pattern in `global-settings.ts`.
4. WHEN `enabled` is false, THE system SHALL NOT create, update, or inject TaskMemory.
5. THE Configuration system SHALL validate each parameter independently and accept valid parameters while rejecting only invalid parameters.
6. IF an invalid configuration value is provided, THEN THE system SHALL fall back to the default value for that parameter and log a warning.

### Requirement 7: Integration with Condensation

**User Story:** As a user, I want task memory to survive context condensation so that the agent retains structured knowledge after the conversation is summarized.

#### Acceptance Criteria

1. THE Condensation integration SHALL preserve TaskMemory in task metadata when `summarizeConversation()` is called — TaskMemory SHALL NOT be modified by the condensation process.
2. THE Condensation integration SHALL include the compressed summary as part of the condensation summary text, ensuring the LLM-generated summary references the structured memory.
3. AFTER condensation completes, THE system SHALL re-inject the compressed summary into the agent's context on the next turn.
4. THE Condensation integration SHALL pass the current TaskMemory to `summarizeConversation()` via the `SummarizeConversationOptions` metadata, so the LLM summary can reference findings, edits, and blockers.
5. IF condensation fails, THEN THE TaskMemory SHALL remain unchanged and available for the next condensation attempt.

### Requirement 8: Observability

**User Story:** As a system administrator, I want visibility into TaskMemory operations so that I can monitor memory health and troubleshoot issues.

#### Acceptance Criteria

1. THE Observability system SHALL log the following events with timestamp: TaskMemory created, TaskMemory updated (including which field was modified), TaskMemory compacted (including counts of archived items), compressed summary injected (including token count), and TaskMemory loaded from persistence.
2. THE Observability system SHALL provide metrics including: total TaskMemory updates per session, total compactions per session, average compressed summary token count, and TaskMemory size (total items across all fields).
3. THE Observability system SHALL exclude the following from all log entries: file contents, user message text, tool parameters containing user input, and full conversation history.
4. THE Observability system SHALL expose metrics as structured key-value entries containing a timestamp, metric name, and numeric value.

## Out of Scope

1. Cross-task memory sharing — TaskMemory is scoped to a single task and is not shared between parent/child tasks.
2. Memory-based task routing — TaskMemory does not influence task delegation or worktree decisions.
3. Automatic hypothesis generation — The system records hypotheses but does not generate them autonomously.
4. Memory export/import — TaskMemory is not exported or imported independently of the task persistence mechanism.
5. Vector-based memory retrieval — All memory operations are in-memory; no embedding or vector database integration.
6. Memory encryption — TaskMemory is stored as plain JSON; encryption is handled at the storage layer if needed.

## Acceptance Criteria Summary

| Req ID | Description | Key Criteria |
|--------|-------------|--------------|
| R1 | TaskMemory Data Model | 7 criteria — interface, enum, compressed summary, zod schemas, validation |
| R2 | Storage and Persistence | 7 criteria — task directory, JSON serialization, atomic writes, backward compatibility |
| R3 | Updates via Tool Signals | 8 criteria — findings, edits, tests, blockers, objective, signal-based only, archiving |
| R4 | Compressed Summary Injection | 7 criteria — JSON block, token limit, priority filtering, no full history |
| R5 | Memory Compaction | 6 criteria — auto-archive, configurable thresholds, archived arrays |
| R6 | Configuration | 5 criteria — globalSettingsSchema, zod defaults, enable/disable |
| R7 | Integration with Condensation | 5 criteria — survive condense, include in summary, re-inject after condense |
| R8 | Observability | 4 criteria — event logging, metrics, structured entries, content exclusion |
