# Design: Tools Single Source of Truth (SSOT)

## Architecture Overview

This is a **purely frontend/UI reorganization**. No backend changes, no new state fields, no new message types. The design moves existing UI components and their state bindings from multiple tabs into the Tools tab.

## Component Changes

### 1. `SettingsView.tsx` — Central Orchestrator

**Changes:**
- Remove `autoApprove` and `slashCommands` from `sectionNames` array and `sections` array
- Remove `AutoApproveSettings` import and render block
- Remove `SlashCommandsSettings` import and render block
- Pass all auto-approve state fields + image generation state fields + custom tools experiment state to `ToolsSettings`
- Pass `experiments` and `setExperimentEnabled` for custom tools toggle to `ToolsSettings`

**New props passed to `ToolsSettings`:**
```typescript
// Existing
disabledTools

// From AutoApprove
alwaysAllowReadOnly
alwaysAllowReadOnlyOutsideWorkspace
alwaysAllowWrite
alwaysAllowWriteOutsideWorkspace
alwaysAllowWriteProtected
alwaysAllowMcp
alwaysAllowModeSwitch
alwaysAllowSubtasks
alwaysAllowExecute
alwaysAllowFollowupQuestions
modeSwitchingEnabled
followupAutoApproveTimeoutMs
allowedCommands
allowedMaxRequests
allowedMaxCost

// From Experimental (Image Generation)
imageGenerationProvider
openRouterImageApiKey
openRouterImageGenerationSelectedModel

// From Experimental (Custom Tools)
experiments
setExperimentEnabled

// From SlashCommands
commands (from extensionState)
cwd (from extensionState)
```

**`handleSubmit`**: No changes needed — all fields are already included in the `updateSettings` message.

### 2. `ToolsSettings.tsx` — Expanded Component

**Current state:** Only renders tool group toggles from `toolGroupConfig`.

**New structure:** The component becomes a multi-section settings panel:

```
ToolsSettings
├── Section: Tool Groups (existing)
│   ├── Read tools
│   ├── Edit tools
│   ├── Browser tools
│   ├── MCP tools
│   └── Command tools
├── Section: Auto-Approve (from AutoApproveSettings)
│   ├── Master toggle (autoApprovalEnabled)
│   ├── Mode switching enabled toggle
│   ├── Toggle buttons (read, write, MCP, mode switch, subtasks, execute, followup)
│   ├── Conditional: read-only sub-toggles
│   ├── Conditional: write sub-toggles
│   ├── Conditional: followup timeout slider
│   ├── Conditional: allowed commands list
│   └── Max limit inputs (requests, cost)
├── Section: Image Generation (from ImageGenerationSettings)
│   ├── Enable/disable checkbox
│   ├── Provider dropdown
│   ├── API key input
│   └── Model selection dropdown
├── Section: Custom Tools (from CustomToolsSettings)
│   ├── Enable/disable checkbox
│   ├── Refresh button
│   └── Tools list
└── Section: Slash Commands (from SlashCommandsSettings)
    ├── Description + Add button
    ├── Project commands list
    ├── Global commands list
    └── Footer
```

**Props type expansion:**
```typescript
type ToolsSettingsProps = HTMLAttributes<HTMLDivElement> & {
  // Existing
  disabledTools?: string[]
  
  // Auto-approve fields
  alwaysAllowReadOnly?: boolean
  alwaysAllowReadOnlyOutsideWorkspace?: boolean
  alwaysAllowWrite?: boolean
  alwaysAllowWriteOutsideWorkspace?: boolean
  alwaysAllowWriteProtected?: boolean
  alwaysAllowMcp?: boolean
  alwaysAllowModeSwitch?: boolean
  alwaysAllowSubtasks?: boolean
  alwaysAllowExecute?: boolean
  alwaysAllowFollowupQuestions?: boolean
  modeSwitchingEnabled?: boolean
  followupAutoApproveTimeoutMs?: number
  allowedCommands?: string[]
  allowedMaxRequests?: number | undefined
  allowedMaxCost?: number | undefined
  
  // Image generation fields
  imageGenerationProvider?: ImageGenerationProvider
  openRouterImageApiKey?: string
  openRouterImageGenerationSelectedModel?: string
  
  // Custom tools
  experiments?: Experiments
  setExperimentEnabled?: SetExperimentEnabled
  
  // Slash commands (from extensionState)
  commands?: Command[]
  cwd?: string
  
  // State setter (expanded union type)
  setCachedStateField: SetCachedStateField<
    | "disabledTools"
    | "alwaysAllowReadOnly"
    | "alwaysAllowReadOnlyOutsideWorkspace"
    | "alwaysAllowWrite"
    | "alwaysAllowWriteOutsideWorkspace"
    | "alwaysAllowWriteProtected"
    | "alwaysAllowMcp"
    | "alwaysAllowModeSwitch"
    | "alwaysAllowSubtasks"
    | "alwaysAllowExecute"
    | "alwaysAllowFollowupQuestions"
    | "modeSwitchingEnabled"
    | "followupAutoApproveTimeoutMs"
    | "allowedCommands"
    | "allowedMaxRequests"
    | "allowedMaxCost"
    | "imageGenerationProvider"
    | "openRouterImageApiKey"
    | "openRouterImageGenerationSelectedModel"
  >
}
```

### 3. `ExperimentalSettings.tsx` — Slimmed Down

**Changes:**
- Remove the `IMAGE_GENERATION` and `CUSTOM_TOOLS` experiment branches
- Remove `imageGenerationProvider`, `openRouterImageApiKey`, `openRouterImageGenerationSelectedModel`, `setImageGenerationProvider`, `setOpenRouterImageApiKey`, `setImageGenerationSelectedModel` from props
- Remove `ImageGenerationSettings` and `CustomToolsSettings` imports
- Keep all other experimental features intact

### 4. `AutoApproveSettings.tsx` — Preserved but Not Rendered

**Changes:** None to the file itself. It will still exist in the codebase but will no longer be imported/rendered by `SettingsView.tsx`. The component logic will be inlined into `ToolsSettings.tsx` instead.

### 5. `ImageGenerationSettings.tsx` — Preserved but Moved

**Changes:** None to the file. It will be imported and rendered inside `ToolsSettings.tsx` instead of `ExperimentalSettings.tsx`.

### 6. `CustomToolsSettings.tsx` — Preserved but Moved

**Changes:** None to the file. It will be imported and rendered inside `ToolsSettings.tsx` instead of `ExperimentalSettings.tsx`.

### 7. `SlashCommandsSettings.tsx` — Preserved but Moved

**Changes:** None to the file. It will be imported and rendered inside `ToolsSettings.tsx` instead of being a standalone tab.

## i18n Changes

### `webview-ui/src/i18n/locales/en/settings.json`

**New keys to add:**
```json
{
  "tools": {
    "description": "Enable or disable internal tools...",
    "autoApprove": {
      "header": "Auto-Approve",
      "description": "Run these actions without asking for permission...",
      "enabled": "Enable Auto-Approve",
      "toggleAriaLabel": "Toggle auto-approval",
      "toggleShortcut": "You can also toggle this with <SettingsLink>keyboard shortcut</SettingsLink>",
      "modeSwitchingEnabled": {
        "label": "Mode Switching",
        "description": "Allow Roo to switch between modes"
      },
      "readOnly": { "label": "Read Files", ... },
      "write": { "label": "Write Files", ... },
      "mcp": { "label": "MCP", ... },
      "execute": { "label": "Execute Commands", ... },
      "followupQuestions": { "label": "Follow-up Questions", ... },
      "subtasks": { "label": "Async Subtasks", ... },
      "maxLimits": { "description": "..." }
    },
    "imageGeneration": {
      "header": "AI Image Generation",
      ...
    },
    "customTools": {
      "header": "Custom Tools",
      ...
    },
    "slashCommands": {
      "header": "Slash Commands",
      ...
    }
  }
}
```

**Deprecated keys** (kept but unused):
- `sections.autoApprove` → replaced by `settings:tools.autoApprove.header`
- All `settings:autoApprove.*` keys → moved to `settings:tools.autoApprove.*`
- `sections.slashCommands` → replaced by `settings:tools.slashCommands.header`
- All `settings:slashCommands.*` keys → moved to `settings:tools.slashCommands.*`
- `settings:experimental.IMAGE_GENERATION.*` → moved to `settings:tools.imageGeneration.*`
- `settings:experimental.CUSTOM_TOOLS.*` → moved to `settings:tools.customTools.*`

## State Flow

```
User toggles setting in Tools tab
  → setCachedStateField(field, value) updates cachedState
  → handleSubmit() sends updateSettings message with ALL fields
  → Extension host processes unchanged message format
  → Settings persisted to globalState/workspaceState
  → On next load, useExtensionState() provides all values
  → ToolsSettings renders with current values
```

No changes to the state flow — the same `updateSettings` message type carries all fields regardless of which tab they're rendered in.

## File Change Summary

| File | Change Type | Description |
|------|------------|-------------|
| `SettingsView.tsx` | Modify | Remove autoApprove/slashCommands tabs, pass new props to ToolsSettings |
| `ToolsSettings.tsx` | Major expand | Add auto-approve, image generation, custom tools, slash commands sections |
| `ExperimentalSettings.tsx` | Modify | Remove image generation and custom tools experiment branches |
| `AutoApproveSettings.tsx` | Deprecate | No longer imported by SettingsView (file kept for reference) |
| `ImageGenerationSettings.tsx` | Relocate import | Imported by ToolsSettings instead of ExperimentalSettings |
| `CustomToolsSettings.tsx` | Relocate import | Imported by ToolsSettings instead of ExperimentalSettings |
| `SlashCommandsSettings.tsx` | Relocate import | Imported by ToolsSettings instead of standalone tab |
| `settings.json` | Add keys | New i18n keys for Tools sub-sections |
| `AutoApproveToggle.tsx` | Reuse | Used inside ToolsSettings for the toggle button row |
| `MaxLimitInputs.tsx` | Reuse | Used inside ToolsSettings for max requests/cost inputs |
