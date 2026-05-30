# Requirements: Disable Internal Tools

## Overview

Add a new **Tools** section to the Settings window that gives users total control over which Roo internal tools are enabled. Users will see checkboxes for every Roo internal tool and can uncheck any tool to disable it globally. This leverages the existing `disabledTools` backend infrastructure while providing a first-ever UI for it.

## Background

The backend already fully supports disabling internal tools:

- The [`disabledTools`](../../packages/types/src/global-settings.ts:233) field is defined in the global settings schema as `z.array(toolNamesSchema).optional()`
- Tool filtering in [`filter-tools-for-mode.ts`](../../src/core/prompts/tools/filter-tools-for-mode.ts:300) removes tools listed in `disabledTools` from the prompt
- Execution-time validation in [`validateToolUse.ts`](../../src/core/tools/validateToolUse.ts:133) blocks disabled tools even if they bypass filtering
- The [`ClineProvider`](../../src/core/webview/ClineProvider.ts:2050) already persists `disabledTools` state

However, **no UI exists** — users currently have no way to set `disabledTools` from the settings window. The webview has zero references to `disabledTools`.

## Functional Requirements

### FR-1: New Tools Section in Settings

- Add a new section named `tools` to the settings sidebar tab list
- Use a **wrench icon** (lucide `Wrench`) as the section icon
- The section must appear in the [`sectionNames`](../../webview-ui/src/components/settings/SettingsView.tsx:98) array and the [`sections`](../../webview-ui/src/components/settings/SettingsView.tsx:496) icon array
- Position the section logically — after `modes` and before `autoApprove` in the tab order

### FR-2: Tool Checkbox List

- Display all 24 Roo internal tools as checkboxes in a scrollable list
- Each checkbox shows the tool's human-readable display name from [`TOOL_DISPLAY_NAMES`](../../src/shared/tools.ts:275)
- Checked = tool is **enabled** (not in `disabledTools`); unchecked = tool is **disabled** (in `disabledTools`)
- Group tools by their tool group (read, edit, command, mcp, modes) with group headers for visual organization
- Always-available tools (ask_followup_question, attempt_completion, etc.) should appear in a separate "Always Available" group

### FR-3: Tool Group Layout

Organize tools into the following groups matching [`TOOL_GROUPS`](../../src/shared/tools.ts:304):

| Group | Tools |
|-------|-------|
| **Read** | read_file, search_files, list_files, codebase_search |
| **Edit** | apply_diff, write_to_file, generate_image, edit, search_replace, edit_file, apply_patch |
| **Command** | execute_command, read_command_output |
| **MCP** | use_mcp_tool, access_mcp_resource |
| **Modes** | switch_mode, new_task, async_task |
| **Always Available** | ask_followup_question, attempt_completion, update_todo_list, run_slash_command, skill |

### FR-4: State Management

- Bind checkbox state to `cachedState.disabledTools` following the existing Settings View pattern (inputs bind to `cachedState`, not live `useExtensionState()`)
- When a checkbox is unchecked, add the tool name to the `disabledTools` array via `setCachedStateField`
- When a checkbox is checked, remove the tool name from the `disabledTools` array via `setCachedStateField`
- Changes must trigger the unsaved-changes detection mechanism (set `isChangeDetected`)
- On Save, the `disabledTools` array is persisted through the existing save flow

### FR-5: Search Integration

- Each tool checkbox must be wrapped in a [`SearchableSetting`](../../webview-ui/src/components/settings/SearchableSetting.tsx) component so it appears in the settings search index
- The search label for each tool should be its display name

### FR-6: Warning for Critical Tools

- Show a visual warning indicator next to `attempt_completion` and `ask_followup_question` — disabling these may significantly degrade Roo's ability to function
- The warning should be a small info text below these tools explaining the impact

### FR-7: i18n Support

- Add translation keys for the new section:
  - `settings:sections.tools` — section tab label
  - `settings:tools.description` — section description
  - `settings:tools.group.read`, `settings:tools.group.edit`, etc. — group headers
  - `settings:tools.group.alwaysAvailable` — always available group header
  - `settings:tools.warning.critical` — warning text for critical tools
  - Tool display names should reuse existing `TOOL_DISPLAY_NAMES` values or use i18n keys like `settings:tools.tool.read_file`

## Non-Functional Requirements

### NFR-1: Consistency

- The new section must follow the exact same patterns as existing settings sections (e.g., [`TerminalSettings`](../../webview-ui/src/components/settings/TerminalSettings.tsx), [`NotificationSettings`](../../webview-ui/src/components/settings/NotificationSettings.tsx))
- Use the same `SectionHeader`, `Section`, `SearchableSetting`, and `VSCodeCheckbox` components

### NFR-2: Performance

- The tool list is static (24 items) — no performance concerns
- No unnecessary re-renders; use React.memo where appropriate

### NFR-3: Accessibility

- All checkboxes must have proper aria labels
- Keyboard navigation must work within the section

### NFR-4: Test Coverage

- Unit tests for the new `ToolsSettings` component
- Test that checking/unchecking tools correctly updates `disabledTools` in cached state
- Test that the section renders all 24 tools

## Out of Scope

- Disabling MCP tools per-server (that already exists in the MCP section)
- Per-mode tool disabling (that's handled by the Modes section)
- Custom tool disabling (custom tools are experimental and managed separately)
- Tool alias resolution in the UI (aliases like `write_file` → `write_to_file` are handled backend-side)

## Dependencies

- Existing `disabledTools` schema and backend logic (already in place)
- [`toolNames`](../../packages/types/src/tool.ts:24) and [`TOOL_DISPLAY_NAMES`](../../src/shared/tools.ts:275) for the tool catalog
- [`TOOL_GROUPS`](../../src/shared/tools.ts:304) and [`ALWAYS_AVAILABLE_TOOLS`](../../src/shared/tools.ts:325) for grouping
- Settings View infrastructure (SectionHeader, Section, SearchableSetting, cachedState pattern)