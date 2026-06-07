# Tasks: Unified Tool Orchestration

## Phase 1: Routing & Safety Core
- [ ] Implement `ToolRouter` and `ToolPreferenceTable`.
- [ ] Implement `getMcpDisabledToolNames` and integrate with `ToolAvailabilityContext`.
- [ ] Update `StripToolReferences` to handle MCP tool name patterns.

## Phase 2: Pipeline Integration
- [ ] Integrate `ToolRouter` into `buildNativeToolsArrayWithRestrictions`.
- [ ] Update `generatePrompt` to sanitize base and custom instructions.
- [ ] Add `TOOL ROUTING` section to system prompt guidelines.

## Phase 3: UI Consolidation (SSOT)
- [ ] Expand `ToolsSettings.tsx` to include Auto-Approve, Image Gen, and Slash Command sections.
- [ ] Remove redundant tabs from `SettingsView.tsx` navigation.
- [ ] Update i18n keys for unified tool configuration.

## Phase 4: Verification & Observability
- [ ] Add structured logging for routing decisions.
- [ ] Benchmark prompt generation latency with large instruction sets.
- [ ] Final end-to-end verification of settings persistence.
