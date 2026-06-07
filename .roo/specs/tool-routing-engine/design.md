# Design: Tool Routing Engine

## Overview

The Tool Routing Engine is a deterministic routing layer that sits between the agent's intent and tool selection. It constrains the available tools and injects guidance into the system prompt based on the agent's declared intent and the current execution context. The router does NOT replace the agent's tool selection — it constrains and guides it.

The design follows the existing patterns in the codebase: zod schemas for configuration, pure functions for deterministic logic, class-based context objects for state, and section generators for system prompt injection.

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Tool Array Building Pipeline                         │
│                     (buildNativeToolsArrayWithRestrictions)                   │
│                                                                             │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────────────┐  │
│  │ getNative    │───>│ filterNative     │───>│ Tool Router              │  │
│  │ Tools()      │    │ ToolsForMode()   │    │ (routeIntent)            │  │
│  │              │    │                  │    │                          │  │
│  │ 24 tools     │    │ Mode-filtered    │    │ ┌──────────────────────┐ │  │
│  │              │    │ tools            │    │ │ ToolPreferenceTable  │ │  │
│  └──────────────┘    └──────────────────┘    │ │ (intent -> tools)    │ │  │
│                                               │ └──────────────────────┘ │  │
│                                               │ ┌──────────────────────┐ │  │
│                                               │ │ PhaseGuidance        │ │  │
│                                               │ │ (phase -> guidance)  │ │  │
│                                               │ └──────────────────────┘ │  │
│                                               │ ┌──────────────────────┐ │  │
│                                               │ │ RoutingContext       │ │  │
│                                               │ │ (repoIndexed, phase, │ │  │
│                                               │ │  availableTools,     │ │  │
│                                               │ │  mode)               │ │  │
│                                               │ └──────────────────────┘ │  │
│                                               └────────────┬─────────────┘  │
│                                                            │                │
│                              ┌─────────────────────────────┤                │
│                              │                             │                │
│                              v                             v                │
│                   ┌──────────────────┐         ┌──────────────────────┐    │
│                   │ Tool Array       │         │ Routing Guidance     │    │
│                   │ (filtered,       │         │ (injected into       │    │
│                   │  possibly        │         │  system prompt)      │    │
│                   │  reordered)      │         │                      │    │
│                   └──────────────────┘         └──────────────────────┘    │
│                              │                             │                │
│                              └──────────┬──────────────────┘                │
│                                         v                                   │
│                              ┌──────────────────────┐                      │
│                              │ API Request           │                      │
│                              │ (tools + prompt)      │                      │
│                              └──────────────────────┘                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        System Prompt Generation                             │
│                                                                             │
│  ┌──────────────────────────┐      ┌────────────────────────────────────┐  │
│  │ getSharedToolUseSection  │─────>│ TOOL ROUTING section              │  │
│  │ (tool-use.ts)            │      │ (dynamic based on repoIndexed)    │  │
│  └──────────────────────────┘      └────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────┐      ┌────────────────────────────────────┐  │
│  │ getToolUseGuidelines     │─────>│ Routing guidelines                 │  │
│  │ Section (tool-use-       │      │ (intent -> tool preference list)  │  │
│  │ guidelines.ts)           │      └────────────────────────────────────┘  │
│  └──────────────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Descriptions

1. **ToolPreferenceTable**: A static mapping from intents to ordered tool preference lists. Pure data, no logic.
2. **RoutingContext**: A structured object containing the current execution context (repoIndexed, executionPhase, availableTools, mode).
3. **ToolRouter**: The core deterministic function that accepts an intent and RoutingContext, looks up the ToolPreferenceTable, filters by available tools, and returns a ToolRecommendation.
4. **PhaseGuidanceGenerator**: Generates phase-based tool guidance for the system prompt based on the current execution phase.
5. **RoutingGuidanceInjector**: Injects routing guidance into the system prompt via the existing section generators.

## Integration Points

### 1. `buildNativeToolsArrayWithRestrictions()` (`src/core/task/build-tools.ts`)

**Invocation Point**: After `filterNativeToolsForMode()` and before returning the `BuildToolsResult`.

**Changes**:
- Accept an optional `routingContext` parameter on `BuildToolsOptions`
- When `toolRouting.enabled` is `true`, construct `RoutingContext` and invoke `ToolRouter.route()`
- The router returns a `ToolRecommendation` containing reordered tools and guidance
- Tool array is reordered to place recommended tools first (for models that prioritize earlier tools)
- Guidance is stored for later prompt injection

**Flow**:
```
nativeTools -> filterNativeToolsForMode -> ToolRouter.route -> reordered tools + guidance
```

### 2. `getSharedToolUseSection()` (`src/core/prompts/sections/tool-use.ts`)

**Changes**:
- Accept an optional `routingGuidance` parameter
- When routing guidance is provided, append a `TOOL ROUTING` section after the existing tool use content
- The section is dynamically generated based on `repoIndexed` state

### 3. `getToolUseGuidelinesSection()` (`src/core/prompts/sections/tool-use-guidelines.ts`)

**Changes**:
- Accept an optional `routingGuidance` parameter
- When routing guidance is provided, append routing guidelines after the existing guidelines
- The guidelines include the tool preference table for common intents

### 4. `ToolAvailabilityContext` (`src/core/prompts/tools/tool-availability-context.ts`)

**Changes**: None. The router reads from this context but does not modify it. The router's `RoutingContext.availableTools` is derived from `ToolAvailabilityContext.isToolAvailable()`.

### 5. `packages/types/src/global-settings.ts`

**Changes**: Add `toolRouting` section to `globalSettingsSchema` with `enabled`, `enforceJcodemunch`, and `phaseBasedFiltering` fields.

### 6. `packages/types/src/loop-detection.ts`

**Changes**: None. The router consumes `executionPhase` from the Execution State Graph but does not modify loop-detection types.

## Data Structures

### RoutingContext

```typescript
/**
 * Context for tool routing decisions.
 * Constructed during tool array building and passed to the router.
 */
export interface RoutingContext {
  /** Whether the current workspace has been indexed by jcodemunch */
  repoIndexed: boolean
  /** Current execution phase from the Execution State Graph */
  executionPhase: "diagnosis" | "implementation" | "testing" | "vcs" | "none"
  /** Tools that are currently available (not disabled) */
  availableTools: string[]
  /** Current mode slug */
  mode: string
  /** Whether to enforce jcodemunch tools over native tools */
  enforceJcodemunch: boolean
  /** Whether phase-based filtering is enabled */
  phaseBasedFiltering: boolean
}
```

### ToolRecommendation

```typescript
/**
 * Output of the tool router — contains the recommended tool,
 * fallback tools, and optional prompt guidance.
 */
export interface ToolRecommendation {
  /** Primary recommended tool name */
  primaryTool: string
  /** Ordered fallback tool names (empty if primary is sufficient) */
  fallbackTools: string[]
  /** Guidance text to inject into the system prompt */
  guidance: string
  /** Tools to deprioritize (still available but discouraged) */
  deprioritizedTools: string[]
  /** The intent that was routed */
  intent: string
}
```

### ToolPreferenceTable

```typescript
/**
 * Static mapping from intents to ordered tool preference lists.
 * Each intent maps to an ordered array of tools — first tool is preferred.
 * The router filters this list by available tools and repoIndexed state.
 */
export type ToolPreferenceEntry = {
  intent: string
  tools: string[]
  /** Whether this intent requires an indexed repo to use the primary tool */
  requiresIndexedRepo: boolean
  /** Fallback tools when repo is not indexed */
  fallbackTools: string[]
}

export const TOOL_PREFERENCE_TABLE: ToolPreferenceEntry[] = [
  {
    intent: "find_function",
    tools: ["search_symbols", "get_context_bundle"],
    requiresIndexedRepo: true,
    fallbackTools: ["read_file", "search_files"],
  },
  {
    intent: "find_usage",
    tools: ["find_references"],
    requiresIndexedRepo: true,
    fallbackTools: ["search_files", "read_file"],
  },
  {
    intent: "understand_module",
    tools: ["get_context_bundle"],
    requiresIndexedRepo: true,
    fallbackTools: ["read_file", "list_files"],
  },
  {
    intent: "search_text",
    tools: ["search_text"],
    requiresIndexedRepo: true,
    fallbackTools: ["search_files", "execute_command"],
  },
  {
    intent: "impact_analysis",
    tools: ["get_blast_radius"],
    requiresIndexedRepo: true,
    fallbackTools: ["find_references", "read_file"],
  },
  {
    intent: "refactor",
    tools: ["plan_refactoring"],
    requiresIndexedRepo: true,
    fallbackTools: ["read_file", "apply_diff"],
  },
]
```

### ToolRoutingConfig

```typescript
/**
 * Configuration for the tool routing engine.
 * Follows the existing zod schema pattern in global-settings.ts.
 */
export const toolRoutingSchema = z.object({
  enabled: z.boolean().optional().default(false),
  enforceJcodemunch: z.boolean().optional().default(true),
  phaseBasedFiltering: z.boolean().optional().default(false),
})

export type ToolRoutingConfig = z.infer<typeof toolRoutingSchema>
```

### PhaseGuidance

```typescript
/**
 * Phase-based tool guidance for system prompt injection.
 */
export interface PhaseGuidance {
  phase: string
  /** Tools to prioritize in this phase */
  prioritizedTools: string[]
  /** Tools to deprioritize in this phase */
  deprioritizedTools: string[]
  /** Guidance text for the system prompt */
  guidanceText: string
}

export const PHASE_GUIDANCE_TABLE: Record<string, PhaseGuidance> = {
  diagnosis: {
    phase: "diagnosis",
    prioritizedTools: ["read_file", "search_files", "list_files", "codebase_search"],
    deprioritizedTools: ["apply_diff", "write_to_file"],
    guidanceText: "You are in the diagnosis phase. Prioritize read and explore tools. Avoid making edits until the problem is confirmed.",
  },
  implementation: {
    phase: "implementation",
    prioritizedTools: ["apply_diff", "write_to_file", "read_file", "edit"],
    deprioritizedTools: [],
    guidanceText: "You are in the implementation phase. Read and write tools are available. Make the necessary changes to implement the solution.",
  },
  testing: {
    phase: "testing",
    prioritizedTools: ["execute_command", "read_file"],
    deprioritizedTools: ["apply_diff", "write_to_file"],
    guidanceText: "You are in the testing phase. Run tests using execute_command. Read test output with read_file. Avoid making code changes.",
  },
  vcs: {
    phase: "vcs",
    prioritizedTools: ["execute_command"],
    deprioritizedTools: ["apply_diff", "write_to_file"],
    guidanceText: "You are in the VCS phase. Use execute_command for git operations. Avoid making code changes.",
  },
  none: {
    phase: "none",
    prioritizedTools: [],
    deprioritizedTools: [],
    guidanceText: "",
  },
}
```

## Algorithms

### 1. Tool Router (Core Algorithm)

```typescript
/**
 * Deterministic tool routing function.
 * Given the same intent and context, always returns the same recommendation.
 *
 * @param intent - The agent's declared intent (e.g., "find_function")
 * @param context - The current routing context
 * @returns A ToolRecommendation with primary tool, fallbacks, and guidance
 */
function routeIntent(intent: string, context: RoutingContext): ToolRecommendation {
  // 1. Look up intent in preference table
  const entry = TOOL_PREFERENCE_TABLE.find((e) => e.intent === intent)

  if (!entry) {
    return {
      primaryTool: "",
      fallbackTools: [],
      guidance: "",
      deprioritizedTools: [],
      intent,
    }
  }

  // 2. Determine effective tool list based on repoIndexed state
  let candidateTools: string[]
  if (context.repoIndexed || !entry.requiresIndexedRepo) {
    candidateTools = entry.tools
  } else {
    candidateTools = entry.fallbackTools
  }

  // 3. Filter by available tools (respect ToolAvailabilityContext)
  const availableTools = candidateTools.filter((tool) =>
    context.availableTools.includes(tool),
  )

  // 4. If enforceJcodemunch is true and repo is indexed,
  //    ensure jcodemunch tools are strictly first
  if (context.enforceJcodemunch && context.repoIndexed) {
    const indexedTools = availableTools.filter((t) => isIndexedTool(t))
    const nativeTools = availableTools.filter((t) => !isIndexedTool(t))
    candidateTools = [...indexedTools, ...nativeTools]
  }

  // 5. Determine deprioritized tools
  const deprioritizedTools = context.phaseBasedFiltering
    ? PHASE_GUIDANCE_TABLE[context.executionPhase]?.deprioritizedTools ?? []
    : []

  // 6. Build guidance
  const guidance = buildRoutingGuidance(intent, context, entry)

  return {
    primaryTool: candidateTools[0] || "",
    fallbackTools: candidateTools.slice(1),
    guidance,
    deprioritizedTools,
    intent,
  }
}
```

### 2. Indexed Tool Detection

```typescript
/**
 * Set of tools that are jcodemunch-specific (require indexed repo).
 */
const INDEXED_TOOLS = new Set([
  "search_symbols",
  "get_context_bundle",
  "find_references",
  "search_text",
  "get_blast_radius",
  "plan_refactoring",
  "find_importers",
  "get_call_hierarchy",
  "get_impact_preview",
  "get_repo_map",
  "search_ast",
  "search_columns",
  "get_project_intel",
  "get_file_outline",
  "get_symbol_source",
  "get_context_bundle",
  "get_related_symbols",
  "get_dead_code_v2",
  "find_hot_paths",
  "find_unused_paths",
  "get_runtime_coverage",
])

function isIndexedTool(toolName: string): boolean {
  return INDEXED_TOOLS.has(toolName)
}
```

### 3. Routing Guidance Builder

```typescript
/**
 * Builds the routing guidance text for the system prompt.
 */
function buildRoutingGuidance(
  intent: string,
  context: RoutingContext,
  entry: ToolPreferenceEntry,
): string {
  const lines: string[] = []

  // Tool preference for this intent
  if (entry.tools.length > 0) {
    const toolsList = entry.tools.join(", ")
    lines.push(`When the user asks to ${intent.replace("_", " ")}: use ${toolsList}.`)
  }

  // Indexed vs native note
  if (context.repoIndexed && context.enforceJcodemunch && entry.requiresIndexedRepo) {
    lines.push(
      `Prefer jcodemunch tools over native tools when the repo is indexed.`,
    )
  }

  // Phase guidance
  if (context.phaseBasedFiltering && context.executionPhase !== "none") {
    const phaseGuidance = PHASE_GUIDANCE_TABLE[context.executionPhase]
    if (phaseGuidance && phaseGuidance.guidanceText) {
      lines.push(phaseGuidance.guidanceText)
    }
  }

  return lines.join("\n")
}
```

### 4. System Prompt Section Generator

```typescript
/**
 * Generates the TOOL ROUTING section for the system prompt.
 * Called from getSharedToolUseSection() or getToolUseGuidelinesSection().
 */
export function getToolRoutingSection(
  repoIndexed: boolean,
  config: ToolRoutingConfig,
  executionPhase?: string,
): string {
  if (!config.enabled) {
    return ""
  }

  const lines: string[] = ["====", "", "TOOL ROUTING", ""]
  lines.push("When the user asks to:")

  for (const entry of TOOL_PREFERENCE_TABLE) {
    const tools = repoIndexed || !entry.requiresIndexedRepo
      ? entry.tools
      : entry.fallbackTools
    const toolsList = tools.join(" > ")
    lines.push(`- ${intentToDescription(entry.intent)}: ${toolsList}`)
  }

  if (repoIndexed && config.enforceJcodemunch) {
    lines.push("")
    lines.push(
      "PREFER jcodemunch tools over native tools when the repo is indexed. " +
        "Only fall back to native tools when jcodemunch tools are unavailable.",
    )
  }

  if (config.phaseBasedFiltering && executionPhase && executionPhase !== "none") {
    const phaseGuidance = PHASE_GUIDANCE_TABLE[executionPhase]
    if (phaseGuidance) {
      lines.push("")
      lines.push(`Current phase: ${executionPhase}`)
      if (phaseGuidance.prioritizedTools.length > 0) {
        lines.push(`Prioritize: ${phaseGuidance.prioritizedTools.join(", ")}`)
      }
      if (phaseGuidance.deprioritizedTools.length > 0) {
        lines.push(`Avoid: ${phaseGuidance.deprioritizedTools.join(", ")}`)
      }
    }
  }

  return lines.join("\n")
}

function intentToDescription(intent: string): string {
  const descriptions: Record<string, string> = {
    find_function: "find a function/class",
    find_usage: "find usage of a symbol",
    understand_module: "understand a module",
    search_text: "search text",
    impact_analysis: "analyze impact",
    refactor: "refactor code",
  }
  return descriptions[intent] || intent.replace("_", " ")
}
```

## Performance Constraints

- **Routing decision**: Synchronous, in-memory lookup. Must complete in under 1ms per call.
- **Guidance generation**: Synchronous string building. Must complete in under 5ms per call.
- **Tool array reordering**: In-place or shallow copy. Must complete in under 1ms.
- **System prompt injection**: String concatenation. Must complete in under 5ms.
- **No additional API calls**: The router does not make any LLM or network calls. All operations are local and deterministic.
- **Memory**: The ToolPreferenceTable and PhaseGuidanceTable are static constants. RoutingContext is constructed per tool array build (typically once per task).
- **Backward compatibility**: When `enabled` is `false`, the router is not invoked. Zero overhead.

## File Change Summary

| File | Change Type | Description |
|------|------------|-------------|
| `packages/types/src/global-settings.ts` | Modify | Add `toolRouting` section to `globalSettingsSchema` |
| `packages/types/src/loop-detection.ts` | No change | Router consumes `executionPhase` but doesn't modify types |
| `src/core/prompts/tools/tool-router.ts` | Create | Core router: `routeIntent()`, `ToolPreferenceTable`, `RoutingContext`, `ToolRecommendation` |
| `src/core/prompts/tools/tool-routing-guidance.ts` | Create | Guidance generation: `getToolRoutingSection()`, `buildRoutingGuidance()` |
| `src/core/prompts/tools/index.ts` | Modify | Export new router functions |
| `src/core/prompts/sections/tool-use.ts` | Modify | Accept optional `routingGuidance`, inject `TOOL ROUTING` section |
| `src/core/prompts/sections/tool-use-guidelines.ts` | Modify | Accept optional `routingGuidance`, inject routing guidelines |
| `src/core/task/build-tools.ts` | Modify | Add `routingContext` to `BuildToolsOptions`, invoke router, store guidance |
| `src/core/prompts/tools/__tests__/tool-router.spec.ts` | Create | Unit tests for router determinism, preference table, context handling |
| `src/core/prompts/tools/__tests__/tool-routing-guidance.spec.ts` | Create | Unit tests for guidance generation |
| `src/core/task/__tests__/build-tools-routing.spec.ts` | Create | Integration tests for routing in tool array building |
