# Phase 4C Architectural Fixes — Tasks

## Target File

`.roo/specs/semantic-loop-detection/phase-4-architecture.md` — Section 9 (lines 1173–1441) plus minor edits to Section 8.4 and the document footer.

## Task Order

Tasks follow the dependency order from the design: Relapse Detection (Issue #4) first, then Issues 1, 2, 3, 5, and additional fixes.

---

### Phase 1: Foundational — Relapse Detection (Issue #4)

- [ ] **Task 1.1**: Insert new section `9.3.3 RelapseEvent Interface` after line 1248 (after the current 9.3.2 algorithm block). Add the `RelapseEvent` interface with `originalCompressionId`, `turnsSinceRecovery`, `similarityToOriginalLoop`, and `timestamp` fields as specified in Design 4.1.

- [ ] **Task 1.2**: Insert new section `9.3.4 RelapseDetector` after the new 9.3.3. Add the `RelapseDetector` class with `checkForRelapse()`, `getRecentRelapses()`, and `hasRelapsed()` methods, plus the detection algorithm description as specified in Design 4.2. Include the note about reusing Phase 1-3 loop signature similarity.

- [ ] **Task 1.3**: Add `RelapseDetector` config fields to Section 9.6.1 Configuration: `relapseSimilarityThreshold` (default: 0.7), `minTurnsSinceRecovery` (default: 2), `maxRelapses` (default: 20).

---

### Phase 2: Adaptation Score Fix (Issue #1)

- [ ] **Task 2.1**: Modify `InterventionOutcome` interface in Section 9.3.1 (lines 1200–1220). Add `recoveryTurns: number`, `relapsed: boolean`, and `relapseTimestamp?: number` fields as specified in Design 1.1.

- [ ] **Task 2.2**: Replace the algorithm description in Section 9.3.2 (lines 1244–1248) with the updated algorithm that defines "sustained" interventions and excludes relapsed interventions from the success count, as specified in Design 1.2.

- [ ] **Task 2.3**: Add `sustainedRecoveryMinTurns` config field to Section 9.6.1 Configuration (default: 3, min: 1, max: 10) as specified in Design 1.3.

---

### Phase 3: Strategy Identity (Issue #2)

- [ ] **Task 3.1**: Modify `AdaptationFailureDetector` class in Section 9.4.2 (lines 1278–1293). Add `lastFailedStrategyFingerprint: string | null` and `failedStrategyIds: string[]` private fields. Change `onFailure()` signature to accept `StrategyRecord` parameter as specified in Design 2.1.

- [ ] **Task 3.2**: Replace the detection algorithm in Section 9.4.2 (lines 1296–1301) with the updated algorithm that uses `StrategyRecord.fingerprint` for strategy identity and references `consecutiveFailedInterventions`, as specified in Design 2.2.

---

### Phase 4: Fallback Classes (Issue #3)

- [ ] **Task 4.1**: Insert new section `9.5.0 Fallback Classification` before the current 9.5.1. Add the `FallbackClass` enum (`Strategy`, `Tool`, `Delegation`, `Completion`) and the fallback progression hierarchy as specified in Design 3.1.

- [ ] **Task 4.2**: Modify `ForceFallbackRecommendation` interface in Section 9.5.1 (lines 1311–1321). Replace `fallbackType: "strategy" | "tool" | "provider"` with `fallbackClass: FallbackClass`. Replace `examplePath` with `recommendedApproach` and `exampleToolPath` as specified in Design 3.2.

- [ ] **Task 4.3**: Replace the `FALLBACK_MAPPING` constant in Section 9.5.2 (lines 1329–1353) with the strategy-class-based mapping keyed by category sequences (`read->read->read`, `write->write->write`, `execute->execute->execute`, `_dead_end`) as specified in Design 3.3.

- [ ] **Task 4.4**: Modify the feedback injection integration code in Section 9.5.3 (lines 1359–1370) to use `fallback.recommendedApproach` and `fallback.exampleToolPath` instead of `fallback.examplePath` as specified in Design 3.4.

---

### Phase 5: Adaptation Failure Thresholds (Issue #5)

- [ ] **Task 5.1**: Modify `AdaptationSignal` interface in Section 9.4.1 (lines 1258–1270). Add `consecutiveFailedInterventions: number` field and update the `adaptationScore` comment to note it's computed from sustained interventions only, as specified in Design 5.1.

- [ ] **Task 5.2**: Update `minAdaptationScore` default from 0.3 to 0.5 in Section 9.6.1 Configuration, as specified in Design 5.3.

- [ ] **Task 5.3**: Add `consecutiveFailureThreshold` config field to Section 9.6.1 Configuration (default: 3, min: 1, max: 10) as specified in Design 5.3.

---

### Phase 6: Telemetry Events (Additional Fix A)

- [ ] **Task 6.1**: Add `InterventionRelapsed` and `AdaptationRecovered` events to the `RooCodeEventName` enum in Section 9.6.2 (lines 1399–1408) as specified in Design A.1.

- [ ] **Task 6.2**: Add event payload schemas for `InterventionRelapsed` and `AdaptationRecovered` after the enum in Section 9.6.2 as specified in Design A.2.

---

### Phase 7: Success Metrics & Implementation Order

- [ ] **Task 7.1**: Add two new success metrics to Section 8.4 (lines 1158–1165): "Relapse detection accuracy" (target: > 70%) and "Sustained recovery rate" (target: > 50%) as specified in the Design (Success Metrics) section.

- [ ] **Task 7.2**: Replace the implementation order list in Section 9.7 (lines 1426–1435) with the updated 12-step order that reflects the new components and dependency sequence as specified in the Design (Impl Order) section.

---

### Phase 8: Document Versioning (Additional Fix B)

- [ ] **Task 8.1**: Delete the duplicate footer at lines 1168–1171 (the `*Document version: 1.1*` block before Section 9) as specified in Design B.1.

- [ ] **Task 8.2**: Update the final footer at lines 1439–1441 from version 1.1 to version 1.2 as specified in Design B.2.

---

### Phase 9: Verification

- [ ] **Task 9.1**: Read the complete modified document and verify all section numbering is consistent (9.3.1, 9.3.2, 9.3.3, 9.3.4, 9.4.1, 9.4.2, 9.5.0, 9.5.1, 9.5.2, 9.5.3, 9.6.1, 9.6.2, 9.6.3, 9.7).

- [ ] **Task 9.2**: Verify all cross-references between sections are correct (e.g., `RelapseDetector` referenced in `InterventionOutcome`, `StrategyRecord.fingerprint` referenced in `AdaptationFailureDetector`, `FallbackClass` referenced in `ForceFallbackRecommendation`).

- [ ] **Task 9.3**: Verify no duplicate footers remain and the final footer shows version 1.2.