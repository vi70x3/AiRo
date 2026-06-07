# Design: Contradiction Detection

## Overview

The Contradiction Detection feature implements a claim-evidence consistency checker that validates the agent's textual claims against the evidence registry from Phase 1. The design follows existing codebase patterns: zod schemas for configuration, pure functions for detection logic, and the existing message injection mechanism for warning delivery.

The core insight is that the agent's `say()` method in [Task.ts](src/core/task/Task.ts#1701) accepts any text without validation. The contradiction engine intercepts this text after `presentAssistantMessage()` processes tool calls, extracts claims, checks them against evidence, and injects warnings when contradictions are found.

The engine is organized as a pipeline with four stages:

```
Agent Message -> Claim Extraction -> Evidence Lookup -> Contradiction Check -> Warning Injection
```

Each stage is a pure function (except Warning Injection, which modifies the message pipeline). The pipeline runs after `presentAssistantMessage()` processes tool calls but before the agent's next API request.

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              Contradiction Detection Engine                              │
│                                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              Claim Extractor                                      │   │
│  │                                                                                  │   │
│  │  ┌─────────────────────┐   ┌─────────────────────┐   ┌────────────────────────┐ │   │
│  │  │ say() Text Parser   │   │ completion_result   │   │ attempt_completion     │ │   │
│  │  │                     │   │ Parser              │   │ Parser                 │ │   │
│  │  │ Scans for keywords  │   │                     │   │                        │ │   │
│  │  │ Extracts claims     │   │ Extracts result     │   │ Extracts result param  │ │   │
│  │  │ Pure function       │   │ text as claim       │   │ as claim               │ │   │
│  │  └─────────────────────┘   └─────────────────────┘   └────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                                │
│                                         v                                                │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              Evidence Lookup                                      │   │
│  │                                                                                  │   │
│  │  ┌─────────────────────┐   ┌─────────────────────┐   ┌────────────────────────┐ │   │
│  │  │ Claim Type Mapper   │   │ Evidence Registry   │   │ Time Window Filter     │ │   │
│  │  │                     │   │ Query               │   │                        │ │   │
│  │  │ fix_applied ->      │   │                     │   │ Filters to current     │ │   │
│  │  │   file_edit         │   │ Queries Phase 1     │   │ task's time window     │ │   │
│  │  │ tests_passed ->     │   │ evidence registry   │   │                        │ │   │
│  │  │   test (exit 0)     │   │ for matching        │   │ taskStart -> now       │ │   │
│  │  │ committed ->        │   │ evidence entries    │   │                        │ │   │
│  │  │   git_commit        │   │                     │   │                        │ │   │
│  │  └─────────────────────┘   └─────────────────────┘   └────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                                │
│                                         v                                                │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              Contradiction Checker                               │   │
│  │                                                                                  │   │
│  │  ┌─────────────────────┐   ┌─────────────────────┐   ┌────────────────────────┐ │   │
│  │  │ Unsupported Check   │   │ Contradicted Check  │   │ Result Builder         │ │   │
│  │  │                     │   │                     │   │                        │ │   │
│  │  │ No evidence of      │   │ Evidence exists but │   │ Builds                 │ │   │
│  │  │ required type       │   │ contradicts claim  │   │ ContradictionResult   │ │   │
│  │  │ -> unsupported      │   │ -> contradicted     │   │ with all entries      │ │   │
│  │  └─────────────────────┘   └─────────────────────┘   └────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                                │
│                                         v                                                │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              Warning Injector                                     │   │
│  │                                                                                  │   │
│  │  ┌─────────────────────┐   ┌─────────────────────┐   ┌────────────────────────┐ │   │
│  │  │ Warning Formatter   │   │ Message Injector    │   │ Resolution Tracker     │ │   │
│  │  │                     │   │                     │   │                        │ │   │
│  │  │ Formats             │   │ Injects warning     │   │ Tracks which           │ │   │
│  │  │ <contradiction_     │   │ as user message     │   │ contradictions are     │ │   │
│  │  │ warning> blocks     │   │ before next API     │   │ resolved               │ │   │
│  │  │                     │   │ request             │   │                        │ │   │
│  │  └─────────────────────┘   └─────────────────────┘   └────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              Metrics Tracker                                      │   │
│  │                                                                                  │   │
│  │  ┌─────────────────────┐   ┌─────────────────────┐   ┌────────────────────────┐ │   │
│  │  │ Per-Task Stats      │   │ Contradiction Rate  │   │ Observability Logger   │ │   │
│  │  │                     │   │                     │   │                        │ │   │
│  │  │ totalClaims         │   │ (unsupported +      │   │ Logs events &          │ │   │
│  │  │ supportedClaims     │   │  contradicted) /    │   │ metrics to             │ │   │
│  │  │ unsupportedClaims   │   │  totalClaims        │   │ console.debug          │ │   │
│  │  │ contradictedClaims  │   │                     │   │                        │ │   │
│  │  └─────────────────────┘   └─────────────────────┘   └────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                         │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│  │                              Configuration                                        │   │
│  │                                                                                  │   │
│  │  ┌──────────────────────────────────────────────────────────────────────────┐   │   │
│  │  │ globalSettingsSchema.contradictionDetection                              │   │   │
│  │  │                                                                          │   │   │
│  │  │ enabled: true (default)                                                  │   │   │
│  │  │ detectFixApplied: true                                                   │   │   │
│  │  │ detectTestsPassed: true                                                 │   │   │
│  │  │ detectCommitted: true                                                   │   │   │
│  │  │ detectPushed: true                                                      │   │   │
│  │  │ detectDiagnosed: true                                                   │   │   │
│  │  │ detectConfigured: true                                                  │   │   │
│  │  │ warningCooldownMs: 5000                                                 │   │   │
│  │  └──────────────────────────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Descriptions

1. **Claim Extractor**: Parses agent messages to identify verifiable claims. Operates on `say()` text, `completion_result` messages, and `attempt_completion` tool results. Uses keyword matching to classify claims into 6 types. Pure function living in `src/core/contradiction-detection/ClaimExtractor.ts`.

2. **Evidence Lookup**: Maps claim types to required evidence types and queries the Phase 1 evidence registry. Filters evidence to the current task's time window. Returns the most recent matching evidence. Pure function living in `src/core/contradiction-detection/EvidenceLookup.ts`.

3. **Contradiction Checker**: Compares claims against evidence and flags each as supported, unsupported, or contradicted. Produces a `ContradictionResult` with all contradiction entries. Pure function living in `src/core/contradiction-detection/ContradictionChecker.ts`.

4. **Warning Injector**: Formats contradiction results as `<contradiction_warning>` blocks and injects them into the agent's context as user messages. Non-blocking — the agent can still proceed. Lives in `src/core/contradiction-detection/WarningInjector.ts`.

5. **Resolution Tracker**: Tracks which contradictions have been resolved by the agent. Automatically resolves contradictions when new evidence is added to the registry. Persists through context condensation. Lives in `src/core/contradiction-detection/ResolutionTracker.ts`.

6. **Metrics Tracker**: Maintains per-task contradiction statistics including contradiction rate. Resets at task start. Accessible for Phase 9 observability. Lives in `src/core/contradiction-detection/MetricsTracker.ts`.

7. **Config Manager**: Reads contradiction detection configuration from global settings. Provides per-claim-type enable/disable flags. Lives in `src/core/contradiction-detection/ConfigManager.ts`.

## Integration Points

### 1. `presentAssistantMessage()` ([presentAssistantMessage.ts](src/core/assistant-message/presentAssistantMessage.ts#60))

**Invocation Point**: After all tool calls in the current message have been processed and `pushToolResult()` has been called for each, but before `userMessageContentReady` is set to `true`.

**Changes**:
- Import `ContradictionDetectionEngine` from `../../core/contradiction-detection`
- After the tool processing loop completes, call `ContradictionDetectionEngine.detect()` with:
  - Claims extracted from the current message's `say()` calls and `attempt_completion` result
  - Evidence registry from the current task
  - Contradiction detection config
- If contradictions are detected, inject the `<contradiction_warning>` block into `userMessageContent`
- Update contradiction metrics

**Flow**:
```
presentAssistantMessage() -> process tool calls -> extract claims -> check evidence -> inject warnings (if any) -> set userMessageContentReady
```

### 2. `Task.say()` ([Task.ts](src/core/task/Task.ts#1701))

**Invocation Point**: When the agent outputs text via `say("text", ...)` or `say("completion_result", ...)`.

**Changes**:
- No changes to the `say()` method itself — it continues to accept any text
- The claim extraction happens after `presentAssistantMessage()` processes the message, not inside `say()`
- The `say()` method stores messages in `clineMessages` which are then scanned by the claim extractor

### 3. `AttemptCompletionTool.execute()` ([AttemptCompletionTool.ts](src/core/tools/AttemptCompletionTool.ts#38))

**Invocation Point**: When the agent calls `attempt_completion` with a `result` parameter.

**Changes**:
- No changes to `AttemptCompletionTool` itself
- The `result` parameter text is captured as a claim source by the claim extractor during the post-processing pipeline

### 4. Evidence Registry (Phase 1 — [agent-state-management](../agent-state-management/))

**Invocation Point**: The contradiction engine reads from the evidence registry; it does not modify it.

**Changes**:
- No changes to the evidence registry
- The contradiction engine consumes evidence entries via the `EvidenceLookup` module

### 5. `packages/types/src/global-settings.ts`

**Changes**: Add `contradictionDetection` section to `globalSettingsSchema` with 8 parameters following the existing `.optional().default()` pattern.

### 6. `packages/types/src/loop-detection.ts`

**Changes**: Add `ContradictionResult`, `ContradictionEntry`, `ContradictionStatus`, `ExtractedClaim`, `ClaimType`, `ContradictionConfig`, `ContradictionMetrics`, `ContradictionDetectionConfig`, and `ResolutionRecord` types.

### 7. `src/core/condense/index.ts`

**Changes**: Preserve unresolved contradiction summaries when condensing conversation history. Inject `[CONTRADICTION]` markers into condensed output.

## Data Structures

### ClaimType

```typescript
/**
 * Types of claims the agent can make, each mapping to a required evidence type.
 */
export type ClaimType =
  | "fix_applied"    // Requires file_edit evidence
  | "tests_passed"   // Requires test evidence with exit code 0
  | "committed"      // Requires git_commit evidence
  | "pushed"         // Requires git_push evidence
  | "diagnosed"      // Requires file_read evidence
  | "configured"     // Requires file_edit evidence
```

### ExtractedClaim

```typescript
/**
 * A claim extracted from an agent message.
 */
export interface ExtractedClaim {
  /** The type of claim identified */
  claimType: ClaimType
  /** The original text containing the claim */
  claimText: string
  /** Where the claim was found */
  source: "say_text" | "say_completion_result" | "attempt_completion"
  /** Timestamp when the claim was made */
  timestamp: number
  /** Identifier of the source message in clineMessages */
  messageId: string
  /** The keyword that triggered claim extraction */
  matchedKeyword: string
}
```

### ContradictionStatus

```typescript
/**
 * Status of a claim after evidence checking.
 */
export type ContradictionStatus = "supported" | "unsupported" | "contradicted"
```

### ContradictionEntry

```typescript
/**
 * A single contradiction detected for a claim.
 */
export interface ContradictionEntry {
  /** The original claim that has a contradiction */
  claim: ExtractedClaim
  /** Whether the claim is unsupported or contradicted */
  status: "unsupported" | "contradicted"
  /** The evidence type required by this claim */
  requiredEvidenceType: string
  /** Evidence entries found (empty for unsupported, populated for contradicted) */
  matchingEvidence: EvidenceEntry[]
  /** Human-readable description of the contradiction */
  message: string
}
```

### ContradictionResult

```typescript
/**
 * Result of running contradiction detection on a set of claims.
 */
export interface ContradictionResult {
  /** True when any claim is unsupported or contradicted */
  hasContradictions: boolean
  /** List of contradictions found */
  contradictions: ContradictionEntry[]
  /** Total number of claims checked */
  totalClaims: number
  /** Number of claims with supporting evidence */
  supportedCount: number
  /** Number of claims without any evidence */
  unsupportedCount: number
  /** Number of claims with contradicting evidence */
  contradictedCount: number
  /** Formatted warning message (empty when no contradictions) */
  warningMessage: string
  /** Duration of detection in milliseconds */
  detectionDurationMs: number
}
```

### ContradictionConfig

```typescript
/**
 * Configuration for contradiction detection.
 * Follows the existing zod schema pattern in global-settings.ts.
 */
export const contradictionDetectionSchema = z.object({
  enabled: z.boolean().optional().default(true),
  detectFixApplied: z.boolean().optional().default(true),
  detectTestsPassed: z.boolean().optional().default(true),
  detectCommitted: z.boolean().optional().default(true),
  detectPushed: z.boolean().optional().default(true),
  detectDiagnosed: z.boolean().optional().default(true),
  detectConfigured: z.boolean().optional().default(true),
  warningCooldownMs: z.number().int().min(1000).max(60000).optional().default(5000),
})

export type ContradictionConfig = z.infer<typeof contradictionDetectionSchema>
```

### ContradictionMetrics

```typescript
/**
 * Per-task contradiction statistics.
 */
export interface ContradictionMetrics {
  /** Task identifier */
  taskId: string
  /** Total number of claims extracted during the task */
  totalClaims: number
  /** Number of claims with supporting evidence */
  supportedClaims: number
  /** Number of claims without evidence */
  unsupportedClaims: number
  /** Number of claims contradicted by evidence */
  contradictedClaims: number
  /** Ratio of (unsupported + contradicted) / totalClaims */
  contradictionRate: number
  /** Timestamp of last update */
  lastUpdated: number
}
```

### ResolutionRecord

```typescript
/**
 * Tracks the resolution status of a detected contradiction.
 */
export interface ResolutionRecord {
  /** Unique identifier for this resolution record */
  id: string
  /** The original contradiction entry */
  contradiction: ContradictionEntry
  /** Timestamp when the contradiction was detected */
  detectedAt: number
  /** Whether the contradiction has been resolved */
  resolved: boolean
  /** Timestamp when resolved (if resolved) */
  resolvedAt?: number
  /** ID of the evidence that resolved the contradiction (if resolved) */
  resolutionEvidenceId?: string
}
```

### ClaimTypeEvidenceMapping

```typescript
/**
 * Maps each claim type to its required evidence type and validation criteria.
 */
export const CLAIM_TYPE_EVIDENCE_MAP: Record<ClaimType, {
  evidenceType: string
  description: string
  validate?: (evidence: EvidenceEntry) => boolean
}> = {
  fix_applied: {
    evidenceType: "file_edit",
    description: "Evidence of a file edit operation",
  },
  tests_passed: {
    evidenceType: "test",
    description: "Evidence of a successful test run (exit code 0)",
    validate: (evidence) => evidence.payload?.exitCode === 0,
  },
  committed: {
    evidenceType: "git_commit",
    description: "Evidence of a git commit",
  },
  pushed: {
    evidenceType: "git_push",
    description: "Evidence of a git push",
  },
  diagnosed: {
    evidenceType: "file_read",
    description: "Evidence of file reads during diagnosis",
  },
  configured: {
    evidenceType: "file_edit",
    description: "Evidence of a configuration file edit",
  },
}
```

### EvidenceEntry (from Phase 1)

```typescript
/**
 * Evidence entry from the Phase 1 evidence registry.
 * Defined here for reference — the canonical type is in the agent-state-management spec.
 */
export interface EvidenceEntry {
  id: string
  timestamp: number
  type: "file_read" | "file_edit" | "command" | "test" | "git_commit" | "git_push"
  payload: Record<string, unknown>
}
```

## Algorithms

### 1. Contradiction Detection Pipeline (Core Algorithm)

```typescript
/**
 * Main entry point for contradiction detection.
 * Runs after presentAssistantMessage() processes tool calls.
 *
 * Pipeline: Extract Claims -> Lookup Evidence -> Check Contradictions -> Format Warning
 *
 * @param claims - Claims extracted from the current assistant message
 * @param evidenceRegistry - Phase 1 evidence registry for the current task
 * @param config - Contradiction detection configuration
 * @param taskStartTime - Timestamp when the current task started
 * @returns ContradictionResult with warning message (if any)
 */
function detectContradictions(
  claims: ExtractedClaim[],
  evidenceRegistry: EvidenceEntry[],
  config: ContradictionConfig,
  taskStartTime: number,
): ContradictionResult {
  const startTime = Date.now()

  if (!config.enabled || claims.length === 0) {
    return createEmptyResult(claims.length, startTime)
  }

  // Filter claims by enabled detection types
  const enabledClaims = claims.filter((claim) => isDetectionEnabled(config, claim.claimType))

  // Check each claim against evidence
  const contradictions: ContradictionEntry[] = []
  let supportedCount = 0

  for (const claim of enabledClaims) {
    const mapping = CLAIM_TYPE_EVIDENCE_MAP[claim.claimType]
    const evidence = lookupEvidence(evidenceRegistry, mapping, taskStartTime, claim)

    if (evidence.length === 0) {
      // No evidence found — claim is unsupported
      contradictions.push({
        claim,
        status: "unsupported",
        requiredEvidenceType: mapping.evidenceType,
        matchingEvidence: [],
        message: `Claim "${claim.claimText}" requires ${mapping.evidenceType} evidence but none was found.`,
      })
    } else if (mapping.validate && !evidence.some(mapping.validate)) {
      // Evidence found but contradicts the claim
      contradictions.push({
        claim,
        status: "contradicted",
        requiredEvidenceType: mapping.evidenceType,
        matchingEvidence: evidence,
        message: `Claim "${claim.claimText}" is contradicted by ${mapping.evidenceType} evidence.`,
      })
    } else {
      supportedCount++
    }
  }

  const totalClaims = enabledClaims.length
  const unsupportedCount = contradictions.filter((c) => c.status === "unsupported").length
  const contradictedCount = contradictions.filter((c) => c.status === "contradicted").length

  const warningMessage = contradictions.length > 0
    ? formatWarningMessage(contradictions)
    : ""

  return {
    hasContradictions: contradictions.length > 0,
    contradictions,
    totalClaims,
    supportedCount,
    unsupportedCount,
    contradictedCount,
    warningMessage,
    detectionDurationMs: Date.now() - startTime,
  }
}
```

### 2. Claim Extraction Algorithm

```typescript
/**
 * Extracts claims from agent messages using keyword matching.
 * Pure function — same input always produces same output.
 *
 * @param messages - Agent messages to scan for claims
 * @returns Array of extracted claims
 */
function extractClaims(messages: ClineMessage[]): ExtractedClaim[] {
  const claims: ExtractedClaim[] = []

  // Keyword patterns for each claim type
  const KEYWORD_PATTERNS: Record<ClaimType, RegExp[]> = {
    fix_applied: [
      /\bfixed\b/i, /\bapplied\b/i, /\badded\b/i, /\bupdated\b/i,
      /\bmodified\b/i, /\bimplemented\b/i, /\bchanged\b/i, /\bedited\b/i,
      /\bpatched\b/i, /\bfix\s+applied\b/i, /\bcode\s+added\b/i,
    ],
    tests_passed: [
      /\btests?\s+pass/i, /\btests?\s+passing/i, /\ball\s+tests\b/i,
      /\btest\s+passed\b/i, /\bgreen\b/i, /\bno\s+failures\b/i,
      /\btests?\s+are\s+passing/i, /\btests?\s+all\s+pass\b/i,
    ],
    committed: [
      /\bcommitted\b/i, /\bgit\s+commit\b/i, /\bcommit\s+made\b/i,
      /\bchanges?\s+committed\b/i,
    ],
    pushed: [
      /\bpushed\b/i, /\bgit\s+push\b/i, /\bpush\s+to\b/i,
      /\bchanges?\s+pushed\b/i,
    ],
    diagnosed: [
      /\bdiagnosed\b/i, /\broot\s+cause\b/i, /\bidentified\s+the\s+issue\b/i,
      /\bfound\s+the\s+bug\b/i, /\bissue\s+is\s+identified\b/i,
    ],
    configured: [
      /\bconfigured\b/i, /\bset\s+up\b/i, /\bconfigured\s+the\b/i,
      /\bupdated\s+the\s+config\b/i, /\bconfig\s+changed\b/i,
    ],
  }

  for (const message of messages) {
    // Only process say messages with text
    if (message.type !== "say" || !message.text) continue

    // Skip system message types
    const skipTypes: ClineSay[] = [
      "error", "api_req_started", "api_req_finished", "api_req_retried",
      "condense_context", "condense_context_error", "sliding_window_truncation",
    ]
    if (message.say && skipTypes.includes(message.say)) continue

    const text = message.text
    const messageId = `${message.ts}`
    const timestamp = message.ts || Date.now()

    for (const [claimType, patterns] of Object.entries(KEYWORD_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          claims.push({
            claimType: claimType as ClaimType,
            claimText: text,
            source: message.say === "completion_result" ? "say_completion_result" : "say_text",
            timestamp,
            messageId,
            matchedKeyword: pattern.source,
          })
          break // One claim type per pattern match per message
        }
      }
    }
  }

  return claims
}
```

### 3. Evidence Lookup Algorithm

```typescript
/**
 * Looks up evidence from the registry for a given claim.
 * Filters to the task's time window and returns the most recent entries.
 * Pure function.
 *
 * @param evidenceRegistry - Phase 1 evidence registry
 * @param mapping - Claim type to evidence type mapping
 * @param taskStartTime - When the current task started
 * @param claim - The claim to look up evidence for
 * @returns Array of matching evidence entries, most recent first
 */
function lookupEvidence(
  evidenceRegistry: EvidenceEntry[],
  mapping: { evidenceType: string; validate?: (evidence: EvidenceEntry) => boolean },
  taskStartTime: number,
  claim: ExtractedClaim,
): EvidenceEntry[] {
  // Filter by evidence type and task time window
  const matching = evidenceRegistry.filter(
    (entry) =>
      entry.type === mapping.evidenceType &&
      entry.timestamp >= taskStartTime &&
      entry.timestamp <= claim.timestamp,
  )

  // Sort by timestamp descending (most recent first)
  matching.sort((a, b) => b.timestamp - a.timestamp)

  return matching
}
```

### 4. Warning Formatting Algorithm

```typescript
/**
 * Formats a contradiction warning message for injection into the agent's context.
 *
 * @param contradictions - List of contradictions to include in the warning
 * @returns Formatted XML warning block
 */
function formatWarningMessage(contradictions: ContradictionEntry[]): string {
  const lines: string[] = []

  lines.push("<contradiction_warning>")
  lines.push(`Contradiction Detection: ${contradictions.length} contradiction(s) found.`)
  lines.push("")

  for (let i = 0; i < contradictions.length; i++) {
    const entry = contradictions[i]
    lines.push(`[${i + 1}] Claim: "${truncate(entry.claim.claimText, 200)}"`)
    lines.push(`    Type: ${entry.claim.claimType}`)
    lines.push(`    Status: ${entry.status}`)
    lines.push(`    Required evidence: ${entry.requiredEvidenceType}`)

    if (entry.status === "unsupported") {
      lines.push(`    Guidance: You claimed "${entry.claim.claimType}" but no ${entry.requiredEvidenceType} evidence was found.`)
      lines.push(`    You must either perform the required action or correct your claim.`)
    } else if (entry.status === "contradicted") {
      lines.push(`    Guidance: Evidence contradicts your claim. The ${entry.requiredEvidenceType} evidence shows a different result.`)
      lines.push(`    You must address the discrepancy before proceeding.`)
    }

    lines.push("")
  }

  lines.push("You MUST resolve these contradictions before proceeding. Provide the missing evidence or correct your claims.")
  lines.push("</contradiction_warning>")

  return lines.join("\n")
}
```

### 5. Resolution Tracking Algorithm

```typescript
/**
 * Checks if new evidence resolves any existing contradictions.
 * Called when evidence is added to the registry.
 *
 * @param newEvidence - The newly added evidence entry
 * @param resolutionRecords - Existing resolution records
 * @returns Updated resolution records with any newly resolved contradictions
 */
function checkResolution(
  newEvidence: EvidenceEntry[],
  resolutionRecords: ResolutionRecord[],
): ResolutionRecord[] {
  const updated = [...resolutionRecords]

  for (let i = 0; i < updated.length; i++) {
    const record = updated[i]
    if (record.resolved) continue

    const mapping = CLAIM_TYPE_EVIDENCE_MAP[record.contradiction.claim.claimType]

    // Check if the new evidence resolves this contradiction
    if (newEvidence.type === mapping.evidenceType) {
      if (!mapping.validate || mapping.validate(newEvidence)) {
        updated[i] = {
          ...record,
          resolved: true,
          resolvedAt: Date.now(),
          resolutionEvidenceId: newEvidence.id,
        }
      }
    }
  }

  return updated
}
```

### 6. Metrics Update Algorithm

```typescript
/**
 * Updates per-task contradiction metrics after a detection run.
 *
 * @param metrics - Current metrics
 * @param result - Result from the latest detection run
 * @returns Updated metrics
 */
function updateMetrics(
  metrics: ContradictionMetrics,
  result: ContradictionResult,
): ContradictionMetrics {
  const totalClaims = metrics.totalClaims + result.totalClaims
  const supportedClaims = metrics.supportedCount + result.supportedCount
  const unsupportedClaims = metrics.unsupportedClaims + result.unsupportedCount
  const contradictedClaims = metrics.contradictedClaims + result.contradictedCount
  const contradictionRate = totalClaims > 0
    ? (unsupportedClaims + contradictedClaims) / totalClaims
    : 0

  return {
    ...metrics,
    totalClaims,
    supportedClaims,
    unsupportedClaims,
    contradictedClaims,
    contradictionRate,
    lastUpdated: Date.now(),
  }
}
```

### 7. Condensed Contradiction Summary Algorithm

```typescript
/**
 * Generates a condensed summary of unresolved contradictions for survival through context condensation.
 * Only unresolved contradictions are included — resolved ones are dropped.
 *
 * @param resolutionRecords - All resolution records
 * @returns Array of condensed summary strings (one per unresolved contradiction)
 */
function generateCondensedContradictions(
  resolutionRecords: ResolutionRecord[],
): string[] {
  return resolutionRecords
    .filter((record) => !record.resolved)
    .map((record) => {
      const claim = record.contradiction.claim
      return `[CONTRADICTION] ${claim.claimType}: ${record.contradiction.status} — "${truncate(claim.claimText, 100)}"`
    })
}
```

## Performance Constraints

- **Claim extraction**: Keyword matching over message text. Must complete in under 5ms per message. Uses pre-compiled regex patterns.
- **Evidence lookup**: Array filter over evidence registry. Must complete in under 5ms for up to 10,000 entries. Evidence is stored in chronological order, enabling early termination.
- **Contradiction checking**: In-memory comparison. Must complete in under 10ms for up to 100 claims.
- **Warning formatting**: String concatenation. Must complete in under 5ms.
- **Total pipeline**: Must complete in under 50ms to avoid delaying the agent's next API request.
- **No additional API calls**: The contradiction engine does not make any LLM or network calls. All operations are local in-memory processing.
- **Memory**: ContradictionResult is small (< 2KB serialized). Resolution records are < 500 bytes each.
- **Backward compatibility**: When `enabled` is `false`, the engine is not instantiated. Zero overhead. The existing message processing flow runs unchanged.
- **Cooldown**: The `warningCooldownMs` config prevents flooding the agent with repeated warnings for the same claim type. Default: 5 seconds.

## File Change Summary

| File | Change Type | Description |
|------|------------|-------------|
| `packages/types/src/global-settings.ts` | Modify | Add `contradictionDetection` section to `globalSettingsSchema` with 8 parameters |
| `packages/types/src/loop-detection.ts` | Modify | Add `ClaimType`, `ExtractedClaim`, `ContradictionStatus`, `ContradictionEntry`, `ContradictionResult`, `ContradictionConfig`, `ContradictionMetrics`, `ResolutionRecord`, `EvidenceEntry`, `CLAIM_TYPE_EVIDENCE_MAP` types |
| `src/core/contradiction-detection/ClaimExtractor.ts` | Create | Claim extraction: `extractClaims()`, keyword patterns, `isDetectionEnabled()` |
| `src/core/contradiction-detection/EvidenceLookup.ts` | Create | Evidence lookup: `lookupEvidence()`, `CLAIM_TYPE_EVIDENCE_MAP` reference |
| `src/core/contradiction-detection/ContradictionChecker.ts` | Create | Contradiction checking: `detectContradictions()`, `createEmptyResult()`, `formatWarningMessage()`, `truncate()` |
| `src/core/contradiction-detection/WarningInjector.ts` | Create | Warning injection: `injectWarning()`, `clearWarning()` |
| `src/core/contradiction-detection/ResolutionTracker.ts` | Create | Resolution tracking: `checkResolution()`, `getUnresolvedContradictions()`, `generateCondensedContradictions()` |
| `src/core/contradiction-detection/MetricsTracker.ts` | Create | Metrics tracking: `updateMetrics()`, `getMetrics()`, `resetMetrics()` |
| `src/core/contradiction-detection/ConfigManager.ts` | Create | Config management: `getContradictionConfig()`, `isDetectionEnabled()` |
| `src/core/contradiction-detection/ContradictionDetectionEngine.ts` | Create | Main orchestrator: `detect()`, `extractAndDetect()`, `extractAndDetectFromMessages()` |
| `src/core/contradiction-detection/index.ts` | Create | Barrel export for all public types and functions |
| `src/core/assistant-message/presentAssistantMessage.ts` | Modify | Integrate contradiction detection into message processing pipeline |
| `src/core/condense/index.ts` | Modify | Preserve unresolved contradiction summaries during condensation |
| `src/core/contradiction-detection/__tests__/ClaimExtractor.spec.ts` | Create | Unit tests for claim extraction |
| `src/core/contradiction-detection/__tests__/ContradictionChecker.spec.ts` | Create | Unit tests for contradiction checking |
| `src/core/contradiction-detection/__tests__/EvidenceLookup.spec.ts` | Create | Unit tests for evidence lookup |
| `src/core/contradiction-detection/__tests__/WarningInjector.spec.ts` | Create | Unit tests for warning formatting |
| `src/core/contradiction-detection/__tests__/ResolutionTracker.spec.ts` | Create | Unit tests for resolution tracking |
| `src/core/contradiction-detection/__tests__/MetricsTracker.spec.ts` | Create | Unit tests for metrics tracking |
| `src/core/contradiction-detection/__tests__/ConfigManager.spec.ts` | Create | Unit tests for config management |
| `src/core/contradiction-detection/__tests__/ContradictionDetectionEngine.spec.ts` | Create | Integration tests for the full pipeline |
| `src/core/assistant-message/__tests__/presentAssistantMessage-contradiction.spec.ts` | Create | Integration tests for contradiction detection in message pipeline |
