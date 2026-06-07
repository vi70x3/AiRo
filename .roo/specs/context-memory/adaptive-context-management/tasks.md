# Tasks: Adaptive Context Management

## Phase 1: Foundation & Model Storage
- [ ] Define `TaskMemory` and `ModelUsageRecord` interfaces.
- [ ] Implement `TaskMemoryWriter` and `ModelUsageTracker`.
- [ ] Extend task metadata schema for `TaskMemory` persistence.

## Phase 2: Layered Retrieval Engine
- [ ] Implement `buildLayer0Core` through `buildLayer3SymbolContext`.
- [ ] Create `ContextCompressionEngine` and `TokenBudgetEnforcer`.
- [ ] Implement tiered environment details in `[Component:EnvironmentDetails]`.

## Phase 3: Integration & Triggers
- [ ] Integrate model switch detection in `attemptApiRequest` within `[Component:Task]`.
- [ ] Hook `TaskMemoryWriter` into `recursivelyMakeClineRequests` within `[Component:Task]`.
- [ ] Augment condensation prompt with `TaskMemory` context.

## Phase 4: Verification & Tuning
- [ ] Add structured logging for layer reductions.
- [ ] Benchmark token reduction across different task types.
- [ ] Final end-to-end integration tests.
