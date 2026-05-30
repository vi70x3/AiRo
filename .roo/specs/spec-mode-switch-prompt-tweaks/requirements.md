# Requirements: Spec Mode Switch Prompt Tweaks

## Overview

Update the Spec mode's `customInstructions` in `DEFAULT_MODES` to change how the mode-switch prompt behaves when all spec documents are complete. Instead of asking a yes/no question about implementation and then conditionally switching modes, the `ask_followup_question` should present mode-switch options as the **primary suggested actions**, intelligently ordered based on task complexity.

## Problem Statement

Currently, when the Spec mode finishes creating all spec documents, step 9 of the `customInstructions` asks:

> "Do you want to start implementation?" → Yes/No

If the user says "Yes", the mode then decides which mode to switch to. This is a two-step process that buries the mode switch behind a generic yes/no. Users should be presented with the mode switch as the **first-class action** directly.

## Requirements

### FR-1: Mode-switch options as primary actions

The `ask_followup_question` at the end of the spec workflow should present mode-switch options as the primary suggested answers, not as a hidden follow-up to a yes/no question.

### FR-2: Intelligent ordering based on task complexity

The order of suggested mode-switch options should adapt based on the assessed complexity of the spec:

- **Complex tasks** (multiple files, cross-cutting concerns, many tasks): Suggest **Orchestrator** first, then Vibe/Debug, then "not ready"
- **Simple tasks** (few files, focused scope, few tasks): Suggest **Vibe/Debug** first (based on spec type), then Orchestrator, then "not ready"

### FR-3: Context-aware mode suggestions

The suggested modes must account for the spec type chosen earlier in the workflow:

- **bugfix** spec type → Include Debug mode option
- **feature** spec type → Include Vibe mode option
- **Both types** → Include both Vibe and Debug options

### FR-4: Orchestrator option always present

The Orchestrator mode option should always be available as a choice (not just for complex tasks), but its position in the order should vary:
- First position for complex tasks
- After Vibe/Debug for simple tasks

### FR-5: "Not ready" option always last

The option to defer implementation ("I'm not ready to implement yet" or similar) should always be the last option.

### FR-6: Preserve existing behavior for mode switch

The actual `switch_mode` call behavior remains unchanged:
- `reason` parameter must include spec name: `"Implementing spec: <spec-name>"`
- Mode slug mapping: bugfix → debug, feature → vibe

### FR-7: No changes to other modes

This change only affects the Spec mode's `customInstructions`. No other mode's behavior, tool definitions, or system prompt structure should be modified.

## Out of Scope

- Changes to the `switch_mode` tool definition
- Changes to the `ask_followup_question` tool definition
- Changes to how Vibe/Debug/Orchestrator modes work after the switch
- Changes to the spec document creation workflow (steps 1-8)
- UI changes in the webview

## Acceptance Criteria

1. When spec documents are complete, the `ask_followup_question` presents mode-switch options as the primary actions (not buried behind yes/no)
2. For complex specs, Orchestrator is the first option
3. For simple specs, Vibe/Debug is the first option
4. The "not ready" option is always last
5. The spec type (feature/bugfix) determines whether Vibe and/or Debug are suggested
6. The `switch_mode` call still includes the spec name in the reason parameter
7. No other mode's `customInstructions` are affected
