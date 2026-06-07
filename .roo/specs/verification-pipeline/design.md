# Design: Verification Pipeline

## Overview

The Verification Pipeline feature implements automatic post-edit verification that runs after every file edit operation. The design follows existing codebase patterns: zod schemas for configuration, the existing `DiffViewProvider` save flow for integration, `ToolAvailabilityContext` for tool-aware check skipping, and the context condensation system for evidence survival.

The pipeline is not a replacement for the existing edit flow — it is a verification layer that activates after `saveChanges()` or `saveDirectly()` completes. When disabled via configuration, the existing save flow runs unchanged with zero overhead.

The pipeline executes four types of checks in parallel after each edit:

| Check | Requires Tool | Description | Timeout |
|-------|--------------|-------------|---------|
| Patch Verification | `read_file` | Re-reads modified region, compares expected vs actual | Immediate |
| Lint | `execute_command` | Runs project linter, detects new errors | 30s |
| Typecheck | `execute_command` | Runs project type checker, detects new errors | 30s |
| Test | `execute_command` | Runs project test suite, detects regressions | 60s |

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              Verification Pipeline                                    │
│                                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                          Verification Orchestrator                            │   │
│  │                                                                              │   │
│  │  ┌───────────────────┐   ┌───────────────────┐   ┌────────────────────────┐ │   │
│  │  │ Patch Verifier    │   │ Command Runner    │   │ Result Aggregator      │ │   │
│  │  │                   │   │                   │   │                        │ │   │
│  │  │ Re-reads file     │   │ Runs lint/tc/test │   │ Collects pass/fail    │ │   │
│  │  │ Compares content  │   │ Manages timeouts  │   │ Generates evidence    │ │   │
│  │  │ Pure function     │   │ Tool-aware skip  │   │ Injects into context  │ │   │
│  │  └───────────────────┘   └───────────────────┘   └────────────────────────┘ │   │
│  │                                                                              │   │
│  │  ┌───────────────────┐   ┌───────────────────┐                              │   │
│  │  │ Language Detector │   │ Config Manager     │                              │   │
│  │  │                   │   │                   │                              │   │
│  │  │ Maps file ext to  │   │ Reads zod config  │                              │   │
│  │  │ lint/tc/test cmds│   │ Per-check enable  │                              │   │
│  │  └───────────────────┘   └───────────────────┘                              │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                          Integration Layer                                    │   │
│  │                                                                              │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────────┐ │   │
│  │  │ DiffViewProvider │  │ Context          │  │ Condense System            │ │   │
│  │  │                  │  │ Management       │  │                            │ │   │
│  │  │ saveChanges()    │  │                  │  │ Verification evidence      │ │   │
│  │  │   -> verify      │  │ injects evidence │  │ summaries preserved in     │ │   │
│  │  │   -> respond     │  │ as user message  │  │ condensed history          │ │   │
│  │  │                  │  │                  │  │                            │ │   │
│  │  │ saveDirectly()   │  │                  │  │                            │ │   │
│  │  │   -> verify      │  │                  │  │                            │ │   │
│  │  │   -> respond     │  │                  │  │                            │ │   │
│  │  └──────────────────┘  └──────────────────┘  └────────────────────────────┘ │   │
│  │                                                                              │   │
│  │  ┌──────────────────┐  ┌──────────────────┐                                  │   │
│  │  │ ToolAvailability │  │ Observability    │                                  │   │
│  │  │ Context          │  │ Logger           │                                  │   │
│  │  │                  │  │                  │                                  │   │
│  │  │ Checks if tools  │  │ Logs events &    │                                  │   │
│  │  │ are available    │  │ metrics          │                                  │   │
│  │  │ before running   │  │                  │                                  │   │
│  │  └──────────────────┘  └──────────────────┘                                  │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                          Configuration                                        │   │
│  │                                                                              │   │
│  │  ┌──────────────────────────────────────────────────────────────────────┐   │   │
│  │  │ globalSettingsSchema.verification                                    │   │   │
│  │  │                                                                      │   │   │
│  │  │ enabled: true (default)                                              │   │   │
│  │  │ lintEnabled: true                                                    │   │   │
│  │  │ typecheckEnabled: true                                               │   │   │
│  │  │ testEnabled: true                                                    │   │   │
│  │  │ patchVerificationEnabled: true                                       │   │   │
│  │  │ lintTimeoutMs: 30000                                                 │   │   │
│  │  │ typecheckTimeoutMs: 30000                                            │   │   │
│  │  │ testTimeoutMs: 60000                                                 │   │   │
│  │  │ failOnLint: true                                                     │   │   │
│  │  │ failOnTypecheck: true                                                │   │   │
│  │  │ failOnTest: true                                                     │   │   │
│  │  │ failOnPatch: true                                                    │   │   │
│  │  └──────────────────────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Descriptions

1. **Verification Orchestrator**: The main entry point that coordinates all verification checks after an edit. Lives in `src/core/verification/VerificationOrchestrator.ts`. Receives the edit context (file path, expected content, actual content) and returns a `VerificationResult`.

2. **Patch Verifier**: Re-reads the modified region of the file and compares actual content against expected content. Pure function — no side effects, no LLM calls. Lives in `src/core/verification/PatchVerifier.ts`.

3. **Command Runner**: Executes lint, typecheck, and test commands with timeout management. Checks `ToolAvailabilityContext` before executing any command. Lives in `src/core/verification/CommandRunner.ts`.

4. **Result Aggregator**: Collects results from all checks, determines overall pass/fail status, and generates the verification evidence message for context injection. Lives in `src/core/verification/ResultAggregator.ts`.

5. **Language Detector**: Maps file extensions to the appropriate lint, typecheck, and test commands. Pure function. Lives in `src/core/verification/LanguageDetector.ts`.

6. **Config Manager**: Reads verification configuration from global settings and provides it to other components. Lives in `src/core/verification/ConfigManager.ts`.

## Integration Points

### 1. `DiffViewProvider.saveChanges()` (`src/integrations/editor/DiffViewProvider.ts`, line 196)

**Invocation Point**: After the file is saved and diagnostics are collected (line 270), before `pushToolWriteResult()` is called.

**Changes**:
- Import `VerificationOrchestrator` from `../../core/verification`
- After the `newProblemsMessage` is computed, call `VerificationOrchestrator.verify()` with the edit context
- Pass the verification result to `pushToolWriteResult()` so it can be included in the tool response
- The verification runs in parallel with the existing diagnostics delay (`writeDelayMs`)

**Flow**:
```
saveChanges() -> write file -> collect diagnostics -> verify (parallel) -> pushToolWriteResult (with verification result)
```

### 2. `DiffViewProvider.saveDirectly()` (`src/integrations/editor/DiffViewProvider.ts`, line 642)

**Invocation Point**: After the file is written and diagnostics are collected (line 712), before the result is returned.

**Changes**:
- Same pattern as `saveChanges()`: call `VerificationOrchestrator.verify()` after diagnostics
- Include verification result in the returned object

### 3. `pushToolWriteResult()` (`src/integrations/editor/DiffViewProvider.ts`, line 313)

**Invocation Point**: When formatting the tool response for the agent.

**Changes**:
- Accept an optional `verificationResult` parameter
- When verification result is present and has failures, append the verification evidence to the `notices` array
- When verification result is present and all pass, append a brief pass summary

### 4. `packages/types/src/global-settings.ts`

**Changes**: Add `verification` section to `globalSettingsSchema` with 12 parameters following the existing `.optional().default()` pattern.

### 5. `packages/types/src/loop-detection.ts`

**Changes**: Add `VerificationResult`, `VerificationCheckResult`, `VerificationCheckStatus`, `VerificationConfig`, and `VerificationEvidenceSummary` types.

### 6. `src/core/condense/index.ts`

**Changes**: Preserve verification evidence summaries when condensing conversation history. Extract `VerificationEvidenceSummary` messages and include them in the condensed output.

### 7. `src/core/prompts/tools/tool-availability-context.ts`

**Changes**: No changes. The existing `isToolAvailable()` method is used by the verification pipeline to check tool availability before running command-based checks.

## Data Structures

### VerificationCheckStatus

```typescript
/**
 * Status of a single verification check.
 */
export type VerificationCheckStatus = "passed" | "failed" | "skipped" | "timeout" | "error"
```

### VerificationCheckResult

```typescript
/**
 * Result of a single verification check (lint, typecheck, test, or patch).
 */
export interface VerificationCheckResult {
  /** Which check produced this result */
  checkType: "lint" | "typecheck" | "test" | "patch"
  /** Status of the check */
  status: VerificationCheckStatus
  /** Human-readable description of the result */
  message: string
  /** Error details (only when status is "failed") */
  errors?: string[]
  /** Files involved (for lint/typecheck/test) */
  filesInvolved?: string[]
  /** Duration in milliseconds */
  durationMs: number
  /** Raw output from the command (truncated to 500 chars) */
  rawOutput?: string
  /** Reason for skipping (only when status is "skipped") */
  skipReason?: string
}
```

### VerificationResult

```typescript
/**
 * Aggregated result of all verification checks for a single edit operation.
 */
export interface VerificationResult {
  /** Overall pass/fail status — true only when all enabled checks passed */
  passed: boolean
  /** Individual check results */
  checks: VerificationCheckResult[]
  /** File path that was edited */
  filePath: string
  /** Total duration of all checks in milliseconds */
  totalDurationMs: number
  /** Timestamp when verification completed */
  timestamp: number
  /** Whether any check failed and the failure should block "Fix applied" claims */
  hasBlockingFailure: boolean
  /** Formatted evidence message for context injection */
  evidenceMessage: string
}
```

### VerificationConfig

```typescript
/**
 * Configuration for the verification pipeline.
 * Follows the existing zod schema pattern in global-settings.ts.
 */
export const verificationSchema = z.object({
  enabled: z.boolean().optional().default(true),
  lintEnabled: z.boolean().optional().default(true),
  typecheckEnabled: z.boolean().optional().default(true),
  testEnabled: z.boolean().optional().default(true),
  patchVerificationEnabled: z.boolean().optional().default(true),
  lintTimeoutMs: z.number().int().min(5000).max(120000).optional().default(30000),
  typecheckTimeoutMs: z.number().int().min(5000).max(120000).optional().default(30000),
  testTimeoutMs: z.number().int().min(10000).max(300000).optional().default(60000),
  failOnLint: z.boolean().optional().default(true),
  failOnTypecheck: z.boolean().optional().default(true),
  failOnTest: z.boolean().optional().default(true),
  failOnPatch: z.boolean().optional().default(true),
})

export type VerificationConfig = z.infer<typeof verificationSchema>
```

### VerificationEvidenceSummary

```typescript
/**
 * Compact summary of verification results for survival through context condensation.
 * Included in condensed conversation history.
 */
export interface VerificationEvidenceSummary {
  /** File path that was edited */
  filePath: string
  /** Overall pass/fail status */
  passed: boolean
  /** Names of failed checks */
  failedChecks: string[]
  /** Error count per failed check */
  errorCounts: Record<string, number>
  /** Timestamp of the verification */
  timestamp: number
  /** Whether the failure was resolved in a subsequent edit */
  resolved: boolean
  /** Timestamp of resolution (if resolved) */
  resolvedAt?: number
}
```

### EditContext

```typescript
/**
 * Context for a file edit operation, passed to the verification pipeline.
 */
export interface EditContext {
  /** Relative path to the edited file */
  relPath: string
  /** Absolute path to the edited file */
  absolutePath: string
  /** Expected content after the edit (what the agent intended to write) */
  expectedContent: string
  /** Actual content after the edit (what was actually written, including user modifications) */
  actualContent: string
  /** Whether this is a new file or a modification */
  isNewFile: boolean
  /** Whether the user made edits during the diff review */
  userEdits: boolean
  /** Pre-edit diagnostics (for detecting new errors) */
  preDiagnostics: [vscode.Uri, vscode.Diagnostic[]][]
  /** Post-edit diagnostics (for detecting new errors) */
  postDiagnostics: [vscode.Uri, vscode.Diagnostic[]][]
  /** Tool availability context for checking if tools are available */
  toolAvailabilityContext: ToolAvailabilityContext
}
```

### LanguageCommands

```typescript
/**
 * Maps file extensions to the appropriate lint, typecheck, and test commands.
 */
export interface LanguageCommands {
  /** Linter command (e.g., "npx eslint") */
  lintCommand?: string
  /** Typechecker command (e.g., "npx tsc --noEmit") */
  typecheckCommand?: string
  /** Test command (e.g., "npx vitest run") */
  testCommand?: string
  /** Test command for a specific file (e.g., "npx vitest run src/foo.test.ts") */
  testFileCommand?: string
  /** Working directory for commands */
  cwd: string
}

/**
 * Language command registry.
 * Maps file extensions to their verification commands.
 */
export const LANGUAGE_COMMANDS: Record<string, LanguageCommands> = {
  ".ts": {
    lintCommand: "npx eslint",
    typecheckCommand: "npx tsc --noEmit",
    testCommand: "npx vitest run",
    testFileCommand: "npx vitest run {file}",
    cwd: ".",
  },
  ".tsx": {
    lintCommand: "npx eslint",
    typecheckCommand: "npx tsc --noEmit",
    testCommand: "npx vitest run",
    testFileCommand: "npx vitest run {file}",
    cwd: ".",
  },
  ".js": {
    lintCommand: "npx eslint",
    typecheckCommand: undefined,
    testCommand: "npx vitest run",
    testFileCommand: "npx vitest run {file}",
    cwd: ".",
  },
  ".jsx": {
    lintCommand: "npx eslint",
    typecheckCommand: undefined,
    testCommand: "npx vitest run",
    testFileCommand: "npx vitest run {file}",
    cwd: ".",
  },
  ".py": {
    lintCommand: "ruff check",
    typecheckCommand: "mypy",
    testCommand: "pytest",
    testFileCommand: "pytest {file}",
    cwd: ".",
  },
  ".rs": {
    lintCommand: "cargo check",
    typecheckCommand: "cargo check",
    testCommand: "cargo test",
    testFileCommand: "cargo test",
    cwd: ".",
  },
  ".go": {
    lintCommand: "go vet",
    typecheckCommand: "go vet",
    testCommand: "go test ./...",
    testFileCommand: "go test {package}",
    cwd: ".",
  },
}
```

## Algorithms

### 1. Verification Orchestrator (Core Algorithm)

```typescript
/**
 * Orchestrates all verification checks after a file edit.
 * Runs checks in parallel and aggregates results.
 *
 * Non-blocking: returns a Promise that resolves before the next API request.
 *
 * @param context - Edit context with file path, content, and tool availability
 * @param config - Verification configuration
 * @returns Aggregated verification result with evidence message
 */
async function verifyEdit(
  context: EditContext,
  config: VerificationConfig,
): Promise<VerificationResult> {
  if (!config.enabled) {
    return createEmptyResult(context, config)
  }

  const checks: Promise<VerificationCheckResult>[] = []

  // Patch verification (always runs if enabled, only needs read_file)
  if (config.patchVerificationEnabled) {
    checks.push(verifyPatch(context, config))
  }

  // Lint verification (needs execute_command)
  if (config.lintEnabled && context.toolAvailabilityContext.isToolAvailable("execute_command")) {
    checks.push(verifyLint(context, config))
  } else if (config.lintEnabled) {
    checks.push(createSkippedResult("lint", "execute_command is disabled"))
  }

  // Typecheck verification (needs execute_command)
  if (config.typecheckEnabled && context.toolAvailabilityContext.isToolAvailable("execute_command")) {
    checks.push(verifyTypecheck(context, config))
  } else if (config.typecheckEnabled) {
    checks.push(createSkippedResult("typecheck", "execute_command is disabled"))
  }

  // Test verification (needs execute_command)
  if (config.testEnabled && context.toolAvailabilityContext.isToolAvailable("execute_command")) {
    checks.push(verifyTest(context, config))
  } else if (config.testEnabled) {
    checks.push(createSkippedResult("test", "execute_command is disabled"))
  }

  // Run all checks in parallel
  const results = await Promise.all(checks)

  // Aggregate results
  return aggregateResults(results, context, config)
}
```

### 2. Patch Verification Algorithm

```typescript
/**
 * Verifies that the expected content was actually written to the file.
 * Re-reads the file and compares against expected content.
 *
 * @param context - Edit context with expected and actual content
 * @param config - Verification configuration
 * @returns Patch verification result
 */
async function verifyPatch(
  context: EditContext,
  config: VerificationConfig,
): Promise<VerificationCheckResult> {
  const startTime = Date.now()

  try {
    // If user made edits during diff review, compare against user's final content
    if (context.userEdits) {
      return {
        checkType: "patch",
        status: "passed",
        message: "User edits detected — patch verification skipped (user approved changes)",
        durationMs: Date.now() - startTime,
      }
    }

    // Read the actual file content from disk
    const actualDiskContent = await fs.readFile(context.absolutePath, "utf-8")

    // Normalize EOL characters for comparison
    const normalizedExpected = normalizeEOL(context.expectedContent)
    const normalizedActual = normalizeEOL(actualDiskContent)

    if (normalizedExpected === normalizedActual) {
      return {
        checkType: "patch",
        status: "passed",
        message: "File content matches expected content",
        durationMs: Date.now() - startTime,
      }
    }

    // Content mismatch — generate diff for evidence
    const diffSummary = generateDiffSummary(normalizedExpected, normalizedActual)
    return {
      checkType: "patch",
      status: "failed",
      message: "File content does not match expected content",
      errors: [diffSummary],
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    return {
      checkType: "patch",
      status: "error",
      message: `Patch verification error: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - startTime,
    }
  }
}
```

### 3. Lint Verification Algorithm

```typescript
/**
 * Runs the project-appropriate linter and detects new errors introduced by the edit.
 * Compares pre-edit and post-edit diagnostics to identify new errors.
 *
 * @param context - Edit context with pre/post diagnostics
 * @param config - Verification configuration
 * @returns Lint verification result
 */
async function verifyLint(
  context: EditContext,
  config: VerificationConfig,
): Promise<VerificationCheckResult> {
  const startTime = Date.now()

  try {
    const commands = detectLanguageCommands(context.absolutePath)
    if (!commands.lintCommand) {
      return {
        checkType: "lint",
        status: "skipped",
        message: `No linter configured for file type: ${extname(context.absolutePath)}`,
        durationMs: Date.now() - startTime,
        skipReason: "unsupported_language",
      }
    }

    // Run linter with timeout
    const result = await runCommand(commands.lintCommand, {
      cwd: commands.cwd,
      timeoutMs: config.lintTimeoutMs,
    })

    if (result.timedOut) {
      return {
        checkType: "lint",
        status: "timeout",
        message: `Lint check timed out after ${config.lintTimeoutMs}ms`,
        durationMs: Date.now() - startTime,
      }
    }

    // Parse lint output for errors
    const lintErrors = parseLintOutput(result.stdout, result.stderr, context.absolutePath)

    // Filter to only new errors (not in pre-edit diagnostics)
    const newErrors = filterNewErrors(lintErrors, context.preDiagnostics)

    if (newErrors.length > 0) {
      return {
        checkType: "lint",
        status: "failed",
        message: `Lint found ${newErrors.length} new error(s)`,
        errors: newErrors.map((e) => `${e.line}: ${e.message}`),
        filesInvolved: [context.relPath],
        durationMs: Date.now() - startTime,
        rawOutput: truncate(result.stdout, 500),
      }
    }

    return {
      checkType: "lint",
      status: "passed",
      message: "No new lint errors",
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    return {
      checkType: "lint",
      status: "error",
      message: `Lint verification error: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - startTime,
    }
  }
}
```

### 4. Typecheck Verification Algorithm

```typescript
/**
 * Runs the project-appropriate type checker and detects new type errors.
 *
 * @param context - Edit context with file path and diagnostics
 * @param config - Verification configuration
 * @returns Typecheck verification result
 */
async function verifyTypecheck(
  context: EditContext,
  config: VerificationConfig,
): Promise<VerificationCheckResult> {
  const startTime = Date.now()

  try {
    const commands = detectLanguageCommands(context.absolutePath)
    if (!commands.typecheckCommand) {
      return {
        checkType: "typecheck",
        status: "skipped",
        message: `No type checker configured for file type: ${extname(context.absolutePath)}`,
        durationMs: Date.now() - startTime,
        skipReason: "unsupported_language",
      }
    }

    // Run type checker with timeout
    const result = await runCommand(commands.typecheckCommand, {
      cwd: commands.cwd,
      timeoutMs: config.typecheckTimeoutMs,
    })

    if (result.timedOut) {
      return {
        checkType: "typecheck",
        status: "timeout",
        message: `Typecheck timed out after ${config.typecheckTimeoutMs}ms`,
        durationMs: Date.now() - startTime,
      }
    }

    // Parse typecheck output for errors
    const typeErrors = parseTypecheckOutput(result.stdout, result.stderr, context.absolutePath)

    // Filter to only new errors
    const newErrors = filterNewErrors(typeErrors, context.preDiagnostics)

    if (newErrors.length > 0) {
      return {
        checkType: "typecheck",
        status: "failed",
        message: `Type checker found ${newErrors.length} new error(s)`,
        errors: newErrors.map((e) => `${e.line}: ${e.message}`),
        filesInvolved: [context.relPath],
        durationMs: Date.now() - startTime,
        rawOutput: truncate(result.stdout, 500),
      }
    }

    return {
      checkType: "typecheck",
      status: "passed",
      message: "No new type errors",
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    return {
      checkType: "typecheck",
      status: "error",
      message: `Typecheck verification error: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - startTime,
    }
  }
}
```

### 5. Test Verification Algorithm

```typescript
/**
 * Runs the project-appropriate test suite and detects regressions.
 * Attempts to run tests related to the modified file first.
 *
 * @param context - Edit context with file path
 * @param config - Verification configuration
 * @returns Test verification result
 */
async function verifyTest(
  context: EditContext,
  config: VerificationConfig,
): Promise<VerificationCheckResult> {
  const startTime = Date.now()

  try {
    const commands = detectLanguageCommands(context.absolutePath)
    if (!commands.testCommand) {
      return {
        checkType: "test",
        status: "skipped",
        message: `No test framework configured for file type: ${extname(context.absolutePath)}`,
        durationMs: Date.now() - startTime,
        skipReason: "unsupported_language",
      }
    }

    // Try to run tests related to the modified file first
    let testCommand = commands.testCommand
    if (commands.testFileCommand) {
      const relatedTestFile = findRelatedTestFile(context.absolutePath)
      if (relatedTestFile) {
        testCommand = commands.testFileCommand.replace("{file}", relatedTestFile)
      }
    }

    // Run tests with timeout
    const result = await runCommand(testCommand, {
      cwd: commands.cwd,
      timeoutMs: config.testTimeoutMs,
    })

    if (result.timedOut) {
      return {
        checkType: "test",
        status: "timeout",
        message: `Test run timed out after ${config.testTimeoutMs}ms`,
        durationMs: Date.now() - startTime,
      }
    }

    // Check test results
    if (result.exitCode !== 0) {
      return {
        checkType: "test",
        status: "failed",
        message: `Tests failed with exit code ${result.exitCode}`,
        errors: parseTestFailures(result.stdout, result.stderr),
        filesInvolved: [context.relPath],
        durationMs: Date.now() - startTime,
        rawOutput: truncate(result.stdout, 500),
      }
    }

    return {
      checkType: "test",
      status: "passed",
      message: "Tests passed",
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    return {
      checkType: "test",
      status: "error",
      message: `Test verification error: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - startTime,
    }
  }
}
```

### 6. Result Aggregation Algorithm

```typescript
/**
 * Aggregates individual check results into a single verification result.
 * Determines overall pass/fail and generates the evidence message.
 *
 * @param checks - Individual check results
 * @param context - Edit context
 * @param config - Verification configuration
 * @returns Aggregated verification result
 */
function aggregateResults(
  checks: VerificationCheckResult[],
  context: EditContext,
  config: VerificationConfig,
): VerificationResult {
  const totalDurationMs = checks.reduce((sum, c) => sum + c.durationMs, 0)

  // Determine if any check has a blocking failure
  const hasBlockingFailure = checks.some((check) => {
    if (check.status !== "failed") return false
    switch (check.checkType) {
      case "lint":
        return config.failOnLint
      case "typecheck":
        return config.failOnTypecheck
      case "test":
        return config.failOnTest
      case "patch":
        return config.failOnPatch
      default:
        return false
    }
  })

  const allPassed = checks.every((c) => c.status === "passed" || c.status === "skipped")

  // Generate evidence message
  const evidenceMessage = generateEvidenceMessage(checks, context, allPassed, hasBlockingFailure)

  return {
    passed: allPassed,
    checks,
    filePath: context.relPath,
    totalDurationMs,
    timestamp: Date.now(),
    hasBlockingFailure,
    evidenceMessage,
  }
}

/**
 * Generates the verification evidence message injected into the agent's context.
 */
function generateEvidenceMessage(
  checks: VerificationCheckResult[],
  context: EditContext,
  allPassed: boolean,
  hasBlockingFailure: boolean,
): string {
  const lines: string[] = []

  if (allPassed) {
    // Brief pass summary
    const passedChecks = checks.filter((c) => c.status === "passed").map((c) => c.checkType)
    const skippedChecks = checks.filter((c) => c.status === "skipped").map((c) => c.checkType)
    lines.push(`Verification passed for ${context.relPath}.`)
    if (passedChecks.length > 0) {
      lines.push(`Passed: ${passedChecks.join(", ")}.`)
    }
    if (skippedChecks.length > 0) {
      lines.push(`Skipped: ${skippedChecks.join(", ")}.`)
    }
  } else {
    // Detailed failure report
    lines.push(`Verification FAILED for ${context.relPath}.`)
    lines.push("")

    for (const check of checks) {
      if (check.status === "failed") {
        lines.push(`[${check.checkType.toUpperCase()}] ${check.message}`)
        if (check.errors) {
          for (const error of check.errors.slice(0, 10)) {
            lines.push(`  - ${error}`)
          }
          if (check.errors.length > 10) {
            lines.push(`  ... and ${check.errors.length - 10} more`)
          }
        }
        lines.push("")
      }
    }

    if (hasBlockingFailure) {
      lines.push("You MUST address these verification failures before claiming the fix is complete.")
      lines.push("Use the error details above to diagnose and fix the issue, then re-run the edit.")
    }
  }

  return lines.join("\n")
}
```

### 7. Verification Evidence Condensation Algorithm

```typescript
/**
 * Extracts verification evidence summaries from conversation messages.
 * Called by the condense system to preserve verification history.
 *
 * @param messages - Conversation messages to extract from
 * @returns Array of verification evidence summaries
 */
function extractVerificationEvidence(messages: ApiMessage[]): VerificationEvidenceSummary[] {
  const summaries: VerificationEvidenceSummary[] = []

  for (const message of messages) {
    if (message.role !== "user") continue
    if (!message.content || typeof message.content !== "string") continue

    // Look for verification evidence markers in the message
    if (message.content.includes("[VERIFICATION_EVIDENCE]")) {
      const summary = parseVerificationEvidence(message.content)
      if (summary) {
        summaries.push(summary)
      }
    }
  }

  // Deduplicate by file path — keep only the most recent per file
  const byFile = new Map<string, VerificationEvidenceSummary>()
  for (const summary of summaries) {
    byFile.set(summary.filePath, summary)
  }

  return Array.from(byFile.values())
}

/**
 * Generates a compact verification evidence summary for condensed history.
 * Max 200 tokens per summary.
 */
function generateCondensedEvidence(summary: VerificationEvidenceSummary): string {
  const status = summary.passed ? "PASSED" : summary.resolved ? "RESOLVED" : "FAILED"
  const failedChecks = summary.failedChecks.join(", ")
  const errorCount = Object.values(summary.errorCounts).reduce((a, b) => a + b, 0)

  return `[VERIFICATION_EVIDENCE] ${summary.filePath}: ${status}. Failed: ${failedChecks} (${errorCount} errors). ${summary.resolved ? "Resolved." : "UNRESOLVED - must fix before completing."}`
}
```

## Performance Constraints

- **Patch verification**: File read + string comparison. Must complete in under 50ms.
- **Lint/typecheck/test**: Command execution with timeout. Default timeouts: 30s/30s/60s. Must not block the agent's next action — runs in parallel.
- **Result aggregation**: Synchronous, in-memory operation. Must complete in under 5ms.
- **Evidence message generation**: String concatenation. Must complete in under 5ms.
- **No additional API calls**: The verification pipeline does not make any LLM or network calls. All operations are local file reads and command executions.
- **Memory**: VerificationResult is small (< 1KB serialized). Evidence summaries are capped at 200 tokens each.
- **Backward compatibility**: When `enabled` is `false`, the pipeline is not instantiated. Zero overhead. The existing save flow runs unchanged.
- **Parallel execution**: All enabled checks run concurrently via `Promise.all()`. Total wall-clock time equals the slowest check, not the sum.
- **Condensation**: Evidence extraction is O(n) over messages but only processes user messages with the `[VERIFICATION_EVIDENCE]` marker, making it effectively O(1) per condensation.

## File Change Summary

| File | Change Type | Description |
|------|------------|-------------|
| `packages/types/src/global-settings.ts` | Modify | Add `verification` section to `globalSettingsSchema` with 12 parameters |
| `packages/types/src/loop-detection.ts` | Modify | Add `VerificationResult`, `VerificationCheckResult`, `VerificationCheckStatus`, `VerificationConfig`, `VerificationEvidenceSummary`, `EditContext`, `LanguageCommands` types |
| `src/core/verification/VerificationOrchestrator.ts` | Create | Core orchestrator: `verifyEdit()`, `createEmptyResult()`, `createSkippedResult()` |
| `src/core/verification/PatchVerifier.ts` | Create | Patch verification: `verifyPatch()`, `normalizeEOL()`, `generateDiffSummary()` |
| `src/core/verification/CommandRunner.ts` | Create | Command execution: `runCommand()`, `parseLintOutput()`, `parseTypecheckOutput()`, `parseTestFailures()`, `filterNewErrors()` |
| `src/core/verification/ResultAggregator.ts` | Create | Result aggregation: `aggregateResults()`, `generateEvidenceMessage()` |
| `src/core/verification/LanguageDetector.ts` | Create | Language detection: `detectLanguageCommands()`, `findRelatedTestFile()`, `LANGUAGE_COMMANDS` registry |
| `src/core/verification/ConfigManager.ts` | Create | Config management: `getVerificationConfig()`, `isCheckEnabled()` |
| `src/core/verification/CondenseHelper.ts` | Create | Condense integration: `extractVerificationEvidence()`, `generateCondensedEvidence()` |
| `src/core/verification/index.ts` | Create | Barrel export for all public types and functions |
| `src/integrations/editor/DiffViewProvider.ts` | Modify | Integrate verification into `saveChanges()`, `saveDirectly()`, `pushToolWriteResult()` |
| `src/core/condense/index.ts` | Modify | Preserve verification evidence summaries during condensation |
| `src/core/verification/__tests__/VerificationOrchestrator.spec.ts` | Create | Unit tests for orchestrator logic |
| `src/core/verification/__tests__/PatchVerifier.spec.ts` | Create | Unit tests for patch verification |
| `src/core/verification/__tests__/CommandRunner.spec.ts` | Create | Unit tests for command execution and parsing |
| `src/core/verification/__tests__/ResultAggregator.spec.ts` | Create | Unit tests for result aggregation and evidence generation |
| `src/core/verification/__tests__/LanguageDetector.spec.ts` | Create | Unit tests for language detection |
| `src/core/verification/__tests__/CondenseHelper.spec.ts` | Create | Unit tests for condensation evidence extraction |
| `src/integrations/editor/__tests__/DiffViewProvider-verification.spec.ts` | Create | Integration tests for verification in save flow |
