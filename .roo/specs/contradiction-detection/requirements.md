# Requirements: Contradiction Detection

## Introduction

The Contradiction Detection feature implements a claim-evidence consistency checker that validates the agent's textual claims against the evidence registry from Phase 1 (Agent State Management). Currently, the agent can claim "Fix applied", "Tests passing", "Feature implemented", or "Code committed" without any supporting evidence — and the system accepts these claims without verification. This is the core mechanism of agent self-deception: the agent states things that aren't true, and nothing in the system catches it.

This feature implements a **pure-function contradiction engine** that extracts claims from the agent's `say()` messages and `attempt_completion` results, checks each claim against the evidence registry, and injects `<contradiction_warning>` blocks into the agent's context when claims are unsupported or contradicted by evidence. The detector runs after `presentAssistantMessage()` processes tool calls but before the agent's next API request is sent.

The contradiction engine does not block the agent from continuing — it flags contradictions as warnings that the agent must acknowledge and resolve. This non-blocking design ensures the agent can still proceed (perhaps to gather more evidence) while making it impossible to ignore contradictions.

The engine integrates with the existing evidence registry from Phase 1 (which records `file_read`, `file_edit`, `command`, `test`, `git_commit`, `git_push` evidence), the `say()` method in [Task.ts](src/core/task/Task.ts#1701), the `AttemptCompletionTool` in [AttemptCompletionTool.ts](src/core/tools/AttemptCompletionTool.ts), and the `presentAssistantMessage()` function in [presentAssistantMessage.ts](src/core/assistant-message/presentAssistantMessage.ts).

## Glossary

- **Agent**: An AI-powered assistant that processes user requests and executes tasks using available tools and reasoning capabilities.
- **Claim**: A textual statement by the agent asserting that an action was performed or a state was achieved (e.g., "Fix applied", "Tests passing", "Feature implemented").
- **Claim Extraction**: The process of parsing agent messages to identify claims that require evidence validation.
- **Evidence**: A verifiable record from the Phase 1 evidence registry that a specific action actually occurred (file read, file edit, command execution, test run, git commit, git push).
- **Evidence Registry**: The append-only store from Phase 1 (Agent State Management) that records all tool execution events with timestamps and payloads.
- **Contradiction**: A state where a claim lacks supporting evidence, or where evidence directly contradicts the claim.
- **Contradiction Engine**: The pure-function module that checks claims against evidence and produces contradiction results.
- **Contradiction Warning**: An XML block (`<contradiction_warning>`) injected into the agent's context when a contradiction is detected.
- **Claim Type**: A category of claim that maps to a specific evidence type (e.g., "fix_applied" maps to "file_edit" evidence).
- **say()**: The method in [Task.ts](src/core/task/Task.ts#1701) that the agent uses to output text messages. Accepts any `ClineSay` type and text without validation.
- **attempt_completion**: The tool the agent calls to declare a task complete, implemented in [AttemptCompletionTool.ts](src/core/tools/AttemptCompletionTool.ts).
- **presentAssistantMessage()**: The function in [presentAssistantMessage.ts](src/core/assistant-message/presentAssistantMessage.ts#60) that processes the agent's assistant message and executes tool calls.
- **ClineSay**: The enum of say types in [message.ts](packages/types/src/message.ts#141) including `text`, `completion_result`, `error`, etc.
- **ClineMessage**: The full message type in [message.ts](packages/types/src/message.ts#246) with `type`, `say`, `ask`, `text`, and other fields.
- **pushToolResult()**: The method in [presentAssistantMessage.ts](src/core/assistant-message/presentAssistantMessage.ts) that pushes tool results back to the agent.
- **Execution State Graph**: The deterministic state tracker from Phase 1 that maintains phase states (diagnosis, implementation, testing, vcs).
- **Condense / Condensation**: The process of summarizing conversation history in [condense/index.ts](src/core/condense/index.ts) to manage context window limits.

## Requirements

### Requirement 1: Claim Extraction from Agent Messages

**User Story:** As a user, I want the system to automatically extract verifiable claims from the agent's messages so that every claim can be checked against evidence.

#### Acceptance Criteria

1. THE Claim_Extractor SHALL extract claims from the agent's `say()` messages of type `"text"` and `"completion_result"`.
2. THE Claim_Extractor SHALL extract claims from the agent's `attempt_completion` tool calls via the `AttemptCompletionTool`.
3. THE Claim_Extractor SHALL identify the following claim types from agent text:
   - `"fix_applied"` — agent claims a fix, edit, or code change was applied (keywords: "fixed", "applied", "added", "updated", "modified", "implemented", "changed", "edited", "patched")
   - `"tests_passed"` — agent claims tests are passing (keywords: "tests pass", "tests passing", "all tests", "test passed", "green", "no failures")
   - `"committed"` — agent claims a git commit was made (keywords: "committed", "commit", "git commit")
   - `"pushed"` — agent claims a git push was made (keywords: "pushed", "git push", "push")
   - `"diagnosed"` — agent claims a diagnosis was performed (keywords: "diagnosed", "root cause", "identified the issue", "found the bug")
   - `"configured"` — agent claims a configuration change was made (keywords: "configured", "set up", "configured the", "updated the config")
4. THE Claim_Extractor SHALL produce a structured `ExtractedClaim` object for each claim with:
   - `claimType`: the identified claim type
   - `claimText`: the original text containing the claim
   - `source`: `"say_text"` | `"say_completion_result"` | `"attempt_completion"`
   - `timestamp`: when the claim was made
   - `messageId`: identifier of the source message
5. THE Claim_Extractor SHALL be a pure function — given the same input text, it always returns the same set of claims.
6. THE Claim_Extractor SHALL NOT extract claims from system-generated messages (e.g., `"error"`, `"api_req_started"`, `"condense_context"`) — only from agent-initiated text.
7. WHEN the agent's text contains no recognizable claims, THE Claim_Extractor SHALL return an empty array.
8. THE Claim_Extractor SHALL handle case-insensitive keyword matching.

### Requirement 2: Evidence Lookup

**User Story:** As a user, I want the system to look up relevant evidence from the evidence registry for each claim so that claim-evidence comparison is deterministic and fast.

#### Acceptance Criteria

1. THE Evidence_Lookup SHALL maintain a mapping from claim types to required evidence types:
   - `"fix_applied"` requires evidence of type `"file_edit"`
   - `"tests_passed"` requires evidence of type `"test"` with payload indicating success (exit code 0)
   - `"committed"` requires evidence of type `"git_commit"`
   - `"pushed"` requires evidence of type `"git_push"`
   - `"diagnosed"` requires evidence of type `"file_read"` (the agent must have read the relevant files)
   - `"configured"` requires evidence of type `"file_edit"` (configuration is a file edit)
2. WHEN a claim is submitted for validation, THE Evidence_Lookup SHALL query the evidence registry for evidence entries matching the required type.
3. THE Evidence_Lookup SHALL filter evidence entries to those occurring **after** the task started (to avoid matching evidence from previous tasks).
4. THE Evidence_Lookup SHALL return the most recent evidence entry of each required type, sorted by timestamp descending.
5. THE Evidence_Lookup SHALL be a pure function — given the same claim and evidence registry, it always returns the same evidence set.
6. WHEN no matching evidence exists for a claim, THE Evidence_Lookup SHALL return an empty evidence set.
7. THE Evidence_Lookup SHALL complete in under 5ms for an evidence registry with up to 10,000 entries.

### Requirement 3: Contradiction Detection Engine

**User Story:** As a user, I want the system to detect contradictions between agent claims and evidence so that false claims are caught before they mislead me.

#### Acceptance Criteria

1. THE Contradiction_Engine SHALL be a pure function — given the same claims and evidence, it always returns the same result.
2. THE Contradiction_Engine SHALL accept an array of `ExtractedClaim` objects and an evidence registry, and return a `ContradictionResult` object.
3. THE Contradiction_Engine SHALL check each claim against the evidence returned by the Evidence_Lookup:
   - IF no evidence exists for a claim's required type, THEN THE Contradiction_Engine SHALL flag the claim as `"unsupported"`.
   - IF evidence exists but contradicts the claim (e.g., test evidence shows exit code 1 for a "tests_passed" claim), THEN THE Contradiction_Engine SHALL flag the claim as `"contradicted"`.
   - IF evidence exists and supports the claim, THEN THE Contradiction_Engine SHALL mark the claim as `"supported"`.
4. THE Contradiction_Engine SHALL produce a `ContradictionResult` containing:
   - `hasContradictions`: boolean — true when any claim is `"unsupported"` or `"contradicted"`
   - `contradictions`: array of `ContradictionEntry` objects, one per unsupported or contradicted claim
   - `totalClaims`: total number of claims checked
   - `supportedCount`: number of claims with supporting evidence
   - `unsupportedCount`: number of claims without any evidence
   - `contradictedCount`: number of claims with contradicting evidence
5. Each `ContradictionEntry` SHALL contain:
   - `claim`: the original `ExtractedClaim`
   - `status`: `"unsupported"` | `"contradicted"`
   - `requiredEvidenceType`: the evidence type required by this claim
   - `matchingEvidence`: the evidence entries found (empty for unsupported, populated for contradicted)
   - `message`: a human-readable description of the contradiction
6. THE Contradiction_Engine SHALL NOT make any API calls, file reads, or network requests — it operates entirely on in-memory data.
7. THE Contradiction_Engine SHALL complete in under 10ms for up to 100 claims.

### Requirement 4: Contradiction Warning Injection

**User Story:** As a user, I want contradiction warnings injected into the agent's context so that the agent must acknowledge and resolve contradictions before proceeding.

#### Acceptance Criteria

1. THE Warning_Injector SHALL inject a `<contradiction_warning>` block into the agent's context when `ContradictionResult.hasContradictions` is `true`.
2. THE `<contradiction_warning>` block SHALL be formatted as a user message injected before the agent's next API request.
3. THE `<contradiction_warning>` block SHALL include:
   - The number of contradictions detected
   - For each contradiction: the claim text, the claim type, the required evidence type, and whether it was "unsupported" or "contradicted"
   - Instructions for the agent to resolve the contradiction
4. THE `<contradiction_warning>` block SHALL use the following format:
   ```
   <contradiction_warning>
   Contradiction Detection: N contradiction(s) found.

   [1] Claim: "<claim_text>"
   Type: <claim_type>
   Status: <unsupported | contradicted>
   Required evidence: <evidence_type>
   <specific guidance based on status>

   [2] ...

   You MUST resolve these contradictions before proceeding. Provide the missing evidence or correct your claims.
   </contradiction_warning>
   ```
5. WHEN no contradictions are detected, THE Warning_Injector SHALL NOT inject any warning — the agent sees no contradiction-related messages.
6. THE Warning_Injector SHALL be non-blocking — the agent can still proceed after receiving a contradiction warning, but the warning remains in context until resolved.
7. THE Warning_Injector SHALL inject the warning as a user message via the existing message injection mechanism (same pattern as verification evidence from Phase 6).
8. WHEN multiple contradictions exist, ALL SHALL be listed in a single `<contradiction_warning>` block (not multiple separate blocks).

### Requirement 5: Integration with presentAssistantMessage

**User Story:** As a developer, I want contradiction detection integrated into the message processing pipeline so that it runs automatically after every assistant message.

#### Acceptance Criteria

1. THE presentAssistantMessage pipeline SHALL run contradiction detection after all tool calls in the current message have been processed and their evidence has been recorded in the evidence registry.
2. THE contradiction detection SHALL run after `pushToolResult()` has been called for all tool results in the current message, ensuring the evidence registry is up to date.
3. THE contradiction detection SHALL extract claims from:
   - All `say()` calls of type `"text"` made during the current message processing
   - The `attempt_completion` tool call result (if present in the current message)
4. THE contradiction detection SHALL use the evidence registry from the current task (initialized at task start, updated by each tool execution).
5. WHEN contradictions are detected, THE system SHALL inject the `<contradiction_warning>` block into `userMessageContent` before the next API request is sent.
6. THE contradiction detection SHALL NOT add more than 50ms to the message processing pipeline.
7. WHEN contradiction detection is disabled in configuration, THE system SHALL skip detection entirely — the existing message processing flow runs unchanged.
8. THE contradiction detection SHALL handle errors gracefully — if detection fails (e.g., evidence registry is unavailable), the system SHALL log the error and proceed without detection.

### Requirement 6: Contradiction Rate Tracking

**User Story:** As a system administrator, I want the system to track contradiction rates so that I can measure agent reliability over time.

#### Acceptance Criteria

1. THE Contradiction_Tracker SHALL maintain per-task contradiction statistics:
   - `totalClaims`: total number of claims extracted during the task
   - `supportedClaims`: number of claims with supporting evidence
   - `unsupportedClaims`: number of claims without evidence
   - `contradictedClaims`: number of claims contradicted by evidence
   - `contradictionRate`: ratio of (unsupported + contradicted) / totalClaims
2. THE Contradiction_Tracker SHALL update statistics after each contradiction detection run.
3. THE Contradiction_Tracker SHALL expose the contradiction rate as a number between 0.0 and 1.0.
4. THE Contradiction_Tracker SHALL reset statistics at the start of each new task.
5. THE Contradiction_Tracker SHALL be included in the task state for persistence across session resume.
6. THE Contradiction_Tracker SHALL provide a `ContradictionMetrics` object with:
   - `taskId`: the task identifier
   - `totalClaims`: number
   - `supportedClaims`: number
   - `unsupportedClaims`: number
   - `contradictedClaims`: number
   - `contradictionRate`: number (0.0 to 1.0)
   - `lastUpdated`: timestamp
7. THE Contradiction_Tracker SHALL be accessible via the task state for the observability system (Phase 9).

### Requirement 7: Configuration

**User Story:** As a system administrator, I want configurable contradiction detection parameters so that I can enable, disable, or tune the feature.

#### Acceptance Criteria

1. THE Configuration_Manager SHALL add a `contradictionDetection` section to the global settings schema in [global-settings.ts](packages/types/src/global-settings.ts) with the following parameters:
   - `enabled`: boolean (default: `true`) — enables or disables the entire contradiction detection system
   - `detectFixApplied`: boolean (default: `true`) — enables detection of "fix applied" claims without file_edit evidence
   - `detectTestsPassed`: boolean (default: `true`) — enables detection of "tests passed" claims without test evidence
   - `detectCommitted`: boolean (default: `true`) — enables detection of "committed" claims without git_commit evidence
   - `detectPushed`: boolean (default: `true`) — enables detection of "pushed" claims without git_push evidence
   - `detectDiagnosed`: boolean (default: `true`) — enables detection of "diagnosed" claims without file_read evidence
   - `detectConfigured`: boolean (default: `true`) — enables detection of "configured" claims without file_edit evidence
   - `warningCooldownMs`: number (default: `5000`, range: `1000` to `60000`) — minimum time between contradiction warnings for the same claim type
2. WHEN `enabled` is `false`, THE system SHALL skip all contradiction detection — the existing message processing flow runs unchanged with zero overhead.
3. WHEN `enabled` is `true` but all sub-detections are disabled, THE system SHALL not run contradiction detection.
4. THE Configuration_Manager SHALL validate each parameter independently and accept valid parameters while rejecting only invalid parameters.
5. THE Configuration_Manager SHALL apply runtime configuration updates within 1 second without requiring agent restart.
6. THE contradiction detection config SHALL follow the existing `.optional().default()` zod pattern used by `loopDetection` and `verification` config sections.

### Requirement 8: Evidence Registry Integration

**User Story:** As a developer, I want contradiction detection to use the existing evidence registry from Phase 1 so that evidence lookup is consistent and reliable.

#### Acceptance Criteria

1. THE Contradiction_Engine SHALL consume evidence from the Phase 1 evidence registry (the append-only store of tool execution events).
2. THE Contradiction_Engine SHALL use the evidence types defined in Phase 1: `"file_read"`, `"file_edit"`, `"command"`, `"test"`, `"git_commit"`, `"git_push"`.
3. WHEN the evidence registry is not available (Phase 1 not implemented or disabled), THE Contradiction_Engine SHALL gracefully degrade — all claims shall be marked as `"supported"` (no false positives).
4. THE Contradiction_Engine SHALL use evidence timestamps to filter evidence to the current task's time window.
5. THE Contradiction_Engine SHALL NOT modify the evidence registry — it is read-only.
6. THE evidence registry SHALL be updated by the tool execution pipeline (Phase 1) before contradiction detection runs.

### Requirement 9: Claim Resolution Tracking

**User Story:** As a user, I want the system to track whether the agent resolved contradictions so that unresolved contradictions are not lost after context condensation.

#### Acceptance Criteria

1. THE Resolution_Tracker SHALL maintain a record of each contradiction detected, including:
   - The original `ContradictionEntry`
   - `detectedAt`: timestamp when the contradiction was detected
   - `resolved`: boolean — whether the contradiction has been resolved
   - `resolvedAt`: timestamp when resolved (if resolved)
   - `resolutionEvidenceId`: ID of the evidence that resolved the contradiction (if resolved)
2. WHEN new evidence is added to the evidence registry that resolves an existing contradiction, THE Resolution_Tracker SHALL automatically mark the contradiction as resolved.
3. THE Resolution_Tracker SHALL persist contradiction records across context condensation — unresolved contradictions SHALL be included in the condensed history.
4. THE Resolution_Tracker SHALL generate a condensed contradiction summary for inclusion in condensed conversation history:
   - Format: `[CONTRADICTION] <claim_type>: <status> — "<claim_text>"`
   - Only unresolved contradictions SHALL be included in condensed history
   - Resolved contradictions SHALL be dropped from condensed history
5. THE Resolution_Tracker SHALL provide a method to check if all contradictions for a task have been resolved.
6. WHEN all contradictions are resolved, THE Resolution_Tracker SHALL NOT inject any warnings — the agent proceeds normally.

### Requirement 10: Observability

**User Story:** As a system administrator, I want visibility into contradiction detection behavior so that I can monitor effectiveness and debug issues.

#### Acceptance Criteria

1. THE Observability_Logger SHALL log the following events with timestamp and relevant values:
   - Contradiction detection started (task ID, number of claims extracted)
   - Contradiction detection completed (task ID, total claims, supported, unsupported, contradicted, duration)
   - Contradiction detected (task ID, claim type, claim text, status, required evidence type)
   - Contradiction resolved (task ID, claim type, resolution evidence ID)
   - Contradiction warning injected (task ID, number of contradictions)
2. THE Observability_Logger SHALL exclude the following from all log entries: full claim text (truncated to 200 characters), evidence payloads larger than 1KB, and tool parameters containing user input.
3. THE Observability_Logger SHALL expose metrics as structured key-value entries containing a timestamp, metric name, and numeric value.
4. THE Observability_Logger SHALL provide metrics including: total contradictions per task, contradiction rate per task, contradiction detection duration, contradiction resolution rate, and per-claim-type contradiction counts.

## Out of Scope

- **Automatic claim correction**: The system detects contradictions; the agent must correct its own claims. The system does not auto-correct agent text.
- **Claim extraction from reasoning messages**: Claims in `reasoning` type messages are not extracted — only `text` and `completion_result` types are checked.
- **Cross-task contradiction tracking**: Contradictions are scoped to individual tasks. Cross-task contradiction analytics are out of scope for this phase.
- **Contradiction visualization UI**: This phase focuses on the backend detection and context injection. UI indicators for contradiction status are a future enhancement.
- **Contradiction detection for MCP tool claims**: Claims about MCP tool results are not checked in this phase. Only native tool evidence types are supported.
- **Historical contradiction analysis**: Analyzing contradiction trends across tasks is out of scope for this phase (covered in Phase 9 reliability metrics).
- **Contradiction-based task abort**: The system flags contradictions but does not automatically abort the task. The agent must resolve contradictions.
- **Natural language inference**: The system uses keyword-based claim extraction, not NLP/ML-based claim detection. Advanced NLI is out of scope.

## Acceptance Criteria Summary

| Req ID | Description | Key Criteria |
|--------|-------------|--------------|
| REQ-1 | Claim Extraction from Agent Messages | Extracts claims from say() text, completion_result, and attempt_completion; 6 claim types; pure function; case-insensitive |
| REQ-2 | Evidence Lookup | Maps claim types to evidence types; filters by task time window; returns most recent evidence; pure function; <5ms |
| REQ-3 | Contradiction Detection Engine | Pure function; checks claims against evidence; flags as unsupported/contradicted/supported; returns ContradictionResult; <10ms |
| REQ-4 | Contradiction Warning Injection | Injects `<contradiction_warning>` block as user message; includes all contradictions; non-blocking; no warnings when no contradictions |
| REQ-5 | Integration with presentAssistantMessage | Runs after tool processing; extracts claims from say() and attempt_completion; injects before next API request; <50ms overhead |
| REQ-6 | Contradiction Rate Tracking | Per-task statistics; contradiction rate 0.0-1.0; resets per task; persisted in task state; accessible for Phase 9 |
| REQ-7 | Configuration | 8 parameters in zod schema with `.optional().default()`; per-claim-type enable/disable; cooldown; zero overhead when disabled |
| REQ-8 | Evidence Registry Integration | Consumes Phase 1 evidence; graceful degradation when unavailable; read-only; uses task time window filtering |
| REQ-9 | Claim Resolution Tracking | Tracks resolution status; auto-resolves when evidence added; persists through condensation; condensed format for unresolved |
| REQ-10 | Observability | Structured logging of detection events; metrics (rate, duration, resolution); no sensitive data in logs |
