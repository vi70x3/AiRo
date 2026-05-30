# Tasks: Disable Internal Tools

## Task Breakdown

### Phase 1: Shared Types & Constants

- [ ] **T1.1**: Export `TOOL_DISPLAY_NAMES` from `@roo-code/types` — Move or re-export the [`TOOL_DISPLAY_NAMES`](../../src/shared/tools.ts:275) record to `packages/types/src/tool.ts` so the webview-ui can import it via `@roo-code/types`
- [ ] **T1.2**: Export `TOOL_GROUPS` config from `@roo-code/types` — Move or re-export [`TOOL_GROUPS`](../../src/shared/tools.ts:304) to `packages/types/src/tool.ts` for webview-ui access
- [ ] **T1.3**: Export `ALWAYS_AVAILABLE_TOOLS` from `@roo-code/types` — Move or re-export [`ALWAYS_AVAILABLE_TOOLS`](../../src/shared/tools.ts:325) to `packages/types/src/tool.ts`
- [ ] **T1.4**: Create `TOOL_GROUP_CONFIG` UI constant — Add a new export in `packages/types/src/tool.ts` that maps each group to its tools and i18n label key, including the `alwaysAvailable` group with its `isAlwaysAvailable` flag
- [ ] **T1.5**: Update `src/shared/tools.ts` imports — If constants were moved to the types package, update `src/shared/tools.ts` to import from `@roo-code/types` instead of defining them locally, maintaining backward compatibility for all existing consumers
- [ ] **T1.6**: Verify types package build — Run `pnpm build` in `packages/types` to confirm the new exports compile correctly and are included in the package output

### Phase 2: i18n Translation Keys

- [ ] **T2.1**: Add English translation keys — Add `settings.sections.tools`, `settings.tools.description`, `settings.tools.group.*` (read, edit, command, mcp, modes, alwaysAvailable), and `settings.tools.warning.critical` to the English locale file
- [ ] **T2.2**: Add translation keys to i18n mock — Update the translation mock in [`webview-ui/src/i18n/__mocks__/TranslationContext.tsx`](../../webview-ui/src/i18n/__mocks__/TranslationContext.tsx) to include the new `settings.tools.*` keys so tests can render properly
- [ ] **T2.3**: Verify other locale files — Check if other language locale files need placeholder entries or if the i18n system handles missing keys gracefully with fallbacks to English

### Phase 3: ToolsSettings Component

- [ ] **T3.1**: Create `ToolsSettings.tsx` — Create [`webview-ui/src/components/settings/ToolsSettings.tsx`](../../webview-ui/src/components/settings/ToolsSettings.tsx) following the pattern of [`NotificationSettings`](../../webview-ui/src/components/settings/NotificationSettings.tsx) with `SectionHeader`, `Section`, and `SearchableSetting` components
- [ ] **T3.2**: Implement tool group rendering — Render each tool group from `TOOL_GROUP_CONFIG` as a sub-section with a group header label, listing each tool as a `VSCodeCheckbox` inside a `SearchableSetting` wrapper
- [ ] **T3.3**: Implement checkbox state binding — Bind each checkbox's checked state to `!disabledTools.includes(toolName)`, using `cachedState` pattern per AGENTS.md rules
- [ ] **T3.4**: Implement toggle logic — Create the `toggleTool` handler that adds/removes tool names from the `disabledTools` array via `setCachedStateField("disabledTools", ...)`
- [ ] **T3.5**: Add critical tool warnings — Add `AlertTriangle` icon and warning text below `attempt_completion` and `ask_followup_question` checkboxes using the `settings:tools.warning.critical` translation key
- [ ] **T3.6**: Add always-available group styling — Style the "Always Available" group slightly differently (e.g., with a subtle border or different background) to visually distinguish tools that are normally always on

### Phase 4: SettingsView Integration

- [ ] **T4.1**: Add `tools` to `sectionNames` — Add `"tools"` to the [`sectionNames`](../../webview-ui/src/components/settings/SettingsView.tsx:98) array between `"modes"` and `"autoApprove"`
- [ ] **T4.2**: Add `tools` section with Wrench icon — Add `{ id: "tools", icon: Wrench }` to the [`sections`](../../webview-ui/src/components/settings/SettingsView.tsx:496) array at the corresponding position, and import `Wrench` from `lucide-react`
- [ ] **T4.3**: Destructure `disabledTools` from `cachedState` — Add `disabledTools` to the destructured fields from `cachedState` in [`SettingsView`](../../webview-ui/src/components/settings/SettingsView.tsx:149)
- [ ] **T4.4**: Add ToolsSettings render block — Add `{renderTab === "tools" && <ToolsSettings disabledTools={disabledTools ?? []} setCachedStateField={setCachedStateField} />}` to the content area
- [ ] **T4.5**: Add `disabledTools` to `handleSubmit` — Add `disabledTools: disabledTools ?? []` to the `updatedSettings` object in [`handleSubmit`](../../webview-ui/src/components/settings/SettingsView.tsx:349) so the setting is persisted on save

### Phase 5: ExtensionState Context

- [ ] **T5.1**: Verify `disabledTools` in state context — Confirm that [`ExtensionStateContextType`](../../webview-ui/src/context/ExtensionStateContext.tsx:32) already includes `disabledTools` from the `ExtensionState` type (it should since `ClineProvider` already sends it)
- [ ] **T5.2**: Add `disabledTools` to state handler if missing — If `disabledTools` is not in the webview state reconciliation, add it to the message handler that syncs extension state to the webview

### Phase 6: Testing

- [ ] **T6.1**: Create `ToolsSettings.spec.tsx` — Create [`webview-ui/src/components/settings/__tests__/ToolsSettings.spec.tsx`](../../webview-ui/src/components/settings/__tests__/ToolsSettings.spec.tsx) with unit tests
- [ ] **T6.2**: Test tool checkbox rendering — Verify all 24 tools render as checkboxes with correct display names
- [ ] **T6.3**: Test toggle logic — Verify checking a checkbox removes the tool from `disabledTools` and unchecking adds it
- [ ] **T6.4**: Test critical tool warnings — Verify warning text appears for `attempt_completion` and `ask_followup_question`
- [ ] **T6.5**: Test group headers — Verify all 6 group headers render with correct labels
- [ ] **T6.6**: Test SearchableSetting integration — Verify each tool checkbox is wrapped in a `SearchableSetting` with correct `settingId` and `section` props
- [ ] **T6.7**: Run existing SettingsView tests — Verify that existing tests in [`SettingsView.change-detection.spec.tsx`](../../webview-ui/src/components/settings/__tests__/SettingsView.change-detection.spec.tsx) and [`SettingsView.unsaved-changes.spec.tsx`](../../webview-ui/src/components/settings/__tests__/SettingsView.unsaved-changes.spec.tsx) still pass after the section addition
- [ ] **T6.8**: Run filter-tools-for-mode tests — Verify existing [`filter-tools-for-mode.spec.ts`](../../src/core/prompts/tools/__tests__/filter-tools-for-mode.spec.ts) tests still pass (no backend logic changes needed)
- [ ] **T6.9**: Run validateToolUse tests — Verify existing [`validateToolUse.spec.ts`](../../src/core/tools/__tests__/validateToolUse.spec.ts) tests still pass