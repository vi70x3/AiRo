# Design Document - Agent State Management

## Overview

Agent State Management replaces the implicit state model — where the agent's notion of reality is derived from conversation history — with an explicit, deterministic Execution State Graph. Every tool execution produces verifiable evidence, and the system validates agent claims against that evidence before accepting them. The system integrates with the existing loop-detection infrastructure and the task execution loop.

All state management is deterministic: no LLM calls are made to infer state. Tools update state via a state transition engine; the agent's textual claims are validated against evidence but never directly modify state.

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Task Execution Loop                          │
│  (recursivelyMakeClineRequests in Task.ts)                     │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐ │
│  │ presentAssist │───>│  StateTransition │───>│  Evidence    │ │
│  │ antMessage   │    │  Engine          │    │  Registry    │ │
│  │              │    │                  │    │              │ │
│  │ Tool results │    │ Tool event +     │    │ Append-only  │ │
│  │ flow in      │    │ current state -> │    │ evidence     │ │
│  │              │    │ new state        │    │ entries      │ │
│  └──────┬───────┘    └────────┬─────────┘    └──────┬───────┘ │
│         │                     │                      │         │
│         │              ┌──────┴───────┐              │         │
│         │              │  Execution   │              │         │
│         │              │  State Graph │              │         │
│         │              │              │              │         │
│         │              │ diagnosis    │              │         │
│         │              │ implementation│             │         │
│         │              │ testing      │              │         │
│         │              │ vcs          │              │         │
│         │              └──────┬───────┘              │         │
│         │                     │                      │         │
│  ┌──────┴─────────────────────┴──────────────────────┴───────┐ │
│  │                   Validation Layer                        │ │
│  │                                                           │ │
│  │  ┌─────────────────┐         ┌──────────────────────┐    │ │
│  │  │ Claim Validator │         │ Completion Validator  │    │ │
│  │  │                 │         │                      │    │ │
│  │  │ Agent claim +   │         │ attempt_completion +  │    │ │
│  │  │ evidence check  │         │ state check           │    │ │
│  │  └─────────────────┘         └──────────────────────┘    │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              Integration Points                           │ │
│  │                                                           │ │
│  │  getEnvironmentDetails ──> state injected into prompt     │ │
│  │  SemanticLoopDetector ──> state transitions as signals    │ │
│  │  summarizeConversation ──> evidence summary preserved     │ │
│  │  Task persistence ──> state graph serialized              │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Component Descriptions

1. **StateTransitionEngine**: Receives tool execution events and the current Execution State Graph, computes the new state deterministically. Stateless pure function.
2. **EvidenceRegistry**: Append-only store of evidence entries. Supports querying by type for claim validation.
3. **ExecutionStateGraph**: The data structure holding current phase states. Serializable to JSON.
4. **ClaimValidator**: Checks agent textual claims against the Evidence Registry. Rejects unverified claims.
5. **CompletionValidator**: Checks the Execution State Graph for required phase states before allowing task completion.
6. **EvidenceSummarizer**: Produces compact evidence summaries for survival through context condensation.

## Integration Points

### 1. Task Execution Loop (`src/core/task/Task.ts`)

**Initialization**: The Execution State Graph and Evidence Registry are instantiated at the start of `recursivelyMakeClineRequests()` (or in `initiateTaskLoop()` for the first iteration). They are stored as properties on the `Task` class.

**State Updates**: After `presentAssistantMessage()` executes a tool and produces a result, the tool execution event is intercepted. The `StateTransitionEngine.processToolEvent()` function is called with the current state graph and the event, producing the new state. The `EvidenceRegistry.addEntry()` function records the evidence.

**Flow**: The tool execution pipeline in `presentAssistantMessage` calls each tool's `call()` method. After each call returns a result, the state management hook fires:
```
tool result produced -> evidence recorded -> state transitioned -> result returned to agent
```

This is synchronous and happens before the next tool in a batch or the next assistant turn.

### 2. Environment Details (`src/core/environment/getEnvironmentDetails.ts`)

The current Execution State Graph is serialized to a human-readable block and appended to the environment details string. This ensures the agent always sees the current machine state in every API request. The format is:

```
<execution_state>
diagnosis: confirmed
implementation: verified
testing: passed
vcs: committed
</execution_state>
```

### 3. Context Condensation (`src/core/condense/index.ts`)

When `summarizeConversation()` is called, the Evidence Summarizer produces a compact summary. This summary is injected into the condensation prompt via the `environmentDetails` parameter of `SummarizeConversationOptions`. The Execution State Graph is preserved as-is (it is small enough to not need summarization).

### 4. Loop Detection (`src/core/loop-detection/SemanticLoopDetector.ts`)

The existing `SemanticLoopDetector` receives Execution State Graph transitions as additional signals. A state transition from `"not_started"` to `"investigating"` (diagnosis) or `"editing"` to `"edited"` (implementation) counts as progress. Repeated state without transition supports loop detection.

### 5. Task Persistence (`src/core/task-persistence/`)

The Execution State Graph and a condensed Evidence Summary are serialized into the task metadata. On task resume, they are restored. The full Evidence Registry is not persisted (it can be large); only the summary survives.

## Data Structures

### ExecutionStateGraph

```typescript
export type PhaseStatus = {
  diagnosis: "not_started" | "investigating" | "hypothesis" | "confirmed"
  implementation: "not_started" | "editing" | "edited" | "verified"
  testing: "not_started" | "running" | "passed" | "failed"
  vcs: "none" | "committed" | "pushed"
}

export interface ExecutionStateGraph {
  diagnosis: { status: PhaseStatus["diagnosis"] }
  implementation: { status: PhaseStatus["implementation"] }
  testing: { status: PhaseStatus["testing"] }
  vcs: { status: PhaseStatus["vcs"] }
}
```

### Evidence

```typescript
export type EvidenceType = "file_read" | "file_edit" | "command" | "test" | "git_commit" | "git_push"

export interface Evidence {
  id: string                          // UUID v4
  timestamp: number                   // Unix epoch milliseconds
  type: EvidenceType
  payload: EvidencePayload
}

export type EvidencePayload =
  | { filePath: string; action: "read" }                                    // file_read
  | { filePath: string; action: "edit" | "create" | "delete" }             // file_edit
  | { command: string; exitCode: number; outputPreview?: string }          // command
  | { testFramework: string; result: "pass" | "fail"; summary: string }    // test
  | { commitHash: string; message: string }                                // git_commit
  | { remote: string; branch: string; commitHash: string }                 // git_push
```

### StateTransition

```typescript
export interface StateTransition {
  phase: keyof ExecutionStateGraph
  from: string
  to: string
  evidenceId: string                   // Links to the evidence that triggered this transition
  timestamp: number
}
```

### AgentStateManagementConfig

```typescript
export const agentStateManagementSchema = z.object({
  enabled: z.boolean().optional().default(false),
  validateClaims: z.boolean().optional().default(true),
  validateCompletion: z.boolean().optional().default(true),
  evidenceRetentionLimit: z.number().int().min(100).max(10000).optional().default(1000),
})

export type AgentStateManagementConfig = z.infer<typeof agentStateManagementSchema>
```

### EvidenceSummary

```typescript
export interface EvidenceSummary {
  totalCount: number
  byType: Record<EvidenceType, number>
  editedFiles: string[]
  readFiles: string[]
  lastTestResult: { result: "pass" | "fail"; summary: string } | null
  lastCommit: { commitHash: string; message: string } | null
  lastPush: { remote: string; branch: string; commitHash: string } | null
}
```

## Algorithms

### 1. State Transition Engine

The state transition engine is a pure function that maps `(currentState, toolEvent) -> newState`. The transition table is:

| Tool Event Type | Current Phase Status | New Phase Status |
|----------------|---------------------|-----------------|
| `file_read` with diagnostic pattern (e.g., read test file, read error log) | `diagnosis: not_started` | `diagnosis: investigating` |
| `file_read` with diagnostic pattern | `diagnosis: investigating` | `diagnosis: investigating` |
| `file_edit` (non-test file) | `implementation: not_started` | `implementation: editing` |
| `file_edit` (non-test file) | `implementation: editing` | `implementation: editing` |
| `file_edit` (non-test file) with success | `implementation: editing` | `implementation: edited` |
| `command` with test framework pattern | `testing: not_started` | `testing: running` |
| `command` with test framework pattern, exit code 0 | `testing: running` | `testing: passed` |
| `command` with test framework pattern, exit code non-zero | `testing: running` | `testing: failed` |
| `git commit` command, exit code 0 | `vcs: none` | `vcs: committed` |
| `git push` command, exit code 0 | `vcs: committed` | `vcs: pushed` |

**Diagnostic pattern detection**: A `file_read` event is considered diagnostic if the file path matches patterns like `*.test.*`, `*.spec.*`, `error*`, `log*`, or if the file is a configuration file (`package.json`, `tsconfig.json`, etc.). This is a simple path-matching heuristic, not LLM inference.

**Implementation verification**: The `implementation: edited` -> `implementation: verified` transition requires both an `edited` state and a subsequent `testing: passed` state. This is computed lazily when the state graph is queried, not on every transition.

### 2. Claim Validation Algorithm

```
function validateClaim(claim: string, evidenceRegistry: EvidenceRegistry): ValidationResult {
  const claimType = classifyClaim(claim)  // Deterministic pattern matching
  if (!claimType) return { accepted: true }  // Unknown claim type, pass through

  const requiredEvidenceType = CLAIM_TYPE_TO_EVIDENCE_TYPE[claimType]
  const matchingEvidence = evidenceRegistry.getEntriesByType(requiredEvidenceType)

  if (matchingEvidence.length === 0) {
    return {
      accepted: false,
      reason: `Claim "${claimType}" requires evidence of type "${requiredEvidenceType}" but no matching evidence found.`
    }
  }

  // For test claims, additionally check that the most recent test evidence passed
  if (claimType === "tests_passed") {
    const lastTest = matchingEvidence[matchingEvidence.length - 1]
    if (lastTest.payload.result === "fail") {
      return {
        accepted: false,
        reason: `Claim "tests_passed" rejected: most recent test evidence shows failure.`
      }
    }
  }

  return { accepted: true }
}
```

**Claim classification**: Uses regex pattern matching on the agent's output text:
- `/fix|patch|apply|update|modify/i` + `/file|code|implement/` -> `"fix_applied"`
- `/test.*pass|all tests|green|passing/i` -> `"tests_passed"`
- `/commit/i` -> `"committed"`
- `/push/i` -> `"pushed"`

### 3. Completion Validation Algorithm

```
function validateCompletion(state: ExecutionStateGraph): CompletionResult {
  const required: Record<string, string> = {
    diagnosis: "confirmed",
    implementation: "verified",
    testing: "passed",
  }

  const incomplete: string[] = []
  for (const [phase, requiredStatus] of Object.entries(required)) {
    if (state[phase].status !== requiredStatus) {
      incomplete.push(`${phase}: ${state[phase].status} (required: ${requiredStatus})`)
    }
  }

  if (incomplete.length > 0) {
    return {
      allowed: false,
      incompletePhases: incomplete,
      message: `Cannot complete task. Incomplete phases: ${incomplete.join(", ")}`
    }
  }

  return { allowed: true }
}
```

### 4. Evidence Summary Algorithm

```
function summarizeEvidence(evidence: Evidence[], limit: number): EvidenceSummary {
  const recentEvidence = evidence.slice(-limit)  // Keep only the most recent entries

  return {
    totalCount: evidence.length,
    byType: countByType(recentEvidence),
    editedFiles: unique(recentEvidence.filter(e => e.type === "file_edit").map(e => e.payload.filePath)),
    readFiles: unique(recentEvidence.filter(e => e.type === "file_read").map(e => e.payload.filePath)),
    lastTestResult: findLast(recentEvidence, e => e.type === "test"),
    lastCommit: findLast(recentEvidence, e => e.type === "git_commit"),
    lastPush: findLast(recentEvidence, e => e.type === "git_push"),
  }
}
```

## Performance Constraints

- **State transition**: Synchronous, in-memory operation. Must complete in under 1ms per transition.
- **Evidence recording**: Synchronous append to in-memory array. Must complete in under 1ms per entry.
- **Claim validation**: Synchronous pattern matching against evidence registry. Must complete in under 5ms per claim.
- **Completion validation**: Synchronous state graph check. Must complete in under 1ms.
- **Memory**: Evidence registry is capped at `evidenceRetentionLimit` entries (default 1000). When the limit is reached, the oldest entries are evicted.
- **No additional API calls**: The state management system does not make any LLM or network calls. All operations are local and deterministic.
- **Serialization overhead**: The Execution State Graph is small (< 1KB serialized) and is included in every environment details injection. Evidence summaries are similarly small (< 2KB serialized).
