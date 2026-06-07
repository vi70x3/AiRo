# Design: Debug Workflow Enforcement

## Overview

The Debug Workflow Enforcement feature implements a deterministic Finite State Machine (FSM) that extends the existing debug mode with phase-based tool restrictions, structured hypothesis requirements, and confirmation gates. The design follows existing codebase patterns: zod schemas for configuration, pure functions for deterministic logic, the existing `ModeConfig` infrastructure for mode definition, and the existing tool filtering pipeline for enforcement.

The debug FSM is not a replacement for the debug mode — it is an enforcement layer that activates when the `debugWorkflow.enabled` configuration is `true` and the current mode is `debug`. When disabled, the existing debug mode behavior (prompt-based guidance only) is preserved with zero overhead.

The FSM has six states with the following enforcement semantics:

| State | Allowed Tools | Required Output | Transition Trigger |
|-------|--------------|-----------------|-------------------|
| Investigate | read, search, explore, logs | Evidence collected | Agent signals hypothesis ready |
| Hypothesize | same as Investigate | Structured JSON hypothesis | Valid hypothesis produced |
| Validate | same as Investigate + execute_command | Log/trace/runtime verification | Validation evidence collected |
| Confirm | same as Investigate | User approval OR confidence > 0.9 | User confirms or confidence threshold met |
| Fix | read + edit tools | Fix applied | Agent signals fix complete |
| Verify | read + execute_command | Test results | Tests pass or agent signals verified |

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Debug Workflow Enforcement                               │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                        Debug FSM Core                                     │  │
│  │                                                                          │  │
│  │  ┌─────────────────┐    ┌──────────────────┐    ┌────────────────────┐  │  │
│  │  │ DebugState      │───>│ StateTransition  │───>│ ToolRestriction    │  │  │
│  │  │ Tracker         │    │ Engine           │    │ Evaluator          │  │  │
│  │  │                 │    │                  │    │                    │  │  │
│  │  │ - currentState  │    │ Validates        │    │ Maps state to      │  │  │
│  │  │ - hypothesis    │    │ transitions      │    │ allowed/blocked    │  │  │
│  │  │ - evidence[]    │    │ against rules    │    │ tool sets          │  │  │
│  │  │ - confidence    │    │                  │    │                    │  │  │
│  │  │ - stateHistory  │    │ Pure function    │    │ Pure function      │  │  │
│  │  └─────────────────┘    └──────────────────┘    └────────────────────┘  │  │
│  │            │                      │                        │             │  │
│  │            │              ┌───────┴────────┐               │             │  │
│  │            │              │                │               │             │  │
│  │            v              v                v               v             │  │
│  │  ┌─────────────────┐  ┌──────────────────────────────────────────────┐  │  │
│  │  │ Hypothesis      │  │ Phase Prompt Injector                        │  │  │
│  │  │ Validator       │  │                                              │  │  │
│  │  │                 │  │ Generates DEBUG WORKFLOW section             │  │  │
│  │  │ Validates JSON  │  │ with state-specific instructions             │  │  │
│  │  │ structure       │  │                                              │  │  │
│  │  └─────────────────┘  └──────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                        Integration Layer                                  │  │
│  │                                                                          │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐ │  │
│  │  │ Tool Filter      │  │ System Prompt    │  │ Execution State Graph  │ │  │
│  │  │ Pipeline         │  │ Generation       │  │ (Phase 1)              │ │  │
│  │  │                  │  │                  │  │                        │ │  │
│  │  │ filterNative     │  │ DEBUG WORKFLOW   │  │ diagnosis <->          │ │  │
│  │  │ ToolsForMode()   │  │ section injected │  │ Investigate/Hypothesize│ │  │
│  │  │ + debug filter   │  │ via generate     │  │ Validate/Confirm       │ │  │
│  │  │                  │  │ Prompt()         │  │                        │ │  │
│  │  └──────────────────┘  └──────────────────┘  │ implementation <-> Fix │ │  │
│  │                                               │ testing <-> Verify     │ │  │
│  │                                               └────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                        Configuration                                      │  │
│  │                                                                          │  │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │  │
│  │  │ globalSettingsSchema.debugWorkflow                              │   │  │
│  │  │                                                                  │   │  │
│  │  │ enabled: false (default)                                         │   │  │
│  │  │ requireUserConfirmation: true                                    │   │  │
│  │  │ confidenceThreshold: 0.9                                         │   │  │
│  │  │ maxInvestigateTurns: 10                                          │   │  │
│  │  │ autoAdvanceFromValidate: false                                    │   │  │
│  │  └──────────────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Component Descriptions

1. **DebugStateTracker**: Maintains the current debug FSM state, hypothesis, evidence list, confidence level, and state transition history. Serializable to JSON for task persistence. Lives in `packages/types/src/loop-detection.ts`.

2. **StateTransitionEngine**: Pure function that validates and executes state transitions. Checks transition rules (e.g., cannot skip from Investigate to Fix), validates required outputs (e.g., hypothesis must be present to leave Hypothesize), and returns the new state or a transition error.

3. **ToolRestrictionEvaluator**: Pure function that maps a debug FSM state to a set of allowed/blocked tool names. Used by the tool filtering pipeline to enforce phase-based tool restrictions.

4. **HypothesisValidator**: Validates that the agent's output contains a valid structured hypothesis JSON with the required `possible_causes` (3-7 items) and `likely_causes` (1-2 items) fields.

5. **PhasePromptInjector**: Generates the `DEBUG WORKFLOW` section for the system prompt, including current state, allowed tools, required output, and transition conditions. Called from the system prompt generation pipeline.

6. **ConfirmationGate**: Manages the Confirm state logic — determines whether user approval is required or confidence threshold suffices, handles user rejection (transitions back to Investigate), and logs bypass events.

## Integration Points

### 1. `filterNativeToolsForMode()` (`src/core/prompts/tools/filter-tools-for-mode.ts`)

**Invocation Point**: After existing mode filtering logic, before returning filtered tools.

**Changes**:
- Accept an optional `debugFsmState` parameter (string) on the filter settings object
- When `debugFsmState` is provided and `debugWorkflow.enabled` is `true`, apply additional tool restrictions based on the debug FSM state
- The debug filter reads the `TOOL_RESTRICTION_MAP` to determine which tools are allowed/blocked for the current state
- Tools blocked by debug FSM restrictions are removed from the filtered array (same as existing mode-based removal)

**Flow**:
```
nativeTools -> filterNativeToolsForMode (mode groups) -> debugFSMFilter (phase restrictions) -> final tools
```

### 2. `buildNativeToolsArrayWithRestrictions()` (`src/core/task/build-tools.ts`)

**Invocation Point**: After mode filtering, before returning `BuildToolsResult`.

**Changes**:
- Accept an optional `debugFsmState` parameter on `BuildToolsOptions`
- When `debugFsmState` is provided, pass it to `filterNativeToolsForMode()` via the `filterSettings` object
- Include `debugFsmState` in `BuildToolsResult` for observability

### 3. `generatePrompt()` (`src/core/prompts/system.ts`)

**Invocation Point**: After all section generators, before assembling the final prompt.

**Changes**:
- Accept an optional `debugFsmState` parameter
- When `debugFsmState` is provided and `debugWorkflow.enabled` is `true`, call `PhasePromptInjector.generateSection()` to generate the `DEBUG WORKFLOW` section
- Inject the section between `getToolUseGuidelinesSection()` and `getCapabilitiesSection()`

### 4. `packages/types/src/global-settings.ts`

**Changes**: Add `debugWorkflow` section to `globalSettingsSchema` with 5 parameters following the existing `.optional().default()` pattern.

### 5. `packages/types/src/loop-detection.ts`

**Changes**: Add `DebugFsmState`, `DebugFsmConfig`, `DebugStateTracker`, and `StateTransition` types. These are new types added to the existing file alongside the existing `ReasoningTurn`, `LoopConfidenceState`, etc.

### 6. `src/shared/modes.ts`

**Changes**: No changes to the mode resolution logic. The existing debug mode definition (slug: `"debug"`) is used as-is. The debug FSM is an enforcement layer on top of the mode, not a new mode.

### 7. Execution State Graph (Phase 1 Integration)

**Changes**: The debug FSM state transitions are mapped to Execution State Graph phase transitions. When the debug FSM advances, the corresponding Execution State Graph phase is also updated. This is a one-way sync: debug FSM drives the Execution State Graph, not the reverse.

## Data Structures

### DebugFsmState

```typescript
/**
 * States of the Debug Finite State Machine.
 * Ordered: Investigate -> Hypothesize -> Validate -> Confirm -> Fix -> Verify
 */
export type DebugFsmState =
  | "investigate"
  | "hypothesize"
  | "validate"
  | "confirm"
  | "fix"
  | "verify"
```

### DebugFsmConfig

```typescript
/**
 * Configuration for the debug workflow enforcement.
 * Follows the existing zod schema pattern in global-settings.ts.
 */
export const debugWorkflowSchema = z.object({
  enabled: z.boolean().optional().default(false),
  requireUserConfirmation: z.boolean().optional().default(true),
  confidenceThreshold: z.number().min(0.5).max(0.99).optional().default(0.9),
  maxInvestigateTurns: z.number().int().min(3).max(50).optional().default(10),
  autoAdvanceFromValidate: z.boolean().optional().default(false),
})

export type DebugFsmConfig = z.infer<typeof debugWorkflowSchema>
```

### DebugStateTracker

```typescript
/**
 * Tracks the state of the debug FSM for a debug session.
 * Serializable to JSON for task persistence.
 */
export interface DebugStateTracker {
  /** Current FSM state */
  currentState: DebugFsmState
  /** Structured hypothesis produced during Hypothesize state (null if not yet produced) */
  hypothesis: DebugHypothesis | null
  /** Evidence collected during Investigate and Validate states */
  evidence: DebugEvidence[]
  /** Agent's diagnostic confidence (0.0 to 1.0) */
  confidence: number
  /** Ordered history of state transitions with timestamps */
  stateHistory: StateTransition[]
  /** Number of consecutive turns in Investigate state */
  investigateTurnCount: number
  /** Timestamp when the debug FSM was activated */
  activatedAt: number
}
```

### DebugHypothesis

```typescript
/**
 * Structured hypothesis produced during the Hypothesize state.
 */
export interface DebugHypothesis {
  /** 3-7 candidate causes */
  possibleCauses: string[]
  /** 1-2 most likely causes distilled from possibleCauses */
  likelyCauses: string[]
  /** Agent's confidence in the likely causes (0.0 to 1.0) */
  confidence: number
  /** Timestamp when the hypothesis was produced */
  timestamp: number
}
```

### DebugEvidence

```typescript
/**
 * Evidence collected during Investigate and Validate states.
 */
export interface DebugEvidence {
  /** Unique identifier for this evidence entry */
  id: string
  /** Type of evidence */
  type: "log" | "trace" | "runtime_verification" | "file_inspection" | "test_output"
  /** Description of the evidence */
  description: string
  /** Files touched or inspected */
  filesInvolved: string[]
  /** Timestamp when evidence was collected */
  timestamp: number
}
```

### StateTransition

```typescript
/**
 * Records a single state transition in the debug FSM.
 */
export interface StateTransition {
  fromState: DebugFsmState
  toState: DebugFsmState
  /** What triggered the transition */
  trigger: "tool_evidence" | "hypothesis_produced" | "validation_complete" | "user_confirmed" | "user_rejected" | "confidence_threshold" | "agent_signal" | "max_turns_exceeded"
  /** Evidence or confirmation that triggered the transition */
  triggerDetail: string
  timestamp: number
}
```

### ToolRestrictionMap

```typescript
/**
 * Maps each debug FSM state to its allowed and blocked tool groups.
 * Used by the ToolRestrictionEvaluator to enforce phase-based tool restrictions.
 */
export interface PhaseToolRestrictions {
  /** Tool names that are explicitly allowed in this state */
  allowedTools: string[]
  /** Tool names that are explicitly blocked in this state */
  blockedTools: string[]
  /** Description of why tools are restricted (for system prompt) */
  restrictionReason: string
}

export const DEBUG_TOOL_RESTRICTIONS: Record<DebugFsmState, PhaseToolRestrictions> = {
  investigate: {
    allowedTools: [
      "read_file", "search_files", "list_files", "codebase_search",
      "search_symbols", "get_context_bundle", "search_text",
      "get_symbol_source", "get_file_outline", "get_repo_map", "search_ast",
      "execute_command", "read_command_output",
    ],
    blockedTools: [
      "apply_diff", "write_to_file", "edit", "search_and_replace",
      "edit_file", "apply_patch",
    ],
    restrictionReason: "Investigation phase: read and explore tools only. Edit tools are blocked to prevent premature fixes.",
  },
  hypothesize: {
    allowedTools: [
      "read_file", "search_files", "list_files", "codebase_search",
      "search_symbols", "get_context_bundle", "search_text",
      "get_symbol_source", "get_file_outline", "get_repo_map", "search_ast",
      "execute_command", "read_command_output",
    ],
    blockedTools: [
      "apply_diff", "write_to_file", "edit", "search_and_replace",
      "edit_file", "apply_patch",
    ],
    restrictionReason: "Hypothesis phase: same as Investigate. Produce a structured hypothesis before proceeding.",
  },
  validate: {
    allowedTools: [
      "read_file", "search_files", "list_files", "codebase_search",
      "search_symbols", "get_context_bundle", "search_text",
      "get_symbol_source", "get_file_outline", "get_repo_map", "search_ast",
      "execute_command", "read_command_output",
    ],
    blockedTools: [
      "apply_diff", "write_to_file", "edit", "search_and_replace",
      "edit_file", "apply_patch",
    ],
    restrictionReason: "Validation phase: add logs, inspect traces, or run verification commands. Edit tools remain blocked.",
  },
  confirm: {
    allowedTools: [
      "read_file", "search_files", "list_files", "codebase_search",
      "search_symbols", "get_context_bundle", "search_text",
      "get_symbol_source", "get_file_outline", "get_repo_map", "search_ast",
      "execute_command", "read_command_output",
    ],
    blockedTools: [
      "apply_diff", "write_to_file", "edit", "search_and_replace",
      "edit_file", "apply_patch",
    ],
    restrictionReason: "Confirmation phase: await user approval or confidence threshold. Edit tools remain blocked until confirmed.",
  },
  fix: {
    allowedTools: [
      "read_file", "search_files", "list_files", "codebase_search",
      "search_symbols", "get_context_bundle", "search_text",
      "get_symbol_source", "get_file_outline", "get_repo_map", "search_ast",
      "execute_command", "read_command_output",
      "apply_diff", "write_to_file", "edit", "search_and_replace",
      "edit_file", "apply_patch",
    ],
    blockedTools: [],
    restrictionReason: "Fix phase: all tools available. Apply the confirmed fix.",
  },
  verify: {
    allowedTools: [
      "read_file", "search_files", "list_files", "codebase_search",
      "search_symbols", "get_context_bundle", "search_text",
      "get_symbol_source", "get_file_outline", "get_repo_map", "search_ast",
      "execute_command", "read_command_output",
    ],
    blockedTools: [
      "apply_diff", "write_to_file", "edit", "search_and_replace",
      "edit_file", "apply_patch",
    ],
    restrictionReason: "Verify phase: run tests to confirm the fix. Edit tools blocked to prevent unverified changes.",
  },
}
```

### DebugWorkflowSection

```typescript
/**
 * Content for the DEBUG WORKFLOW section injected into the system prompt.
 */
export interface DebugWorkflowSection {
  currentState: DebugFsmState
  allowedTools: string[]
  blockedTools: string[]
  requiredOutput: string
  transitionCondition: string
  restrictionReason: string
  hypothesis: DebugHypothesis | null
  evidenceCount: number
  investigateTurnCount: number
  confidence: number
}
```

## Algorithms

### 1. State Transition Engine (Core Algorithm)

```typescript
/**
 * Validates and executes a debug FSM state transition.
 * Pure function: given the same state, request, and context, always returns the same result.
 *
 * @param current - Current debug state tracker
 * @param requested - The state the agent wants to transition to
 * @param context - Transition context (hypothesis, evidence, confidence, user input)
 * @param config - Debug workflow configuration
 * @returns New DebugStateTracker with updated state, or a TransitionError
 */
function transitionState(
  current: DebugStateTracker,
  requested: DebugFsmState,
  context: TransitionContext,
  config: DebugFsmConfig,
): DebugStateTracker | TransitionError {
  // 1. Validate transition is legal
  const validTransitions = getValidTransitions(current.currentState)
  if (!validTransitions.includes(requested)) {
    return {
      error: "invalid_transition",
      message: `Cannot transition from ${current.currentState} to ${requested}. Valid transitions: ${validTransitions.join(", ")}`,
      currentState: current.currentState,
    }
  }

  // 2. Validate required outputs for current state
  const validationError = validateRequiredOutput(current, requested, context, config)
  if (validationError) {
    return validationError
  }

  // 3. Execute transition
  const transition: StateTransition = {
    fromState: current.currentState,
    toState: requested,
    trigger: context.trigger,
    triggerDetail: context.triggerDetail,
    timestamp: Date.now(),
  }

  return {
    ...current,
    currentState: requested,
    hypothesis: context.hypothesis ?? current.hypothesis,
    evidence: [...current.evidence, ...(context.newEvidence ?? [])],
    confidence: context.confidence ?? current.confidence,
    stateHistory: [...current.stateHistory, transition],
    investigateTurnCount: requested === "investigate"
      ? current.investigateTurnCount + 1
      : (requested !== "hypothesize" ? 0 : current.investigateTurnCount),
  }
}
```

### 2. Valid Transition Rules

```typescript
/**
 * Defines the valid state transitions for the debug FSM.
 * Each state maps to the set of states it can legally transition to.
 */
const VALID_TRANSITIONS: Record<DebugFsmState, DebugFsmState[]> = {
  investigate: ["hypothesize"],
  hypothesize: ["validate"],
  validate: ["confirm"],
  confirm: ["fix", "investigate"],  // Can go back to investigate if user rejects
  fix: ["verify"],
  verify: ["investigate", "fix"],  // Can go back to investigate (new issue) or fix (failed tests)
}

function getValidTransitions(currentState: DebugFsmState): DebugFsmState[] {
  return VALID_TRANSITIONS[currentState]
}
```

### 3. Required Output Validation

```typescript
/**
 * Validates that the required output for the current state is present
 * before allowing transition to the next state.
 */
function validateRequiredOutput(
  current: DebugStateTracker,
  requested: DebugFsmState,
  context: TransitionContext,
  config: DebugFsmConfig,
): TransitionError | null {
  switch (current.currentState) {
    case "investigate":
      // Must have collected at least some evidence
      if (current.evidence.length === 0) {
        return {
          error: "missing_evidence",
          message: "Cannot transition from Investigate to Hypothesize without collecting evidence. Use read, search, or explore tools to gather information about the problem.",
          currentState: current.currentState,
        }
      }
      break

    case "hypothesize":
      // Must have produced a valid hypothesis
      if (!context.hypothesis || !isValidHypothesis(context.hypothesis)) {
        return {
          error: "missing_hypothesis",
          message: "Cannot transition from Hypothesize to Validate without producing a structured hypothesis. Output a JSON object with 'possible_causes' (3-7 items) and 'likely_causes' (1-2 items).",
          currentState: current.currentState,
        }
      }
      break

    case "validate":
      // Must have validation evidence (log insertion, trace, or runtime verification)
      const hasValidationEvidence = context.newEvidence?.some(
        (e) => e.type === "log" || e.type === "trace" || e.type === "runtime_verification"
      ) ?? false
      if (!hasValidationEvidence && !config.autoAdvanceFromValidate) {
        return {
          error: "missing_validation",
          message: "Cannot transition from Validate to Confirm without validation evidence. Add logs, inspect traces, or run verification commands.",
          currentState: current.currentState,
        }
      }
      break

    case "confirm":
      // Must have user confirmation or confidence > threshold
      if (config.requireUserConfirmation && context.trigger !== "user_confirmed") {
        return {
          error: "confirmation_required",
          message: "Cannot transition from Fix without user confirmation. Use ask_followup_question to present the diagnosis and proposed fix, or set confidence > threshold.",
          currentState: current.currentState,
        }
      }
      if (!config.requireUserConfirmation && context.trigger !== "user_confirmed") {
        if (current.confidence < config.confidenceThreshold) {
          return {
            error: "low_confidence",
            message: `Cannot transition from Confirm to Fix: confidence (${current.confidence}) is below threshold (${config.confidenceThreshold}). Collect more evidence or get user confirmation.`,
            currentState: current.currentState,
          }
        }
      }
      break

    case "fix":
      // No special requirements to move to verify
      break

    case "verify":
      // Must have test output evidence
      const hasTestEvidence = context.newEvidence?.some(
        (e) => e.type === "test_output"
      ) ?? false
      if (!hasTestEvidence) {
        return {
          error: "missing_test_evidence",
          message: "Cannot complete verification without test output. Run tests using execute_command to verify the fix.",
          currentState: current.currentState,
        }
      }
      break
  }

  return null
}
```

### 4. Hypothesis Validation

```typescript
/**
 * Validates that a hypothesis object has the required structure.
 */
function isValidHypothesis(hypothesis: DebugHypothesis): boolean {
  return (
    Array.isArray(hypothesis.possibleCauses) &&
    hypothesis.possibleCauses.length >= 3 &&
    hypothesis.possibleCauses.length <= 7 &&
    Array.isArray(hypothesis.likelyCauses) &&
    hypothesis.likelyCauses.length >= 1 &&
    hypothesis.likelyCauses.length <= 2 &&
    typeof hypothesis.confidence === "number" &&
    hypothesis.confidence >= 0 &&
    hypothesis.confidence <= 1 &&
    // likelyCauses must be a subset of possibleCauses
    hypothesis.likelyCauses.every((c) => hypothesis.possibleCauses.includes(c))
  )
}
```

### 5. Debug FSM Tool Filter

```typescript
/**
 * Filters tools based on the current debug FSM state.
 * Called after mode filtering in the tool pipeline.
 *
 * @param tools - Tools already filtered by mode
 * @param debugFsmState - Current debug FSM state
 * @param config - Debug workflow configuration
 * @returns Tools filtered by debug FSM phase restrictions
 */
function filterToolsForDebugState(
  tools: OpenAI.Chat.ChatCompletionTool[],
  debugFsmState: DebugFsmState,
  config: DebugFsmConfig,
): OpenAI.Chat.ChatCompletionTool[] {
  if (!config.enabled) {
    return tools
  }

  const restrictions = DEBUG_TOOL_RESTRICTIONS[debugFsmState]
  const blockedSet = new Set(restrictions.blockedTools)

  return tools.filter((tool) => {
    if ("function" in tool && tool.function) {
      return !blockedSet.has(tool.function.name)
    }
    return true
  })
}
```

### 6. System Prompt Section Generator

```typescript
/**
 * Generates the DEBUG WORKFLOW section for the system prompt.
 * Called from generatePrompt() when debug FSM is active.
 */
export function getDebugWorkflowSection(
  state: DebugStateTracker,
  config: DebugFsmConfig,
): string {
  if (!config.enabled) {
    return ""
  }

  const restrictions = DEBUG_TOOL_RESTRICTIONS[state.currentState]
  const lines: string[] = ["====", "", "DEBUG WORKFLOW", ""]

  // State diagram
  lines.push("Debug workflow states: Investigate -> Hypothesize -> Validate -> Confirm -> Fix -> Verify")
  lines.push("")
  lines.push(`Current state: ${state.currentState.toUpperCase()}`)
  lines.push("")

  // Allowed tools
  lines.push("Allowed tools:")
  for (const tool of restrictions.allowedTools) {
    lines.push(`  - ${tool}`)
  }
  lines.push("")

  // Blocked tools (if any)
  if (restrictions.blockedTools.length > 0) {
    lines.push("BLOCKED tools (do not use):")
    for (const tool of restrictions.blockedTools) {
      lines.push(`  - ${tool}`)
    }
    lines.push(`  Reason: ${restrictions.restrictionReason}`)
    lines.push("")
  }

  // Required output for current state
  lines.push("Required output for this state:")
  lines.push(getRequiredOutput(state.currentState))
  lines.push("")

  // Transition condition
  lines.push("To advance to the next state:")
  lines.push(getTransitionCondition(state.currentState, state, config))
  lines.push("")

  // State history summary
  if (state.stateHistory.length > 0) {
    lines.push("State transitions so far:")
    for (const transition of state.stateHistory) {
      lines.push(`  ${transition.fromState} -> ${transition.toState} (${transition.trigger})`)
    }
    lines.push("")
  }

  // Hypothesis (if produced)
  if (state.hypothesis) {
    lines.push("Current hypothesis:")
    lines.push(`  Possible causes: ${state.hypothesis.possibleCauses.join(", ")}`)
    lines.push(`  Likely causes: ${state.hypothesis.likelyCauses.join(", ")}`)
    lines.push(`  Confidence: ${state.hypothesis.confidence}`)
    lines.push("")
  }

  return lines.join("\n")
}

function getRequiredOutput(state: DebugFsmState): string {
  const outputs: Record<DebugFsmState, string> = {
    investigate: "Collect evidence about the problem using read, search, and explore tools. Gather logs, inspect traces, and read relevant files.",
    hypothesize: "Produce a structured JSON hypothesis with 'possible_causes' (3-7 items) and 'likely_causes' (1-2 items). Include confidence level.",
    validate: "Add logging statements, inspect traces, or run verification commands to validate your hypothesis. Collect evidence that supports or refutes the likely causes.",
    confirm: "Present the diagnosis and proposed fix to the user via ask_followup_question. Wait for user approval before proceeding.",
    fix: "Apply the confirmed fix using edit tools. Make targeted changes based on the validated hypothesis.",
    verify: "Run tests using execute_command to verify the fix resolves the issue. Inspect test output using read_file.",
  }
  return outputs[state]
}

function getTransitionCondition(
  state: DebugFsmState,
  tracker: DebugStateTracker,
  config: DebugFsmConfig,
): string {
  const conditions: Record<DebugFsmState, string> = {
    investigate: "Signal that you have enough evidence to form a hypothesis. The system will transition to Hypothesize.",
    hypothesize: "Output your structured hypothesis as JSON. The system will validate the format and transition to Validate.",
    validate: "Complete your validation with evidence (logs, traces, or runtime verification). The system will transition to Confirm.",
    confirm: config.requireUserConfirmation
      ? "Wait for user approval. If rejected, you will return to Investigate. If approved, you will proceed to Fix."
      : `Wait for user approval or reach confidence > ${config.confidenceThreshold}.`,
    fix: "Signal that the fix is applied. The system will transition to Verify.",
    verify: "Run tests and report results. If tests pass, the debug workflow is complete. If tests fail, you will return to Investigate or Fix.",
  }
  return conditions[state]
}
```

### 7. Execution State Graph Sync

```typescript
/**
 * Maps debug FSM states to Execution State Graph phase updates.
 * Called after each successful debug FSM transition.
 */
function syncDebugFsmToExecutionGraph(
  debugState: DebugFsmState,
  executionGraph: ExecutionStateGraph,
): ExecutionStateGraph {
  const newState = { ...executionGraph }

  switch (debugState) {
    case "investigate":
    case "hypothesize":
    case "validate":
    case "confirm":
      // These states map to the diagnosis phase
      if (newState.diagnosis.status === "not_started") {
        newState.diagnosis.status = "investigating"
      }
      break
    case "fix":
      // Fix maps to implementation phase
      newState.diagnosis.status = "confirmed"
      newState.implementation.status = "editing"
      break
    case "verify":
      // Verify maps to testing phase
      newState.implementation.status = "edited"
      newState.testing.status = "running"
      break
  }

  return newState
}
```

## Performance Constraints

- **State transition**: Synchronous, in-memory operation. Must complete in under 1ms per transition.
- **Tool filtering**: Synchronous set-based lookup. Must complete in under 1ms per tool array build.
- **Hypothesis validation**: Synchronous JSON structure check. Must complete in under 1ms.
- **System prompt generation**: String concatenation. Must complete in under 5ms.
- **No additional API calls**: The debug FSM does not make any LLM or network calls. All operations are local and deterministic.
- **Memory**: DebugStateTracker is small (< 2KB serialized). Evidence list is capped at 100 entries per debug session.
- **Backward compatibility**: When `enabled` is `false`, the debug FSM is not instantiated. Zero overhead. The existing debug mode behavior is preserved.
- **Serialization**: The DebugStateTracker is included in task persistence but adds less than 2KB to the task state.

## File Change Summary

| File | Change Type | Description |
|------|------------|-------------|
| `packages/types/src/global-settings.ts` | Modify | Add `debugWorkflow` section to `globalSettingsSchema` with 5 parameters |
| `packages/types/src/loop-detection.ts` | Modify | Add `DebugFsmState`, `DebugFsmConfig`, `DebugStateTracker`, `DebugHypothesis`, `DebugEvidence`, `StateTransition`, `TransitionContext`, `TransitionError` types |
| `src/core/prompts/tools/debug-fsm.ts` | Create | Core FSM: `transitionState()`, `validateRequiredOutput()`, `isValidHypothesis()`, `getValidTransitions()`, `DEBUG_TOOL_RESTRICTIONS` |
| `src/core/prompts/tools/debug-fsm-filter.ts` | Create | Tool filter: `filterToolsForDebugState()`, `getDebugToolRestrictionSection()` |
| `src/core/prompts/tools/debug-fsm-section.ts` | Create | System prompt section: `getDebugWorkflowSection()`, `getRequiredOutput()`, `getTransitionCondition()` |
| `src/core/prompts/tools/index.ts` | Modify | Export new debug FSM functions and types |
| `src/core/prompts/tools/filter-tools-for-mode.ts` | Modify | Accept optional `debugFsmState` parameter, apply debug tool restrictions |
| `src/core/prompts/system.ts` | Modify | Accept optional `debugFsmState`, inject `DEBUG WORKFLOW` section |
| `src/core/task/build-tools.ts` | Modify | Accept optional `debugFsmState`, pass to filter function |
| `src/core/prompts/tools/__tests__/debug-fsm.spec.ts` | Create | Unit tests for state transitions, validation, hypothesis checking |
| `src/core/prompts/tools/__tests__/debug-fsm-filter.spec.ts` | Create | Unit tests for tool filtering per debug state |
| `src/core/prompts/tools/__tests__/debug-fsm-section.spec.ts` | Create | Unit tests for system prompt section generation |
| `src/core/task/__tests__/build-tools-debug-fsm.spec.ts` | Create | Integration tests for debug FSM in tool array building |
