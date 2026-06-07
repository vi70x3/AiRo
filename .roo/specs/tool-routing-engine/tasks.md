# Tasks: Tool Routing Engine

## Phase 1: Foundation — Types, Schema, and Preference Table

- [ ] **T1.1**: Add `toolRouting` section to `packages/types/src/global-settings.ts`
  - Import `z` from zod (already imported)
  - Add `toolRouting` field to `globalSettingsSchema` with:
    - `enabled`: `z.boolean().optional().default(false)`
    - `enforceJcodemunch`: `z.boolean().optional().default(true)`
    - `phaseBasedFiltering`: `z.boolean().optional().default(false)`
  - Export `ToolRoutingConfig` type via `z.infer`
  - Verify the existing export pattern in `index.ts` re-exports the new type

- [ ] **T1.2**: Create `src/core/prompts/tools/tool-router.ts`
  - Define `RoutingContext` interface with fields: `repoIndexed`, `executionPhase`, `availableTools`, `mode`, `enforceJcodemunch`, `phaseBasedFiltering`
  - Define `ToolRecommendation` interface with fields: `primaryTool`, `fallbackTools`, `guidance`, `deprioritizedTools`, `intent`
  - Define `ToolPreferenceEntry` type with fields: `intent`, `tools`, `requiresIndexedRepo`, `fallbackTools`
  - Define `INDEXED_TOOLS` Set containing all jcodemunch tool names
  - Implement `isIndexedTool(toolName)` helper function
  - Implement `TOOL_PREFERENCE_TABLE` constant with all 6 intents from the architecture doc
  - Implement `routeIntent(intent, context)` core function following the algorithm in design.md
  - Implement `buildRoutingGuidance(intent, context, entry)` function
  - Export all public types and functions

- [ ] **T1.3**: Create `src/core/prompts/tools/tool-routing-guidance.ts`
  - Define `PhaseGuidance` interface
  - Define `PHASE_GUIDANCE_TABLE` constant with entries for `diagnosis`, `implementation`, `testing`, `vcs`, `none`
  - Implement `getToolRoutingSection(repoIndexed, config, executionPhase?)` function
  - Implement `intentToDescription(intent)` helper function
  - Export all public types and functions

- [ ] **T1.4**: Update `src/core/prompts/tools/index.ts` exports
  - Add exports for `routeIntent`, `buildRoutingGuidance`, `getToolRoutingSection`
  - Add exports for `RoutingContext`, `ToolRecommendation`, `ToolPreferenceEntry`, `PhaseGuidance`
  - Add exports for `TOOL_PREFERENCE_TABLE`, `PHASE_GUIDANCE_TABLE`, `INDEXED_TOOLS`

## Phase 2: Core Logic — Router Tests and Phase Guidance

- [ ] **T2.1**: Create `src/core/prompts/tools/__tests__/tool-router.spec.ts`
  - Test `routeIntent()` with all 6 intents from the preference table
  - Test `routeIntent()` with `repoIndexed=true` — verifies indexed tools are preferred
  - Test `routeIntent()` with `repoIndexed=false` — verifies fallback tools are used
  - Test `routeIntent()` with disabled tools in `availableTools` — verifies disabled tools are excluded
  - Test `routeIntent()` with `enforceJcodemunch=true` — verifies jcodemunch tools are strictly first
  - Test `routeIntent()` determinism — same inputs always produce same output
  - Test `routeIntent()` with unknown intent — returns empty recommendation
  - Test `routeIntent()` with empty `availableTools` — returns empty primary tool
  - Test `isIndexedTool()` for known indexed tools and non-indexed tools

- [ ] **T2.2**: Create `src/core/prompts/tools/__tests__/tool-routing-guidance.spec.ts`
  - Test `getToolRoutingSection()` with `enabled=false` — returns empty string
  - Test `getToolRoutingSection()` with `enabled=true, repoIndexed=true` — includes jcodemunch tools
  - Test `getToolRoutingSection()` with `enabled=true, repoIndexed=false` — includes fallback tools
  - Test `getToolRoutingSection()` with `enforceJcodemunch=true` — includes preference note
  - Test `getToolRoutingSection()` with `phaseBasedFiltering=true` — includes phase guidance
  - Test `getToolRoutingSection()` with `executionPhase=none` — omits phase guidance
  - Test `intentToDescription()` for all intent values

- [ ] **T2.3**: Run existing test suite to verify no regressions
  - `cd src && npx vitest run prompts/tools/__tests__/tool-availability-context.spec.ts` — all pass
  - `cd src && npx vitest run prompts/tools/__tests__/filter-tools-for-mode.spec.ts` — all pass

## Phase 3: Integration — System Prompt and Tool Pipeline

- [ ] **T3.1**: Update `src/core/prompts/sections/tool-use.ts`
  - Import `getToolRoutingSection` from `../tools/tool-routing-guidance`
  - Add optional `routingGuidance?: string` parameter to `getSharedToolUseSection()`
  - When `routingGuidance` is provided and non-empty, append it after the existing tool use content
  - Maintain backward compatibility — when `routingGuidance` is undefined, output is identical to current

- [ ] **T3.2**: Update `src/core/prompts/sections/tool-use-guidelines.ts`
  - Import `getToolRoutingSection` from `../tools/tool-routing-guidance`
  - Add optional `routingGuidance?: string` parameter to `getToolUseGuidelinesSection()`
  - When `routingGuidance` is provided and non-empty, append routing guidelines after existing guidelines
  - Maintain backward compatibility — when `routingGuidance` is undefined, output is identical to current

- [ ] **T3.3**: Update `src/core/task/build-tools.ts`
  - Import `routeIntent`, `RoutingContext`, `ToolRecommendation` from `../prompts/tools/tool-router`
  - Import `getToolRoutingSection` from `../prompts/tools/tool-routing-guidance`
  - Import `ToolRoutingConfig` type from `@roo-code/types`
  - Add optional `routingContext?: RoutingContext` to `BuildToolsOptions` interface
  - Add optional `toolRoutingConfig?: ToolRoutingConfig` to `BuildToolsOptions` interface
  - In `buildNativeToolsArrayWithRestrictions()`, after mode filtering:
    - When `toolRoutingConfig?.enabled` is `true` and `routingContext` is provided:
      - Call `routeIntent()` with a default intent derived from context (or "find_function" as default)
      - Store the returned `ToolRecommendation`
      - Reorder `filteredTools` to place `primaryTool` first (if present in the array)
      - Store `recommendation.guidance` for later prompt injection
    - When `toolRoutingConfig?.enabled` is `false` or not provided, skip routing entirely
  - Add optional `routingGuidance?: string` to `BuildToolsResult` interface
  - Return `routingGuidance` in the result when routing is enabled

- [ ] **T3.4**: Create `src/core/task/__tests__/build-tools-routing.spec.ts`
  - Test `buildNativeToolsArrayWithRestrictions()` with `toolRoutingConfig.enabled=true`
    - Verify routing guidance is present in result
    - Verify tool array is not broken (same tools, possibly reordered)
  - Test `buildNativeToolsArrayWithRestrictions()` with `toolRoutingConfig.enabled=false`
    - Verify no routing guidance in result
    - Verify identical behavior to current
  - Test `buildNativeToolsArrayWithRestrictions()` with `toolRoutingConfig` not provided
    - Verify no routing guidance in result
    - Verify identical behavior to current
  - Test with `includeAllToolsWithRestrictions=true` — verify routing guidance is provided but tool array is not modified

## Phase 4: Verification — End-to-End and Observability

- [ ] **T4.1**: Add routing decision logging
  - In `routeIntent()`, add a `console.debug` call (or use existing logging infrastructure) that logs:
    - Intent, repoIndexed, executionPhase, primaryTool, fallbackTools
  - Ensure logging is gated behind a debug flag or existing verbose logging check
  - Verify logs do not contain user message text, file contents, or tool parameters

- [ ] **T4.2**: Run full test suite
  - `cd src && npx vitest run` — all tests pass
  - `cd webview-ui && npx vitest run` — all tests pass (verify no regressions from type changes)

- [ ] **T4.3**: Run lint
  - `cd src && npx eslint prompts/tools/tool-router.ts prompts/tools/tool-routing-guidance.ts` — zero errors
  - `cd src && npx eslint core/prompts/sections/tool-use.ts core/prompts/sections/tool-use-guidelines.ts` — zero errors
  - `cd src && npx eslint core/task/build-tools.ts` — zero errors

- [ ] **T4.4**: Manual verification
  - Build the project: `cd src && npx tsc --noEmit` — zero type errors
  - Verify the `toolRouting` config section appears in settings types
  - Verify the `TOOL ROUTING` section appears in system prompt when `enabled=true` and `repoIndexed=true`
  - Verify the `TOOL ROUTING` section uses fallback tools when `repoIndexed=false`
  - Verify no `TOOL ROUTING` section when `enabled=false`
  - Verify disabled tools are never recommended by the router
  - Verify phase guidance appears when `phaseBasedFiltering=true` and execution phase is available
