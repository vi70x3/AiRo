# Tasks: Contradiction Detection

## Phase 1: Foundation — Types, Schema, and Core Modules

- [ ] **T1.1**: Add `contradictionDetection` section to `packages/types/src/global-settings.ts`
  - Import `z` from zod (already imported)
  - Add `contradictionDetection` field to `globalSettingsSchema` with:
    - `enabled`: `z.boolean().optional().default(true)`
    - `detectFixApplied`: `z.boolean().optional().default(true)`
    - `detectTestsPassed`: `z.boolean().optional().default(true)`
    - `detectCommitted`: `z.boolean().optional().default(true)`
    - `detectPushed`: `z.boolean().optional().default(true)`
    - `detectDiagnosed`: `z.boolean().optional().default(true)`
    - `detectConfigured`: `z.boolean().optional().default(true)`
    - `warningCooldownMs`: `z.number().int().min(1000).max(60000).optional().default(5000)`
  - Export `ContradictionConfig` type via `z.infer`
  - Verify the existing export pattern in `index.ts` re-exports the new type

- [ ] **T1.2**: Add contradiction detection types to `packages/types/src/loop-detection.ts`
  - Add `ClaimType` type: `"fix_applied" | "tests_passed" | "committed" | "pushed" | "diagnosed" | "configured"`
  - Add `ExtractedClaim` interface with fields: `claimType`, `claimText`, `source`, `timestamp`, `messageId`, `matchedKeyword`
  - Add `ContradictionStatus` type: `"supported" | "unsupported" | "contradicted"`
  - Add `ContradictionEntry` interface with fields: `claim`, `status`, `requiredEvidenceType`, `matchingEvidence`, `message`
  - Add `ContradictionResult` interface with fields: `hasContradictions`, `contradictions`, `totalClaims`, `supportedCount`, `unsupportedCount`, `contradictedCount`, `warningMessage`, `detectionDurationMs`
  - Add `ContradictionMetrics` interface with fields: `taskId`, `totalClaims`, `supportedClaims`, `unsupportedClaims`, `contradictedClaims`, `contradictionRate`, `lastUpdated`
  - Add `ResolutionRecord` interface with fields: `id`, `contradiction`, `detectedAt`, `resolved`, `resolvedAt?`, `resolutionEvidenceId?`
  - Add `EvidenceEntry` interface with fields: `id`, `timestamp`, `type`, `payload`
  - Add `CLAIM_TYPE_EVIDENCE_MAP` constant mapping claim types to evidence types with optional validators
  - Export all new types

- [ ] **T1.3**: Create `src/core/contradiction-detection/ConfigManager.ts`
  - Define `getContradictionConfig(globalSettings)` function extracting config from global settings with defaults
  - Define `isDetectionEnabled(config, claimType)` function returning whether a specific claim type detection is enabled
  - Define `getWarningCooldownMs(config)` function returning the cooldown duration
  - Define `shouldDetectClaim(config, claimType)` function combining enabled flag and claim-type flag checks
  - Export all public functions

- [ ] **T1.4**: Create `src/core/contradiction-detection/ClaimExtractor.ts`
  - Define `KEYWORD_PATTERNS` constant mapping `ClaimType` to `RegExp[]` arrays with all keywords from REQ-1
  - Define `extractClaims(messages)` function scanning `ClineMessage[]` for claims
  - Implement message type filtering: only process `type: "say"` messages with text
  - Implement system message skip list: skip `error`, `api_req_started`, `api_req_finished`, `condense_context`, etc.
  - Implement keyword matching: iterate claim types, test each pattern against message text
  - Implement source detection: distinguish `"say_text"`, `"say_completion_result"`, and `"attempt_completion"`
  - Define `extractClaimsFromText(text, source, messageId, timestamp)` helper for raw text extraction
  - Define `truncate(text, maxLength)` helper for truncating claim text in warnings
  - Export all public functions and the `KEYWORD_PATTERNS` constant

- [ ] **T1.5**: Create `src/core/contradiction-detection/EvidenceLookup.ts`
  - Define `lookupEvidence(evidenceRegistry, mapping, taskStartTime, claim)` function
  - Implement evidence type filtering: match `entry.type === mapping.evidenceType`
  - Implement time window filtering: `entry.timestamp >= taskStartTime && entry.timestamp <= claim.timestamp`
  - Implement recency sorting: sort matching evidence by timestamp descending
  - Implement validation: if `mapping.validate` exists, check whether any evidence passes validation
  - Define `filterByTimeWindow(evidenceRegistry, startTime, endTime)` helper
  - Define `sortByRecency(evidence)` helper
  - Export all public functions

- [ ] **T1.6**: Create `src/core/contradiction-detection/ContradictionChecker.ts`
  - Define `detectContradictions(claims, evidenceRegistry, config, taskStartTime)` function
  - Implement enabled check: if `config.enabled` is false, return empty result immediately
  - Implement claim filtering: filter claims by enabled detection types via `isDetectionEnabled()`
  - Implement per-claim checking: for each claim, look up evidence and determine status
  - Implement unsupported detection: no evidence of required type -> status "unsupported"
  - Implement contradicted detection: evidence exists but fails validation -> status "contradicted"
  - Implement supported tracking: evidence exists and passes -> status "supported"
  - Define `createEmptyResult(totalClaims, startTime)` function for disabled/empty cases
  - Define `formatWarningMessage(contradictions)` function producing `<contradiction_warning>` XML block
  - Implement warning format: numbered list with claim text, type, status, required evidence, and guidance
  - Implement closing instruction: "You MUST resolve these contradictions before proceeding."
  - Export `detectContradictions` as the main entry point

- [ ] **T1.7**: Create `src/core/contradiction-detection/WarningInjector.ts`
  - Define `injectWarning(userMessageContent, warningMessage)` function
  - Implement injection: append `<contradiction_warning>` block to `userMessageContent` as a user message
  - Implement no-op: when `warningMessage` is empty, return `userMessageContent` unchanged
  - Define `clearWarning(userMessageContent)` function removing existing contradiction warnings
  - Define `hasExistingWarning(userMessageContent)` function checking for existing `<contradiction_warning>` blocks
  - Export all public functions

- [ ] **T1.8**: Create `src/core/contradiction-detection/ResolutionTracker.ts`
  - Define `createResolutionRecord(contradiction)` function creating a new `ResolutionRecord`
  - Define `checkResolution(newEvidence, resolutionRecords)` function
  - Implement auto-resolution: when new evidence matches a contradiction's required type and passes validation, mark as resolved
  - Implement resolution timestamp: set `resolvedAt` to current time
  - Implement resolution evidence tracking: store `resolutionEvidenceId`
  - Define `getUnresolvedContradictions(resolutionRecords)` function filtering to unresolved records
  - Define `generateCondensedContradictions(resolutionRecords)` function producing `[CONTRADICTION]` summary strings
  - Define `areAllResolved(resolutionRecords)` function checking if all contradictions are resolved
  - Export all public functions

- [ ] **T1.9**: Create `src/core/contradiction-detection/MetricsTracker.ts`
  - Define `createInitialMetrics(taskId)` function creating a `ContradictionMetrics` object with zero counts
  - Define `updateMetrics(metrics, result)` function updating per-task statistics
  - Implement count accumulation: add `totalClaims`, `supportedClaims`, `unsupportedClaims`, `contradictedClaims`
  - Implement contradiction rate calculation: `(unsupported + contradicted) / total`
  - Implement timestamp update: set `lastUpdated` to current time
  - Define `getMetrics(metrics)` function returning the current metrics
  - Define `resetMetrics(metrics, taskId)` function resetting all counts to zero
  - Export all public functions

- [ ] **T1.10**: Create `src/core/contradiction-detection/ContradictionDetectionEngine.ts`
  - Define `detect(context)` main orchestrator function
  - Context object: `claims`, `evidenceRegistry`, `config`, `taskStartTime`
  - Implement pipeline: extract claims (if raw messages passed) -> check evidence -> format warning
  - Define `extractAndDetect(messages, evidenceRegistry, config, taskStartTime)` convenience function
  - Implement claim extraction from messages before detection
  - Define `extractAndDetectFromMessages(clineMessages, task)` high-level convenience function
  - Implement task integration: extract evidence registry and config from task object
  - Export `detect`, `extractAndDetect`, and `extractAndDetectFromMessages` as public entry points

- [ ] **T1.11**: Create `src/core/contradiction-detection/index.ts`
  - Barrel export all public types from the contradiction detection module
  - Re-export `detect`, `extractAndDetect`, `extractAndDetectFromMessages` from `ContradictionDetectionEngine`
  - Re-export `ClaimType`, `ExtractedClaim`, `ContradictionStatus`, `ContradictionEntry`, `ContradictionResult`, `ContradictionMetrics`, `ResolutionRecord`, `EvidenceEntry`, `CLAIM_TYPE_EVIDENCE_MAP` from types
  - Re-export `extractClaims`, `truncate` from `ClaimExtractor`
  - Re-export `lookupEvidence` from `EvidenceLookup`
  - Re-export `detectContradictions`, `formatWarningMessage` from `ContradictionChecker`
  - Re-export `injectWarning`, `clearWarning`, `hasExistingWarning` from `WarningInjector`
  - Re-export `checkResolution`, `getUnresolvedContradictions`, `generateCondensedContradictions`, `areAllResolved` from `ResolutionTracker`
  - Re-export `updateMetrics`, `getMetrics`, `resetMetrics` from `MetricsTracker`
  - Re-export `getContradictionConfig`, `isDetectionEnabled`, `shouldDetectClaim` from `ConfigManager`

## Phase 2: Core Logic — Unit Tests

- [ ] **T2.1**: Create `src/core/contradiction-detection/__tests__/ClaimExtractor.spec.ts`
  - Test `extractClaims()` with "Fix applied" text — returns one claim with type "fix_applied"
  - Test `extractClaims()` with "Tests passing" text — returns one claim with type "tests_passed"
  - Test `extractClaims()` with "Committed the changes" text — returns one claim with type "committed"
  - Test `extractClaims()` with "Pushed to remote" text — returns one claim with type "pushed"
  - Test `extractClaims()` with "Diagnosed the root cause" text — returns one claim with type "diagnosed"
  - Test `extractClaims()` with "Configured the settings" text — returns one claim with type "configured"
  - Test `extractClaims()` with no claim keywords — returns empty array
  - Test `extractClaims()` with multiple claims in one message — returns multiple claims
  - Test `extractClaims()` with system message types (error, api_req_started) — skips them
  - Test `extractClaims()` with `say: "completion_result"` — source is "say_completion_result"
  - Test `extractClaims()` with `say: "text"` — source is "say_text"
  - Test `extractClaims()` case insensitivity — "FIXED", "Fixed", "fixed" all match
  - Test `extractClaimsFromText()` with raw text input — returns correct claim
  - Test `truncate()` with short text — returns unchanged
  - Test `truncate()` with long text — truncates to maxLength with ellipsis

- [ ] **T2.2**: Create `src/core/contradiction-detection/__tests__/EvidenceLookup.spec.ts`
  - Test `lookupEvidence()` with matching evidence type — returns matching entries
  - Test `lookupEvidence()` with non-matching evidence type — returns empty array
  - Test `lookupEvidence()` with evidence before task start — filters out old evidence
  - Test `lookupEvidence()` with evidence after claim timestamp — filters out future evidence
  - Test `lookupEvidence()` with multiple matching entries — returns sorted by timestamp descending
  - Test `lookupEvidence()` with test evidence and exit code 0 — passes validation
  - Test `lookupEvidence()` with test evidence and exit code 1 — fails validation
  - Test `lookupEvidence()` with empty evidence registry — returns empty array
  - Test `filterByTimeWindow()` with evidence spanning time range — returns only entries in range
  - Test `sortByRecency()` with unsorted evidence — returns sorted descending

- [ ] **T2.3**: Create `src/core/contradiction-detection/__tests__/ContradictionChecker.spec.ts`
  - Test `detectContradictions()` with `enabled: false` — returns empty result immediately
  - Test `detectContradictions()` with no claims — returns empty result
  - Test `detectContradictions()` with supported claim — returns hasContradictions: false
  - Test `detectContradictions()` with unsupported claim (no evidence) — returns hasContradictions: true, status: "unsupported"
  - Test `detectContradictions()` with contradicted claim (test failed) — returns hasContradictions: true, status: "contradicted"
  - Test `detectContradictions()` with mixed claims (some supported, some not) — returns correct counts
  - Test `detectContradictions()` with `detectFixApplied: false` — skips fix_applied claims
  - Test `detectContradictions()` with `detectTestsPassed: false` — skips tests_passed claims
  - Test `detectContradictions()` with all sub-detections disabled — returns empty result
  - Test `formatWarningMessage()` with one contradiction — includes claim text, type, status
  - Test `formatWarningMessage()` with multiple contradictions — includes all with numbering
  - Test `formatWarningMessage()` with unsupported status — includes "no evidence was found"
  - Test `formatWarningMessage()` with contradicted status — includes "contradicted by evidence"
  - Test `formatWarningMessage()` includes "You MUST resolve these contradictions"
  - Test `createEmptyResult()` — returns hasContradictions: false, zero counts
  - Test `detectContradictions()` returns detectionDurationMs
  - Test `detectContradictions()` returns warningMessage (empty when no contradictions)

- [ ] **T2.4**: Create `src/core/contradiction-detection/__tests__/WarningInjector.spec.ts`
  - Test `injectWarning()` with empty warning — returns userMessageContent unchanged
  - Test `injectWarning()` with non-empty warning — appends `<contradiction_warning>` block
  - Test `injectWarning()` warning is formatted as user message
  - Test `clearWarning()` with existing warning — removes `<contradiction_warning>` block
  - Test `clearWarning()` with no warning — returns content unchanged
  - Test `hasExistingWarning()` with warning present — returns true
  - Test `hasExistingWarning()` with no warning — returns false
  - Test `injectWarning()` preserves existing userMessageContent

- [ ] **T2.5**: Create `src/core/contradiction-detection/__tests__/ResolutionTracker.spec.ts`
  - Test `createResolutionRecord()` — creates record with resolved: false
  - Test `checkResolution()` with resolving evidence — marks record as resolved
  - Test `checkResolution()` with non-matching evidence — leaves record unresolved
  - Test `checkResolution()` with already resolved record — does not change resolved status
  - Test `checkResolution()` with contradicted claim and passing evidence — resolves the record
  - Test `getUnresolvedContradictions()` with mixed records — returns only unresolved
  - Test `getUnresolvedContradictions()` with all resolved — returns empty array
  - Test `generateCondensedContradictions()` with unresolved records — returns summary strings
  - Test `generateCondensedContradictions()` with all resolved — returns empty array
  - Test `generateCondensedContradictions()` format — includes `[CONTRADICTION]`, claim type, status, truncated text
  - Test `areAllResolved()` with all resolved — returns true
  - Test `areAllResolved()` with some unresolved — returns false
  - Test `areAllResolved()` with empty array — returns true

- [ ] **T2.6**: Create `src/core/contradiction-detection/__tests__/MetricsTracker.spec.ts`
  - Test `createInitialMetrics()` — returns zero counts, contradictionRate: 0
  - Test `updateMetrics()` with supported claim — increments totalClaims and supportedClaims
  - Test `updateMetrics()` with unsupported claim — increments unsupportedClaims
  - Test `updateMetrics()` with contradicted claim — increments contradictedClaims
  - Test `updateMetrics()` contradiction rate calculation — (unsupported + contradicted) / total
  - Test `updateMetrics()` multiple updates — accumulates correctly
  - Test `getMetrics()` — returns current metrics object
  - Test `resetMetrics()` — resets all counts to zero, preserves taskId
  - Test `updateMetrics()` updates lastUpdated timestamp

- [ ] **T2.7**: Create `src/core/contradiction-detection/__tests__/ConfigManager.spec.ts`
  - Test `getContradictionConfig()` with all defaults — returns default values
  - Test `getContradictionConfig()` with partial overrides — returns merged values
  - Test `getContradictionConfig()` with all overrides — returns all custom values
  - Test `isDetectionEnabled()` with enabled detection — returns true
  - Test `isDetectionEnabled()` with disabled detection — returns false
  - Test `isDetectionEnabled()` with `enabled: false` — returns false for all claim types
  - Test `shouldDetectClaim()` with both enabled — returns true
  - Test `shouldDetectClaim()` with either disabled — returns false
  - Test `getWarningCooldownMs()` with default config — returns 5000
  - Test `getWarningCooldownMs()` with custom config — returns custom value

- [ ] **T2.8**: Create `src/core/contradiction-detection/__tests__/ContradictionDetectionEngine.spec.ts`
  - Test `detect()` with `enabled: false` — returns empty result
  - Test `detect()` with claims and supporting evidence — returns hasContradictions: false
  - Test `detect()` with claims and no evidence — returns hasContradictions: true
  - Test `detect()` with mixed evidence — returns correct counts
  - Test `extractAndDetect()` with messages containing claims — extracts and detects
  - Test `extractAndDetect()` with messages without claims — returns empty result
  - Test `extractAndDetectFromMessages()` with task context — full pipeline
  - Test `detect()` performance — completes in under 50ms for 100 claims
  - Test `detect()` with evidence registry unavailable — graceful degradation (all supported)
  - Test `detect()` with `warningCooldownMs` — respects cooldown between warnings

- [ ] **T2.9**: Run existing test suite to verify no regressions
  - `cd src && npx vitest run core/loop-detection/__tests__/` — all pass
  - `cd src && npx vitest run core/assistant-message/__tests__/` — all pass

## Phase 3: Integration — presentAssistantMessage, Condense, and Resolution

- [ ] **T3.1**: Integrate contradiction detection into `presentAssistantMessage()`
  - Import `extractAndDetectFromMessages` from `../../core/contradiction-detection`
  - Import `ContradictionResult` from `@roo-code/types`
  - After the tool processing loop completes (after all `pushToolResult()` calls), add contradiction detection:
    - Collect `say()` messages from the current message's content blocks
    - Call `extractAndDetectFromMessages()` with the collected messages and task context
    - If `result.hasContradictions` is true, inject `result.warningMessage` into `userMessageContent`
    - Update contradiction metrics via `MetricsTracker`
    - Create resolution records for new contradictions
  - Ensure detection runs after evidence registry is updated with current message's tool results
  - Ensure detection does not block the message processing pipeline (wrap in try/catch)

- [ ] **T3.2**: Integrate resolution tracking with evidence registry updates
  - When new evidence is added to the evidence registry (Phase 1), call `checkResolution()` to auto-resolve contradictions
  - Store resolution records in the task state
  - When a contradiction is auto-resolved, log the resolution for observability
  - Ensure resolution checking runs synchronously as part of the evidence recording pipeline

- [ ] **T3.3**: Update `src/core/condense/index.ts`
  - Import `getUnresolvedContradictions`, `generateCondensedContradictions` from `../contradiction-detection/ResolutionTracker`
  - In `summarizeConversation()`, after extracting messages to summarize:
    - Call `getUnresolvedContradictions()` to get unresolved contradictions
    - Call `generateCondensedContradictions()` to produce condensed summaries
    - Inject condensed summaries into the condensed messages as user messages
    - Format: `[CONTRADICTION] <claim_type>: <status> — "<text>"`
  - Ensure only unresolved contradictions are included in condensed history
  - Ensure resolved contradictions are dropped from condensed history

- [ ] **T3.4**: Create `src/core/assistant-message/__tests__/presentAssistantMessage-contradiction.spec.ts`
  - Test `presentAssistantMessage()` with agent claiming "Fix applied" and file_edit evidence present
    - Verify no contradiction warning is injected
    - Verify the tool response is unchanged
  - Test `presentAssistantMessage()` with agent claiming "Fix applied" and no file_edit evidence
    - Verify a `<contradiction_warning>` block is injected into `userMessageContent`
    - Verify the warning includes "fix_applied" and "unsupported"
  - Test `presentAssistantMessage()` with agent claiming "Tests passing" and test evidence showing failure
    - Verify a contradiction warning is injected
    - Verify the warning includes "tests_passed" and "contradicted"
  - Test `presentAssistantMessage()` with agent claiming "Committed" and no git_commit evidence
    - Verify a contradiction warning is injected
    - Verify the warning includes "committed" and "unsupported"
  - Test `presentAssistantMessage()` with contradiction detection disabled
    - Verify no contradiction warning is injected regardless of claims
    - Verify the message processing flow is unchanged
  - Test `presentAssistantMessage()` with multiple claims (some supported, some not)
    - Verify all contradictions are listed in a single warning block
    - Verify supported claims are not mentioned in the warning
  - Test `presentAssistantMessage()` with no claims in agent message
    - Verify no contradiction warning is injected
  - Test `presentAssistantMessage()` performance — detection adds less than 50ms
  - Test `presentAssistantMessage()` error handling — if detection fails, log error and proceed

- [ ] **T3.5**: Create `src/core/condense/__tests__/condense-contradiction.spec.ts`
  - Test `summarizeConversation()` preserves unresolved contradictions
    - Create messages with unresolved contradiction records
    - Verify condensed output includes `[CONTRADICTION]` summaries
  - Test `summarizeConversation()` with no contradictions
    - Verify condensed output is unchanged
  - Test `summarizeConversation()` with all resolved contradictions
    - Verify condensed output does not include resolved contradictions
  - Test `summarizeConversation()` with mixed resolved/unresolved
    - Verify only unresolved contradictions are preserved
  - Test condensed contradiction summary format
    - Verify format: `[CONTRADICTION] <type>: <status> — "<text>"`
  - Test condensed contradiction summary is compact (max 200 tokens per summary)

- [ ] **T3.6**: Create `src/core/contradiction-detection/__tests__/ResolutionTracker-integration.spec.ts`
  - Test auto-resolution when file_edit evidence is added after "fix_applied" contradiction
    - Create a contradiction for "fix_applied" without evidence
    - Add file_edit evidence to the registry
    - Verify the contradiction is marked as resolved
  - Test auto-resolution when test evidence (exit code 0) is added after "tests_passed" contradiction
    - Create a contradiction for "tests_passed" with failing test evidence
    - Add passing test evidence to the registry
    - Verify the contradiction is marked as resolved
  - Test non-resolution when irrelevant evidence is added
    - Create a contradiction for "committed"
    - Add file_edit evidence (wrong type)
    - Verify the contradiction remains unresolved
  - Test resolution records persist in task state
  - Test resolution records survive context condensation

## Phase 4: Verification — End-to-End, Observability, and Polish

- [ ] **T4.1**: Add contradiction detection event logging
  - In `ContradictionDetectionEngine.detect()`, add a `console.debug` call (or use existing logging infrastructure) that logs:
    - Detection started (task ID, number of claims extracted)
    - Detection completed (task ID, total claims, supported, unsupported, contradicted, duration)
    - Contradiction detected (task ID, claim type, claim text truncated to 200 chars, status, required evidence type)
    - Contradiction resolved (task ID, claim type, resolution evidence ID)
    - Warning injected (task ID, number of contradictions)
  - Ensure logging is gated behind a debug flag or existing verbose logging check
  - Verify logs do not contain full claim text (truncated to 200 chars), evidence payloads larger than 1KB, or tool parameters containing user input

- [ ] **T4.2**: Add contradiction metrics to task state
  - Store `ContradictionMetrics` in the task state
  - Update metrics after each detection run
  - Expose metrics via the task's state interface for the observability system (Phase 9)
  - Include metrics in task serialization for persistence across session resume
  - Verify metrics reset at the start of each new task

- [ ] **T4.3**: Verify configuration edge cases
  - Test with `enabled: true` and all sub-detections disabled — no detection runs
  - Test with `enabled: true` and only `detectFixApplied: true` — only fix_applied claims checked
  - Test with `enabled: false` — zero overhead, no detection runs
  - Test with `warningCooldownMs: 1000` — minimum cooldown
  - Test with `warningCooldownMs: 60000` — maximum cooldown
  - Test with invalid config values (e.g., `warningCooldownMs: 500`) — falls back to default
  - Test with `enabled: true` and `detectFixApplied: false`, `detectTestsPassed: false`, etc. — each sub-detection independently disabled

- [ ] **T4.4**: Verify evidence registry integration
  - Test with evidence registry available — evidence lookup works correctly
  - Test with evidence registry unavailable — graceful degradation (all claims marked as supported)
  - Test with evidence registry containing entries from previous tasks — time window filtering excludes old entries
  - Test with evidence registry containing 10,000+ entries — evidence lookup completes in under 5ms
  - Test with evidence entries added during tool execution — contradiction detection sees up-to-date evidence

- [ ] **T4.5**: Verify claim type coverage
  - Test "fix_applied" claim with file_edit evidence — supported
  - Test "fix_applied" claim without file_edit evidence — unsupported
  - Test "tests_passed" claim with test evidence (exit code 0) — supported
  - Test "tests_passed" claim with test evidence (exit code 1) — contradicted
  - Test "tests_passed" claim without test evidence — unsupported
  - Test "committed" claim with git_commit evidence — supported
  - Test "committed" claim without git_commit evidence — unsupported
  - Test "pushed" claim with git_push evidence — supported
  - Test "pushed" claim without git_push evidence — unsupported
  - Test "diagnosed" claim with file_read evidence — supported
  - Test "diagnosed" claim without file_read evidence — unsupported
  - Test "configured" claim with file_edit evidence — supported
  - Test "configured" claim without file_edit evidence — unsupported

- [ ] **T4.6**: Run full test suite
  - `cd src && npx vitest run` — all tests pass
  - `cd webview-ui && npx vitest run` — all tests pass (verify no regressions from type changes)

- [ ] **T4.7**: Run lint
  - `cd src && npx eslint core/contradiction-detection/` — zero errors
  - `cd src && npx eslint core/assistant-message/presentAssistantMessage.ts` — zero errors
  - `cd src && npx eslint core/condense/index.ts` — zero errors

- [ ] **T4.8**: Manual verification
  - Build the project: `cd src && npx tsc --noEmit` — zero type errors
  - Verify the `contradictionDetection` config section appears in settings types
  - Verify the `ContradictionResult` type is exported from `@roo-code/types`
  - Verify claim extraction identifies all 6 claim types from sample agent messages
  - Verify evidence lookup correctly filters by time window and evidence type
  - Verify contradiction detection flags unsupported claims correctly
  - Verify contradiction detection flags contradicted claims correctly
  - Verify warning message format includes `<contradiction_warning>` tags
  - Verify warning is injected into `userMessageContent` when contradictions exist
  - Verify no warning is injected when all claims are supported
  - Verify resolution tracking auto-resolves contradictions when evidence is added
  - Verify resolution records survive context condensation
  - Verify contradiction metrics are tracked per task
  - Verify contradiction detection is non-blocking — agent can proceed after warning
  - Verify contradiction detection respects `enabled: false` config
  - Verify contradiction detection respects per-claim-type enable/disable flags
  - Verify contradiction detection completes in under 50ms
  - Verify contradiction detection handles evidence registry unavailability gracefully
