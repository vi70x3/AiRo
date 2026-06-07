# Requirements: Debug Workflow Enforcement

## Introduction

The Debug Workflow Enforcement feature replaces the current prompt-based debug guidance — which the agent can ignore — with a deterministic Debug Finite State Machine (FSM). The existing debug mode (`packages/types/src/mode.ts`, line 205) instructs the agent to "Reflect on 5-7 different possible sources of the problem, distill those down to 1-2 most likely sources, and then add logs to validate your assumptions. Explicitly ask the user to confirm the diagnosis before fixing the problem." However, nothing enforces this workflow. The agent can skip straight to editing, bypass hypothesis generation, or fix without confirmation.

This feature implements a Debug FSM that enforces the debug workflow through tool restrictions, structured output requirements, and state transition gates. The FSM has six states: `Investigate -> Hypothesize -> Validate -> Confirm -> Fix -> Verify`. Each state restricts which tools are available and what the agent must produce before advancing. The system tracks FSM state deterministically — the agent cannot self-advance; only tool execution evidence and user confirmation trigger transitions.

The debug FSM is implemented as an extension of the existing debug mode, using the `ModeConfig` infrastructure and integrating with the tool filtering pipeline from `src/core/prompts/tools/filter-tools-for-mode.ts`. It also integrates with the Execution State Graph from the Agent State Management spec (Phase 1) — the debug FSM's `Investigate`/`Hypothesize`/`Validate`/`Confirm` states map to the `diagnosis` phase, while `Fix` maps to `implementation` and `Verify` maps to `testing`.

## Glossary

- **Agent**: An AI-powered assistant that processes user requests and executes tasks using available tools and reasoning capabilities.
- **Debug FSM**: A deterministic Finite State Machine that enforces the debug workflow through six states: Investigate, Hypothesize, Validate, Confirm, Fix, Verify.
- **Debug State Tracker**: The deterministic module that maintains the current debug FSM state, validates transitions, and enforces tool restrictions per state.
- **Hypothesis**: A structured JSON object produced by the agent during the Hypothesize state, containing `possible_causes` and `likely_causes`.
- **State Transition**: A change from one debug FSM state to the next, triggered by tool execution evidence or user confirmation.
- **Tool Restriction**: The set of tools available in each debug state. Investigate allows only read/explore tools; Fix allows edit tools; etc.
- **Confirmation Gate**: The Confirm state requirement that the user explicitly approves the diagnosis before the agent proceeds to Fix, or the agent's confidence exceeds 0.9.
- **Confidence Threshold**: A numeric value (0.0 to 1.0) representing the agent's diagnostic confidence. When above 0.9, user confirmation can be bypassed.
- **ModeConfig**: The existing type in `packages/types/src/mode.ts` defining mode configuration (slug, name, roleDefinition, groups, customInstructions, etc.).
- **filterNativeToolsForMode**: The existing function in `src/core/prompts/tools/filter-tools-for-mode.ts` that filters tools based on mode restrictions.
- **Execution State Graph**: The deterministic state tracker from the Agent State Management spec (Phase 1), maintaining phase states (diagnosis, implementation, testing, vcs).
- **ToolAvailabilityContext**: The existing class in `src/core/prompts/tools/tool-availability-context.ts` that tracks which tools are disabled.
- **Custom Mode**: A user-defined mode configuration that can override built-in modes, loaded via `CustomModesManager` or `.roomodes` files.

## Requirements

### Requirement 1: Debug FSM State Machine

**User Story:** As a user, I want the debug workflow enforced by a deterministic state machine so that the agent cannot skip investigation, hypothesis generation, or confirmation before fixing.

#### Acceptance Criteria

1. THE Debug_FSM SHALL implement the following six states with the specified order:
   - `Investigate` — Agent searches for evidence (read, search, trace, logs)
   - `Hypothesize` — Agent produces structured hypothesis with possible and likely causes
   - `Validate` — Agent adds logs, inspects traces, or runs runtime verification
   - `Confirm` — User approves diagnosis OR confidence threshold > 0.9
   - `Fix` — Agent applies the fix (edit tools now available)
   - `Verify` — Agent runs tests to confirm the fix works
2. THE Debug_FSM SHALL be the initial state when the debug mode is activated.
3. THE Debug_FSM SHALL only transition to the next state when the transition conditions for the current state are met — the agent SHALL NOT self-advance.
4. WHEN the agent is in the `Investigate` state, THE Debug_FSM SHALL allow only read and explore tools: `read_file`, `search_files`, `list_files`, `codebase_search`, `search_symbols`, `get_context_bundle`, `search_text`, `get_symbol_source`, `get_file_outline`, `get_repo_map`, `search_ast`, `execute_command` (for log reading only).
5. WHEN the agent is in the `Investigate` state, THE Debug_FSM SHALL block edit tools: `apply_diff`, `write_to_file`, `edit`, `search_and_replace`, `edit_file`, `apply_patch`.
6. WHEN the agent is in the `Hypothesize` state, THE Debug_FSM SHALL require the agent to produce a structured hypothesis in JSON format.
7. WHEN the agent is in the `Validate` state, THE Debug_FSM SHALL require at least one of: log insertion, trace inspection, or runtime verification via command execution.
8. WHEN the agent is in the `Confirm` state, THE Debug_FSM SHALL require either user approval via `ask_followup_question` or a confidence threshold exceeding 0.9.
9. WHEN the agent is in the `Fix` state, THE Debug_FSM SHALL enable edit tools: `apply_diff`, `write_to_file`, `edit`, `search_and_replace`, `edit_file`, `apply_patch`.
10. WHEN the agent is in the `Verify` state, THE Debug_FSM SHALL allow command execution for test running and read tools for output inspection.
11. THE Debug_FSM SHALL be deterministic — given the same state and evidence, it always produces the same next state.

### Requirement 2: Debug State Tracker

**User Story:** As a developer, I want a deterministic state tracker that maintains the current debug FSM state and validates transitions, so that the enforcement is reliable and testable.

#### Acceptance Criteria

1. THE Debug_State_Tracker SHALL be a new module in `packages/types/src/loop-detection.ts` that maintains the current debug FSM state.
2. THE Debug_State_Tracker SHALL store the following data for each debug session:
   - `currentState`: one of the six debug FSM states
   - `hypothesis`: the structured hypothesis produced during Hypothesize state (nullable)
   - `evidence`: list of evidence collected during Investigate and Validate states
   - `confidence`: number from 0.0 to 1.0 representing diagnostic confidence
   - `stateHistory`: ordered list of state transitions with timestamps
3. THE Debug_State_Tracker SHALL expose a `transition(nextState, evidence)` function that validates and executes state transitions.
4. THE Debug_State_Tracker SHALL reject invalid transitions (e.g., Investigate -> Fix without Hypothesize and Validate) and return an error describing the violation.
5. THE Debug_State_Tracker SHALL be a pure function for state transition logic — no side effects, no LLM calls.
6. THE Debug_State_Tracker SHALL be serializable to JSON for persistence across task resume.
7. WHEN the debug mode is not active, THE Debug_State_Tracker SHALL not be instantiated — zero overhead.

### Requirement 3: Tool Restrictions Per Debug Phase

**User Story:** As a user, I want tools to be restricted based on the current debug phase so that the agent cannot edit files during investigation or skip to fixing without diagnosis.

#### Acceptance Criteria

1. THE system SHALL restrict tools based on the current debug FSM state using the existing `filterNativeToolsForMode()` mechanism.
2. WHEN the debug FSM state is `Investigate`, THE system SHALL allow only:
   - Read tools: `read_file`, `search_files`, `list_files`, `codebase_search`
   - Indexed tools (if repo indexed): `search_symbols`, `get_context_bundle`, `search_text`, `get_symbol_source`, `get_file_outline`, `get_repo_map`, `search_ast`
   - Command: `execute_command` (for reading logs, running diagnostic commands)
   - Meta tools: `ask_followup_question`, `attempt_completion`, `switch_mode`, `update_todo_list`
3. WHEN the debug FSM state is `Hypothesize`, THE system SHALL allow the same tools as Investigate.
4. WHEN the debug FSM state is `Validate`, THE system SHALL allow the same tools as Investigate plus `execute_command` for running verification commands.
5. WHEN the debug FSM state is `Confirm`, THE system SHALL allow the same tools as Investigate.
6. WHEN the debug FSM state is `Fix`, THE system SHALL enable edit tools: `apply_diff`, `write_to_file`, `edit`, `search_and_replace`, `edit_file`, `apply_patch`.
7. WHEN the debug FSM state is `Verify`, THE system SHALL allow command execution and read tools for test verification.
8. THE tool restrictions SHALL be implemented by extending the existing `filterNativeToolsForMode()` function or by adding a debug-specific filter step that runs after mode filtering.
9. THE tool restrictions SHALL respect `ToolAvailabilityContext` — disabled tools SHALL remain disabled regardless of debug state.
10. THE tool restrictions SHALL respect the `includeAllToolsWithRestrictions` flag — when true, all tools are returned but `allowedFunctionNames` reflects debug state restrictions.

### Requirement 4: Structured Hypothesis Requirement

**User Story:** As a user, I want the agent to produce a structured hypothesis during the Hypothesize phase so that the diagnosis is explicit, reviewable, and complete.

#### Acceptance Criteria

1. WHEN the debug FSM transitions to the `Hypothesize` state, THE system SHALL inject instructions into the system prompt requiring the agent to produce a structured hypothesis.
2. THE structured hypothesis SHALL be in JSON format with the following schema:
   ```json
   {
     "possible_causes": ["cause1", "cause2", "..."],
     "likely_causes": ["cause1", "cause2"]
   }
   ```
3. THE `possible_causes` array SHALL contain 3-7 candidate causes.
4. THE `likely_causes` array SHALL contain 1-2 causes distilled from `possible_causes`.
5. THE system SHALL validate that the agent's output contains a valid hypothesis JSON before allowing transition to the `Validate` state.
6. IF the agent's output does not contain a valid hypothesis JSON, THE system SHALL reject the transition and inject a corrective message requesting the structured format.
7. THE hypothesis SHALL be stored in the Debug State Tracker's `hypothesis` field.

### Requirement 5: Confirmation Gate

**User Story:** As a user, I want the agent to require my explicit confirmation before applying a fix, unless the diagnostic confidence is very high (> 0.9), so that I have control over what changes are made.

#### Acceptance Criteria

1. WHEN the debug FSM is in the `Confirm` state, THE system SHALL require one of:
   - User approval via `ask_followup_question` with a clear description of the diagnosis and proposed fix
   - Agent confidence level > 0.9 (stored in the Debug State Tracker)
2. WHEN user approval is required, THE system SHALL present the hypothesis and proposed fix to the user via `ask_followup_question` before allowing transition to `Fix`.
3. WHEN the user rejects the diagnosis, THE system SHALL transition back to `Investigate` (not to `Fix`).
4. WHEN the user approves the diagnosis, THE system SHALL transition to `Fix`.
5. WHEN confidence > 0.9 and user approval is bypassed, THE system SHALL log the bypass event with the confidence value and hypothesis.
6. THE confirmation gate SHALL be enforced regardless of the agent's eagerness to proceed — the agent SHALL NOT self-advance past `Fix`.

### Requirement 6: System Prompt Phase Instructions

**User Story:** As a user, I want the system prompt to include phase-specific instructions and state transition rules when in debug mode, so that the agent always knows what is expected in each debug phase.

#### Acceptance Criteria

1. THE system prompt SHALL include a `DEBUG WORKFLOW` section when the mode is `debug` and the debug FSM is active.
2. THE `DEBUG WORKFLOW` section SHALL include:
   - Current debug FSM state
   - Allowed tools for the current state
   - Required output for the current state (e.g., hypothesis JSON for Hypothesize)
   - Transition conditions for the next state
3. WHEN the debug FSM state changes, THE `DEBUG WORKFLOW` section SHALL be regenerated to reflect the new state.
4. THE `DEBUG WORKFLOW` section SHALL be injected via the existing system prompt generation pipeline in `src/core/prompts/system.ts`.
5. THE `DEBUG WORKFLOW` section SHALL include the state transition diagram for reference:
   ```
   Investigate -> Hypothesize -> Validate -> Confirm -> Fix -> Verify
   ```
6. WHEN the debug FSM is not active (debug mode disabled in config), THE `DEBUG WORKFLOW` section SHALL NOT be included in the system prompt.

### Requirement 7: Configuration

**User Story:** As a system administrator, I want configurable debug workflow parameters so that I can enable, disable, or tune the debug FSM.

#### Acceptance Criteria

1. THE Configuration_Manager SHALL add a `debugWorkflow` section to the global settings schema in `packages/types/src/global-settings.ts` with the following parameters:
   - `enabled`: boolean (default: `false`) — enables or disables the debug FSM
   - `requireUserConfirmation`: boolean (default: `true`) — when true, the Confirm state requires user approval; when false, confidence threshold alone suffices
   - `confidenceThreshold`: number (default: `0.9`, range: `0.5` to `0.99`) — confidence level above which user confirmation can be bypassed
   - `maxInvestigateTurns`: number (default: `10`, range: `3` to `50`) — maximum number of turns allowed in Investigate state before the system suggests advancing or switching modes
   - `autoAdvanceFromValidate`: boolean (default: `false`) — when true, automatically transitions from Validate to Confirm after successful validation
2. WHEN `enabled` is `false`, THE system SHALL operate with the existing debug mode behavior — no FSM enforcement, no tool restrictions beyond the existing mode groups.
3. WHEN `requireUserConfirmation` is `true`, THE Confirm state SHALL always require user approval regardless of confidence level.
4. WHEN `confidenceThreshold` is set below `0.5`, THE Configuration_Manager SHALL reject the value and use the default.
5. THE Configuration_Manager SHALL validate each parameter independently and accept valid parameters while rejecting only invalid parameters.
6. THE Configuration_Manager SHALL apply runtime configuration updates within 1 second without requiring agent restart.

### Requirement 8: Integration with Execution State Graph

**User Story:** As a developer, I want the debug FSM integrated with the Execution State Graph from Phase 1 so that debug state transitions contribute to overall task progress tracking.

#### Acceptance Criteria

1. THE debug FSM states SHALL map to Execution State Graph phases as follows:
   - `Investigate`, `Hypothesize`, `Validate`, `Confirm` -> `diagnosis` phase
   - `Fix` -> `implementation` phase
   - `Verify` -> `testing` phase
2. WHEN the debug FSM transitions from `Confirm` to `Fix`, THE Execution State Graph SHALL transition `diagnosis.status` from `"investigating"` to `"confirmed"`.
3. WHEN the debug FSM transitions from `Fix` to `Verify`, THE Execution State Graph SHALL transition `implementation.status` from `"not_started"` to `"editing"` (and subsequently to `"edited"`).
4. WHEN the debug FSM completes the `Verify` state, THE Execution State Graph SHALL transition `testing.status` from `"not_started"` to `"running"` (and subsequently to `"passed"` or `"failed"`).
5. THE debug FSM SHALL consume `executionPhase` from the Execution State Graph to avoid conflicting state — if the Execution State Graph indicates `implementation.status === "verified"`, the debug FSM SHALL NOT allow transition back to `Fix`.
6. IF the Execution State Graph is not available (Phase 1 not enabled), THE debug FSM SHALL operate independently using its own state tracker.

### Requirement 9: Custom Mode Extensions

**User Story:** As a user, I want to extend the debug mode with custom behavior via the existing custom modes infrastructure, so that I can tailor the debug workflow to my project's needs.

#### Acceptance Criteria

1. THE system SHALL support custom mode overrides for the debug mode slug, following the existing pattern in `src/shared/modes.ts` where custom modes override built-in modes.
2. WHEN a custom mode with slug `debug` is defined, THE system SHALL use the custom mode's `groups` for tool filtering instead of the default debug FSM tool restrictions.
3. WHEN a custom mode with slug `debug` defines `customInstructions`, THE instructions SHALL be appended to (not replace) the debug FSM system prompt section.
4. THE debug FSM state tracking SHALL still be active even with custom mode overrides — custom modes can relax tool restrictions but cannot disable the FSM entirely.
5. WHEN a custom mode with slug `debug` defines a `roleDefinition`, THE system SHALL use the custom role definition instead of the built-in debug role definition.
6. THE debug FSM SHALL respect the `FileRestrictionError` mechanism — if a custom mode defines file regex restrictions, the debug FSM SHALL enforce them in addition to phase-based tool restrictions.

### Requirement 10: Observability

**User Story:** As a system administrator, I want visibility into debug FSM behavior so that I can monitor enforcement effectiveness and debug issues.

#### Acceptance Criteria

1. THE Observability_Logger SHALL log the following events with timestamp and relevant values:
   - State transition (fromState, toState, triggering evidence or confirmation)
   - Hypothesis produced (hypothesis JSON, confidence level)
   - Tool restriction applied (state, blocked tools, allowed tools)
   - Confidence threshold bypass (confidence value, hypothesis summary)
   - Invalid transition attempt (requested transition, current state, rejection reason)
   - Max investigate turns reached (turn count, suggestion injected)
2. THE Observability_Logger SHALL exclude the following from all log entries: user message text, file contents, tool parameters containing user input, and hypothesis details longer than 500 characters.
3. THE Observability_Logger SHALL expose metrics as structured key-value entries containing a timestamp, metric name, and numeric value.
4. THE Observability_Logger SHALL provide metrics including: total debug FSM transitions per task, total confirmations (user-approved, confidence-bypassed, rejected), average time per debug state, and invalid transition attempts.

## Out of Scope

- **Automatic hypothesis generation**: The agent produces hypotheses; the system only validates the format and enforces the requirement.
- **Multi-agent debug coordination**: Debug FSM is scoped to a single agent session; swarm/delegated debug workflows are out of scope.
- **Debug FSM visualization UI**: This phase focuses on the backend enforcement engine; UI indicators for debug state are a future enhancement.
- **Automatic fix application**: The agent applies fixes in the Fix state; the system only enables edit tools and does not auto-apply changes.
- **Debug session recording/playback**: Recording debug sessions for replay is out of scope.
- **Integration with external debuggers**: The debug FSM works with code-level debugging tools (logs, traces, tests) but does not integrate with IDE debuggers or remote debugging protocols.
- **Replacing the existing debug mode**: The debug FSM extends the existing debug mode; it does not replace the mode itself. When disabled, the existing debug mode behavior is preserved.

## Acceptance Criteria Summary

| Req ID | Description | Key Criteria |
|--------|-------------|--------------|
| REQ-1 | Debug FSM State Machine | Six-state ordered FSM with deterministic transitions, tool restrictions per state |
| REQ-2 | Debug State Tracker | State maintenance, transition validation, serializable, pure function logic |
| REQ-3 | Tool Restrictions Per Phase | Phase-based tool filtering using existing filterNativeToolsForMode mechanism |
| REQ-4 | Structured Hypothesis | JSON hypothesis with possible_causes (3-7) and likely_causes (1-2), validated before transition |
| REQ-5 | Confirmation Gate | User approval or confidence > 0.9 required, rejection returns to Investigate |
| REQ-6 | System Prompt Instructions | DEBUG WORKFLOW section with current state, allowed tools, required output, transition conditions |
| REQ-7 | Configuration | Enable/disable/tune via global settings with zod schema, 5 parameters |
| REQ-8 | Execution State Graph Integration | Debug FSM states map to diagnosis/implementation/testing phases, no conflicts |
| REQ-9 | Custom Mode Extensions | Custom debug mode overrides for groups/instructions/roleDefinition, FSM still active |
| REQ-10 | Observability | Structured logging of transitions, hypotheses, restrictions, bypasses, invalid attempts |
