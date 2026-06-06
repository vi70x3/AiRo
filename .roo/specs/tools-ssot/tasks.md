# Tasks: Tools Single Source of Truth (SSOT)

## Phase 1: i18n Preparation

- [ ] **T1.1**: Add new i18n keys to `webview-ui/src/i18n/locales/en/settings.json`
  - Add `settings:tools.autoApprove.*` keys (header, description, enabled, mode switching, read, write, MCP, execute, followup, subtasks, max limits)
  - Add `settings:tools.imageGeneration.*` keys (header, provider, API key, model, status messages)
  - Add `settings:tools.customTools.*` keys (header, description, refresh, tools list, parameters)
  - Add `settings:tools.slashCommands.*` keys (header, description, add command, workspace/global sections, delete dialog)
  - Keep old keys for backwards compatibility (do not delete yet)

## Phase 2: Expand ToolsSettings Component

- [ ] **T2.1**: Update `ToolsSettingsProps` type in `ToolsSettings.tsx`
  - Add all auto-approve state fields as optional props
  - Add image generation state fields as optional props
  - Add `experiments` and `setExperimentEnabled` props
  - Add `commands` and `cwd` props for slash commands
  - Expand `SetCachedStateField` union type to cover all new fields

- [ ] **T2.2**: Add Auto-Approve section to `ToolsSettings.tsx`
  - Import `AutoApproveToggle`, `MaxLimitInputs` components
  - Import `useAutoApprovalToggles` hook
  - Add section header using new i18n key
  - Add master auto-approval enable/disable toggle
  - Add mode switching enabled toggle
  - Add `AutoApproveToggle` component for the toggle button row
  - Add conditional sub-toggles for read-only (outside workspace)
  - Add conditional sub-toggles for write (outside workspace, protected files)
  - Add conditional follow-up questions timeout slider
  - Add conditional allowed commands input/list
  - Add `MaxLimitInputs` for max requests and max cost
  - Wire all toggles to `setCachedStateField` with correct field names

- [ ] **T2.3**: Add Image Generation section to `ToolsSettings.tsx`
  - Import `ImageGenerationSettings` component
  - Import `ImageGenerationProvider` type
  - Add section header using new i18n key
  - Render `ImageGenerationSettings` with all required props
  - Wire `setImageGenerationProvider`, `setOpenRouterImageApiKey`, `setImageGenerationSelectedModel` through `setCachedStateField`

- [ ] **T2.4**: Add Custom Tools section to `ToolsSettings.tsx`
  - Import `CustomToolsSettings` component
  - Add section header using new i18n key
  - Render `CustomToolsSettings` with `enabled` and `onChange` props
  - Wire `onChange` to `setExperimentEnabled(EXPERIMENT_IDS.CUSTOM_TOOLS, enabled)`

- [ ] **T2.5**: Add Slash Commands section to `ToolsSettings.tsx`
  - Import `SlashCommandsSettings` component
  - Add section header using new i18n key
  - Render `SlashCommandsSettings` (it reads `commands` and `cwd` from `useExtensionState()` internally)

## Phase 3: Update SettingsView

- [ ] **T3.1**: Remove Auto-Approve and Slash Commands from navigation
  - Remove `"autoApprove"` from `sectionNames` array
  - Remove `"slashCommands"` from `sectionNames` array
  - Remove corresponding entries from `sections` array
  - Remove `AutoApproveSettings` import
  - Remove `SlashCommandsSettings` import

- [ ] **T3.2**: Pass new props to `ToolsSettings`
  - Add all auto-approve state destructuring from `cachedState` (if not already present)
  - Pass `alwaysAllowReadOnly`, `alwaysAllowReadOnlyOutsideWorkspace`, `alwaysAllowWrite`, `alwaysAllowWriteOutsideWorkspace`, `alwaysAllowWriteProtected`, `alwaysAllowMcp`, `alwaysAllowModeSwitch`, `alwaysAllowSubtasks`, `alwaysAllowExecute`, `alwaysAllowFollowupQuestions`, `modeSwitchingEnabled`, `followupAutoApproveTimeoutMs`, `allowedCommands`, `allowedMaxRequests`, `allowedMaxCost`
  - Pass `imageGenerationProvider`, `openRouterImageApiKey`, `openRouterImageGenerationSelectedModel`
  - Pass `experiments`, `setExperimentEnabled`
  - Pass `setImageGenerationProvider`, `setOpenRouterImageApiKey`, `setImageGenerationSelectedModel` (wrapped via setCachedStateField or as separate setters)

- [ ] **T3.3**: Remove Auto-Approve render block
  - Delete `{renderTab === "autoApprove" && (<AutoApproveSettings .../>)}` block

- [ ] **T3.4**: Remove Slash Commands render block
  - Delete `{renderTab === "slashCommands" && (<SlashCommandsSettings .../>)}` block

## Phase 4: Slim Down Experimental Settings

- [ ] **T4.1**: Remove image generation from `ExperimentalSettings.tsx`
  - Remove the `IMAGE_GENERATION` experiment branch (the `if (config[0] === "IMAGE_GENERATION" ...)` block)
  - Remove `ImageGenerationSettings` import
  - Remove image generation-related props from `ExperimentalSettingsProps`

- [ ] **T4.2**: Remove custom tools from `ExperimentalSettings.tsx`
  - Remove the `CUSTOM_TOOLS` experiment branch (the `if (config[0] === "CUSTOM_TOOLS" ...)` block)
  - Remove `CustomToolsSettings` import
  - Remove custom tools-related props from `ExperimentalSettingsProps`

## Phase 5: Testing & Validation

- [ ] **T5.1**: Run existing test suite
  - `cd webview-ui && npx vitest run` — all tests should pass
  - Update any tests that reference the old tab structure (e.g., tests looking for autoApprove tab)

- [ ] **T5.2**: Manual verification
  - Open Settings → verify Tools tab shows all sections
  - Verify no Auto-Approve or Slash Commands tab in sidebar
  - Verify Experimental tab no longer shows Image Generation or Custom Tools
  - Toggle each setting → click Save → reopen Settings → verify persistence
  - Test conditional sub-toggles (enable read → verify outside-workspace appears)
  - Test command add/remove in allowed commands
  - Test slash command create/edit/delete
  - Test image generation provider/model/API key flow

- [ ] **T5.3**: Run lint
  - `cd webview-ui && npx eslint src/components/settings/` — zero errors
