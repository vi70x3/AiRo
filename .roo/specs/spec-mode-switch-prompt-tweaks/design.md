# Design: Spec Mode Switch Prompt Tweaks

## Architecture

This is a prompt engineering change — no code architecture changes needed. The modification is entirely within the `customInstructions` string of the spec mode in `DEFAULT_MODES`.

## File to Modify

**Single file**: [`packages/types/src/mode.ts`](packages/types/src/mode.ts:168) — the `DEFAULT_MODES` constant, specifically the `customInstructions` field of the spec mode entry (slug: `"spec"`).

## Current Behavior

Step 9 currently asks a yes/no "do you want to start implementation?" then conditionally calls `switch_mode`. This buries the mode switch behind a generic prompt.

## New Behavior

Step 9 should instruct the agent to:
1. Assess complexity (simple vs complex) based on tasks.md length, file count, and scope
2. Use `ask_followup_question` with mode-switch options as primary suggested actions
3. Order options: Orchestrator first for complex, Vibe/Debug first for simple
4. Always include "not ready" as the last option
5. Each option includes a `mode` parameter for direct switching

## Complexity Heuristics

- **Simple**: <=5 tasks, <=3 files, single module
- **Complex**: >5 tasks, >3 files, cross-cutting concerns

## New Step 9 Text

Replace the existing step 9 with:

```
9. After all documents are complete, assess the complexity of the spec you just created. Use the `ask_followup_question` tool to present mode-switch options as the primary suggested actions. Determine complexity: **Simple** (<=5 tasks, <=3 files, single module) or **Complex** (>5 tasks, >3 files, cross-cutting concerns). Present options in this order:

   **For Complex specs:**
   - First: "Switch to Orchestrator mode for multi-step implementation" with mode "orchestrator"
   - Then: implementation mode based on spec type:
     - **feature** spec type -> "Switch to Vibe mode to implement this feature" with mode "vibe"
     - **bugfix** spec type -> "Switch