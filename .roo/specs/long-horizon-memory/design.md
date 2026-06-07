# Design Document - Long-Horizon Memory

## Overview

Long-Horizon Memory provides a structured, persistent memory that survives context condensation. Instead of injecting the full todo list and raw conversation history into every agent turn, the system injects a compressed summary of the agent's objective, findings, hypotheses, edits, tests, and blockers. TaskMemory is stored outside the conversation history in task metadata, updated by tool signals (not agent claims), and compacted automatically to stay within token budgets.

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Task Execution                           │
│  recursivelyMakeClineRequests() ──────────────────────────────> │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐  │
│  │ Tool Result  │───>│ TaskMemoryWriter │───>│  TaskMemory  │  │
│  │   Signals    │    │  (signal-based)  │    │   (in-mem)   │  │
│  └──────────────┘    └──────────────────┘    └──────┬───────┘  │
│                                                      │          │
│                                              ┌───────▼────────┐ │
│                                              │   Memory       │ │
│                                              │  Compactor     │ │
│                                              └───────┬────────┘ │
│                                                      │          │
│                                              ┌───────▼────────┐ │
│                                              │  Compressed    │ │
│                                              │  Summary       │ │
│                                              │  Generator     │ │
│                                              └───────┬────────┘ │
│                                                      │          │
│  ┌──────────────────────────────────────────────────▼────────┐ │
│  │              Context Assembly                             │ │
│  │  [System Prompt] [<task_memory>JSON</task_memory>] [History]│ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      Persistence Layer                          │
│                                                                 │
│  ┌──────────────────┐    ┌──────────────────────────────────┐  │
│  │ TaskMetadata     │    │  FileContextTracker              │  │
│  │ (task_memory     │<──>│  (getTaskMetadata /              │  │
│  │  field)          │    │   saveTaskMetadata)              │  │
│  └──────────────────┘    └──────────────────────────────────┘  │
│            │                                                    │
│            ▼                                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  task_metadata.json (task directory)                     │  │
│  │  {                                                       │  │
│  │    "files_in_context": [...],                            │  │
│  │    "task_memory": {                                      │  │
│  │      "objective": "...",                                 │  │
│  │      "findings": [...],                                  │  │
│  │      "hypotheses": [...],                                │  │
│  │      "edits": [...],                                     │  │
│  │      "tests": [...],                                     │  │
│  │      "blockers": [...],                                  │  │
│  │      "archivedFindings": [...],                          │  │
│  │      "archivedEdits": [...]                              │  │
│  │    }                                                     │  │
│  │  }                                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Component Descriptions

1. **TaskMemoryWriter**: Listens to tool result signals and updates the in-memory TaskMemory. Only updates on concrete signals (file writes, test results, errors) — never on agent textual claims.
2. **Memory Compactor**: Runs before each summary injection. Archives resolved/abandoned findings and old edits to keep the active memory within configured thresholds.
3. **Compressed Summary Generator**: Produces a minimal `CompressedSummary` from the current TaskMemory, respecting token limits and priority filtering.
4. **Context Assembly**: Injects the compressed summary as a `<task_memory>` JSON block between the system prompt and conversation history.
5. **Persistence Layer**: Reads/writes TaskMemory as part of task metadata using the existing `FileContextTracker` infrastructure.

## Integration Points

### 1. Task Execution Loop (`src/core/task/Task.ts`)
- **Hook point**: After each tool execution result in `recursivelyMakeClineRequests()`, the `TaskMemoryWriter` inspects the result for signals.
- **Signal detection**: File operations (write, edit, diff) → `edits`; test execution results → `tests`; error results → `blockers`; search/read results with new evidence → `findings`.
- **Injection point**: Before each API request, the compressed summary is assembled into the context.

### 2. Condense System (`src/core/condense/index.ts`)
- **Preservation**: `summarizeConversation()` does NOT modify TaskMemory. TaskMemory persists in task metadata, independent of conversation history.
- **Enrichment**: The current TaskMemory is passed to `summarizeConversation()` via `SummarizeConversationOptions` so the LLM-generated summary can reference structured memory.
- **Re-injection**: After condensation completes, the compressed summary is re-injected on the next turn.

### 3. Context Management (`src/core/context-management/index.ts`)
- **Integration**: `manageContext()` triggers TaskMemory compaction before condensation, ensuring the LLM summary has access to the latest structured memory.
- **Token awareness**: The token budget for context management accounts for the compressed summary injection overhead.

### 4. File Context Tracker (`src/core/context-tracking/FileContextTracker.ts`)
- **Extension**: TaskMemory is stored as a `task_memory` field in the task metadata JSON, managed via the existing `getTaskMetadata()` / `saveTaskMetadata()` methods.
- **No new storage mechanism**: Reuses the existing task directory and `safeWriteJson` infrastructure.

### 5. Task Persistence (`src/core/task-persistence/`)
- **Serialization**: TaskMemory is included in the task metadata saved during task persistence.
- **Resume**: On task resume, TaskMemory is loaded from the task metadata file alongside `files_in_context`.

## Data Structures

### TaskMemory
```typescript
export enum TaskMemoryStatus {
    Active = "active",
    DiagnosisConfirmed = "diagnosis_confirmed",
    Resolved = "resolved",
    Abandoned = "abandoned",
}

export interface TaskMemory {
    objective: string
    findings: string[]
    hypotheses: string[]
    edits: string[]
    tests: string[]
    blockers: string[]
    archivedFindings: string[]
    archivedEdits: string[]
    status: TaskMemoryStatus
    turnCount: number  // Number of turns since last compaction
}
```

### CompressedSummary
```typescript
export interface CompressedSummary {
    objective: string
    finding: string       // Most recent or highest-priority finding
    status: TaskMemoryStatus
}
```

### LongHorizonMemoryConfig
```typescript
export const longHorizonMemoryConfigSchema = z.object({
    enabled: z.boolean().optional().default(true),
    maxFindings: z.number().int().min(5).max(100).optional().default(20),
    maxEdits: z.number().int().min(10).max(200).optional().default(50),
    archiveAfterTurns: z.number().int().min(5).max(100).optional().default(30),
    injectionTokenLimit: z.number().int().min(50).max(500).optional().default(200),
    compactBeforeInjection: z.boolean().optional().default(true),
})

export type LongHorizonMemoryConfig = z.infer<typeof longHorizonMemoryConfigSchema>
```

### TaskMetadata Extension
```typescript
// Extended task_metadata schema (additions to existing FileContextTrackerTypes)
export const taskMetadataSchema = z.object({
    files_in_context: z.array(fileMetadataEntrySchema),
    task_memory: taskMemorySchema.optional(),
})
```

### Zod Schemas
```typescript
export const taskMemoryStatusSchema = z.enum(["active", "diagnosis_confirmed", "resolved", "abandoned"])

export const taskMemorySchema = z.object({
    objective: z.string().min(1),
    findings: z.array(z.string().min(1)),
    hypotheses: z.array(z.string().min(1)),
    edits: z.array(z.string().min(1)),
    tests: z.array(z.string().min(1)),
    blockers: z.array(z.string().min(1)),
    archivedFindings: z.array(z.string().min(1)).default([]),
    archivedEdits: z.array(z.string().min(1)).default([]),
    status: taskMemoryStatusSchema.default("active"),
    turnCount: z.number().int().min(0).default(0),
})

export const compressedSummarySchema = z.object({
    objective: z.string(),
    finding: z.string(),
    status: taskMemoryStatusSchema,
})
```

## Algorithms

### 1. Signal-Based Memory Update
After each tool execution result in the agentic loop:

1. **File write/edit detected** → Append `"<filename>: <description of change>"` to `edits[]`.
2. **Test execution result** → Append `"<test framework>: <result summary>"` to `tests[]`.
3. **Error result** → Append `"Error: <error summary>"` to `blockers[]`.
4. **Blocker resolved** → Remove matching entry from `blockers[]`.
5. **Search/read with new evidence** → Append `"<evidence summary>"` to `findings[]`.
6. **Increment** `turnCount`.

### 2. Memory Compaction
Runs before each compressed summary injection:

1. IF `turnCount >= archiveAfterTurns`, THEN archive all `findings[]` entries with status `resolved` or `abandoned` to `archivedFindings[]`.
2. IF `edits.length > maxEdits`, THEN move the oldest `edits.length - maxEdits` entries to `archivedEdits[]`.
3. IF `findings.length > maxFindings`, THEN archive the oldest resolved findings to `archivedFindings[]` until `findings.length <= maxFindings`.
4. Reset `turnCount` to 0.

### 3. Compressed Summary Generation
Generates the summary injected into context:

1. Take `objective` from TaskMemory.
2. Take the most recent entry from `findings[]` (or `"No findings yet"` if empty).
3. Take `status` from TaskMemory.
4. Serialize to JSON within `<task_memory>` tags.
5. Truncate `finding` field if total summary exceeds `injectionTokenLimit` tokens.

### 4. Context Assembly Order
The agent's context is assembled in this order:

1. System prompt
2. `<task_memory>{"objective":"...","finding":"...","status":"..."}</task_memory>`
3. Conversation history (post-condensation if applicable)
4. Tool definitions

### 5. Persistence Flow
On task save/resume:

1. **Save**: `saveTaskMetadata()` writes the full TaskMemory (including archived arrays) to `task_metadata.json`.
2. **Resume**: `getTaskMetadata()` reads TaskMemory from `task_metadata.json`. If `task_memory` field is absent, initialize with empty defaults.
3. **Atomic writes**: All persistence uses `safeWriteJson` to prevent corruption.

## Performance Constraints

- **In-memory operations**: All TaskMemory reads and updates are in-memory only — no I/O on the hot path.
- **Persistence amortization**: TaskMetadata is written asynchronously and batched with existing file context tracking writes.
- **Token budget**: Compressed summary is capped at 200 tokens (configurable, max 500).
- **Compaction cost**: Memory compaction runs O(n) over findings and edits arrays, where n is bounded by configurable thresholds (max 100 findings, max 200 edits).
- **No LLM calls for memory**: TaskMemory updates and compaction are purely programmatic — no LLM calls required.
- **Serialization**: TaskMemory JSON is typically under 10KB, adding negligible overhead to task metadata persistence.
