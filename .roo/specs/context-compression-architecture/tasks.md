# Task Breakdown - Context Compression Architecture

## Phase 1: Foundation and Configuration

*   [ ] Add `contextCompression` section to `globalSettingsSchema` in [global-settings.ts](packages/types/src/global-settings.ts:118) following the existing `loopDetection` pattern (zod object with `.optional()` fields and `.default()` values).
*   [ ] Define `ContextCompressionConfig` type in [global-settings.ts](packages/types/src/global-settings.ts:286) as a zod inferred type.
*   [ ] Define `SpecSummary` interface in [loop-detection.ts](packages/types/src/loop-detection.ts:89).
*   [ ] Define `EvidenceBlock` interface in [loop-detection.ts](packages/types/src/loop-detection.ts:89).
*   [ ] Define `LayerReductionEvent` interface in [loop-detection.ts](packages/types/src/loop-detection.ts:89).
*   [ ] Define `TierBOmission` interface in [loop-detection.ts](packages/types/src/loop-detection.ts:89).
*   [ ] Define `ModeInstructionMapping` interface in [loop-detection.ts](packages/types/src/loop-detection.ts:89).
*   [ ] Add unit tests for configuration schema validation (valid config, invalid config, missing fields use defaults).

## Phase 2: Layer 0 — Permanent Core

*   [ ] Create `buildLayer0Core()` function in a new `src/core/context-compression/` directory.
*   [ ] Implement token counting for Layer 0 using the existing `estimateTokenCount()` from [context-management/index.ts](src/core/context-management/index.ts:33).
*   [ ] Implement the 1500-token overflow warning in `buildLayer0Core()`.
*   [ ] Implement roleDefinition truncation logic when Layer 0 exceeds budget due to a long mode roleDefinition.
*   [ ] Add unit tests for `buildLayer0Core()`: within budget, at budget, over budget, empty toolContext, all tools disabled.

## Phase 3: Layer 1 — Active Mode Instructions

*   [ ] Create `buildLayer1Instructions()` function in `src/core/context-compression/`.
*   [ ] Implement `getModeInstructionMapping()` that returns the instruction mapping for a given mode slug.
*   [ ] Implement mode-based filtering: "vibe" mode gets base instructions only, "debug" mode gets diagnose/log/confirm/fix rules, "spec" mode gets spec workflow rules.
*   [ ] Implement fallback to base mode instructions when mode slug is not found in the mapping.
*   [ ] Add unit tests for `buildLayer1Instructions()`: each supported mode, unknown mode fallback, empty mode.

## Phase 4: Layer 2 — Active Spec Summary

*   [ ] Create `buildSpecSummary()` function in `src/core/context-compression/`.
*   [ ] Implement spec directory reading: read first 20 lines of requirements.md, design.md, tasks.md from `.roo/specs/<spec-name>/`.
*   [ ] Implement JSON compression: extract spec name, one-line summary, affected files, current phase, progress status.
*   [ ] Implement the 500-token budget enforcement with `affectedFiles` truncation.
*   [ ] Implement missing spec directory handling with warning log.
*   [ ] Add unit tests for `buildSpecSummary()`: valid spec directory, missing directory, empty documents, oversized summary.

## Phase 5: Layer 3 — Symbol Retrieval Integration

*   [ ] Create `buildSymbolContext()` function in `src/core/context-compression/`.
*   [ ] Implement symbol retrieval using `search_symbols()` against the jcodemunch index.
*   [ ] Implement the 1000-token budget enforcement for symbol context.
*   [ ] Implement fallback to `list_files` output when repository is not indexed.
*   [ ] Implement empty result handling with empty string return.
*   [ ] Add unit tests for `buildSymbolContext()`: indexed repo with results, indexed repo with no results, non-indexed repo fallback.

## Phase 6: Tiered Environment Details

*   [ ] Add optional `tier` parameter (`"critical" | "detailed" | "full"`) to `getEnvironmentDetails()` in [getEnvironmentDetails.ts](src/core/environment/getEnvironmentDetails.ts:23).
*   [ ] Create `buildTierACritical()` internal function extracting: current mode, model ID, workspace directory, todo list.
*   [ ] Create `buildTierBDetailed()` internal function extracting: visible files, open tabs, active terminals, inactive terminals, recently modified files, current time, git status, current cost, workspace listing.
*   [ ] Implement priority-ordered Tier B inclusion: recently modified files > visible files > active terminals > current time > git status > current cost > open tabs > inactive terminals > workspace listing.
*   [ ] Implement the 500-token cap for Tier A.
*   [ ] Preserve existing behavior when `tier` is `"full"` (default).
*   [ ] Add unit tests for tiered environment: critical only, detailed with full budget, detailed with limited budget, full mode.

## Phase 7: Token Budget Enforcement

*   [ ] Create `TokenBudgetEnforcer` class in `src/core/context-compression/`.
*   [ ] Implement `assessBudget()` method that calculates total token cost and reduces layers in order: Layer 3 → Layer 2 → Layer 1 extended → Tier B → Layer 1 base.
*   [ ] Implement layer reduction logging via `LayerReductionEvent`.
*   [ ] Implement the configurable `contextBudget` parameter with default of 6000 tokens.
*   [ ] Implement budget enforcement disable when `contextBudget` is 0.
*   [ ] Implement per-turn token count exposure via the existing metrics system.
*   [ ] Add unit tests for `TokenBudgetEnforcer`: within budget, over budget with each reduction step, budget disabled, zero budget.

## Phase 8: Enhanced Condensation with Evidence Preservation

*   [ ] Create `extractEvidence()` function in `src/core/context-compression/`.
*   [ ] Implement evidence extraction from tool_use blocks: tool names, key parameters (excluding user content), file paths.
*   [ ] Implement evidence extraction from tool_result blocks: conclusions (results containing "found"/"created"), blockers (results containing "error"/"fail").
*   [ ] Implement the 1000-token cap for evidence blocks.
*   [ ] Integrate `extractEvidence()` into `summarizeConversation()` in [condense/index.ts](src/core/condense/index.ts:254) — insert evidence block as a separate text block in `summaryContent` before the narrative summary.
*   [ ] Preserve existing `injectSyntheticToolResults()`, `transformMessagesForCondensing()`, `getMessagesSinceLastSummary()`, `getEffectiveApiHistory()`, and `cleanupAfterTruncation()` functions without modification to their core logic.
*   [ ] Add unit tests for evidence extraction: normal conversation, conversation with errors, conversation with file modifications, malformed tool blocks.

## Phase 9: Integration and Orchestration

*   [ ] Create `ContextCompressionEngine` class in `src/core/context-compression/` that orchestrates all layers.
*   [ ] Implement `buildSystemPrompt()` method that calls `buildLayer0Core()`, `buildLayer1Instructions()`, `buildLayer2SpecSummary()`, `buildLayer3SymbolContext()`, then passes results through `TokenBudgetEnforcer`.
*   [ ] Implement `buildEnvironmentDetails()` method that calls `buildTierACritical()` and `buildTierBDetailed()` based on remaining budget.
*   [ ] Integrate `ContextCompressionEngine` into `generatePrompt()` in [system.ts](src/core/prompts/system.ts:44) — add conditional branch: if `contextCompression.enabled`, use the engine; otherwise, use existing concatenation.
*   [ ] Integrate tiered environment into `getEnvironmentDetails()` in [getEnvironmentDetails.ts](src/core/environment/getEnvironmentDetails.ts:23) — add conditional branch for tiered mode.
*   [ ] Add integration tests: full pipeline with compression enabled, full pipeline with compression disabled (backward compatibility), each layer individually toggled.

## Phase 10: Observability

*   [ ] Add structured logging for layer reduction events (`LayerReductionEvent`).
*   [ ] Add structured logging for Tier B omission events (`TierBOmission`).
*   [ ] Add structured logging for spec summary generation (spec name, token count).
*   [ ] Add structured logging for evidence preservation (evidence token count).
*   [ ] Implement metrics: average tokens per turn (rolling 10-turn window), layer reduction frequency per session, Tier B omission rate, condensation evidence preservation rate.
*   [ ] Verify that no user message text, file contents, tool parameters with user input, or task-specific reasoning content appears in any log entry.
*   [ ] Add unit tests for observability: log format validation, sensitive data exclusion, metric calculation accuracy.

## Phase 11: Verification and Tuning

*   [ ] Create end-to-end context compression simulations with realistic conversation histories.
*   [ ] Benchmark token reduction: measure per-turn token count with compression enabled vs disabled across 10 representative tasks.
*   [ ] Benchmark performance overhead: measure system prompt generation time with compression enabled (target: <300ms added).
*   [ ] Tune default `contextBudget` based on benchmark results.
*   [ ] Tune Layer 0 section selection to stay within 1500-token budget across all built-in modes.
*   [ ] Update documentation: add context compression section to architecture docs, add configuration guide to user docs.
