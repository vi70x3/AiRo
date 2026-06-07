# Tasks: Verification Pipeline

## Phase 1: Foundation — Types, Schema, and Core Modules

- [ ] **T1.1**: Add `verification` section to `packages/types/src/global-settings.ts`
  - Import `z` from zod (already imported)
  - Add `verification` field to `globalSettingsSchema` with:
    - `enabled`: `z.boolean().optional().default(true)`
    - `lintEnabled`: `z.boolean().optional().default(true)`
    - `typecheckEnabled`: `z.boolean().optional().default(true)`
    - `testEnabled`: `z.boolean().optional().default(true)`
    - `patchVerificationEnabled`: `z.boolean().optional().default(true)`
    - `lintTimeoutMs`: `z.number().int().min(5000).max(120000).optional().default(30000)`
    - `typecheckTimeoutMs`: `z.number().int().min(5000).max(120000).optional().default(30000)`
    - `testTimeoutMs`: `z.number().int().min(10000).max(300000).optional().default(60000)`
    - `failOnLint`: `z.boolean().optional().default(true)`
    - `failOnTypecheck`: `z.boolean().optional().default(true)`
    - `failOnTest`: `z.boolean().optional().default(true)`
    - `failOnPatch`: `z.boolean().optional().default(true)`
  - Export `VerificationConfig` type via `z.infer`
  - Verify the existing export pattern in `index.ts` re-exports the new type

- [ ] **T1.2**: Add verification types to `packages/types/src/loop-detection.ts`
  - Add `VerificationCheckStatus` type: `"passed" | "failed" | "skipped" | "timeout" | "error"`
  - Add `VerificationCheckResult` interface with fields: `checkType`, `status`, `message`, `errors?`, `filesInvolved?`, `durationMs`, `rawOutput?`, `skipReason?`
  - Add `VerificationResult` interface with fields: `passed`, `checks`, `filePath`, `totalDurationMs`, `timestamp`, `hasBlockingFailure`, `evidenceMessage`
  - Add `VerificationEvidenceSummary` interface with fields: `filePath`, `passed`, `failedChecks`, `errorCounts`, `timestamp`, `resolved`, `resolvedAt?`
  - Add `EditContext` interface with fields: `relPath`, `absolutePath`, `expectedContent`, `actualContent`, `isNewFile`, `userEdits`, `preDiagnostics`, `postDiagnostics`, `toolAvailabilityContext`
  - Add `LanguageCommands` interface with fields: `lintCommand?`, `typecheckCommand?`, `testCommand?`, `testFileCommand?`, `cwd`
  - Export all new types

- [ ] **T1.3**: Create `src/core/verification/LanguageDetector.ts`
  - Define `LANGUAGE_COMMANDS` registry mapping file extensions to lint/typecheck/test commands
  - Support: `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.rs`, `.go`
  - Define `detectLanguageCommands(absolutePath, cwd)` function returning `LanguageCommands`
  - Define `findRelatedTestFile(absolutePath)` function that maps source files to their test counterparts (e.g., `src/foo.ts` -> `src/__tests__/foo.test.ts`, `src/foo.test.ts`)
  - Define `getLanguageFromExtension(ext)` helper returning the language name
  - Export all public functions and the `LANGUAGE_COMMANDS` constant

- [ ] **T1.4**: Create `src/core/verification/ConfigManager.ts`
  - Define `getVerificationConfig(globalSettings)` function extracting verification config from global settings with defaults
  - Define `isCheckEnabled(config, checkType)` function returning whether a specific check is enabled
  - Define `getTimeoutForCheck(config, checkType)` function returning the timeout in milliseconds for a specific check
  - Define `shouldFailOnCheck(config, checkType)` function returning whether failures on a specific check should block "Fix applied"
  - Export all public functions

- [ ] **T1.5**: Create `src/core/verification/PatchVerifier.ts`
  - Define `verifyPatch(context, config)` async function
  - Implement user-edits detection: if `context.userEdits` is true, return "passed" with skip message
  - Implement file re-read: read actual content from disk via `fs.readFile()`
  - Implement EOL normalization: normalize both expected and actual content before comparison
  - Implement diff generation: when content mismatches, generate a concise diff summary
  - Define `normalizeEOL(content)` helper
  - Define `generateDiffSummary(expected, actual)` helper producing a unified diff snippet (max 20 lines)
  - Export all public functions

- [ ] **T1.6**: Create `src/core/verification/CommandRunner.ts`
  - Define `runCommand(command, options)` async function with timeout support
  - Options: `cwd`, `timeoutMs`, `env?`
  - Return: `stdout`, `stderr`, `exitCode`, `timedOut`
  - Use `child_process.exec` or `execa` (whichever is already in the project) for command execution
  - Implement timeout: kill the process if it exceeds `timeoutMs`
  - Define `parseLintOutput(stdout, stderr, filePath)` function extracting lint errors from command output
  - Define `parseTypecheckOutput(stdout, stderr, filePath)` function extracting type errors from command output
  - Define `parseTestFailures(stdout, stderr)` function extracting test failure messages
  - Define `filterNewErrors(errors, preDiagnostics)` function filtering to only errors not present in pre-edit diagnostics
  - Define `truncate(output, maxLength)` helper
  - Export all public functions

- [ ] **T1.7**: Create `src/core/verification/ResultAggregator.ts`
  - Define `aggregateResults(checks, context, config)` function
  - Implement blocking failure determination: check each failed check against `failOn*` config flags
  - Implement pass/fail logic: all checks must be "passed" or "skipped" for overall pass
  - Define `generateEvidenceMessage(checks, context, allPassed, hasBlockingFailure)` function
  - Implement pass summary format: brief message listing passed and skipped checks
  - Implement failure report format: detailed message with per-check error details (max 10 errors per check)
  - Implement blocking instruction: when `hasBlockingFailure` is true, append "You MUST address these verification failures before claiming the fix is complete."
  - Define `createEmptyResult(context, config)` function for when verification is disabled
  - Define `createSkippedResult(checkType, reason)` function for tool-unavailable skips
  - Export all public functions

- [ ] **T1.8**: Create `src/core/verification/VerificationOrchestrator.ts`
  - Define `verifyEdit(context, config)` async function
  - Implement enabled check: if `config.enabled` is false, return empty result immediately
  - Implement parallel check execution: build array of promises for enabled checks, run via `Promise.all()`
  - Implement tool availability awareness: check `ToolAvailabilityContext.isToolAvailable("execute_command")` before adding lint/typecheck/test checks
  - Implement patch verification: add patch check if `config.patchVerificationEnabled` is true
  - Call `aggregateResults()` to combine individual results
  - Export `verifyEdit` as the main entry point

- [ ] **T1.9**: Create `src/core/verification/CondenseHelper.ts`
  - Define `extractVerificationEvidence(messages)` function
  - Parse `[VERIFICATION_EVIDENCE]` markers from user messages
  - Deduplicate by file path, keeping only the most recent per file
  - Define `generateCondensedEvidence(summary)` function producing a compact string (max 200 tokens)
  - Format: `[VERIFICATION_EVIDENCE] <path>: <STATUS>. Failed: <checks> (<count> errors). <resolution>`
  - Define `parseVerificationEvidence(messageContent)` function parsing evidence from a message
  - Export all public functions

- [ ] **T1.10**: Create `src/core/verification/index.ts`
  - Barrel export all public types from the verification module
  - Re-export `verifyEdit` from `VerificationOrchestrator`
  - Re-export `VerificationResult`, `VerificationCheckResult`, `VerificationCheckStatus`, `VerificationConfig`, `VerificationEvidenceSummary`, `EditContext`, `LanguageCommands` from types
  - Re-export `extractVerificationEvidence`, `generateCondensedEvidence` from `CondenseHelper`
  - Re-export `LANGUAGE_COMMANDS`, `detectLanguageCommands` from `LanguageDetector`

## Phase 2: Core Logic — Unit Tests

- [ ] **T2.1**: Create `src/core/verification/__tests__/LanguageDetector.spec.ts`
  - Test `detectLanguageCommands()` for `.ts` — returns eslint, tsc, vitest commands
  - Test `detectLanguageCommands()` for `.tsx` — returns eslint, tsc, vitest commands
  - Test `detectLanguageCommands()` for `.py` — returns ruff, mypy, pytest commands
  - Test `detectLanguageCommands()` for `.rs` — returns cargo check, cargo test commands
  - Test `detectLanguageCommands()` for `.go` — returns go vet, go test commands
  - Test `detectLanguageCommands()` for `.md` — returns undefined for all commands (unsupported)
  - Test `findRelatedTestFile()` for `src/core/foo.ts` — returns `src/core/__tests__/foo.test.ts`
  - Test `findRelatedTestFile()` for `src/core/foo.test.ts` — returns itself
  - Test `findRelatedTestFile()` for `packages/types/src/index.ts` — returns `packages/types/src/__tests__/index.test.ts`
  - Test `getLanguageFromExtension()` for all supported extensions
  - Test `getLanguageFromExtension()` for unsupported extension — returns undefined

- [ ] **T2.2**: Create `src/core/verification/__tests__/PatchVerifier.spec.ts`
  - Test `verifyPatch()` with matching content — returns "passed"
  - Test `verifyPatch()` with mismatched content — returns "failed" with diff summary
  - Test `verifyPatch()` with user edits — returns "passed" with skip message
  - Test `verifyPatch()` with EOL differences (CRLF vs LF) — returns "passed" after normalization
  - Test `verifyPatch()` with file read error — returns "error" status
  - Test `normalizeEOL()` with CRLF input — returns LF
  - Test `normalizeEOL()` with mixed EOL — returns LF
  - Test `generateDiffSummary()` produces max 20 lines
  - Test `generateDiffSummary()` shows correct line numbers

- [ ] **T2.3**: Create `src/core/verification/__tests__/CommandRunner.spec.ts`
  - Test `runCommand()` with successful command — returns exitCode 0, stdout, stderr
  - Test `runCommand()` with failing command — returns non-zero exitCode
  - Test `runCommand()` with timeout — returns timedOut: true
  - Test `runCommand()` with non-existent command — returns error
  - Test `parseLintOutput()` with eslint output — extracts file, line, message
  - Test `parseLintOutput()` with ruff output — extracts file, line, message
  - Test `parseTypecheckOutput()` with tsc output — extracts file, line, message
  - Test `parseTestFailures()` with vitest output — extracts test name and error
  - Test `parseTestFailures()` with pytest output — extracts test name and error
  - Test `filterNewErrors()` with pre-existing errors — filters them out
  - Test `filterNewErrors()` with all new errors — keeps all
  - Test `filterNewErrors()` with mixed — keeps only new
  - Test `truncate()` with short output — returns unchanged
  - Test `truncate()` with long output — truncates to maxLength

- [ ] **T2.4**: Create `src/core/verification/__tests__/ResultAggregator.spec.ts`
  - Test `aggregateResults()` with all checks passed — returns passed: true, hasBlockingFailure: false
  - Test `aggregateResults()` with lint failed and failOnLint: true — returns hasBlockingFailure: true
  - Test `aggregateResults()` with lint failed and failOnLint: false — returns hasBlockingFailure: false
  - Test `aggregateResults()` with all checks skipped — returns passed: true
  - Test `aggregateResults()` with timeout — returns hasBlockingFailure: false (timeout is not a failure)
  - Test `generateEvidenceMessage()` with all passed — includes "Verification passed"
  - Test `generateEvidenceMessage()` with failure — includes "FAILED" and error details
  - Test `generateEvidenceMessage()` with blocking failure — includes "You MUST address these verification failures"
  - Test `generateEvidenceMessage()` truncates errors to max 10 per check
  - Test `createEmptyResult()` — returns passed: true, empty checks array
  - Test `createSkippedResult()` — returns "skipped" status with reason

- [ ] **T2.5**: Create `src/core/verification/__tests__/VerificationOrchestrator.spec.ts`
  - Test `verifyEdit()` with `enabled: false` — returns empty result immediately
  - Test `verifyEdit()` with `enabled: true` and all checks enabled — runs all checks in parallel
  - Test `verifyEdit()` with `enabled: true` and only patch enabled — runs only patch verification
  - Test `verifyEdit()` with `execute_command` disabled — skips lint, typecheck, test; runs patch only
  - Test `verifyEdit()` with `read_file` disabled — skips patch verification
  - Test `verifyEdit()` with all tools disabled — returns all checks skipped
  - Test `verifyEdit()` with `lintEnabled: false` — skips lint check
  - Test `verifyEdit()` with `typecheckEnabled: false` — skips typecheck check
  - Test `verifyEdit()` with `testEnabled: false` — skips test check
  - Test `verifyEdit()` with `patchVerificationEnabled: false` — skips patch check
  - Test `verifyEdit()` returns evidenceMessage in result
  - Test `verifyEdit()` returns totalDurationMs in result
  - Test `verifyEdit()` returns timestamp in result

- [ ] **T2.6**: Create `src/core/verification/__tests__/ConfigManager.spec.ts`
  - Test `getVerificationConfig()` with all defaults — returns default values
  - Test `getVerificationConfig()` with partial overrides — returns merged values
  - Test `getVerificationConfig()` with all overrides — returns all custom values
  - Test `isCheckEnabled()` with check enabled — returns true
  - Test `isCheckEnabled()` with check disabled — returns false
  - Test `getTimeoutForCheck()` with default config — returns default timeout
  - Test `getTimeoutForCheck()` with custom config — returns custom timeout
  - Test `shouldFailOnCheck()` with failOn* true — returns true
  - Test `shouldFailOnCheck()` with failOn* false — returns false

- [ ] **T2.7**: Create `src/core/verification/__tests__/CondenseHelper.spec.ts`
  - Test `extractVerificationEvidence()` with no verification messages — returns empty array
  - Test `extractVerificationEvidence()` with one verification message — returns one summary
  - Test `extractVerificationEvidence()` with multiple verifications for same file — returns only most recent
  - Test `extractVerificationEvidence()` with verifications for different files — returns all
  - Test `generateCondensedEvidence()` with passed verification — includes "PASSED"
  - Test `generateCondensedEvidence()` with failed verification — includes "FAILED"
  - Test `generateCondensedEvidence()` with resolved verification — includes "RESOLVED"
  - Test `parseVerificationEvidence()` with valid marker — returns summary
  - Test `parseVerificationEvidence()` with invalid marker — returns null

- [ ] **T2.8**: Run existing test suite to verify no regressions
  - `cd src && npx vitest run integrations/diagnostics/__tests__/` — all pass
  - `cd src && npx vitest run integrations/editor/__tests__/` — all pass

## Phase 3: Integration — DiffViewProvider, Context, and Condense

- [ ] **T3.1**: Integrate verification into `DiffViewProvider.saveChanges()`
  - Import `verifyEdit` from `../../core/verification`
  - Import `VerificationResult`, `EditContext` from `@roo-code/types`
  - After the `newProblemsMessage` is computed (line ~270), build an `EditContext` object:
    - `relPath`: from `this.relPath`
    - `absolutePath`: `path.resolve(this.cwd, this.relPath)`
    - `expectedContent`: from `this.newContent`
    - `actualContent`: from the saved document content
    - `isNewFile`: from `this.editType === "create"`
    - `userEdits`: from the user edits detection logic (line ~282)
    - `preDiagnostics`: from `this.preDiagnostics`
    - `postDiagnostics`: from `vscode.languages.getDiagnostics()`
    - `toolAvailabilityContext`: obtain from the task's current tool availability state
  - Call `verifyEdit(context, config)` and store the result
  - Pass the verification result to `pushToolWriteResult()` calls
  - Ensure verification runs in parallel with the existing `writeDelayMs` delay

- [ ] **T3.2**: Integrate verification into `DiffViewProvider.saveDirectly()`
  - Same pattern as `saveChanges()`: build `EditContext` after diagnostics are collected (line ~712)
  - Call `verifyEdit(context, config)` and store the result
  - Include the verification result in the returned object as `verificationResult`
  - Ensure verification runs in parallel with the existing `writeDelayMs` delay

- [ ] **T3.3**: Update `DiffViewProvider.pushToolWriteResult()`
  - Add optional `verificationResult?: VerificationResult` parameter to the method signature
  - When `verificationResult` is provided and `hasBlockingFailure` is true:
    - Append the `evidenceMessage` to the `notices` array
    - Prepend a `[VERIFICATION FAILED]` marker to the notice
  - When `verificationResult` is provided and all checks passed:
    - Append a brief pass summary to the `notices` array
  - When `verificationResult` is provided and checks were skipped:
    - Append a brief skip summary to the `notices` array
  - When `verificationResult` is not provided (verification disabled):
    - No change to existing behavior

- [ ] **T3.4**: Update `src/core/condense/index.ts`
  - Import `extractVerificationEvidence`, `generateCondensedEvidence` from `../verification/CondenseHelper`
  - In `summarizeConversation()`, after extracting messages to summarize:
    - Call `extractVerificationEvidence(messages)` to get evidence summaries
    - Store the evidence summaries in the response metadata
  - After condensation, inject condensed evidence summaries into the condensed messages:
    - For each evidence summary, generate a condensed string via `generateCondensedEvidence()`
    - Inject as a user message with the `[VERIFICATION_EVIDENCE]` tag
    - Position after the summary message but before the remaining messages
  - Ensure evidence summaries are compact (max 200 tokens each)

- [ ] **T3.5**: Create `src/integrations/editor/__tests__/DiffViewProvider-verification.spec.ts`
  - Test `saveChanges()` with verification enabled and all checks passing
    - Verify the tool response includes a verification pass notice
    - Verify the tool response does NOT include a verification failure notice
  - Test `saveChanges()` with verification enabled and lint failure
    - Verify the tool response includes `[VERIFICATION FAILED]` notice
    - Verify the notice includes lint error details
    - Verify the notice includes "You MUST address these verification failures"
  - Test `saveChanges()` with verification enabled and patch mismatch
    - Verify the tool response includes patch verification failure
    - Verify the notice includes diff summary
  - Test `saveChanges()` with verification disabled
    - Verify the tool response is identical to current behavior (no verification notices)
  - Test `saveDirectly()` with verification enabled
    - Verify the returned object includes `verificationResult`
  - Test `pushToolWriteResult()` with verification result
    - Verify notices array includes verification evidence
  - Test `pushToolWriteResult()` without verification result
    - Verify notices array is unchanged from current behavior
  - Test with `execute_command` disabled
    - Verify lint/typecheck/test checks are skipped
    - Verify only patch verification runs
    - Verify skip summary is included in notices

- [ ] **T3.6**: Create `src/core/condense/__tests__/condense-verification.spec.ts`
  - Test `summarizeConversation()` preserves verification evidence
    - Create messages with `[VERIFICATION_EVIDENCE]` markers
    - Verify condensed output includes verification evidence summaries
  - Test `summarizeConversation()` with no verification evidence
    - Verify condensed output is unchanged
  - Test `summarizeConversation()` with multiple verification evidences for same file
    - Verify only the most recent evidence is preserved
  - Test `summarizeConversation()` with verification evidence for different files
    - Verify all evidences are preserved
  - Test evidence summary is compact (max 200 tokens)
  - Test evidence summary includes file path, status, and failed checks

## Phase 4: Verification — End-to-End, Observability, and Polish

- [ ] **T4.1**: Add verification event logging
  - In `VerificationOrchestrator.verifyEdit()`, add a `console.debug` call (or use existing logging infrastructure) that logs:
    - Verification started (file path, enabled checks)
    - Verification completed (file path, per-check results, total duration)
    - Verification failed (file path, failed checks, error details truncated to 500 chars)
    - Verification skipped (file path: reason)
    - Patch verification mismatch (file path, diff summary)
  - Ensure logging is gated behind a debug flag or existing verbose logging check
  - Verify logs do not contain file contents, full command output (truncated to 500 chars), or tool parameters containing user input

- [ ] **T4.2**: Add verification metrics
  - Track total verifications per task
  - Track verification pass rate (passed / total)
  - Track average verification duration per check type (lint, typecheck, test, patch)
  - Track verification failure rate per check type
  - Track verification skip rate (skipped / total)
  - Expose metrics as structured key-value entries with timestamp, metric name, and numeric value
  - Store metrics in the task state for retrieval by the observability system

- [ ] **T4.3**: Verify configuration edge cases
  - Test with `enabled: true` and all sub-checks disabled — only patch verification runs
  - Test with `enabled: true` and `failOnLint: false` — lint failures do not block "Fix applied"
  - Test with `enabled: true` and `failOnTypecheck: false` — typecheck failures do not block
  - Test with `enabled: true` and `failOnTest: false` — test failures do not block
  - Test with `enabled: true` and `failOnPatch: false` — patch failures do not block
  - Test with `enabled: false` — zero overhead, no verification runs
  - Test with `lintTimeoutMs: 5000` — lint check times out after 5 seconds
  - Test with `testTimeoutMs: 300000` — test check times out after 5 minutes
  - Test with invalid config values (e.g., `lintTimeoutMs: 100`) — falls back to default

- [ ] **T4.4**: Verify ToolAvailabilityContext integration
  - Test with `execute_command` disabled: lint, typecheck, test skipped; patch runs
  - Test with `read_file` disabled: patch skipped; lint, typecheck, test run
  - Test with all tools disabled: all checks skipped
  - Test with tools enabled after being disabled: checks resume
  - Verify skip reasons are correctly reported in verification results

- [ ] **T4.5**: Run full test suite
  - `cd src && npx vitest run` — all tests pass
  - `cd webview-ui && npx vitest run` — all tests pass (verify no regressions from type changes)

- [ ] **T4.6**: Run lint
  - `cd src && npx eslint core/verification/` — zero errors
  - `cd src && npx eslint integrations/editor/DiffViewProvider.ts` — zero errors
  - `cd src && npx eslint core/condense/index.ts` — zero errors

- [ ] **T4.7**: Manual verification
  - Build the project: `cd src && npx tsc --noEmit` — zero type errors
  - Verify the `verification` config section appears in settings types
  - Verify the `VerificationResult` type is exported from `@roo-code/types`
  - Verify patch verification re-reads file content after edit
  - Verify lint check runs `npx eslint` after TypeScript file edit
  - Verify typecheck check runs `npx tsc --noEmit` after TypeScript file edit
  - Verify test check runs `npx vitest run` after TypeScript file edit
  - Verify verification result is injected into tool response as a notice
  - Verify verification failure blocks "Fix applied" claim with specific error details
  - Verify verification pass produces a brief pass summary
  - Verify verification is skipped when `enabled: false`
  - Verify verification evidence survives context condensation
  - Verify verification respects `ToolAvailabilityContext` — skips command-based checks when `execute_command` is disabled
  - Verify verification runs in parallel with the agent's next action (non-blocking)
  - Verify user edits during diff review skip patch verification gracefully
