# Requirements: Verification Pipeline

## Introduction

The Verification Pipeline feature implements automatic post-edit checks that run after every file edit operation. Currently, after an edit is applied via `DiffViewProvider.saveChanges()` or `DiffViewProvider.saveDirectly()`, the agent receives a success response and proceeds to claim "Fix applied" without verifying the code was actually written correctly, tests pass, or types check. This is the single largest source of agent unreliability — the agent cannot self-verify because no verification infrastructure exists.

This feature implements a configurable, non-blocking verification pipeline that runs automatically after every edit. The pipeline executes lint, typecheck, and test commands appropriate for the project language, re-reads the modified region to verify the expected code was written, and injects verification results into the agent's context as evidence. If verification fails, the agent receives specific error details and cannot claim "Fix applied" without addressing the failures.

The verification pipeline is implemented as a new module in `src/core/verification/` that integrates with the existing `DiffViewProvider` save flow, the `ToolAvailabilityContext` for tool-aware check skipping, and the context condensation system to ensure verification evidence survives summarization. Configuration follows the existing zod schema pattern in `packages/types/src/global-settings.ts`.

## Glossary

- **Agent**: An AI-powered assistant that processes user requests and executes tasks using available tools and reasoning capabilities.
- **Verification Pipeline**: The automatic post-edit verification system that runs lint, typecheck, test, and patch verification checks after every file edit.
- **Verification Check**: A single verification step (lint, typecheck, test, or patch) that produces a pass/fail result with details.
- **Verification Result**: The aggregated output of all verification checks for a single edit operation, including pass/fail status, error details, and evidence.
- **Patch Verification**: The process of re-reading the modified region of a file after an edit to verify the expected code was actually written.
- **Verification Evidence**: The structured summary of verification results injected into the agent's context for the next API request.
- **Verification Config**: The user-configurable settings that control which checks are enabled, timeouts, and failure handling.
- **DiffViewProvider**: The existing class in `src/integrations/editor/DiffViewProvider.ts` that manages diff views for file edits.
- **saveChanges()**: The existing method in `DiffViewProvider` that saves diff editor changes and returns diagnostics.
- **saveDirectly()**: The existing method in `DiffViewProvider` that saves content directly without a diff view.
- **ToolAvailabilityContext**: The existing class in `src/core/prompts/tools/tool-availability-context.ts` that tracks which tools are disabled.
- **pushToolWriteResult()**: The existing method in `DiffViewProvider` that formats the tool response for file writes.
- **Condense / Condensation**: The process of summarizing conversation history in `src/core/condense/index.ts` to manage context window limits.
- **Verification Evidence Summary**: A condensed representation of verification results that survives context condensation.
- **DEFAULT_WRITE_DELAY_MS**: The existing constant in `packages/types/src/global-settings.ts` controlling the delay after writes for diagnostics.

## Requirements

### Requirement 1: Automatic Post-Edit Verification Trigger

**User Story:** As a user, I want verification to run automatically after every file edit so that I can trust the agent's changes are correct without manual checking.

#### Acceptance Criteria

1. THE Verification_Pipeline SHALL run automatically after every file edit operation, including both `saveChanges()` and `saveDirectly()` paths in `DiffViewProvider`.
2. THE Verification_Pipeline SHALL be triggered after the existing `saveChanges()` / `saveDirectly()` completes and before `pushToolWriteResult()` returns the tool response to the agent.
3. THE Verification_Pipeline SHALL NOT require any agent action — it is entirely automatic and transparent to the agent.
4. WHEN a file is edited, THE Verification_Pipeline SHALL execute all enabled verification checks in parallel (lint, typecheck, test, patch verification).
5. THE Verification_Pipeline SHALL be non-blocking — verification runs in parallel with the agent's next action, but results are available before the next API request is sent.
6. WHEN verification is disabled in configuration, THE system SHALL skip all verification checks with zero overhead — the existing save flow runs unchanged.
7. THE Verification_Pipeline SHALL respect `ToolAvailabilityContext` — if `execute_command` is disabled, lint/typecheck/test checks that require command execution SHALL be skipped.

### Requirement 2: Patch Verification (Re-Read Modified Region)

**User Story:** As a user, I want the system to re-read the modified region after every edit to verify the expected code was actually written, so that the agent cannot claim "Fix applied" without evidence.

#### Acceptance Criteria

1. THE Patch_Verification step SHALL re-read the modified region of the file after every edit to verify the expected code exists.
2. THE Patch_Verification SHALL compare the actual file content against the expected content that was written.
3. WHEN the actual content does not match the expected content, THE Patch_Verification SHALL return a failure result with the diff between expected and actual.
4. THE Patch_Verification SHALL block the "Fix applied" claim — the tool response SHALL include a verification failure message that the agent must address before claiming completion.
5. WHEN the actual content matches the expected content, THE Patch_Verification SHALL return a pass result.
6. THE Patch_Verification SHALL handle edge cases: file was modified by the user during edit (userEdits detected), file was deleted, file encoding changed.
7. WHEN user edits are detected (the user modified the diff before approving), THE Patch_Verification SHALL compare against the user's final content, not the agent's original content.

### Requirement 3: Lint Verification

**User Story:** As a user, I want automatic lint checking after every edit so that syntax errors and style violations are caught immediately.

#### Acceptance Criteria

1. THE Lint_Verification step SHALL run the project-appropriate linter after every edit.
2. THE Lint_Verification SHALL support the following languages and their standard linters:
   - TypeScript/JavaScript: `eslint` (via `npx eslint`)
   - Python: `ruff` (via `ruff check`)
   - Rust: `cargo check`
   - Go: `go vet`
   - Other languages: skip lint verification with a note
3. THE Lint_Verification SHALL detect new lint errors introduced by the edit (not pre-existing errors).
4. WHEN new lint errors are found, THE Lint_Verification SHALL return a failure result with the specific error messages and file locations.
5. WHEN no new lint errors are found, THE Lint_Verification SHALL return a pass result.
6. WHEN `execute_command` is disabled in `ToolAvailabilityContext`, THE Lint_Verification SHALL be skipped.
7. THE Lint_Verification SHALL respect the `verification.lintEnabled` configuration — when `false`, lint verification SHALL be skipped.
8. THE Lint_Verification SHALL have a configurable timeout (default: 30 seconds) — if the linter takes longer, the check SHALL be skipped with a timeout result.

### Requirement 4: Typecheck Verification

**User Story:** As a user, I want automatic type checking after every edit so that type errors are caught immediately.

#### Acceptance Criteria

1. THE Typecheck_Verification step SHALL run the project-appropriate type checker after every edit.
2. THE Typecheck_Verification SHALL support the following languages and their standard type checkers:
   - TypeScript: `tsc --noEmit` (via `npx tsc --noEmit`)
   - Python: `mypy` (via `mypy`)
   - Rust: `cargo check` (shared with lint)
   - Other languages: skip typecheck verification with a note
3. THE Typecheck_Verification SHALL detect new type errors introduced by the edit (not pre-existing errors).
4. WHEN new type errors are found, THE Typecheck_Verification SHALL return a failure result with the specific error messages and file locations.
5. WHEN no new type errors are found, THE Typecheck_Verification SHALL return a pass result.
6. WHEN `execute_command` is disabled in `ToolAvailabilityContext`, THE Typecheck_Verification SHALL be skipped.
7. THE Typecheck_Verification SHALL respect the `verification.typecheckEnabled` configuration — when `false`, typecheck verification SHALL be skipped.
8. THE Typecheck_Verification SHALL have a configurable timeout (default: 30 seconds) — if the type checker takes longer, the check SHALL be skipped with a timeout result.

### Requirement 5: Test Verification

**User Story:** As a user, I want automatic test running after every edit so that regressions are caught immediately.

#### Acceptance Criteria

1. THE Test_Verification step SHALL run the project-appropriate test suite after every edit.
2. THE Test_Verification SHALL support the following test frameworks:
   - JavaScript/TypeScript: `vitest run` (via `npx vitest run`)
   - Python: `pytest` (via `pytest`)
   - Rust: `cargo test`
   - Go: `go test`
   - Other languages: skip test verification with a note
3. THE Test_Verification SHALL run only tests related to the modified file when possible (e.g., `vitest run <test-file>`), falling back to the full suite when the related test cannot be determined.
4. WHEN tests fail, THE Test_Verification SHALL return a failure result with the specific test failure output.
5. WHEN tests pass, THE Test_Verification SHALL return a pass result.
6. WHEN `execute_command` is disabled in `ToolAvailabilityContext`, THE Test_Verification SHALL be skipped.
7. THE Test_Verification SHALL respect the `verification.testEnabled` configuration — when `false`, test verification SHALL be skipped.
8. THE Test_Verification SHALL have a configurable timeout (default: 60 seconds) — if the test suite takes longer, the check SHALL be skipped with a timeout result.
9. WHEN no test framework is detected in the project, THE Test_Verification SHALL be skipped with a note result.

### Requirement 6: Verification Result Injection

**User Story:** As a user, I want verification results injected into the agent's context as evidence so that the agent can see and respond to verification failures.

#### Acceptance Criteria

1. THE Verification_Pipeline SHALL inject verification results into the agent's context as a user message before the next API request.
2. THE verification result message SHALL include:
   - Overall pass/fail status
   - Per-check results (lint, typecheck, test, patch) with pass/fail/skip status
   - Error details for any failed checks (file, line, error message)
   - Duration of each check
3. WHEN all checks pass, THE verification result SHALL be a brief pass summary (e.g., "Verification passed: lint OK, typecheck OK, tests OK").
4. WHEN any check fails, THE verification result SHALL include the full failure details and a clear instruction that the agent must address the failures before claiming completion.
5. THE verification result SHALL be formatted as structured evidence that the agent can parse and act upon.
6. THE verification result SHALL survive context condensation — a verification evidence summary SHALL be included in the condensed conversation history.
7. WHEN verification is disabled, NO verification result SHALL be injected — the agent sees no verification-related messages.

### Requirement 7: Verification Evidence Survival Through Condensation

**User Story:** As a user, I want verification evidence to survive context condensation so that the agent retains knowledge of past verification failures even after the conversation is summarized.

#### Acceptance Criteria

1. THE Condense_System SHALL preserve verification evidence summaries when condensing conversation history.
2. THE verification evidence summary SHALL include:
   - File path that was edited
   - Verification pass/fail status
   - Failed check names and error counts
   - Timestamp of the verification
3. WHEN a verification failure is followed by a successful fix, THE evidence summary SHALL be updated to reflect the resolution.
4. THE verification evidence summary SHALL be included in the condensed history as a user message with a `verification_evidence` tag.
5. THE evidence summary SHALL be compact — no more than 200 tokens per verification event.
6. WHEN the conversation is condensed multiple times, only the most recent verification evidence per file SHALL be retained.

### Requirement 8: Configuration

**User Story:** As a system administrator, I want configurable verification parameters so that I can enable, disable, or tune the verification pipeline.

#### Acceptance Criteria

1. THE Configuration_Manager SHALL add a `verification` section to the global settings schema in `packages/types/src/global-settings.ts` with the following parameters:
   - `enabled`: boolean (default: `true`) — enables or disables the entire verification pipeline
   - `lintEnabled`: boolean (default: `true`) — enables or disables lint verification
   - `typecheckEnabled`: boolean (default: `true`) — enables or disables typecheck verification
   - `testEnabled`: boolean (default: `true`) — enables or disables test verification
   - `patchVerificationEnabled`: boolean (default: `true`) — enables or disables patch verification (re-read)
   - `lintTimeoutMs`: number (default: `30000`, range: `5000` to `120000`) — timeout for lint checks in milliseconds
   - `typecheckTimeoutMs`: number (default: `30000`, range: `5000` to `120000`) — timeout for typecheck checks in milliseconds
   - `testTimeoutMs`: number (default: `60000`, range: `10000` to `300000`) — timeout for test checks in milliseconds
   - `failOnLint`: boolean (default: `true`) — when `true`, lint failures block "Fix applied" claims
   - `failOnTypecheck`: boolean (default: `true`) — when `true`, typecheck failures block "Fix applied" claims
   - `failOnTest`: boolean (default: `true`) — when `true`, test failures block "Fix applied" claims
   - `failOnPatch`: boolean (default: `true`) — when `true`, patch verification failures block "Fix applied" claims
2. WHEN `enabled` is `false`, THE system SHALL skip all verification checks — the existing save flow runs unchanged.
3. WHEN `enabled` is `true` but all sub-checks are disabled, THE system SHALL run only patch verification (re-read) since it does not require command execution.
4. THE Configuration_Manager SHALL validate each parameter independently and accept valid parameters while rejecting only invalid parameters.
5. THE Configuration_Manager SHALL apply runtime configuration updates within 1 second without requiring agent restart.
6. THE verification config SHALL follow the existing `.optional().default()` zod pattern used by `loopDetection` and other config sections.

### Requirement 9: Tool Availability Awareness

**User Story:** As a user, I want the verification pipeline to respect tool availability so that verification steps requiring disabled tools are automatically skipped.

#### Acceptance Criteria

1. THE Verification_Pipeline SHALL query `ToolAvailabilityContext` before running any verification check that requires `execute_command`.
2. WHEN `execute_command` is disabled, THE Verification_Pipeline SHALL skip lint, typecheck, and test checks — only patch verification (re-read) SHALL run.
3. WHEN `read_file` is disabled, THE Patch_Verification step SHALL be skipped.
4. THE Verification_Pipeline SHALL report skipped checks in the verification result with a "skipped" status and reason.
5. THE Verification_Pipeline SHALL NOT attempt to execute commands for tools that are disabled — it SHALL check availability before execution.
6. WHEN all verification-relevant tools are disabled, THE Verification_Pipeline SHALL return a result indicating all checks were skipped due to tool unavailability.

### Requirement 10: Observability

**User Story:** As a system administrator, I want visibility into verification pipeline behavior so that I can monitor effectiveness and debug issues.

#### Acceptance Criteria

1. THE Observability_Logger SHALL log the following events with timestamp and relevant values:
   - Verification started (file path, enabled checks)
   - Verification completed (file path, per-check results, total duration)
   - Verification failed (file path, failed checks, error details)
   - Verification skipped (file path, reason: disabled, tool unavailable, timeout)
   - Patch verification mismatch (file path, expected vs actual diff)
2. THE Observability_Logger SHALL exclude the following from all log entries: file contents, full lint/typecheck/test output (truncated to 500 characters), and tool parameters containing user input.
3. THE Observability_Logger SHALL expose metrics as structured key-value entries containing a timestamp, metric name, and numeric value.
4. THE Observability_Logger SHALL provide metrics including: total verifications per task, verification pass rate, average verification duration per check type, verification failure rate per check type, and verification skip rate.

## Out of Scope

- **Automatic fix application**: The verification pipeline detects failures; the agent applies fixes. The pipeline does not auto-fix verification failures.
- **Pre-edit verification**: This phase focuses on post-edit verification. Pre-edit checks (e.g., checking if a file exists before editing) are out of scope.
- **Verification of non-code files**: The pipeline focuses on code files (TypeScript, Python, Rust, Go, etc.). Verification for non-code files (images, binaries) is out of scope.
- **Integration with CI/CD systems**: The pipeline runs local verification only. Integration with external CI/CD pipelines is out of scope.
- **Verification result UI**: This phase focuses on the backend pipeline and context injection. UI indicators for verification status are a future enhancement.
- **Verification of MCP tool outputs**: The pipeline verifies file edits, not MCP tool call results.
- **Cross-file verification**: The pipeline verifies the specific file that was edited. Cross-file impact analysis (e.g., checking if a renamed function breaks callers) is out of scope for this phase.
- **Replacing existing diagnostics**: The existing `getNewDiagnostics()` system in `src/integrations/diagnostics/` continues to operate. The verification pipeline adds additional checks on top.

## Acceptance Criteria Summary

| Req ID | Description | Key Criteria |
|--------|-------------|--------------|
| REQ-1 | Automatic Post-Edit Verification Trigger | Runs after every edit, non-blocking, respects ToolAvailabilityContext, zero overhead when disabled |
| REQ-2 | Patch Verification (Re-Read) | Re-reads modified region, compares expected vs actual, blocks "Fix applied" on mismatch, handles user edits |
| REQ-3 | Lint Verification | Runs project linter, detects new errors, supports TS/Python/Rust/Go, respects timeout and config |
| REQ-4 | Typecheck Verification | Runs project type checker, detects new errors, supports TS/Python/Rust, respects timeout and config |
| REQ-5 | Test Verification | Runs project test suite, runs related tests when possible, supports TS/Python/Rust/Go, respects timeout and config |
| REQ-6 | Verification Result Injection | Injects results as user message, pass summary or failure details, survives condensation |
| REQ-7 | Evidence Survival Through Condensation | Preserves verification evidence summaries in condensed history, compact format, per-file recency |
| REQ-8 | Configuration | 12 parameters in zod schema with `.optional().default()`, per-check enable/disable, timeouts, fail-on flags |
| REQ-9 | Tool Availability Awareness | Queries ToolAvailabilityContext, skips command-based checks when execute_command disabled, reports skip reason |
| REQ-10 | Observability | Structured logging of verification events, metrics (pass rate, duration, failure rate), no sensitive data in logs |
