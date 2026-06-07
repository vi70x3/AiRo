# Verification: Reasoning Recovery

## Test Strategy
- **Unit Testing**: Test `SimilarityScorer` with synthetic turns; test `StateTransitionEngine` with all valid/invalid transitions.
- **Integration Testing**: Verify tool filtering updates when FSM state changes; verify `manageContext` is triggered by loop confidence.
- **End-to-End**: Simulate a loop (e.g., repeatedly reading the same file) and verify compression occurs and feedback is injected.

## Validation Checks
1. Loop confidence increments on redundant turns.
2. Edit tools blocked in Investigation state.
3. Recovery hints injected post-compression.

## Completion Criteria
- [ ] Semantic Loop Detector integrated with `Task.ts`.
- [ ] Debug FSM enforces Investigat -> Hypothesize -> Validate -> Confirm -> Fix -> Verify.
- [ ] Feedback Generator injects actionable hints.
