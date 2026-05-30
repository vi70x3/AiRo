# Requirements Document: Vibe Task-Commit Ordering

## Introduction

The Vibe mode (✨ Vibe, slug: `vibe`) currently instructs the agent to commit changes and push the branch **before** marking tasks as completed in the spec's `tasks.md` file. This ordering leaves the updated `tasks.md` as an uncommitted change in the worktree, which is problematic because:

1. The task completion status is part of the spec's record of work done
2. Leaving it uncommitted means the worktree is dirty after the agent declares completion
3. The commit should include the full state of completed work, including the updated task tracker

This feature reorders the completion sequence in the Vibe mode `customInstructions` so that the agent updates the spec's `tasks.md` file first, then commits all changes (including the updated `tasks.md`), then pushes.

## Glossary

- **Vibe Mode**: The code implementation mode (slug: `vibe`) defined in `DEFAULT_MODES` at [`packages/types/src/mode.ts`](packages/types/src/mode.ts:182)
- **Spec Name**: The kebab-case directory name under `.roo/specs/` identifying a feature (e.g., `vibe-git-workflow`)
- **tasks.md**: The task tracking file inside `.roo/specs/<spec-name>/` that contains the checkbox list of implementation tasks
- **customInstructions**: A field on `ModeConfig` that provides mode-specific behavioral instructions injected into the system prompt
- **update_todo_list**: The built-in tool for managing the agent's internal todo list (distinct from the spec's `tasks.md` file)

## Requirements

### Requirement 1: Update tasks.md Before Committing

**User Story:** As a developer, when Vibe mode finishes implementing tasks, I want the agent to update the spec's `tasks.md` file to mark all completed tasks **before** committing, so that the task completion state is included in the commit and the worktree is clean.

#### Acceptance Criteria

1. BEFORE committing changes, THE agent SHALL update the spec's `.roo/specs/<spec-name>/tasks.md` file to mark all completed tasks as `[x]`
2. THE agent SHALL use the `update_todo_list` tool to mark all internal todos as `[x]` completed — this is separate from updating the spec's `tasks.md`
3. THE agent SHALL NOT commit until the spec's `tasks.md` has been updated to reflect completed work
4. IF a task in `tasks.md` cannot be completed, THE agent SHALL inform the user via `ask_followup_question` rather than silently marking it
5. THE updated `tasks.md` SHALL be included in the `git add -A` staging and subsequent commit

### Requirement 2: Revised Completion Ordering

**User Story:** As a developer, I want the completion sequence in Vibe mode to follow a logical order: update task status → commit everything → push → report completion.

#### Acceptance Criteria

1. THE completion sequence in Vibe mode `customInstructions` SHALL be reordered to:
   1. Update the spec's `tasks.md` file (mark tasks as `[x]`)
   2. Use `update_todo_list` to mark all internal todos as `[x]`
   3. Stage all changes: `git add -A`
   4. Commit with conventional commit message
   5. Push to origin
   6. Call `attempt_completion` with PR suggestion
2. THE ordering SHALL ensure no uncommitted changes remain in the worktree when `attempt_completion` is called
3. THE `update_todo_list` call SHALL remain as a separate step from updating the spec's `tasks.md` — both are required

### Requirement 3: No Other Behavioral Changes

**User Story:** As a developer, I want this change to only affect the ordering of the completion sequence, not any other git workflow behavior.

#### Acceptance Criteria

1. THE branch management behavior (create/reuse `spec/<spec-name>` branch) SHALL remain unchanged
2. THE commit message format (conventional commits) SHALL remain unchanged
3. THE push behavior (push to `origin`, not upstream) SHALL remain unchanged
4. THE PR suggestion format SHALL remain unchanged
5. THE spec name detection logic SHALL remain unchanged
6. THE edge case handling (no git repo, direct Vibe entry, etc.) SHALL remain unchanged

## Out of Scope

- Changing the `update_todo_list` tool behavior or schema
- Changing the `switch_mode` tool behavior
- Changing the commit message format
- Changing branch naming conventions
- Changing PR suggestion behavior
- Any changes to other modes (Spec, Debug, Ask, Orchestrator)

## Assumptions

- The spec's `tasks.md` file exists at `.roo/specs/<spec-name>/tasks.md` when Vibe mode is working from a spec
- The `update_todo_list` tool and the spec's `tasks.md` file are two separate things — both need to be updated
- The agent has write access to the spec's `tasks.md` file (it's in the project, not blocked by `.rooignore`)

## Dependencies

- This change depends on the existing Vibe mode `customInstructions` added by the `vibe-git-workflow` spec
- The `execute_command` tool must be available in Vibe mode (it is — groups include `command`)
- The `update_todo_list` tool must be available (it is always available)
