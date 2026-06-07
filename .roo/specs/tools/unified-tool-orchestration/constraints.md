# Constraints: Unified Tool Orchestration

## MUST Rules
1. THE system SHALL reorder the tool array to place recommended tools first if `toolRouting.enabled` is true.
2. THE system SHALL consolidate all tool configuration into exactly one "Tools" tab.
3. ALL disabled tool names MUST be stripped from prompt text using exact backtick-wrapped matches.
4. THE `ToolAvailabilityContext` MUST include both native and MCP disabled tools.

## MUST NOT Rules
1. THE system MUST NOT recommend a tool that is present in the `disabledTools` list.
2. THE system MUST NOT advertise MCP access if all tools on the target server are disabled.

## Assumptions
1. `SettingsView.tsx` handles the global `updateSettings` message for all state fields.
2. jcodemunch provides a reliable index state signal via the MCP hub.
