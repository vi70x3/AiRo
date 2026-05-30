# Design Document: Vibe Task-Commit Ordering

## Overview

This feature reorders the completion sequence in the Vibe mode `customInstructions` in [`packages/types/src/mode.ts`](packages/types/src/mode.ts:190) so that the spec's `tasks.md` file is updated **before** committing changes. This ensures the updated task tracker is included in the commit and the worktree is clean when the agent finishes.

## Current State

The current completion sequence in the Vibe mode `customInstructions` is:

```
1. Commit changes         (git add -A + git commit)
2. Push and suggest PR    (git push -u origin spec/<name>)
3. Mark tasks completed   (update_todo_list → all [x])
4. attempt_completion
```

This ordering means the spec's `tasks.md` file (which is part of the repo) gets updated **after** the commit, leaving it as an uncommitted modification in the worktree.

## Proposed State

The revised completion sequence will be:

```
1. Update spec tasks.md   (mark all [x] in .roo/specs/<name>/tasks.md)
2. Mark internal todos    (update_todo_list → all [x])
3. Commit changes         (git add -A + git commit — now includes updated tasks.md)
4. Push and suggest PR    (git push -u origin spec/<name>)
5. attempt_completion
```

## Detailed Design

### Change: Reorder Completion Sequence in Vibe Mode customInstructions

The only change is to the `customInstructions` string on the Vibe mode config at [`packages/types/src/mode.ts`](packages/types/src/mode.ts:190). Specifically, the numbered completion sequence section needs to be reordered.

#### Current ordering constraint (from the existing customInstructions):

```
The completion sequence MUST be:
1. Commit changes (Requirement 3)
2. Push branch (Requirement 4)
3. Mark all tasks completed (Requirement 5)
4. Call attempt_completion with result including PR suggestion
```

#### Proposed ordering constraint:

```
The completion sequence MUST be:
1. Update the spec's tasks.md file (mark all completed tasks as [x])
2. Mark all internal todos as [x] via update_todo_list
3. Commit all changes including the updated tasks.md
4. Push branch to origin
5. Call attempt_completion with result including PR suggestion
```

### What Stays the Same

- Branch management (create/reuse `spec/<spec-name>` branch) — unchanged
- Spec name detection logic — unchanged
- Commit message format (conventional commits) — unchanged
- Push behavior (push to `origin`, not upstream) — unchanged
- PR suggestion format — unchanged
- Edge case handling (no git repo, direct Vibe entry) — unchanged
- The `update_todo_list` tool call is still required — it's a separate concern from updating the spec's `tasks.md`

### File Change Summary

| File | Change |
|------|--------|
| [`packages/types/src/mode.ts`](packages/types/src/mode.ts:190) | Reorder the completion sequence in Vibe mode `customInstructions` — move "update tasks.md" and "mark internal todos" before "commit changes" |

### Test Impact

- The snapshot at [`src/core/prompts/__tests__/__snapshots__/add-custom-instructions/vibe-mode-rules.snap`](src/core/prompts/__tests__/__snapshots__/add-custom-instructions/vibe-mode-rules.snap) will need updating since the `customInstructions` content changes.
- No new test files need to be created — existing snapshot tests will automatically detect the changes.

## Edge Cases

### No Spec (Ad-hoc Changes)

If the user entered Vibe mode directly without a spec, there is no `.roo/specs/<name>/tasks.md` to update. In this case, the agent should skip the `tasks.md` update step and proceed with the rest of the sequence (mark internal todos → commit → push → complete).

### tasks.md Already Up to Date

If the agent already updated `tasks.md` during implementation (e.g., marking tasks as it went), the step is effectively a no-op. The agent should still verify the file reflects the current state before committing.

### Pre-commit Hook Failures

If pre-commit hooks fail after the `tasks.md` update is staged, the agent fixes issues, re-stages, and retries — same as before. The `tasks.md` update remains part of the commit.
