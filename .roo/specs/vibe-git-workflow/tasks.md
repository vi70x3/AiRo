# Tasks: Vibe Git Workflow

## Implementation Tasks

- [ ] Add `customInstructions` to the Vibe mode config in [`packages/types/src/mode.ts`](packages/types/src/mode.ts:182) covering:
  - [ ] Spec name detection section (3-tier: switch_mode reason → `.roo/specs/` directory → ask user)
  - [ ] Branch management section (new spec: `git checkout -b spec/<name>`, existing: `git checkout spec/<name>`)
  - [ ] Commit before completion section (`git add -A`, conventional commit message, handle hook failures)
  - [ ] Push and PR suggestion section (`git push -u origin spec/<name>`, suggest PR to user repo NOT upstream)
  - [ ] Task completion section (mark all `[x]` via `update_todo_list` before `attempt_completion`)
  - [ ] Completion ordering constraint (commit → push → mark tasks → attempt_completion)
  - [ ] Edge case fallback (no git repo → skip git operations; no spec name → ask user)
- [ ] Update Spec mode step 9 in [`packages/types/src/mode.ts`](packages/types/src/mode.ts:179) to include spec name in `switch_mode` reason parameter format: "Implementing spec: <spec-name>"
- [ ] Update the Vibe mode snapshot at [`src/core/prompts/__tests__/__snapshots__/add-custom-instructions/vibe-mode-rules.snap`](src/core/prompts/__tests__/__snapshots__/add-custom-instructions/vibe-mode-rules.snap)
- [ ] Update the Spec mode snapshot at [`src/core/prompts/__tests__/__snapshots__/add-custom-instructions/spec-mode-rules.snap`](src/core/prompts/__tests__/__snapshots__/add-custom-instructions/spec-mode-rules.snap)
- [ ] Run existing tests to verify no regressions: `cd src && npx vitest run core/prompts/__tests__/add-custom-instructions.spec.ts`
- [ ] Run mode-related tests: `cd src && npx vitest run core/config/__tests__/ModeConfig.spec.ts`
- [ ] Run the full test suite for the types package: `cd packages/types && npx vitest run`
- [ ] Verify the Vibe mode `customInstructions` render correctly in the system prompt by checking the updated snapshots