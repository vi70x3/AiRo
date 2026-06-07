# Design Document - Context Compression Architecture

## Overview

The Context Compression Architecture replaces the monolithic system prompt and environment details injection model with a four-layer retrieval system. Each layer is loaded conditionally based on token budget, agent mode, and repository state. The architecture integrates with three existing subsystems:

1. **System Prompt Generation** ([system.ts](src/core/prompts/system.ts:44)) — `generatePrompt()` builds the full system prompt by concatenating sections. This is where Layers 0–2 are assembled.
2. **Environment Details** ([getEnvironmentDetails.ts](src/core/environment/getEnvironmentDetails.ts:23)) — `getEnvironmentDetails()` builds a massive string every turn. This is where Tier A/Tier B splitting occurs.
3. **Condensation Pipeline** ([condense/index.ts](src/core/condense/index.ts:254)) — `summarizeConversation()` produces a narrative summary. This is where evidence preservation is added.

The design preserves backward compatibility: when `contextCompression.enabled` is `false`, the existing full-injection behavior is used with zero changes to the existing code paths.

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ContextCompressionEngine                      │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Layer 0      │  │ Layer 1      │  │ Layer 2               │  │
│  │ Permanent    │  │ Active Mode  │  │ Active Spec           │  │
│  │ Core         │  │ Instructions │  │ Summary               │  │
│  │ (≤1500 tok)  │  │ (dynamic)    │  │ (≤500 tok, JSON)      │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘  │
│         │                 │                       │              │
│  ┌──────┴─────────────────┴───────────────────────┴───────────┐  │
│  │              TokenBudgetEnforcer                            │  │
│  │              (budget: 6000 tok default)                     │  │
│  └──────┬─────────────────┬───────────────────────┬───────────┘  │
│         │                 │                       │              │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌───────────┴───────────┐  │
│  │ Layer 3      │  │ Environment  │  │ Environment           │  │
│  │ Symbol       │  │ Tier A       │  │ Tier B                │  │
│  │ Retrieval    │  │ (≤500 tok)   │  │ (on demand)           │  │
│  │ (≤1000 tok)  │  │ (always)     │  │ (priority order)      │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ EnhancedCondensationEngine                                │  │
│  │ - Evidence extraction (files, tools, conclusions)         │  │
│  │ - Structured JSON block in summary                        │  │
│  │ - ≤1000 tokens for evidence                               │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User sends message
    │
    ▼
ContextCompressionEngine.isEnabled?
    │
    ├── No ──► generatePrompt() [existing path, unchanged]
    │           getEnvironmentDetails() [existing path, unchanged]
    │
    └── Yes ──► buildLayer0Core()          [≤1500 tokens]
                buildLayer1Instructions()  [mode-dependent]
                buildLayer2SpecSummary()   [≤500 tokens, if spec active]
                buildLayer3SymbolContext() [≤1000 tokens, if indexed]
                │
                ▼
            TokenBudgetEnforcer.assess(budget=6000)
                │
                ├── Within budget ──► assemble system prompt
                │
                └── Over budget ──► reduce layers in order:
                    1. Drop Layer 3
                    2. Drop Layer 2
                    3. Reduce Layer 1 to base instructions
                    4. Drop Tier B environment
                    5. Reduce Layer 1 base (last resort)
                │
                ▼
            buildEnvironmentTierA()  [≤500 tokens, always]
            buildEnvironmentTierB()  [priority order, budget permitting]
                │
                ▼
            Assemble final system prompt + environment details
```

## Integration Points

### 1. System Prompt Generation (`src/core/prompts/system.ts`)

The `generatePrompt()` function (line 44) is the primary integration point. The current implementation concatenates all sections into a single string. The new design:

- **Wraps** the existing section functions with a `ContextCompressionEngine` that assembles layers conditionally.
- **Preserves** all existing section functions (`getSharedToolUseSection`, `getToolUseGuidelinesSection`, `getCapabilitiesSection`, `getModesSection`, `getRulesSection`, `getSystemInfoSection`, `getObjectiveSection`, `addCustomInstructions`, `markdownFormattingSection`, `getSkillsSection`) without modification.
- **Adds** a new `buildLayer0Core()` function that selects a subset of sections for the permanent core.
- **Adds** a new `buildLayer1Instructions()` function that wraps `addCustomInstructions()` and `getRulesSection()` with mode-based filtering.
- **Adds** a new `buildLayer2SpecSummary()` function that reads from `.roo/specs/<spec-name>/`.
- **Falls back** to the existing concatenation logic when `contextCompression.enabled` is `false`.

### 2. Environment Details (`src/core/environment/getEnvironmentDetails.ts`)

The `getEnvironmentDetails()` function (line 23) is the secondary integration point. The current implementation builds a single string with all environment information. The new design:

- **Adds** an optional `tier` parameter to the function signature: `"critical" | "detailed" | "full"`.
- **Splits** the existing content generation into `buildTierACritical()` and `buildTierBDetailed()` internal functions.
- **Preserves** the existing behavior when `tier` is `"full"` (default for backward compatibility).
- **Preserves** the existing `formatReminderSection()` integration for todo lists.

### 3. Condensation Pipeline (`src/core/condense/index.ts`)

The `summarizeConversation()` function (line 254) is the tertiary integration point. The new design:

- **Adds** an `extractEvidence()` function that runs before the LLM summarization call.
- **Inserts** the evidence block as a separate text block in the `summaryContent` array.
- **Preserves** the existing `injectSyntheticToolResults()`, `transformMessagesForCondensing()`, `getMessagesSinceLastSummary()`, `getEffectiveApiHistory()`, and `cleanupAfterTruncation()` functions without modification to their core logic.

### 4. Configuration (`packages/types/src/global-settings.ts`)

The `globalSettingsSchema` (line 118) uses zod schemas with `.optional().default()` pattern. The new design:

- **Adds** a `contextCompression` section following the exact same pattern as the existing `loopDetection` section (line 222).
- **Uses** zod validation with ranges and defaults matching the requirements.

## Data Structures

### ContextCompressionConfig

```typescript
interface ContextCompressionConfig {
    enabled: boolean                    // Master switch, default: false
    contextBudget: number               // Target tokens per turn, range: 1000-50000, default: 6000
    layer0MaxTokens: number             // Max tokens for Layer 0, range: 500-3000, default: 1500
    layer2MaxTokens: number             // Max tokens for Layer 2, range: 100-2000, default: 500
    layer3MaxTokens: number             // Max tokens for Layer 3, range: 200-3000, default: 1000
    environmentTierAMaxTokens: number   // Max tokens for Tier A, range: 100-2000, default: 500
    enableTieredEnvironment: boolean    // Enable tiered env details, default: true
    enableEnhancedCondensation: boolean // Enable evidence preservation, default: true
}
```

### SpecSummary

```typescript
interface SpecSummary {
    spec: string                        // Kebab-case spec name, e.g., "context-compression-architecture"
    summary: string                     // One-line description of the spec
    affectedFiles: string[]             // Array of file paths the spec touches
    currentPhase: string                // Current phase name, e.g., "Phase 2: Core Logic"
    progressStatus: string              // Progress status, e.g., "in_progress" or "completed"
    totalPhases: number                 // Total number of phases in the spec
    completedPhases: number             // Number of completed phases
}
```

### EvidenceBlock

```typescript
interface EvidenceBlock {
    filesModified: Array<{
        path: string                    // Relative file path
        action: "created" | "modified" | "read" | "deleted"
    }>
    toolsInvoked: Array<{
        name: string                    // Tool name, e.g., "search_files"
        keyParams: Record<string, string> // Key parameters (excluding user content)
    }>
    conclusions: string[]               // Conclusions reached by the agent
    blockers: string[]                  // Current blockers preventing progress
    timestamp: number                   // Timestamp of evidence extraction
}
```

### LayerReductionEvent

```typescript
interface LayerReductionEvent {
    timestamp: number                   // When the reduction occurred
    layerRemoved: string                // Name of the layer removed, e.g., "Layer 3"
    tokensBefore: number                // Token count before reduction
    tokensAfter: number                 // Token count after reduction
    budgetRemaining: number             // Remaining budget after reduction
}
```

### TierBOmission

```typescript
interface TierBOmission {
    timestamp: number                   // When the omission occurred
    itemsOmitted: string[]             // Names of Tier B items omitted
    tokensSaved: number                 // Tokens saved by omitting
    budgetRemaining: number             // Remaining budget after omission
}
```

### ModeInstructionMapping

```typescript
interface ModeInstructionMapping {
    modeSlug: string                    // Mode slug, e.g., "vibe", "debug", "spec"
    includeBaseInstructions: boolean    // Whether to include base mode instructions
    includeExtendedRules: boolean       // Whether to include extended workflow rules
    includeModeSpecificRules: boolean   // Whether to include mode-specific rules from .roo/rules-${mode}/
    customInstructionKeys: string[]     // Keys for custom instructions to include
}
```

## Algorithms

### 1. Token Budget Assessment

The token budget assessment runs after all layers are built but before final assembly:

```
function assessBudget(layers, budget):
    total = sum(layer.tokens for layer in layers)

    if total <= budget:
        return layers  // All layers included

    reductionOrder = [
        "Layer 3",      // Symbol retrieval (least critical for correctness)
        "Layer 2",      // Spec summary (can be re-fetched)
        "Layer 1 extended",  // Extended mode rules (keep base)
        "Tier B",       // Detailed environment (keep critical)
        "Layer 1 base"  // Base mode instructions (last resort)
    ]

    for layerName in reductionOrder:
        if total <= budget:
            break
        removed = removeLayer(layers, layerName)
        total -= removed.tokens
        logReduction(layerName, total + removed.tokens, total)

    return layers
```

### 2. Tier B Priority Inclusion

When the budget allows Tier B content, items are added in priority order until the budget is exhausted:

```
function buildTierB(tierBItems, remainingBudget):
    priorityOrder = [
        "recentlyModifiedFiles",    // Highest: files the agent just edited
        "visibleFiles",             // High: files currently visible in VSCode
        "activeTerminals",          // High: running terminal output
        "currentTime",              // Medium: time context
        "gitStatus",                // Medium: git state
        "currentCost",              // Medium: cost tracking
        "openTabs",                 // Low: open tab paths
        "inactiveTerminals",        // Low: completed terminal output
        "workspaceListing"          // Lowest: full directory listing
    ]

    included = []
    for itemName in priorityOrder:
        itemTokens = estimateTokenCount(itemName.content)
        if itemTokens <= remainingBudget:
            included.push(itemName)
            remainingBudget -= itemTokens
        else:
            logOmission(itemName, itemTokens, remainingBudget)
            break  // Stop at first item that doesn't fit

    return included
```

### 3. Evidence Extraction

Evidence extraction runs before the LLM summarization call in `summarizeConversation()`:

```
function extractEvidence(messages):
    evidence = new EvidenceBlock()

    for message in messages:
        if message.role === "assistant":
            for block in message.content:
                if block.type === "tool_use":
                    evidence.toolsInvoked.add({
                        name: block.name,
                        keyParams: extractKeyParams(block.input)
                    })
                    evidence.filesModified.add(extractFilePath(block))

        if message.role === "user":
            for block in message.content:
                if block.type === "tool_result":
                    evidence.conclusions.add(extractConclusion(block))
                    evidence.blockers.add(extractBlocker(block))

    evidence.timestamp = Date.now()
    return evidence
```

Key parameter extraction filters out user content, keeping only structural parameters (file paths, tool names, search patterns). Conclusion and blocker extraction uses simple heuristics: tool results containing "error" or "fail" are blockers; tool results containing "found" or "created" are conclusions.

### 4. Spec Summary Generation

The spec summary is generated by reading the first 20 lines of each spec document:

```
function buildSpecSummary(specName):
    specDir = `.roo/specs/${specName}/`

    if !directoryExists(specDir):
        logWarning(`Spec directory not found: ${specDir}`)
        return ""

    requirements = readFirstNLines(`${specDir}/requirements.md`, 20)
    design = readFirstNLines(`${specDir}/design.md`, 20)
    tasks = readFirstNLines(`${specDir}/tasks.md`, 20)

    summary = {
        spec: specName,
        summary: extractFirstSentence(requirements),
        affectedFiles: extractFilePaths(design),
        currentPhase: extractCurrentPhase(tasks),
        progressStatus: extractProgressStatus(tasks),
        totalPhases: countPhases(tasks),
        completedPhases: countCompletedPhases(tasks)
    }

    tokenCount = estimateTokenCount(JSON.stringify(summary))
    if tokenCount > layer2MaxTokens:
        // Truncate affectedFiles to fit budget
        summary.affectedFiles = truncateFileList(summary.affectedFiles, layer2MaxTokens)

    return JSON.stringify(summary)
```

### 5. Mode-Based Instruction Filtering

Layer 1 instructions are filtered based on the current mode:

```
function buildLayer1Instructions(mode, settings):
    mapping = getModeInstructionMapping(mode)

    if !mapping:
        logWarning(`No instruction mapping for mode: ${mode}`)
        return getBaseInstructions(mode)

    instructions = []

    if mapping.includeBaseInstructions:
        instructions.push(getBaseInstructions(mode))

    if mapping.includeModeSpecificRules:
        instructions.push(getRulesSection(cwd, settings))

    if mapping.includeExtendedRules:
        instructions.push(getExtendedModeRules(mode))

    if mapping.customInstructionKeys.length > 0:
        instructions.push(getCustomInstructionsByKeys(mapping.customInstructionKeys))

    return instructions.join("\n\n")
```

## Performance Constraints

- **Layer 0 generation**: Must complete in <50ms. This is a synchronous operation over a fixed set of section functions.
- **Layer 2 spec summary**: File I/O for reading spec documents must complete in <100ms. The `readFirstNLines()` function reads at most 20 lines per document.
- **Layer 3 symbol retrieval**: `search_symbols()` calls must complete in <200ms. This is an in-memory lookup against the jcodemunch index.
- **Tier B priority inclusion**: Must complete in <20ms. This is a simple iteration over a fixed list of environment detail items.
- **Evidence extraction**: Must complete in <50ms before the LLM summarization call. This is a synchronous pass over the message array.
- **Token budget assessment**: Must complete in <10ms. This is a simple arithmetic operation over layer token counts.
- **Total overhead**: The Context Compression Engine must add no more than 300ms to the system prompt generation path.
- **Backward compatibility**: When `contextCompression.enabled` is `false`, the overhead must be <1ms (single boolean check).
