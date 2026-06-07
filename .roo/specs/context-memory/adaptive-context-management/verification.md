# Verification: Adaptive Context Management

## Test Strategy
- **Unit Testing**: Test L0-L3 assembly logic, `TaskMemory` updates, and `ModelSwitchDetector`.
- **Integration Testing**: Verify context budget enforcement triggers layer reduction; verify model switch triggers condensation.
- **End-to-End**: Simulate a multi-turn task with a model switch and verify summary coherence and token reduction.

## Validation Checks
1. L0 tokens <= 1500.
2. `TaskMemory` persists after condensation.
3. Model switch triggers `manageContext`.

## Completion Criteria
- [ ] Context Compression Engine orchestrates L0-L3.
- [ ] `TaskMemory` updated by tool signals and persists.
- [ ] Automatic condensation on model switch verified.
