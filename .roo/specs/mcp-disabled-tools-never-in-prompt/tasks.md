# Tasks: MCP Disabled Tools Never in Prompt

## Implementation Steps

### 1. Create `getMcpDisabledToolNames()` utility
- [ ] Create `src/core/prompts/tools/mcp-disabled-tools.ts`
- [ ] Implement function that iterates MCP servers and collects disabled tool names in `mcp--serverName--toolName` format
- [ ] Handle edge cases: undefined mcpHub, servers without tools, tools with undefined `enabledForPrompt`
- [ ] Export from `src/core/prompts/tools/native-tools/index.ts`

### 2. Write unit tests for `getMcpDisabledToolNames()`
- [ ] Create `src/core/prompts/tools/__tests__/mcp-disabled-tools.spec.ts`
- [ ] Test: returns empty array when mcpHub is undefined
- [ ] Test: returns empty array when no servers exist
- [ ] Test: collects names only from tools with `enabledForPrompt === false`
- [ ] Test: skips tools with `enabledForPrompt` undefined (treated as enabled)
- [ ] Test: handles multiple servers with mixed enabled/disabled tools
- [ ] Test: formats names correctly as `mcp--serverName--toolName`

### 3. Update `system.ts` to merge MCP disabled tools
- [ ] Import `getMcpDisabledToolNames` in `src/core/prompts/system.ts`
- [ ] In `generatePrompt()`, collect MCP disabled tool names from `mcpHub`
- [ ] Merge native `disabledTools` and MCP disabled tools into single array
- [ ] Pass merged array to `ToolAvailabilityContext` constructor

### 4. Update `build-tools.ts` to merge MCP disabled tools
- [ ] Import `getMcpDisabledToolNames` in `src/core/task/build-tools.ts`
- [ ] In `buildNativeToolsArrayWithRestrictions()`, collect MCP disabled tool names
- [ ] Merge into `filterSettings.disabledTools`

### 5. Update `strip-tool-references.ts` for MCP tool names
- [ ] Add MCP tool name stripping logic in `stripDisabledToolReferences()`
- [ ] For disabled tool names starting with `mcp--`, use dynamic regex to strip lines containing backtick-wrapped references
- [ ] Reuse existing `regexEscape` helper or import from `disabled-tools-disclaimer.ts`

### 6. Write unit tests for MCP tool reference stripping
- [ ] Add tests to `src/core/prompts/tools/__tests__/strip-tool-references.spec.ts`
- [ ] Test: strips lines containing disabled MCP tool names in backticks
- [ ] Test: preserves lines containing enabled MCP tool names
- [ ] Test: handles multiple disabled MCP tools in same text
- [ ] Test: works alongside native tool stripping

### 7. Verify `disabled-tools-disclaimer.ts` handles MCP tool names
- [ ] Add tests to existing test file for `generateDisabledToolsDisclaimer`
- [ ] Test: detects MCP tool name references in custom instructions text
- [ ] Test: generates disclaimer listing MCP disabled tools
- [ ] Test: works with mix of native and MCP disabled tools

### 8. Update `capabilities.ts` to hide fully-disabled MCP servers
- [ ] Add `hasAnyMcpToolsAvailable()` helper function
- [ ] Update MCP section condition to check for available tools (not just server existence)
- [ ] When all MCP tools on all servers are disabled, omit the MCP access message

### 9. Write unit tests for capabilities section MCP changes
- [ ] Add tests to `src/core/prompts/sections/__tests__/capabilities-tool-aware.spec.ts`
- [ ] Test: omits MCP section when all MCP tools are disabled
- [ ] Test: shows MCP section when at least one MCP tool is enabled
- [ ] Test: shows MCP section when mcpHub is provided with servers but no disabled tools

### 10. Add defensive filtering in `filterMcpToolsForMode()`
- [ ] Add optional `mcpHub` parameter to `filterMcpToolsForMode()`
- [ ] Filter out disabled MCP tools using `getMcpDisabledToolNames()`
- [ ] Update call site in `build-tools.ts` to pass `mcpHub`

### 11. Write unit tests for defensive MCP filtering
- [ ] Add tests to `src/core/prompts/tools/__tests__/filter-tools-for-mode.spec.ts`
- [ ] Test: filters out disabled MCP tools in `filterMcpToolsForMode`
- [ ] Test: returns all MCP tools when none are disabled
- [ ] Test: returns empty array when `use_mcp_tool` is not allowed (unchanged behavior)

### 12. Integration: Update system prompt tests
- [ ] Update snapshot tests in `src/core/prompts/__tests__/` if needed
- [ ] Add integration test: system prompt with disabled MCP tools does not contain those tool names
- [ ] Verify `ToolAvailabilityContext` correctly reports MCP tool availability

### 13. Run all tests and fix any failures
- [ ] Run `npx vitest run` for affected test files
- [ ] Fix any test failures
- [ ] Ensure no regressions in existing tests
