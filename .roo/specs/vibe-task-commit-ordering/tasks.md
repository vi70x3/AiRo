# Tasks: Vibe Task-Commit Ordering

## Implementation Tasks

- [ ] Reorder the completion sequence in Vibe mode `customInstructions` in [`packages/types/src/mode.ts`](packages/types/src/mode.ts:190):
  - [ ] Move "Update spec's `tasks.md`" (mark all `[x]`) to be step 1 of the completion sequence
  - [ ] Move "Mark internal todos via `update_todo_list`" to be step 2
  - [ ] Keep "Commit changes" as step 3 (now includes the updated `tasks.md` in the commit)
  - [ ] Keep "Push to origin" as step 4
  - [ ] Keep "Call `attempt_completion` with PR suggestion" as step 5
  - [ ] Add note that if there is no spec (ad-hoc Vibe session), skip the `tasks.md` update step
- [ ] Update the Vibe mode snapshot at [`src/core/prompts/__tests__/__snapshots__/add-custom-instructions/vibe-mode-rules.snap`](src/core/prompts/__tests__/__snapshots__/add-custom-instructions/vibe-mode-rules.snap)
- [ ] Run existing tests to verify no regressions: `cd src && npx vitest run core/prompts/__tests__/add-custom-instructions.spec.ts`
- [ ] Verify the updated completion sequence renders correctly in the system prompt snapshot
