# Tasks: Vibe Git Workflow

## Implementation Tasks

- [x] Add `customInstructions` to the Vibe mode config in [`packages/types/src/mode.ts`](packages/types/src/mode.ts:190) covering:
  - [x] Spec name detection section (3-tier: switch_mode reason → `.roo/specs/` directory → ask user)
  - [x] Branch management section (new spec: `git checkout -b spec/<name>`, existing: `git checkout spec/<name>`)
  - [x] Commit before completion section (`git add -A`, conventional commit message, handle hook failures)
  - [x] Push and PR suggestion section (`git push -u origin spec/<name>`, suggest PR to user repo NOT upstream)
  - [x] Task completion section (mark all `[x]` via `update_todo_list` before `attempt_completion`)
  - [x] Completion ordering constraint (commit → push → mark tasks → attempt_completion)
  - [x] Edge case fallback (no git repo → skip git operations; no spec name → ask user)
- [x] Update Spec mode step 9 in [`packages/types/src/mode.ts`](packages/types/src/mode.ts:179) to include spec name in `switch_mode` reason parameter format: "Implementing spec: <spec-name>"
- [x] Update the Vibe mode snapshot at [`src/core/prompts/__tests__/__snapshots__/add-custom-instructions/vibe-mode-rules.snap`](src/core/prompts/__tests__/__snapshots__/add-custom-instructions/vibe-mode-rules.snap)
- [x] Update the Spec mode snapshot at [`src/core/prompts/__tests__/__snapshots__/add-custom-instructions/spec-mode-rules.snap`](src/core/prompts/__tests__/__snapshots__/add-custom-instructions/spec-mode-rules.snap)
- [x] Run existing tests to verify no regressions: `cd src && npx vitest run core/prompts/__tests__/add-custom-instructions.spec.ts`
- [x] Run mode-related tests: `cd src && npx vitest run core/config/__tests__/ModeConfig.spec.ts`
- [x] Run the full test suite for the types package: `cd packages/types && npx vitest run`
- [x] Verify the Vibe mode `customInstructions` render correctly in the system prompt by checking the updated snapshots
- [x] Update tasks.md to mark all items as completed
- [x] Update Vibe mode customInstructions to mention updating the spec's tasks.md file (not just update_todo_list)