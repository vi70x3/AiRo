# Task Breakdown - Semantic Loop Detection (Revised)

## Phase 1: Foundation and Domain Models
*   [x] Define `ReasoningTurn`, `LoopConfidenceState`, and `SemanticState` interfaces in `@roo-code/types`.
*   [x] Create `SemanticStateTracker` class in `src/core/loop-detection/`.
*   [x] Add unit tests for `SemanticStateTracker`.
*   [ ] Add `CompressionRecoveryState` to `@roo-code/types`.

## Phase 2: Structured Scoring and Progress Logic
*   [x] Implement `SimilarityScorer` using structured signals (Tool Patterns, File Sets).
*   [x] Implement `ProgressDetector` with Tiered Progress Scoring (Strong, Medium, Weak).
*   [x] Implement `LoopConfidenceCalculator` with cooldown logic.
*   [x] Implement `CompressionRecoveryTracker`.
*   [x] Add unit tests for all components with mock turns.

## Phase 3: Core Service and Configuration
*   [x] Create the main `SemanticLoopDetector` coordinator.
*   [ ] Add `loopDetection` settings to `RooConfig`.
*   [ ] Add telemetry for loop detection and recovery events.
*   [x] Add comprehensive tests for the coordinator.

## Phase 4: Integration with Task Execution
*   [ ] Integrate into `Task.ts` (`recursivelyMakeClineRequests`).
*   [ ] Extract structured signals (hypotheses, conclusions) from turn results.
*   [ ] Implement loop-break compression trigger in `manageContext`.
*   [ ] Add recovery prompt to condensation workflow.

## Phase 5: Verification and Tuning
*   [ ] Create end-to-end loop simulations.
*   [ ] Benchmark performance impact.
*   [ ] Tune similarity weights and thresholds.
*   [ ] Update documentation.
