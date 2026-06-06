# Design: MCP Disabled Tools Never in Prompt

## Architecture Overview

The fix requires changes across the prompt generation pipeline to ensure MCP disabled tool names are treated identically to native disabled tools in the context of prompt text generation.

```
┌─────────────────────────────────────────────────────────────┐
│                     Data Flow                                │
│                                                              │
│  McpHub.getServers()                                         │
│       │                                                      │
│       ▼                                                      │
│  getMcpDisabledToolNames(mcpHub)  ← NEW                      │
│       │  collects mcp--server--tool names                    │
│       │  where enabledForPrompt === false                    │
│       ▼                                                      │
│  system.ts / build-tools.ts                                  │
│       │  merges native disabledTools + MCP disabled tools    │
│       ▼                                                      │
│  ToolAvailabilityContext                                     │
│       │  isToolAvailable("mcp--server--tool") → false        │
│       │  isToolDisabled("mcp--server--tool") → true          │
│       │  getDisabledToolNames() → includes MCP names         │
│       ▼                                                      │
│  ┌──────────────────────────────────────────────────┐        │
│  │  Prompt Text Generation                           │        │
│  │                                                    │        │
│  │  stripDisabledToolReferences() ← strips MCP refs  │        │
│  │  generateDisabledToolsDisclaimer() ← detects MCP  │        │
│  │  getCapabilitiesSection() ← hides disabled servers│        │
│  └──────────────────────────────────────────────────┘        │
│       │                                                      │
│       ▼                                                      │
│  LLM never sees disabled MCP tool names                      │
└─────────────────────────────────────────────────────────────┘
```

## Component Changes

### 1. New Utility: `getMcpDisabledToolNames()`

**File:** `src/core/prompts/tools/mcp-disabled-tools.ts` (new)

A pure function that iterates over MCP servers and collects disabled tool names in `mcp--serverName--toolName` format.

```typescript
export function getMcpDisabledToolNames(mcpHub?: McpHub): string[] {
    if (!mcpHub) return []
    const servers = mcpHub.getServers()
    const disabledNames: string[] = []
    for (const server of servers) {
        if (!server.tools) continue
        for (const tool of server.tools) {
            if (tool.enabledForPrompt === false) {
                disabledNames.push(buildMcpToolName(server.name, tool.name))
            }
        }
    }
    return disabledNames
}
```

### 2. `ToolAvailabilityContext` — Accept MCP Disabled Tools

**File:** `src/core/prompts/tools/tool-availability-context.ts`

No changes needed to the class itself. The constructor already accepts any `string[]`. The caller just needs to pass the merged list.

### 3. `system.ts` — Merge MCP Disabled Tools

**File:** `src/core/prompts/system.ts`

In `generatePrompt()`, collect MCP disabled tool names and merge them into the `ToolAvailabilityContext`:

```typescript
// Collect disabled MCP tool names
const mcpDisabledTools = getMcpDisabledToolNames(mcpHub)
const allDisabledTools = [...(settings?.disabledTools ?? []), ...mcpDisabledTools]
const toolContext = new ToolAvailabilityContext(allDisabledTools)
```

### 4. `build-tools.ts` — Merge MCP Disabled Tools for Tool Filtering

**File:** `src/core/task/build-tools.ts`

In `buildNativeToolsArrayWithRestrictions()`, merge MCP disabled tools into `filterSettings`:

```typescript
const mcpDisabledTools = getMcpDisabledToolNames(mcpHub)
const filterSettings = {
    todoListEnabled: apiConfiguration?.todoListEnabled ?? true,
    disabledTools: [...(disabledTools ?? []), ...mcpDisabledTools],
    modelInfo,
}
```

### 5. `strip-tool-references.ts` — Strip MCP Tool References

**File:** `src/core/prompts/tools/strip-tool-references.ts`

Add a catch-all pattern for MCP tool names (format: `mcp--serverName--toolName`) that runs after the named patterns:

```typescript
// MCP tool references (format: mcp--serverName--toolName)
const MCP_TOOL_PATTERN = /^[^\n]*`mcp--[^`]+--[^`]+`[^\n]*(?:\r?\n|$)/gm

// In stripDisabledToolReferences(), after the named pattern loop:
for (const toolName of toolContext.getDisabledToolNames()) {
    if (toolName.startsWith("mcp--")) {
        const escaped = regexEscape(toolName)
        result = result.replace(new RegExp(`^[^\n]*\`${escaped}\`[^\n]*(?:\r?\n|$)`, "gm"), "")
    }
}
```

### 6. `disabled-tools-disclaimer.ts` — Detect MCP Tool References

**File:** `src/core/prompts/tools/disabled-tools-disclaimer.ts`

No changes needed. The existing word-boundary matching (`\b`) already works for MCP tool names like `mcp--server--tool` since `--` and `-` are non-word characters. However, we should verify and potentially use a more specific pattern for MCP tool names.

**Verification needed:** The `\b` word boundary in regex matches at positions between word characters (`[a-zA-Z0-9_]`) and non-word characters. For `mcp--server--tool`, the `--` creates natural word boundaries. The existing logic should work, but we'll add explicit test coverage.

### 7. `capabilities.ts` — Hide Fully-Disabled MCP Servers

**File:** `src/core/prompts/sections/capabilities.ts`

Add a helper to check if any MCP tools are available (at least one server has at least one enabled tool):

```typescript
function hasAnyMcpToolsAvailable(mcpHub: McpHub): boolean {
    const servers = mcpHub.getServers()
    return servers.some(server =>
        server.tools && server.tools.some(t => t.enabledForPrompt !== false)
    )
}
```

Update the MCP section check:
```typescript
// MCP section — only show if there are available MCP tools
if (mcpHub && hasAnyMcpToolsAvailable(mcpHub)) {
    section += `\n- You have access to MCP servers that may provide additional tools and resources. ...`
}
```

### 8. `filter-tools-for-mode.ts` — Defensive Filtering

**File:** `src/core/prompts/tools/filter-tools-for-mode.ts`

In `filterMcpToolsForMode()`, add defensive filtering for disabled MCP tools:

```typescript
export function filterMcpToolsForMode(
    mcpTools: OpenAI.Chat.ChatCompletionTool[],
    mode: string | undefined,
    customModes: ModeConfig[] | undefined,
    experiments: Record<string, boolean> | undefined,
    mcpHub?: McpHub,  // NEW optional parameter
): OpenAI.Chat.ChatCompletionTool[] {
    // ... existing mode check ...

    // Defensive: filter out disabled MCP tools
    if (mcpHub) {
        const disabledNames = new Set(getMcpDisabledToolNames(mcpHub))
        return mcpTools.filter(t => {
            if ("function" in t && t.function) {
                return !disabledNames.has(t.function.name)
            }
            return true
        })
    }

    return mcpTools
}
```

## Data Flow Diagram

```
McpHub
  │
  ├── getServers() → [{ name, tools: [{ name, enabledForPrompt }] }]
  │
  ▼
getMcpDisabledToolNames(mcpHub)
  │  filters tools where enabledForPrompt === false
  │  maps to "mcp--serverName--toolName" format
  │
  ▼
["mcp--jcodemunch--search_symbols", "mcp--playwright--browser_navigate"]
  │
  ├──► system.ts ──► ToolAvailabilityContext([...nativeDisabled, ...mcpDisabled])
  │                    │
  │                    ├──► stripDisabledToolReferences() ──► strips from baseInstructions
  │                    ├──► generateDisabledToolsDisclaimer() ──► detects in custom instructions
  │                    └──► getCapabilitiesSection() ──► hides fully-disabled servers
  │
  └──► build-tools.ts ──► filterSettings.disabledTools
                           │
                           ├──► filterNativeToolsForMode() ──► removes from allowed native tools
                           └──► filterMcpToolsForMode() ──► defensive removal from MCP tools
```

## Edge Cases

1. **All MCP tools disabled on a server**: Capabilities section should not mention MCP access at all
2. **No MCP servers connected**: `getMcpDisabledToolNames()` returns `[]`, no behavior change
3. **MCP server with undefined `tools`**: Safely skipped (existing behavior in `getMcpServerTools`)
4. **MCP tool name collision with native tool name**: Impossible — MCP tools use `mcp--server--tool` format
5. **Tool with `enabledForPrompt` undefined (not explicitly false)**: Treated as enabled (existing behavior)
6. **Both native and MCP disabled tools**: Both are merged into `ToolAvailabilityContext` and handled uniformly

## Testing Strategy

- Unit tests for `getMcpDisabledToolNames()` with various server configurations
- Unit tests for `ToolAvailabilityContext` with MCP tool names
- Unit tests for `stripDisabledToolReferences` with MCP tool name patterns
- Unit tests for `generateDisabledToolsDisclaimer` with MCP tool names
- Unit tests for `filterMcpToolsForMode` with disabled MCP tools
- Unit tests for `getCapabilitiesSection` with fully-disabled MCP servers
- Integration test: end-to-end system prompt generation with disabled MCP tools
- Snapshot tests for system prompt output with MCP disabled tools
