# Task Breakdown - Long-Horizon Memory

## Phase 1: Foundation and Domain Models

*   [ ] Define `TaskMemory`, `CompressedSummary`, and `TaskMemoryStatus` interfaces in `packages/types/src/loop-detection.ts`.
*   [ ] Define `taskMemorySchema`, `compressedSummarySchema`, and `taskMemoryStatusSchema` zod schemas in `packages/types/src/loop-detection.ts`.
*   [ ] Define `LongHorizonMemoryConfig` interface and `longHorizonMemoryConfigSchema` zod schema in `packages/types/src/global-settings.ts`.
*   [ ] Add `longHorizonMemory` field to `globalSettingsSchema` in `packages/types/src/global-settings.ts` with `.optional().default()` pattern.
*   [ ] Add `LongHorizonMemoryConfig` export to `packages/types/src/index.ts`.
*   [ ] Add unit tests for zod schema validation (valid objects, invalid objects, missing fields, boundary values).
*   [ ] Add `task_memory` optional field to `TaskMetadata` and `taskMetadataSchema` in `FileContextTrackerTypes.ts`.

## Phase 2: TaskMemory Core Logic

*   [ ] Create `TaskMemoryWriter` class in `src/core/task-memory/`.
*   [ ] Implement signal detection: file write/edit → `edits[]`, test result → `tests[]`, error → `blockers[]`, new evidence → `findings[]`.
*   [ ] Implement blocker resolution: remove from `blockers[]` when subsequent action resolves the blocker.
*   [ ] Implement finding archiving: move superseded findings to `archivedFindings[]`.
*   [ ] Implement `objective` extraction from initial user request.
*   [ ] Write unit tests for `TaskMemoryWriter` with mock tool results.
*   [ ] Create `MemoryCompactor` class in `src/core/task-memory/`.
*   [ ] Implement compaction algorithm: archive resolved findings, trim old edits, respect configurable thresholds.
*   [ ] Implement `turnCount` tracking and reset after compaction.
*   [ ] Write unit tests for `MemoryCompactor` with various threshold configurations.
*   [ ] Create `CompressedSummaryGenerator` class in `src/core/task-memory/`.
*   [ ] Implement summary generation: extract objective, top finding, status from TaskMemory.
*   [ ] Implement token limit enforcement with truncation.
*   [ ] Write unit tests for `CompressedSummaryGenerator` with various TaskMemory states.

## Phase 3: Persistence and Storage

*   [ ] Extend `FileContextTracker.getTaskMetadata()` to read `task_memory` field from task metadata JSON.
*   [ ] Extend `FileContextTracker.saveTaskMetadata()` to write `task_memory` field to task metadata JSON.
*   [ ] Implement backward compatibility: initialize empty TaskMemory when `task_memory` field is absent.
*   [ ] Ensure atomic writes using existing `safeWriteJson` infrastructure.
*   [ ] Write unit tests for persistence round-trip (save → load → verify).
*   [ ] Write unit tests for backward compatibility (legacy task metadata without `task_memory`).

## Phase 4: Integration with Task Execution

*   [ ] Integrate `TaskMemoryWriter` into `recursivelyMakeClineRequests()` in `src/core/task/Task.ts`.
*   [ ] Hook tool result signals after each tool execution in the agentic loop.
*   [ ] Integrate `CompressedSummaryGenerator` into context assembly before each API request.
*   [ ] Inject `<task_memory>JSON</task_memory>` block between system prompt and conversation history.
*   [ ] Ensure injection respects the configured `injectionTokenLimit`.
*   [ ] Write integration tests for TaskMemory updates during simulated agentic loops.

## Phase 5: Integration with Condensation

*   [ ] Pass current TaskMemory to `summarizeConversation()` via `SummarizeConversationOptions`.
*   [ ] Include compressed summary as part of the LLM-generated condensation summary text.
*   [ ] Ensure TaskMemory is NOT modified during condensation — it persists in task metadata.
*   [ ] Implement re-injection of compressed summary after condensation completes.
*   [ ] Handle condensation failure gracefully: TaskMemory remains unchanged.
*   [ ] Write integration tests for TaskMemory survival across condensation cycles.

## Phase 6: Integration with Context Management

*   [ ] Integrate `MemoryCompactor` into `manageContext()` in `src/core/context-management/index.ts`.
*   [ ] Trigger compaction before condensation when `compactBeforeInjection` is true.
*   [ ] Account for compressed summary token overhead in context management token budget calculations.
*   [ ] Write integration tests for context management with long-horizon memory enabled.

## Phase 7: Configuration and Settings

*   [ ] Add `longHorizonMemory` configuration to settings UI (if applicable).
*   [ ] Validate configuration on load: invalid values fall back to defaults with warning.
*   [ ] Implement enable/disable toggle: when disabled, skip all TaskMemory operations.
*   [ ] Write unit tests for configuration validation and fallback behavior.

## Phase 8: Observability

*   [ ] Add structured logging for TaskMemory events: created, updated, compacted, injected, loaded.
*   [ ] Implement metrics collection: total updates, total compactions, average summary token count, memory size.
*   [ ] Ensure log entries exclude sensitive content (file contents, user messages, tool parameters).
*   [ ] Write unit tests for logging and metrics accuracy.

## Phase 9: Verification and Edge Cases

*   [ ] Test with long-running tasks (100+ turns) to verify compaction keeps memory manageable.
*   [ ] Test with rapid condensation cycles (multiple condenses in quick succession).
*   [ ] Test with task resume from persistence (close and reopen task).
*   [ ] Test with disabled configuration (ensure no memory operations occur).
*   [ ] Test with maximum findings/edits/blockers to verify compaction thresholds.
*   [ ] Test backward compatibility with legacy task metadata files.
*   [ ] Benchmark performance impact on the agentic loop (should be < 1ms per turn).
*   [ ] Update documentation.
