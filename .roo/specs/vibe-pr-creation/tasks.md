# Tasks: Vibe PR Creation

## Implementation Tasks

- [x] Replace the push/PR section in Vibe mode `customInstructions` in [`packages/types/src/mode.ts`](packages/types/src/mode.ts:190):
  - [x] Replace passive "Consider opening a PR..." text with interactive `ask_followup_question` step
  - [x] Add three-tier fallback chain: GitHub MCP tool → `gh` CLI → pre-filled URL
  - [x] Add dynamic default branch detection (`git symbolic-ref refs/remotes/origin/HEAD`)
  - [x] Add guard: only offer PR creation when on a `spec/<spec-name>` branch (not default branch, not ad-hoc)
  - [x] Ensure non-tool-agnostic wording — describe MCP tool availability as conditional, not assumed
  - [x] Update completion ordering: commit → push → ask about PR → create PR if confirmed → mark tasks → attempt_completion
  - [x] Update `attempt_completion` guidance to include PR creation status in result message
- [x] Update the Vibe mode snapshot at [`src/core/prompts/__tests__/__snapshots__/add-custom-instructions/vibe-mode-rules.snap`](src/core/prompts/__tests__/__snapshots__/add-custom-instructions/vibe-mode-rules.snap)
- [x] Run existing tests to verify no regressions: `cd src && npx vitest run core/prompts/__tests__/add-custom-instructions.spec.ts`
- [x] Verify the updated `customInstructions` render correctly in the system prompt by checking the updated snapshot
