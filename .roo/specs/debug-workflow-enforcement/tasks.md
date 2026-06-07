# Tasks: Debug Workflow Enforcement

## Phase 1: Foundation — Types, Schema, and FSM Core

- [ ] **T1.1**: Add `debugWorkflow` section to `packages/types/src/global-settings.ts`
  - Import `z` from zod (already imported)
  - Add `debugWorkflow` field to `globalSettingsSchema` with:
    - `enabled`: `z.boolean().optional().default(false)`
    - `requireUserConfirmation`: `z.boolean().optional().default(true)`
    - `confidenceThreshold`: `z.number().min(0.5).max(0.99).optional().default(0.9)`
    - `maxInvestigateTurns`: `z.number().int().min(3).max(50).optional().default(10)`
    - `autoAdvanceFromValidate`: `z.boolean().optional().default(false)`
  - Export `DebugFsmConfig` type via `z.infer`
  - Verify the existing export pattern in `index.ts` re-exports the new type

- [ ] **T1.2**: Add debug FSM types to `packages/types/src/loop-detection.ts`
  - Add `DebugFsmState` type: `"investigate" | "hypothesize" | "validate" | "confirm" | "fix" | "verify"`
  - Add `DebugHypothesis` interface with fields: `possibleCauses`, `likelyCauses`, `confidence`, `timestamp`
  - Add `DebugEvidence` interface with fields: `id`, `type`, `description`, `filesInvolved`, `timestamp`
  - Add `StateTransition` interface with fields: `fromState`, `toState`, `trigger`, `triggerDetail`, `timestamp`
  - Add `DebugStateTracker` interface with fields: `currentState`, `hypothesis`, `evidence`, `confidence`, `stateHistory`, `investigateTurnCount`, `activatedAt`
  - Add `TransitionContext` interface with fields: `trigger`, `triggerDetail`, `hypothesis`, `newEvidence`, `confidence`
  - Add `TransitionError` interface with fields: `error`, `message`, `currentState`
  - Add `DebugEvidenceType` type: `"log" | "trace" | "runtime_verification" | "file_inspection" | "test_output"`
  - Export all new types

- [ ] **T1.3**: Create `src/core/prompts/tools/debug-fsm.ts`
  - Define `VALID_TRANSITIONS` constant mapping each state to its valid next states
  - Define `getValidTransitions(currentState)` function
  - Define `isValidHypothesis(hypothesis)` validation function
  - Define `validateRequiredOutput(current, requested, context, config)` function with all state-specific validation rules
  - Define `transitionState(current, requested, context, config)` core function
  - Define `DEBUG_TOOL_RESTRICTIONS` constant with `PhaseToolRestrictions` for all 6 states
  - Define `PhaseToolRestrictions` interface
  - Export all public types and functions

- [ ] **T1.4**: Create `src/core/prompts/tools/debug-fsm-filter.ts`
  - Define `filterToolsForDebugState(tools, debugFsmState, config)` function
  - Define `getDebugToolRestrictionSection(state)` function returning human-readable restriction description
  - Import `DEBUG_TOOL_RESTRICTIONS` from `./debug-fsm`
  - Export all public functions

- [ ] **T1.5**: Create `src/core/prompts/tools/debug-fsm-section.ts`
  - Define `DebugWorkflowSection` interface
  - Define `getDebugWorkflowSection(state, config)` function generating the full DEBUG WORKFLOW prompt section
  - Define `getRequiredOutput(state)` helper returning state-specific required output description
  - Define `getTransitionCondition(state, tracker, config)` helper returning state-specific transition instructions
  - Import `DEBUG_TOOL_RESTRICTIONS` from `./debug-fsm`
  - Export all public types and functions

- [ ] **T1.6**: Update `src/core/prompts/tools/index.ts` exports
  - Add exports for `transitionState`, `filterToolsForDebugState`, `getDebugWorkflowSection`
  - Add exports for `DEBUG_TOOL_RESTRICTIONS`, `getValidTransitions`, `isValidHypothesis`
  - Add exports for `DebugFsmState`, `DebugStateTracker`, `DebugHypothesis`, `DebugEvidence`, `StateTransition`, `TransitionContext`, `TransitionError`

## Phase 2: Core Logic — FSM Tests and Validation

- [ ] **T2.1**: Create `src/core/prompts/tools/__tests__/debug-fsm.spec.ts`
  - Test `transitionState()` with valid transitions: Investigate -> Hypothesize -> Validate -> Confirm -> Fix -> Verify
  - Test `transitionState()` with invalid transitions: Investigate -> Fix (rejected), Hypothesize -> Investigate (rejected), Fix -> Investigate (rejected)
  - Test `transitionState()` with user rejection at Confirm: Confirm -> Investigate
  - Test `transitionState()` with test failure at Verify: Verify -> Investigate, Verify -> Fix
  - Test `validateRequiredOutput()` for Investigate without evidence — returns error
  - Test `validateRequiredOutput()` for Hypothesize without hypothesis — returns error
  - Test `validateRequiredOutput()` for Validate without validation evidence — returns error
  - Test `validateRequiredOutput()` for Confirm without user confirmation when required — returns error
  - Test `validateRequiredOutput()` for Confirm with confidence > threshold when `requireUserConfirmation=false` — passes
  - Test `validateRequiredOutput()` for Verify without test evidence — returns error
  - Test `isValidHypothesis()` with valid hypothesis — returns true
  - Test `isValidHypothesis()` with too few possible causes (< 3) — returns false
  - Test `isValidHypothesis()` with too many possible causes (> 7) — returns false
  - Test `isValidHypothesis()` with likely causes not subset of possible causes — returns false
  - Test `isValidHypothesis()` with confidence out of range — returns false
  - Test `getValidTransitions()` for all 6 states
  - Test `transitionState()` determinism — same inputs always produce same output
  - Test `transitionState()` serializability — output can be JSON.stringify'd and parsed back

- [ ] **T2.2**: Create `src/core/prompts/tools/__tests__/debug-fsm-filter.spec.ts`
  - Test `filterToolsForDebugState()` with `enabled=false` — returns tools unchanged
  - Test `filterToolsForDebugState()` with state=`investigate` — edit tools blocked
  - Test `filterToolsForDebugState()` with state=`hypothesize` — edit tools blocked
  - Test `filterToolsForDebugState()` with state=`validate` — edit tools blocked
  - Test `filterToolsForDebugState()` with state=`confirm` — edit tools blocked
  - Test `filterToolsForDebugState()` with state=`fix` — all tools allowed
  - Test `filterToolsForDebugState()` with state=`verify` — edit tools blocked
  - Test `filterToolsForDebugState()` respects `ToolAvailabilityContext` — disabled tools still blocked
  - Test `getDebugToolRestrictionSection()` returns non-empty string for each state

- [ ] **T2.3**: Create `src/core/prompts/tools/__tests__/debug-fsm-section.spec.ts`
  - Test `getDebugWorkflowSection()` with `enabled=false` — returns empty string
  - Test `getDebugWorkflowSection()` with `enabled=true, state=investigate` — includes "INVESTIGATE", allowed tools, blocked tools
  - Test `getDebugWorkflowSection()` with `enabled=true, state=fix` — includes "FIX", no blocked tools
  - Test `getDebugWorkflowSection()` includes state transition diagram
  - Test `getDebugWorkflowSection()` includes hypothesis when present
  - Test `getDebugWorkflowSection()` includes state history
  - Test `getRequiredOutput()` returns non-empty for all 6 states
  - Test `getTransitionCondition()` includes confidence threshold when `requireUserConfirmation=false`
  - Test `getTransitionCondition()` includes user approval instruction when `requireUserConfirmation=true`

- [ ] **T2.4**: Run existing test suite to verify no regressions
  - `cd src && npx vitest run prompts/tools/__tests__/tool-availability-context.spec.ts` — all pass
  - `cd src && npx vitest run prompts/tools/__tests__/filter-tools-for-mode.spec.ts` — all pass

## Phase 3: Integration — Tool Pipeline, System Prompt, and Execution Graph

- [ ] **T3.1**: Update `src/core/prompts/tools/filter-tools-for-mode.ts`
  - Import `filterToolsForDebugState` from `./debug-fsm-filter`
  - Import `DebugFsmState` from `@roo-code/types`
  - Add optional `debugFsmState?: DebugFsmState` to the `settings` parameter object in `filterNativeToolsForMode()`
  - After existing mode filtering logic, when `debugFsmState` is provided:
    - Read `debugWorkflow.enabled` from global settings (via `settings` or a config lookup)
    - Call `filterToolsForDebugState()` to apply debug phase tool restrictions
  - Maintain backward compatibility — when `debugFsmState` is undefined, behavior is identical to current

- [ ] **T3.2**: Update `src/core/task/build-tools.ts`
  - Import `DebugFsmState` from `@roo-code/types`
  - Add optional `debugFsmState?: DebugFsmState` to `BuildToolsOptions` interface
  - In `buildNativeToolsArrayWithRestrictions()`, pass `debugFsmState` to `filterNativeToolsForMode()` via the `filterSettings` object
  - Add optional `debugFsmState?: DebugFsmState` to `BuildToolsResult` interface
  - Return `debugFsmState` in the result when provided

- [ ] **T3.3**: Update `src/core/prompts/system.ts`
  - Import `getDebugWorkflowSection` from `./tools/debug-fsm-section`
  - Import `DebugStateTracker`, `DebugFsmConfig` from `@roo-code/types`
  - Add optional `debugStateTracker?: DebugStateTracker` parameter to `generatePrompt()`
  - Add optional `debugFsmConfig?: DebugFsmConfig` parameter to `generatePrompt()`
  - When both are provided and `debugFsmConfig.enabled` is `true`:
    - Call `getDebugWorkflowSection(debugStateTracker, debugFsmConfig)` to generate the section
    - Inject the section between `getToolUseGuidelinesSection()` and `getCapabilitiesSection()`
  - Add the same parameters to `SYSTEM_PROMPT()` and pass through to `generatePrompt()`
  - Maintain backward compatibility — when parameters are undefined, output is identical to current

- [ ] **T3.4**: Create `src/core/task/__tests__/build-tools-debug-fsm.spec.ts`
  - Test `buildNativeToolsArrayWithRestrictions()` with `debugFsmState="investigate"`
    - Verify edit tools (apply_diff, write_to_file) are NOT in the result
    - Verify read tools (read_file, search_files) ARE in the result
  - Test `buildNativeToolsArrayWithRestrictions()` with `debugFsmState="fix"`
    - Verify edit tools ARE in the result
    - Verify read tools ARE in the result
  - Test `buildNativeToolsArrayWithRestrictions()` with `debugFsmState="verify"`
    - Verify edit tools are NOT in the result
    - Verify execute_command IS in the result
  - Test `buildNativeToolsArrayWithRestrictions()` without `debugFsmState`
    - Verify identical behavior to current (all mode-allowed tools present)
  - Test with `includeAllToolsWithRestrictions=true` and `debugFsmState="investigate"`
    - Verify all tools are returned but `allowedFunctionNames` excludes edit tools

- [ ] **T3.5**: Create `src/core/prompts/__tests__/system-debug-fsm.spec.ts`
  - Test `generatePrompt()` with `debugFsmConfig.enabled=true, debugStateTracker` in investigate state
    - Verify `DEBUG WORKFLOW` section is present in output
    - Verify `Current state: INVESTIGATE` is present
    - Verify blocked tools list is present
  - Test `generatePrompt()` with `debugFsmConfig.enabled=true, debugStateTracker` in fix state
    - Verify `Current state: FIX` is present
    - Verify no blocked tools list (all tools available)
  - Test `generatePrompt()` with `debugFsmConfig.enabled=false`
    - Verify no `DEBUG WORKFLOW` section in output
  - Test `generatePrompt()` without `debugStateTracker`
    - Verify no `DEBUG WORKFLOW` section in output
    - Verify identical behavior to current

## Phase 4: Verification — End-to-End, Observability, and Custom Modes

- [ ] **T4.1**: Add debug FSM transition logging
  - In `transitionState()`, add a `console.debug` call (or use existing logging infrastructure) that logs:
    - From state, to state, trigger type, timestamp
    - Hypothesis summary (likely causes count, confidence)
    - Evidence count
  - Ensure logging is gated behind a debug flag or existing verbose logging check
  - Verify logs do not contain user message text, file contents, or evidence payloads larger than 1KB

- [ ] **T4.2**: Add debug FSM metrics
  - Track total debug FSM transitions per task
  - Track total confirmations (user-approved, confidence-bypassed, rejected)
  - Track average time per debug state
  - Track invalid transition attempts
  - Expose metrics as structured key-value entries with timestamp, metric name, and numeric value

- [ ] **T4.3**: Verify custom mode extensions
  - Create a test custom mode with slug `debug` that overrides `groups` to `["read", "edit", "command"]`
  - Verify the custom mode's groups are used for tool filtering (edit tools available even in investigate state)
  - Verify the debug FSM state tracking is still active (transitions are still validated)
  - Create a test custom mode with slug `debug` that adds `customInstructions`
  - Verify the custom instructions are appended to the DEBUG WORKFLOW section
  - Verify `FileRestrictionError` is still enforced for custom debug modes

- [ ] **T4.4**: Verify Execution State Graph integration
  - Test that debug FSM transition from Confirm -> Fix triggers Execution State Graph: `diagnosis.status = "confirmed"`
  - Test that debug FSM transition from Fix -> Verify triggers Execution State Graph: `implementation.status = "editing"`
  - Test that debug FSM transition to Verify triggers Execution State Graph: `testing.status = "running"`
  - Test that conflicting Execution State Graph state blocks invalid debug FSM transitions
  - Test that debug FSM operates independently when Execution State Graph is not available

- [ ] **T4.5**: Run full test suite
  - `cd src && npx vitest run` — all tests pass
  - `cd webview-ui && npx vitest run` — all tests pass (verify no regressions from type changes)

- [ ] **T4.6**: Run lint
  - `cd src && npx eslint prompts/tools/debug-fsm.ts prompts/tools/debug-fsm-filter.ts prompts/tools/debug-fsm-section.ts` — zero errors
  - `cd src && npx eslint core/prompts/tools/filter-tools-for-mode.ts` — zero errors
  - `cd src && npx eslint core/prompts/system.ts` — zero errors
  - `cd src && npx eslint core/task/build-tools.ts` — zero errors

- [ ] **T4.7**: Manual verification
  - Build the project: `cd src && npx tsc --noEmit` — zero type errors
  - Verify the `debugWorkflow` config section appears in settings types
  - Verify the `DEBUG WORKFLOW` section appears in system prompt when `enabled=true` and `debugStateTracker` is in investigate state
  - Verify the `DEBUG WORKFLOW` section shows all tools available when in fix state
  - Verify no `DEBUG WORKFLOW` section when `enabled=false`
  - Verify edit tools are blocked in investigate state (check tool array)
  - Verify edit tools are available in fix state (check tool array)
  - Verify hypothesis validation rejects invalid JSON
  - Verify confirmation gate requires user approval when `requireUserConfirmation=true`
  - Verify confirmation gate bypasses user approval when `requireUserConfirmation=false` and confidence > threshold
  - Verify user rejection at Confirm returns to Investigate
  - Verify custom debug mode overrides groups but keeps FSM active
