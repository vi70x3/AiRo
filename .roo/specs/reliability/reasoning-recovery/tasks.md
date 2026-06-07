# Tasks: Reasoning Recovery

## Phase 1: Loop Detection Core
- [ ] Define `ReasoningTurn` and `LoopConfidenceState` interfaces.
- [ ] Implement `SemanticStateTracker` and `SimilarityScorer`.
- [ ] Implement `ProgressDetector` with tiered scoring.

## Phase 2: Debug FSM & Tool Gating
- [ ] Implement `StateTransitionEngine` and `HypothesisValidator`.
- [ ] Implement `ToolRestrictionEvaluator`.
- [ ] Integrate with `filterNativeToolsForMode` for phase-based gating.

## Phase 3: Feedback & Monitoring
- [ ] Implement `FeedbackGenerator` and `StrategyMemory`.
- [ ] Implement `SilentFailureTracker` and `WanderingDetector`.
- [ ] Integrate feedback injection into `getEnvironmentDetails`.

## Phase 4: Integration & Tuning
- [ ] Hook `SemanticLoopDetector` into `Task.ts` execution loop.
- [ ] Implement loop-break compression trigger in `manageContext`.
- [ ] Tune similarity weights and confidence thresholds.
- [ ] Comprehensive verification of recovery effectiveness.
