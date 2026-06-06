# Requirements: Tools Single Source of Truth (SSOT)

## Overview

Consolidate all tool-related settings into the **Tools** tab, making it the single source of truth for tool configuration. This removes the Auto-Approve tab entirely and moves relevant settings from the Experimental and Slash Commands tabs into Tools.

## Problem Statement

Currently, tool-related settings are scattered across multiple tabs:
- **Tools tab**: Only manages `disabledTools` (which internal tools are enabled/disabled)
- **Auto-Approve tab**: Contains mode switching, async subtasks, read/write/MCP/execute/followup auto-approve toggles
- **Experimental tab**: Contains AI image generation and custom tools settings
- **Slash Commands tab**: Contains model-initiated slash command management

This fragmentation makes it hard for users to find and configure tool-related behavior in one place.

## Requirements

### FR-1: Remove Auto-Approve Tab
- **FR-1.1**: The Auto-Approve tab must be removed from the settings navigation sidebar
- **FR-1.2**: The `autoApprove` entry must be removed from the `sections` array and `sectionNames` in `SettingsView.tsx`
- **FR-1.3**: The `AutoApproveSettings` component import and render block must be removed from `SettingsView.tsx`
- **FR-1.4**: All state fields previously managed by AutoApprove must still be functional (moved to Tools, see FR-2)

### FR-2: Move Auto-Approve Settings to Tools Tab
- **FR-2.1**: All auto-approve toggles from `AutoApproveSettings.tsx` must be available within the Tools tab:
  - `alwaysAllowReadOnly` — Auto-approve read-only operations
  - `alwaysAllowReadOnlyOutsideWorkspace` — Auto-approve read-only outside workspace (sub-toggle of read-only)
  - `alwaysAllowWrite` — Auto-approve write operations
  - `alwaysAllowWriteOutsideWorkspace` — Auto-approve writes outside workspace (sub-toggle of write)
  - `alwaysAllowWriteProtected` — Auto-approve writes to protected files (sub-toggle of write)
  - `alwaysAllowMcp` — Auto-approve MCP tool usage
  - `alwaysAllowModeSwitch` — Auto-approve mode switching
  - `alwaysAllowSubtasks` — Auto-approve async subtasks
  - `alwaysAllowExecute` — Auto-approve command execution
  - `alwaysAllowFollowupQuestions` — Auto-approve follow-up questions
  - `modeSwitchingEnabled` — Enable/disable mode switching capability
  - `followupAutoApproveTimeoutMs` — Timeout for follow-up auto-approval
  - `allowedCommands` — List of allowed commands (when execute is enabled)
  - `allowedMaxRequests` — Max requests limit
  - `allowedMaxCost` — Max cost limit
- **FR-2.2**: The `ToolsSettings` component must accept all the above as props via `setCachedStateField`
- **FR-2.3**: The conditional sub-toggle behavior must be preserved (e.g., `alwaysAllowReadOnlyOutsideWorkspace` only shows when `alwaysAllowReadOnly` is enabled)
- **FR-2.4**: The auto-approval enable/disable master toggle must be included
- **FR-2.5**: The command input/add/remove functionality for `allowedCommands` must be preserved

### FR-3: Move AI Image Generation to Tools Tab
- **FR-3.1**: The image generation settings from `ExperimentalSettings.tsx` / `ImageGenerationSettings.tsx` must be available within the Tools tab
- **FR-3.2**: The following state fields must be managed in Tools:
  - `imageGenerationProvider` — Provider selection (e.g., OpenRouter)
  - `openRouterImageApiKey` — API key for OpenRouter
  - `openRouterImageGenerationSelectedModel` — Selected model
- **FR-3.3**: The `ImageGenerationSettings` component must be removed from `ExperimentalSettings.tsx`
- **FR-3.4**: The experiment toggle for `IMAGE_GENERATION` must be removed from the experimental config map

### FR-4: Move Custom Tools to Tools Tab
- **FR-4.1**: The custom tools settings from `ExperimentalSettings.tsx` / `CustomToolsSettings.tsx` must be available within the Tools tab
- **FR-4.2**: The `CustomToolsSettings` component must be removed from `ExperimentalSettings.tsx`
- **FR-4.3**: The experiment toggle for `CUSTOM_TOOLS` must be removed from the experimental config map

### FR-5: Move Slash Commands to Tools Tab
- **FR-5.1**: The slash commands management from `SlashCommandsSettings.tsx` must be available within the Tools tab
- **FR-5.2**: The `slashCommands` entry must be removed from the `sections` array and `sectionNames` in `SettingsView.tsx`
- **FR-5.3**: The `SlashCommandsSettings` component import and render block must be removed from `SettingsView.tsx`
- **FR-5.4**: All slash command functionality must be preserved (list, create, edit, delete, refresh, project vs global grouping)

### FR-6: Tools Tab Organization
- **FR-6.1**: The Tools tab must present settings in clearly labeled sections/groups
- **FR-6.2**: The existing tool enable/disable groups (read, edit, browser, MCP, etc.) must remain at the top
- **FR-6.3**: Auto-approve settings must be grouped together within the Tools tab
- **FR-6.4**: Image generation, custom tools, and slash commands must each have their own clearly delineated sections
- **FR-6.5**: The tab must be scrollable to accommodate all consolidated settings

### FR-7: i18n Updates
- **FR-7.1**: All i18n keys must be updated to reflect the new organization
- **FR-7.2**: Section headers for the Tools tab sub-sections must be added
- **FR-7.3**: The `sections.autoApprove` key can be deprecated (keys kept for backwards compat but unused)
- **FR-7.4**: New keys for Tools sub-sections must be added (e.g., `settings:tools.autoApprove.*`, `settings:tools.imageGeneration.*`, `settings:tools.customTools.*`, `settings:tools.slashCommands.*`)

### FR-8: State Management
- **FR-8.1**: The `handleSubmit` function in `SettingsView.tsx` must continue to send all settings via the `updateSettings` message
- **FR-8.2**: No backend changes are required — this is purely a UI reorganization
- **FR-8.3**: The `SetCachedStateField` type must be extended to cover all moved state fields

## Out of Scope
- Changes to the backend/extension host handling of these settings
- Changes to the actual behavior of any tool or auto-approve feature
- Changes to the Modes tab or any non-tool-related tab
- Removal of the `AutoApproveSettings.tsx`, `ImageGenerationSettings.tsx`, `CustomToolsSettings.tsx`, or `SlashCommandsSettings.tsx` files (they can be kept as source files, just not rendered in their old locations)

## Acceptance Criteria
1. Settings sidebar has no "Auto-Approve" or "Slash Commands" tab
2. Experimental tab no longer shows "Image Generation" or "Custom Tools" experiments
3. Tools tab contains all previously scattered tool-related settings
4. All toggles, inputs, and functionality work identically to before
5. All existing tests pass (or are updated to reflect new DOM structure)
6. No regression in settings save/load behavior
