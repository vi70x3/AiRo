# Requirements: MCP Disabled Tools Never in Prompt

## Overview

MCP tools disabled via per-server `disabledTools` configuration must never be visible to the LLM. This includes both the tool definitions array AND all system prompt text. The LLM should have no way of knowing these tools exist.

## Problem Statement

Currently, MCP tools disabled via per-server `disabledTools` config are filtered from the tool definitions array by `getMcpServerTools()` (via `enabledForPrompt === false`). However, the `ToolAvailabilityContext` used for prompt text generation only receives `settings.disabledTools` (native tool names), NOT the per-server MCP disabled tool names. This means:

1. MCP disabled tool names are not stripped from mode baseInstructions or custom instructions
2. The capabilities section may advertise MCP access even when all MCP tools on a server are disabled
3. The `stripDisabledToolReferences` function has no patterns for MCP tool names (e.g., `mcp--serverName--toolName`)
4. The `generateDisabledToolsDisclaimer` won't detect references to MCP disabled tools in custom instructions

## Requirements

### FR-1: Collect Disabled MCP Tool Names

The system must collect the full set of disabled MCP tool names (in their `mcp--serverName--toolName` format) from all connected MCP servers where `enabledForPrompt === false`.

**Acceptance Criteria:**
- When an MCP server has `disabledTools: ["toolA"]`, the name `mcp--serverName--toolA` is collected
- When all MCP tools on a server are enabled, no names are collected from that server
- Works across all connected MCP servers (both global and project-scoped)

### FR-2: Merge Disabled MCP Tools into ToolAvailabilityContext

The collected MCP disabled tool names must be merged into the `ToolAvailabilityContext` alongside native `disabledTools`, so that all prompt text generation is aware of them.

**Acceptance Criteria:**
- `ToolAvailabilityContext.isToolAvailable("mcp--server--tool")` returns `false` for disabled MCP tools
- `ToolAvailabilityContext.isToolDisabled("mcp--server--tool")` returns `true` for disabled MCP tools
- `ToolAvailabilityContext.getDisabledToolNames()` includes disabled MCP tool names
- Native tool disabled status is unaffected

### FR-3: Strip MCP Disabled Tool References from Prompt Text

The `stripDisabledToolReferences` function must also strip references to disabled MCP tool names from mode baseInstructions.

**Acceptance Criteria:**
- Lines referencing disabled MCP tool names (e.g., `` `mcp--server--tool` ``) are removed from baseInstructions
- Existing native tool stripping behavior is unchanged
- No regex pattern collisions between native and MCP tool names

### FR-4: Strip MCP Disabled Tool References from Custom Instructions

The `generateDisabledToolsDisclaimer` must detect references to disabled MCP tool names in custom instructions and generate an appropriate disclaimer.

**Acceptance Criteria:**
- If custom instructions mention a disabled MCP tool name, a disclaimer is generated
- The disclaimer lists all referenced disabled tools (both native and MCP)
- Existing native tool disclaimer behavior is unchanged

### FR-5: Filter Disabled MCP Tools in filterMcpToolsForMode

The `filterMcpToolsForMode` function must also filter out disabled MCP tools as a defensive measure, even though `getMcpServerTools()` already does this.

**Acceptance Criteria:**
- Disabled MCP tools are excluded from the filtered MCP tools array
- Works correctly when `use_mcp_tool` is not allowed in the mode (returns empty array)
- No double-filtering issues

### FR-6: Capabilities Section Hides Fully-Disabled MCP Servers

When ALL tools on an MCP server are disabled, the capabilities section should not advertise that server's existence.

**Acceptance Criteria:**
- If all tools on an MCP server are disabled, no mention of that server appears in the capabilities section
- If at least one tool on an MCP server is enabled, the generic MCP access message is shown
- Existing capabilities section behavior for native tools is unchanged

## Out of Scope

- Changes to the MCP server connection or tool fetching logic
- Changes to the `enabledForPrompt` mechanism in `McpHub.ts`
- Changes to the webview UI for tool management
- Changes to how `settings.disabledTools` (native tools) is populated

## Dependencies

- `src/services/mcp/McpHub.ts` — must expose a method to get disabled tool names
- `src/core/prompts/tools/tool-availability-context.ts` — must accept MCP disabled tools
- `src/core/prompts/tools/filter-tools-for-mode.ts` — must filter disabled MCP tools
- `src/core/prompts/tools/strip-tool-references.ts` — must strip MCP tool references
- `src/core/prompts/tools/disabled-tools-disclaimer.ts` — must detect MCP tool references
- `src/core/prompts/sections/capabilities.ts` — must handle fully-disabled servers
- `src/core/prompts/system.ts` — must pass MCP disabled tools to ToolAvailabilityContext
- `src/core/task/build-tools.ts` — must pass MCP disabled tools through the build pipeline
