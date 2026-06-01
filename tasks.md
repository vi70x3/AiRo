# Task Breakdown - Semantic Loop Detection

## Phase 1: Foundation and Domain Models
*   [ ] Define `ReasoningTurn` and `SemanticState` interfaces in `@roo-code/types` or a shared core location.
*   [ ] Create `SemanticStateTracker` class to manage the rolling window of turns.
*   [ ] Implement basic serialization/deserialization for these models.
*   [ ] Add unit tests for state tracking.

## Phase 2: Similarity and Progress Logic
*   [ ] Implement `SimilarityScorer` with symbolic (Jaccard) and text-based (N-gram/Levenshtein) metrics.
*   [ ] Implement `ProgressDetector` with heuristics for file changes and tool success/failure transitions.
*   [ ] Implement `LoopConfidenceCalculator` to aggregate scores.
*   [ ] Add unit tests for scoring and progress detection with mock reasoning turns.

## Phase 3: Core Service and Configuration
*   [ ] Create the main `SemanticLoopDetector` service.
*   [ ] Add configuration options to `RooConfig` and the settings UI.
*   [ ] Implement telemetry hooks for loop detection events.
*   [ ] Add comprehensive tests for the coordinator logic.

## Phase 4: Integration with Task Execution
*   [ ] Integrate `SemanticLoopDetector` into `Task.ts` (`recursivelyMakeClineRequests`).
*   [ ] Implement the `CompressionExecutor` to trigger `manageContext` on loop detection.
*   [ ] Add specialized "Loop Break" prompts to the condensation workflow.
*   [ ] Verify that manual/automatic condensation still works correctly alongside loop-triggered condensation.

## Phase 5: Verification and Tuning
*   [ ] Create end-to-end test cases that simulate common reasoning loops (e.g., repeating the same failing search).
*   [ ] Benchmark performance impact on turn latency (target < 50ms).
*   [ ] Fine-tune similarity weights and confidence thresholds based on test results.
*   [ ] Update documentation in `docs/` explaining how loop detection works and how to configure it.
