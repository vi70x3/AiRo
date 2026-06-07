# Design Document - Agent Reliability Metrics

## Overview

Agent Reliability Metrics introduces a comprehensive metrics collection and analysis system that quantifies five dimensions of agent reliability: Diagnosis Accuracy, Hallucinated Edit Rate, Tool Efficiency, Token Efficiency, and Recovery Rate. The system is built as a new `src/core/metrics/` module that integrates with existing infrastructure at well-defined points.

All metrics are computed deterministically from data already available in the system — tool execution results, API usage data, and task lifecycle events. No additional LLM calls or external services are required. The system follows the existing patterns in the codebase: TypeScript interfaces in `packages/types/`, zod schemas for configuration, class-based modules with barrel exports, and event-based communication via `ClineProvider.emit()`.

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Task Execution Loop                                  │
│  (recursivelyMakeClineRequests in src/core/task/Task.ts)                    │
│                                                                              │
│  ┌──────────────────┐     ┌──────────────────────────────────────────────┐  │
│  │ presentAssistant │────>│              MetricsCollector                │  │
│  │ Message          │     │                                              │  │
│  │                  │     │  ┌────────────┐  ┌───────────────────────┐  │  │
│  │ Tool results     │     │  │ Diagnosis  │  │ HallucinatedEdit      │  │  │
│  │ flow in          │     │  │ Accuracy   │  │ Detector              │  │  │
│  │                  │     │  │ Tracker    │  │                       │  │  │
│  └──────────────────┘     │  └────────────┘  └───────────────────────┘  │  │
│                           │                                              │  │
│  ┌──────────────────┐     │  ┌────────────┐  ┌───────────────────────┐  │  │
│  │ processUsage     │────>│  │ Tool       │  │ TokenEfficiency       │  │  │
│  │ Metrics          │     │  │ Efficiency │  │ Tracker               │  │  │
│  │                  │     │  │ Tracker    │  │                       │  │  │
│  └──────────────────┘     │  └────────────┘  └───────────────────────┘  │  │
│                           │                                              │  │
│  ┌──────────────────┐     │  ┌───────────────────────────────────────┐  │  │
│  │ Task lifecycle   │────>│  │ RecoveryRateTracker                   │  │  │
│  │ events           │     │  │                                       │  │  │
│  │ (mistakes,       │     │  └───────────────────────────────────────┘  │  │
│  │  errors,         │     │                                              │  │
│  │  completions)    │     └──────────────────┬───────────────────────────┘  │
│  └──────────────────┘                        │                              │
│                                              │                              │
│  ┌──────────────────┐     ┌──────────────────┴───────────────────────────┐  │
│  │ Loop detection   │────>│              MetricsAggregator                │  │
│  │ (interventions,  │     │                                              │  │
│  │  adaptations)    │     │  Per-task aggregates                         │  │
│  └──────────────────┘     │  Session-level aggregates                    │  │
│                           │  Event emission                               │  │
│                           └──────────────────┬───────────────────────────┘  │
│                                              │                              │
│                           ┌──────────────────┴───────────────────────────┐  │
│                           │              Integration Points              │  │
│                           │                                              │  │
│                           │  TaskPersistence ──> metrics serialized     │  │
│                           │  getTaskWithAggregatedCosts ──> UI data     │  │
│                           │  ClineProvider.emit() ──> events            │  │
│                           │  TaskHeader ──> metrics display             │  │
│                           └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Descriptions

1. **DiagnosisAccuracyTracker**: Detects diagnostic language in agent output via pattern matching, tracks confirmation/refutation based on subsequent tool execution outcomes. Stateless between tasks; resets on task start.
2. **HallucinatedEditDetector**: Monitors edit tool calls and their results, detects discrepancies between reported success and actual tool errors. Integrates with existing `consecutiveMistakeCountForEditFile` and `recordToolError()`.
3. **ToolEfficiencyTracker**: Records every tool invocation with success/failure status, computes per-task and per-tool rates. Integrates with `AutoApprovalHandler` for separate auto-approval tracking.
4. **TokenEfficiencyTracker**: Consumes API usage data from `getApiMetrics()` and `processUsageMetrics()`, computes cache hit rate, context utilization, and useful context approximation.
5. **RecoveryRateTracker**: Monitors failure events and subsequent recovery actions, classifies failures as recovered/unrecovered. Integrates with `InterventionEffectivenessTracker` and `AdaptationFailureDetector`.
6. **MetricsAggregator**: Collects per-task samples from all five trackers, computes aggregate values, persists to task metadata, and emits finalization events.
7. **MetricsCollector**: Facade class that owns all five trackers, provides a unified interface for the task execution loop, and manages lifecycle (reset on task start, finalize on task end).

## Integration Points

### 1. Task Execution Loop (`src/core/task/Task.ts`)

**Initialization**: The `MetricsCollector` is instantiated at the start of `recursivelyMakeClineRequests()` (or in `initiateTaskLoop()` for the first iteration) when `agentReliabilityMetrics.enabled` is `true`. It is stored as a property on the `Task` class alongside existing metrics like `toolUsage`.

**Tool Result Interception**: After `presentAssistantMessage()` executes a tool and produces a result, the tool execution event is intercepted. The `MetricsCollector.recordToolCall()` method is called with the tool name, result, and success/failure status. This happens synchronously as part of the tool execution pipeline.

**Mistake Tracking Integration**: When `consecutiveMistakeCount` increments (line 313), the `RecoveryRateTracker` records a failure event. When `consecutiveMistakeCountForEditFile` increments (line 315), the `HallucinatedEditDetector` checks for hallucinated claims. When `recordToolError()` is called (line 4512), both the `ToolEfficiencyTracker` and `HallucinatedEditDetector` are notified.

**Flow**:
```
tool result produced -> metrics recorded (all trackers) -> result returned to agent
```

This is synchronous and happens before the next tool in a batch or the next assistant turn.

### 2. API Response Processing (`src/api/providers/base-openai-compatible-provider.ts`)

When `processUsageMetrics()` processes an API response, the `TokenEfficiencyTracker` receives the usage data (context tokens, cache writes, cache reads). This happens in the provider layer, after the response is received but before it is returned to the task execution loop.

### 3. API Metrics (`src/shared/getApiMetrics.ts`)

The `TokenEfficiencyTracker` consumes data from `getApiMetrics()` (which re-exports `consolidateTokenUsage` from `@roo-code/core/browser`). This provides `contextTokens`, `totalTokensIn`, `totalTokensOut`, `totalCacheWrites`, `totalCacheReads`, and `totalCost`.

### 4. Auto-Approval Handler (`src/core/auto-approval/AutoApprovalHandler.ts`)

The `ToolEfficiencyTracker` registers a callback with the `AutoApprovalHandler` to receive notifications when tool calls are auto-approved. Auto-approved calls are tracked separately with their own success rate computation.

### 5. Loop Detection (`src/core/loop-detection/`)

**InterventionEffectivenessTracker** (`src/core/loop-detection/InterventionEffectivenessTracker.ts`): When a loop-breaking intervention is applied, the `RecoveryRateTracker` begins measuring whether the agent recovers within the next 5 turns. Recovery is defined as at least one successful tool call.

**AdaptationFailureDetector** (`src/core/loop-detection/AdaptationFailureDetector.ts`): When an adaptation failure is detected, the `RecoveryRateTracker` records it as a separate failure subtype (`"adaptation_failure"`) with its own recovery tracking.

### 6. Task Persistence (`src/core/task-persistence/taskMetadata.ts`)

The `MetricsAggregator` serializes per-task metrics into the `TaskMetadata` interface. On task resume, the metrics are restored. The full metric sample history is not persisted (it can be large); only the aggregate values survive.

### 7. Webview Message Handler (`src/core/webview/webviewMessageHandler.ts`)

The `getTaskWithAggregatedCosts` function is extended to include reliability metrics alongside cost data. The metrics are passed through to the webview via the existing message passing mechanism.

### 8. TaskHeader Component (`webview-ui/src/components/chat/TaskHeader.tsx`)

A new `reliabilityMetrics` prop is added to `TaskHeaderProps`. When the task header is expanded (`isTaskExpanded === true`), the reliability metrics section is rendered with compact, color-coded displays for each metric family.

## Data Structures

### TaskReliabilityMetrics

```typescript
export interface TaskReliabilityMetrics {
  diagnosisAccuracy: {
    confirmed: number
    refuted: number
    total: number
    rate: number                    // confirmed / total, 0 to 1
  }
  hallucinatedEdits: {
    verified: number
    hallucinated: number
    total: number
    rate: number                    // hallucinated / total, 0 to 1
  }
  toolEfficiency: {
    successful: number
    failed: number
    total: number
    rate: number                    // successful / total, 0 to 1
    perTool: Record<string, {      // Per-tool breakdown for top 10 tools
      successful: number
      failed: number
      rate: number
    }>
  }
  tokenEfficiency: {
    contextTokens: number
    usefulContextTokens: number
    wastedContextTokens: number
    cacheHitRate: number            // cacheWrites / (cacheWrites + cacheReads)
    contextUtilizationRate: number  // contextTokens / contextWindow
    rate: number                    // usefulContextTokens / contextTokens, 0 to 1
  }
  recoveryRate: {
    recovered: number
    unrecovered: number
    total: number
    rate: number                    // recovered / total, 0 to 1
  }
}
```

### ToolCallSample

```typescript
export interface ToolCallSample {
  id: string                        // UUID v4
  timestamp: number                 // Unix epoch milliseconds
  task: string                      // Tool name (e.g., "Edit", "Bash", "Read")
  success: boolean
  errorType: string | null          // e.g., "file_not_found", "permission_denied", null if success
  isAutoApproved: boolean
  contextTokensAtTime: number       // Context tokens at the time of this call
}
```

### DiagnosisSample

```typescript
export interface DiagnosisSample {
  id: string                        // UUID v4
  timestamp: number                 // Unix epoch milliseconds
  diagnosisHash: string             // SHA-256 of diagnostic utterance, truncated to 8 chars
  status: "pending" | "confirmed" | "refuted"
  confirmationEvidenceId: string | null  // ID of the evidence that confirmed/refuted
  outcomeTurns: number               // Number of turns until outcome determined
}
```

### HallucinatedEditSample

```typescript
export interface HallucinatedEditSample {
  id: string                        // UUID v4
  timestamp: number                 // Unix epoch milliseconds
  filePath: string
  toolName: string                  // "Edit", "Write", or "MultiEdit"
  toolError: string                 // The error returned by the tool
  agentClaimedSuccess: boolean      // Whether the agent reported success despite the error
}
```

### RecoverySample

```typescript
export interface RecoverySample {
  id: string                        // UUID v4
  timestamp: number                 // Unix epoch milliseconds
  failureType: "tool_error" | "consecutive_mistake" | "adaptation_failure" | "loop_intervention"
  recovered: boolean
  attemptsToRecovery: number        // Number of turns until recovery (max 3 for unrecovered)
  interventionId: string | null     // Links to InterventionEffectivenessTracker if applicable
}
```

### AgentReliabilityMetricsConfig

```typescript
export const agentReliabilityMetricsSchema = z.object({
  enabled: z.boolean().optional().default(false),
  trackDiagnosisAccuracy: z.boolean().optional().default(true),
  trackHallucinatedEdits: z.boolean().optional().default(true),
  trackToolEfficiency: z.boolean().optional().default(true),
  trackTokenEfficiency: z.boolean().optional().default(true),
  trackRecoveryRate: z.boolean().optional().default(true),
  emitEvents: z.boolean().optional().default(true),
  perTaskRetentionLimit: z.number().int().min(100).max(10000).optional().default(1000),
})

export type AgentReliabilityMetricsConfig = z.infer<typeof agentReliabilityMetricsSchema>
```

### SessionMetricsAggregate

```typescript
export interface SessionMetricsAggregate {
  tasksCount: number
  diagnosisAccuracy: { mean: number; min: number; max: number }
  hallucinatedEditRate: { mean: number; min: number; max: number }
  toolEfficiency: { mean: number; min: number; max: number }
  tokenEfficiency: { mean: number; min: number; max: number }
  recoveryRate: { mean: number; min: number; max: number }
}
```

## Algorithms

### 1. Diagnosis Detection and Classification

```
function detectDiagnosis(agentOutput: string): DiagnosisSample | null {
  // Deterministic pattern matching for diagnostic language
  const DIAGNOSIS_PATTERNS = [
    /the\s+(issue|problem|bug|error|root\s+cause)\s+is/i,
    /caused\s+by/i,
    /the\s+fix\s+(is|would\s+be|should\s+be)/i,
    /we\s+need\s+to\s+(fix|update|change|modify)/i,
    /the\s+(solution|resolution)\s+is/i,
  ]

  const hasDiagnosis = DIAGNOSIS_PATTERNS.some(pattern => pattern.test(agentOutput))
  if (!hasDiagnosis) return null

  return {
    id: generateUUID(),
    timestamp: Date.now(),
    diagnosisHash: sha256(agentOutput).slice(0, 8),
    status: "pending",
    confirmationEvidenceId: null,
    outcomeTurns: 0,
  }
}

function classifyDiagnosis(
  diagnosis: DiagnosisSample,
  toolCallSample: ToolCallSample,
  consecutiveMistakeCount: number
): "confirmed" | "refuted" | "pending" {
  // Confirmed: successful edit on a relevant file followed by successful test
  if (toolCallSample.success && isEditTool(toolCallSample.tool)) {
    return "confirmed"
  }

  // Refuted: 3+ consecutive mistakes after diagnosis
  if (consecutiveMistakeCount >= 3) {
    return "refuted"
  }

  // Refuted: agent explicitly revises diagnosis
  // (detected by a new diagnosis sample being created)

  return "pending"
}
```

### 2. Hallucinated Edit Detection

```
function detectHallucinatedEdit(
  toolCallSample: ToolCallSample,
  agentOutput: string,
  consecutiveMistakeCountForEditFile: Map<string, number>
): HallucinatedEditSample | null {
  if (!isEditTool(toolCallSample.tool)) return null

  const filePath = extractFilePath(toolCallSample)
  const editCount = consecutiveMistakeCountForEditFile.get(filePath) || 0

  // Tool returned error but agent claims success
  if (!toolCallSample.success && editCount > 0) {
    const agentClaimsSuccess = /successfully|updated|fixed|applied|modified/i.test(agentOutput)
    if (agentClaimsSuccess) {
      return {
        id: generateUUID(),
        timestamp: Date.now(),
        filePath,
        toolName: toolCallSample.tool,
        toolError: toolCallSample.errorType || "unknown",
        agentClaimedSuccess: true,
      }
    }
  }

  return null
}
```

### 3. Token Efficiency Computation

```
function computeTokenEfficiency(
  toolCallSamples: ToolCallSample[],
  apiMetrics: { contextTokens: number; totalCacheWrites: number; totalCacheReads: number },
  contextWindow: number
): TokenEfficiencyResult {
  const totalContextTokens = apiMetrics.contextTokens
  const totalCacheWrites = apiMetrics.totalCacheWrites
  const totalCacheReads = apiMetrics.totalCacheReads

  // Useful context: context tokens from turns that produced successful tool calls
  const successfulTurns = new Set(
    toolCallSamples.filter(s => s.success).map(s => Math.floor(s.timestamp / TURN_TIME_WINDOW))
  )
  const usefulContextTokens = toolCallSamples
    .filter(s => successfulTurns.has(Math.floor(s.timestamp / TURN_TIME_WINDOW)))
    .reduce((sum, s) => sum + s.contextTokensAtTime, 0)

  const wastedContextTokens = totalContextTokens - usefulContextTokens

  return {
    contextTokens: totalContextTokens,
    usefulContextTokens,
    wastedContextTokens,
    cacheHitRate: totalCacheWrites / Math.max(1, totalCacheWrites + totalCacheReads),
    contextUtilizationRate: totalContextTokens / contextWindow,
    rate: usefulContextTokens / Math.max(1, totalContextTokens),
  }
}
```

### 4. Recovery Classification

```
function classifyRecovery(
  failure: RecoverySample,
  subsequentToolCalls: ToolCallSample[],
  maxRecoveryTurns: number = 3
): "recovered" | "unrecovered" | "pending" {
  const failureIndex = subsequentToolCalls.findIndex(s => s.timestamp > failure.timestamp)
  if (failureIndex === -1) return "pending"

  const callsAfterFailure = subsequentToolCalls.slice(failureIndex, failureIndex + maxRecoveryTurns)
  const hasRecovery = callsAfterFailure.some(s => s.success)

  if (hasRecovery) {
    return "recovered"
  }

  // If we've seen maxRecoveryTurns calls after failure with no success, it's unrecovered
  if (callsAfterFailure.length >= maxRecoveryTurns) {
    return "unrecovered"
  }

  return "pending"
}
```

### 5. Metrics Finalization

```
function finalizeTaskMetrics(collector: MetricsCollector): TaskReliabilityMetrics {
  const diagnosis = collector.diagnosisTracker.getAggregate()
  const hallucinated = collector.hallucinatedEditDetector.getAggregate()
  const toolEff = collector.toolEfficiencyTracker.getAggregate()
  const tokenEff = collector.tokenEfficiencyTracker.getAggregate()
  const recovery = collector.recoveryRateTracker.getAggregate()

  return {
    diagnosisAccuracy: {
      confirmed: diagnosis.confirmed,
      refuted: diagnosis.refuted,
      total: diagnosis.total,
      rate: diagnosis.total > 0 ? diagnosis.confirmed / diagnosis.total : 0,
    },
    hallucinatedEdits: {
      verified: hallucinated.verified,
      hallucinated: hallucinated.hallucinated,
      total: hallucinated.total,
      rate: hallucinated.total > 0 ? hallucinated.hallucinated / hallucinated.total : 0,
    },
    toolEfficiency: {
      successful: toolEff.successful,
      failed: toolEff.failed,
      total: toolEff.total,
      rate: toolEff.total > 0 ? toolEff.successful / toolEff.total : 0,
      perTool: toolEff.perTool,
    },
    tokenEfficiency: {
      contextTokens: tokenEff.contextTokens,
      usefulContextTokens: tokenEff.usefulContextTokens,
      wastedContextTokens: tokenEff.wastedContextTokens,
      cacheHitRate: tokenEff.cacheHitRate,
      contextUtilizationRate: tokenEff.contextUtilizationRate,
      rate: tokenEff.rate,
    },
    recoveryRate: {
      recovered: recovery.recovered,
      unrecovered: recovery.unrecovered,
      total: recovery.total,
      rate: recovery.total > 0 ? recovery.recovered / recovery.total : 0,
    },
  }
}
```

## Performance Constraints

- **Tool call recording**: Synchronous, in-memory operation. Must complete in under 1ms per call. The recording involves only counter increments and timestamp capture.
- **Diagnosis detection**: Synchronous regex pattern matching against agent output. Must complete in under 5ms per output. Uses pre-compiled regex patterns.
- **Hallucinated edit detection**: Synchronous check against tool result and agent output. Must complete in under 2ms per edit tool call.
- **Token efficiency update**: Synchronous counter update from API metrics. Must complete in under 1ms per API response.
- **Recovery classification**: Synchronous check against recent tool call history. Must complete in under 2ms per failure event.
- **Metrics finalization**: Synchronous aggregation of in-memory counters. Must complete in under 10ms per task.
- **Memory**: Metric samples are capped at `perTaskRetentionLimit` entries (default 1000). When the limit is reached, the oldest entries are evicted. Each sample is approximately 100 bytes, so 1000 samples = ~100KB per task.
- **No additional API calls**: The metrics system does not make any LLM or network calls. All operations are local and deterministic.
- **Serialization overhead**: The `TaskReliabilityMetrics` aggregate is small (< 2KB serialized) and is included in the task metadata. Full sample history is not persisted.
- **Event emission**: Events are emitted asynchronously (fire-and-forget) and do not block the metrics recording pipeline.
