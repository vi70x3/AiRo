# Tasks: Adaptive Context Management

## Phase 1: Foundation & Model Storage
- [ ] Define `TaskMemory` and `ModelUsageRecord` interfaces.
- [ ] Implement `TaskMemoryWriter` and `ModelUsageTracker`.
- [ ] Extend task metadata schema for `TaskMemory` persistence.

## Phase 2: Layered Retrieval Engine
- [ ] Implement `buildLayer0Core` through `buildLayer3SymbolContext`.
- [ ] Create `ContextCompressionEngine` and `TokenBudgetEnforcer`.
- [ ] Implement tiered environment details in `getEnvironmentDetails`.

## Phase 3: Integration & Triggers
- [ ] Integrate model switch detection in `attemptApiRequest`.
- [ ] Hook `TaskMemoryWriter` into `recursivelyMakeClineRequests`.
- [ ] Augment condensation prompt with `TaskMemory` context.

## Phase 4: Verification & Tuning
- [ ] Add structured logging for layer reductions.
- [ ] Benchmark token reduction across different task types.
- [ ] Final end-to-end integration tests.
