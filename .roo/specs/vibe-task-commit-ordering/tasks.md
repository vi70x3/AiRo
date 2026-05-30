# Tasks: Vibe Task-Commit Ordering

## Implementation Tasks

- [x] Reorder the completion sequence in Vibe mode `customInstructions` in [`packages/types/src/mode.ts`](packages/types/src/mode.ts:190):
  - [x] Move "Update spec's `tasks.md`" (mark all `[x]`) to be step 1 of the completion sequence
  - [x] Move "Mark internal todos via `update_todo_list`" to be step 2
  - [x] Keep "Commit changes" as step 3 (now includes the updated `tasks.md` in the commit)
  - [x] Keep "Push to origin" as step 4
  - [x] Keep "Call `attempt_completion` with PR suggestion" as step 5
  - [x] Add note that if there is no spec (ad-hoc Vibe session), skip the `tasks.md` update step
- [x] Update the Vibe mode snapshot at [`src/core/prompts/__tests__/__snapshots__/add-custom-instructions/vibe-mode-rules.snap`](src/core/prompts/__tests__/__snapshots__/add-custom-instructions/vibe-mode-rules.snap)
- [x] Run existing tests to verify no regressions: `cd src && npx vitest run core/prompts/__tests__/add-custom-instructions.spec.ts`
- [x] Verify the updated completion sequence renders correctly in the system prompt snapshot
- [x] Fix design.md: add `text` language identifier to all fenced code blocks (MD040)
- [x] Fix mode.ts: handle ad-hoc (no-spec) case in push/PR step — conditional flow for spec vs current branch
- [x] Fix mode.ts: make branch management step 2 conditional on spec name being found
- [x] Fix mode.ts: update Completion Sequence and Edge Cases to reflect conditional behavior
