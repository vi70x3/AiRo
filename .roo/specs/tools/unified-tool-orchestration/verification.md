# Verification: Unified Tool Orchestration

## Test Strategy
- **Unit Testing**: Test `ToolRouter` with various `RoutingContext` states; test `StripToolReferences` with native and MCP names.
- **Integration Testing**: Verify `buildNativeToolsArrayWithRestrictions` reorders tools correctly; verify Settings UI consolidation works without breaking persistence.
- **End-to-End**: Open settings, toggle "Auto-Approve Read-Only", save, and verify that subsequent edits are auto-approved.

## Validation Checks
1. Recommended tool at index 0 of tool array.
2. Disabled tool names absent from `generatePrompt` output.
3. Settings sidebar contains only "Tools" (no "Auto-Approve").

## Completion Criteria
- [ ] Unified "Tools" tab functional with all sub-sections.
- [ ] Tool Routing Engine reorders tools based on intent.
- [ ] MCP disabled tools stripped from system prompt.
