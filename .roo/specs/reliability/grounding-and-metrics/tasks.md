# Tasks: Agent Grounding and Metrics

## Phase 1: Foundation Models (ESG & Evidence)
- [ ] Define `ExecutionStateGraph` and `Evidence` interfaces.
- [ ] Implement `StateTransitionEngine` and `EvidenceRegistry`.
- [ ] Integrate into `Task.ts` lifecycle.

## Phase 2: Verification Pipeline
- [ ] Implement `VerificationOrchestrator` and `PatchVerifier`.
- [ ] Implement `CommandRunner` for lint/typecheck/test with timeouts.
- [ ] Integrate into `DiffViewProvider` save flow.

## Phase 3: Claim Validation
- [ ] Implement `ClaimExtractor` and `ContradictionChecker`.
- [ ] Integrate into `presentAssistantMessage` post-processing.
- [ ] Implement `ResolutionTracker` for resolving contradictions.

## Phase 4: Reliability Metrics & UI
- [ ] Implement `MetricsCollector` and family-specific trackers.
- [ ] Integrate metrics persistence in task metadata.
- [ ] Extend `TaskHeader` component to display reliability indicators.

## Phase 5: Verification & Observability
- [ ] Add structured logging for state transitions and verification failures.
- [ ] End-to-end integration tests for "Fix applied" blocking.
- [ ] Benchmark performance impact on tool execution.
