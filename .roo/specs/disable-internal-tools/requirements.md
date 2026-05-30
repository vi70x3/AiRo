# Requirements: Dynamic System Prompt Tool Instruction Removal

## Feature Name
`disable-internal-tools` — Extend the disabled-tools feature to dynamically strip tool-specific prompt instructions from the system prompt when tools are disabled.

## Problem Statement

When a user disables tools via the `disabledTools` setting, [`filterNativeToolsForMode()`](src/core/prompts/tools/filter-tools-for-mode.ts:225) correctly removes the tool **definitions** from the API call — but the system prompt still contains references to those disabled tools across multiple sections. This creates two problems:

1. **Token waste**: Every mention of a disabled tool in the system prompt consumes tokens that provide zero value since the model cannot use those tools.
2. **Model confusion**: The model sees instructions describing tools it cannot actually invoke, which can lead to attempted calls that fail or suboptimal behavior where the model references unavailable capabilities in its reasoning.

### Current Affected Prompt Sections

| Section | File | Tool References |
|---------|------|-----------------|
| CAPABILITIES | [`getCapabilitiesSection()`](src/core/prompts/sections/capabilities.ts:3) | Explicit mentions of `execute_command`, `list_files`; entire paragraphs dedicated to specific tools |
| Tool Use Guidelines | [`getToolUseGuidelinesSection()`](src/core/prompts/sections/tool-use-guidelines.ts:1) | Example referencing `list_files` tool |
| Shared Tool Use | [`getSharedToolUseSection()`](src/core/prompts/sections/tool-use.ts:1) | Generic — no specific tool names, but still relevant context |
| Response Messages | [`formatResponse.noToolsUsed()`](src/core/prompts/responses.ts:42) | References `attempt_completion` and `ask_followup_question` tools |
| Response Messages | [`formatResponse.missingToolParameterError()`](src/core/prompts/responses.ts:57) | Includes tool use reminder |
| Mode baseInstructions | [`getModeSelection()`](src/shared/modes.ts:150) | May reference specific tools in mode-specific instructions |
| Custom Instructions | [`addCustomInstructions()`](src/core/prompts/sections/custom-instructions.ts:382) | User-written instructions may reference tools |

### Existing Precedent

There is already a pattern for dynamic prompt content removal in [`generatePrompt()`](src/core/prompts/system.ts:68) — when the `asyncSubtasks` experiment is disabled, the `async_task` bullet point is stripped from orchestrator mode's `baseInstructions` via regex replacement. This proves the architecture supports dynamic prompt trimming.

## Requirements

### R1: Capabilities Section — Tool-Aware Paragraph Removal
When a tool is disabled, the corresponding tool-specific paragraph in the CAPABILITIES section must be removed or replaced with a neutral alternative. Specifically:

- **R1.1**: If `execute_command` is disabled, remove the entire paragraph starting with "You can use the execute_command tool..."
- **R1.2**: If `list_files` is disabled, remove the `list_files` references from the workspace directory bullet point, replacing them with a generic "you can explore directories" phrasing
- **R1.3**: The opening capabilities summary line ("tools that let you execute CLI commands, list files, view source code definitions, regex search, read and write files, and ask follow-up questions") must be dynamically composed to only list actually-available tool categories

### R2: Tool Use Guidelines — Dynamic Example Selection
- **R2.1**: The example in [`getToolUseGuidelinesSection()`](src/core/prompts/sections/tool-use-guidelines.ts:1) that references `list_files` must be replaced with an example that references an actually-available tool when `list_files` is disabled
- **R2.2**: If no suitable alternative tool exists for the example, the example sentence should be removed entirely

### R3: Response Messages — Tool-Aware Next Steps
- **R3.1**: [`formatResponse.noToolsUsed()`](src/core/prompts/responses.ts:42) currently says "If you have completed the user's task, use the `attempt_completion` tool" and "If you require additional information from the user, use the `ask_followup_question` tool". These references must be conditionally included based on whether those tools are available
- **R3.2**: If both `attempt_completion` and `ask_followup_question` are disabled, the "Next Steps" section should provide a generic fallback instruction

### R4: Mode baseInstructions — Tool Reference Stripping
- **R4.1**: Mode `baseInstructions` that reference disabled tools by name should have those references removed or replaced, following the same pattern as the existing `async_task` removal in [`generatePrompt()`](src/core/prompts/system.ts:68)
- **R4.2**: This must work for all built-in modes and custom modes

### R5: Custom Instructions — No Automatic Modification
- **R5.1**: User-written custom instructions must NOT be automatically modified. These are intentional user content and stripping tool references from them could remove important context
- **R5.2**: Instead, if custom instructions reference disabled tools, a brief disclaimer should be appended noting that some referenced tools may be disabled in the current session

### R6: Shared Tool Use Section — Conditional Inclusion
- **R6.1**: [`getSharedToolUseSection()`](src/core/prompts/sections/tool-use.ts:1) is generic and does not reference specific tools, so it should always be included regardless of which tools are disabled
- **R6.2**: However, if ALL tools are disabled, the entire TOOL USE section becomes meaningless and should be replaced with a minimal statement

### R7: Settings Propagation
- **R7.1**: The `disabledTools` setting must be propagated to all prompt section generators that need it, via the existing `settings` parameter in [`generatePrompt()`](src/core/prompts/system.ts:41)
- **R7.2**: The `disabledTools` list must be resolved through [`resolveToolAlias()`](src/core/prompts/tools/filter-tools-for-mode.ts:96) so that disabling a legacy alias also triggers prompt instruction removal for the canonical tool

### R8: MCP Tool Prompt Instructions
- **R8.1**: When MCP tools are disabled via `enabledForPrompt: false`, their descriptions should already be filtered by [`filterMcpToolsForMode()`](src/core/prompts/tools/filter-tools-for-mode.ts:476). No additional system prompt changes are needed for MCP tools since they don't have dedicated prompt sections

### R9: Backward Compatibility
- **R9.1**: When no tools are disabled, the system prompt must be identical to the current output — no behavioral change
- **R9.2**: The feature must be purely additive: it only removes content when tools are disabled, never adds new content that wasn't there before

### R10: Test Coverage
- **R10.1**: Unit tests must cover each prompt section generator with various disabled tool combinations
- **R10.2**: Integration tests must verify the full system prompt output with disabled tools matches expectations
- **R10.3**: Edge cases must be tested: all tools disabled, critical tools disabled, alias-based disabling

## Out of Scope

- Modifying the tool definitions themselves — that is already handled by [`filterNativeToolsForMode()`](src/core/prompts/tools/filter-tools-for-mode.ts:225)
- Modifying user-written custom instructions content — only a disclaimer may be appended
- Changing the UI for tool disabling — the [`ToolsSettings`](webview-ui/src/components/settings/ToolsSettings.tsx:24) component remains unchanged
- MCP tool prompt sections — these are already handled by the MCP filtering pipeline

## Dependencies

- Existing `disabledTools` setting in `SystemPromptSettings`
- Existing [`resolveToolAlias()`](src/core/prompts/tools/filter-tools-for-mode.ts:96) for alias resolution
- Existing `settings` parameter propagation through [`generatePrompt()`](src/core/prompts/system.ts:41) → section generators

## Success Metrics

- Token count reduction proportional to the number of disabled tools and their prompt instruction footprint
- No model attempts to invoke disabled tools after the change
- Zero behavioral change when no tools are disabled