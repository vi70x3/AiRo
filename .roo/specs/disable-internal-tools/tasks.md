# Tasks: Dynamic System Prompt Tool Instruction Removal

## Phase 1: Core Infrastructure

- [ ] **T1.1**: Create `src/core/prompts/tools/tool-availability-context.ts` — implement `ToolAvailabilityContext` class with `isToolAvailable()`, `isToolDisabled()`, `hasAnyAvailable()`, `areAllDisabled()`, and `getDisabledToolNames()` methods. Constructor accepts `string[]` of disabled tool names and resolves aliases via `resolveToolAlias()` from [`filter-tools-for-mode.ts`](src/core/prompts/tools/filter-tools-for-mode.ts:96). Import `ALL_NATIVE_TOOL_NAMES` or derive from existing tool definitions.

- [ ] **T1.2**: Create `src/core/prompts/tools/__tests__/tool-availability-context.spec.ts` — unit tests covering: empty disabled list (all available), partial disabling, full disabling, alias resolution (e.g. `search_and_replace` → `edit`), `undefined`/`null` input handling, `isToolAvailable()`/`isToolDisabled()` consistency.

- [ ] **T1.3**: Create `src/core/prompts/tools/strip-tool-references.ts` — implement `stripDisabledToolReferences(instructions, toolContext)` function with `TOOL_REFERENCE_PATTERNS` registry. Each entry maps a tool name to an array of regex patterns that match common reference formats in mode instructions (bullet-point patterns like `^-.*Use `tool_name`...`, conservative inline patterns). After all replacements, collapse excessive blank lines with `\n{3,}` → `\n\n` and trim.

- [ ] **T1.4**: Create `src/core/prompts/tools/__tests__/strip-tool-references.spec.ts` — unit tests covering: no disabled tools (output identical to input), single tool disabled with bullet-point pattern, multiple tools disabled, alias-based disabling, patterns that don't match (no false removals), blank line cleanup after removals.

## Phase 2: Section Generator Modifications

- [ ] **T2.1**: Modify [`src/core/prompts/sections/capabilities.ts`](src/core/prompts/sections/capabilities.ts) — add optional `toolContext?: ToolAvailabilityContext` parameter to `getCapabilitiesSection()`. Define `CAPABILITY_PHASES` mapping (cli → execute_command, files → list_files, search → search_files/codebase_search, code → read_file, edit → write_to_file/apply_diff/etc, questions → ask_followup_question). Dynamically compose opening summary line by joining phrases for categories where at least one tool is available. Conditionally include/exclude the `execute_command` paragraph and `list_files` references. When `toolContext` is undefined, produce byte-identical output to current version.

- [ ] **T2.2**: Create `src/core/prompts/sections/__tests__/capabilities-tool-aware.spec.ts` — test all combinations: no disabled tools (identical output), `execute_command` disabled (paragraph removed), `list_files` disabled (references removed, generic phrasing), multiple tools disabled, all tools disabled (minimal fallback), `toolContext` undefined (identical to current).

- [ ] **T2.3**: Modify [`src/core/prompts/sections/tool-use-guidelines.ts`](src/core/prompts/sections/tool-use-guidelines.ts) — add optional `toolContext?: ToolAvailabilityContext` parameter. Define `EXAMPLE_TOOL_PRIORITY` array with `{ name, example }` entries for `list_files`, `read_file`, `search_files`, `execute_command`. Pick first available tool for the example sentence. If no example tool available, omit example sentence and shorten to 2-point list. When `toolContext` undefined, produce byte-identical output.

- [ ] **T2.4**: Create `src/core/prompts/sections/__tests__/tool-use-guidelines-tool-aware.spec.ts` — test: no disabled tools (identical output with `list_files` example), `list_files` disabled (falls back to `read_file` example), all example tools disabled (example omitted, 2-point list), `toolContext` undefined (identical to current).

- [ ] **T2.5**: Modify [`src/core/prompts/sections/tool-use.ts`](src/core/prompts/sections/tool-use.ts) — add optional `toolContext?: ToolAvailabilityContext` parameter. When `toolContext.areAllDisabled()` returns true, return minimal content: `"====\n\nTOOL USE\n\nNo tools are available in the current session. Respond directly to the user without attempting tool calls."`. Otherwise return current content unchanged. When `toolContext` undefined, produce byte-identical output.

- [ ] **T2.6**: Modify [`src/core/prompts/sections/custom-instructions.ts`](src/core/prompts/sections/custom-instructions.ts) — at the end of `addCustomInstructions()`, after assembling all custom instruction content, check `options.settings?.disabledTools`. If present, create a `ToolAvailabilityContext`, scan the assembled instructions for references to disabled tools using word-boundary regex matches, and if any are found, append a disclaimer: `"Note: The following tools referenced in your instructions are currently disabled in this session: {tool_names}. Do not attempt to use them."`

- [ ] **T2.7**: Add tests for custom instructions disclaimer in existing test file [`src/core/prompts/__tests__/add-custom-instructions.spec.ts`](src/core/prompts/__tests__/add-custom-instructions.spec.ts) — test: custom instructions referencing disabled tools (disclaimer appended), custom instructions not referencing disabled tools (no disclaimer), no disabled tools setting (no disclaimer), disclaimer format correctness.

## Phase 3: System Prompt Orchestrator

- [ ] **T3.1**: Modify [`src/core/prompts/system.ts`](src/core/prompts/system.ts) — in `generatePrompt()`, after retrieving `settings`, construct `ToolAvailabilityContext` from `settings?.disabledTools ?? []`. Pass `toolContext` to: `getCapabilitiesSection(cwd, mcpHub, toolContext)`, `getToolUseGuidelinesSection(toolContext)`, `getSharedToolUseSection(toolContext)`. Apply `stripDisabledToolReferences(baseInstructions, toolContext)` to `baseInstructions` after the existing `async_task` removal. Ensure `settings` continues to propagate to `addCustomInstructions()` for the disclaimer feature.

- [ ] **T3.2**: Update [`src/core/prompts/sections/index.ts`](src/core/prompts/sections/index.ts) — update exports if function signatures changed (adding `toolContext` params).

- [ ] **T3.3**: Add/update integration tests in [`src/core/prompts/__tests__/system-prompt.spec.ts`](src/core/prompts/__tests__/system-prompt.spec.ts) — test full system prompt generation with: no disabled tools (identical to current), `execute_command` disabled (no execute_command paragraph, no execute_command in capabilities summary), `list_files` disabled (no list_files references, alternative example in guidelines), multiple tools disabled, all tools disabled (minimal sections).

## Phase 4: Response Message Modifications

- [ ] **T4.1**: Modify [`src/core/prompts/responses.ts`](src/core/prompts/responses.ts) — add optional `disabledTools?: string[]` parameter to `noToolsUsed()` and `missingToolParameterError()`. In `noToolsUsed()`, construct `ToolAvailabilityContext` from the param, conditionally include "use the `attempt_completion` tool" and "use the `ask_followup_question` tool" lines based on availability. If neither is available, use generic fallback: "Otherwise, proceed with the next step of the task." When param undefined, produce byte-identical output.

- [ ] **T4.2**: Modify [`src/core/task/Task.ts`](src/core/task/Task.ts) — find all call sites for `formatResponse.noToolsUsed()` and `formatResponse.missingToolParameterError()`. Pass `this.provider.getState().disabledTools` (or equivalent access path) as the new parameter. Verify the state access path is correct for the current codebase structure.

- [ ] **T4.3**: Add tests for response message modifications — test `noToolsUsed()` with: no disabled tools (identical output), `attempt_completion` disabled (that line removed), `ask_followup_question` disabled (that line removed), both disabled (generic fallback), undefined param (identical to current). Similar for `missingToolParameterError()`.

## Phase 5: Validation & Edge Cases

- [ ] **T5.1**: Run existing test suite — ensure all current tests pass with no regressions. Specifically run: `cd src && npx vitest run core/prompts/`, `cd src && npx vitest run core/tools/`, `cd src && npx vitest run core/prompts/tools/__tests__/filter-tools-for-mode.spec.ts`.

- [ ] **T5.2**: Manual verification — generate system prompt previews with various disabled tool combinations via the "Preview System Prompt" UI feature. Compare token counts between disabled and non-disabled scenarios to confirm reduction.

- [ ] **T5.3**: Edge case testing — verify behavior for: alias-based disabling (`search_and_replace` disabling `edit` references), critical tool warnings still appearing in UI, MCP tools unaffected by this change, `update_todo_list`/`generate_image`/`async_task`/`run_slash_command` already excluded by other mechanisms coexisting with `disabledTools` exclusion.

- [ ] **T5.4**: Backward compatibility audit — generate system prompts with `disabledTools` = `[]`, `undefined`, and not present in settings at all. All three must produce identical output to the current production behavior.