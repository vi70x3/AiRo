# Verification: Agent Grounding and Metrics

## Test Strategy
- **Unit Testing**: Test `StateTransitionEngine`, `ClaimValidator`, `PatchVerifier`, and individual reliability trackers.
- **Integration Testing**: Verify the full grounding pipeline: Tool Result -> Evidence -> State Transition -> Claim Validation.
- **End-to-End**: Simulate a "broken" fix (e.g., bad syntax) and verify the Verification Pipeline catches it, the Hallucinated Edit Detector flags the claim, and metrics are updated.

## Validation Checks
1. ESG transitions correctly on file read/write.
2. Contradiction warning injected when edit is missing evidence.
3. Reliability metrics preserved across task resume.

## Completion Criteria
- [ ] ESG and Evidence Registry active in `Task.ts`.
- [ ] Verification Pipeline integrated into `DiffViewProvider`.
- [ ] Reliability metrics surfaced in `TaskHeader` UI.
- [ ] Claim validation rejects unsupported "fix" claims.
