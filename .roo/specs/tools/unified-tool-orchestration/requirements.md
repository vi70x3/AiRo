# Requirements: Unified Tool Orchestration

## Introduction

The Unified Tool Orchestration system provides a single source of truth for tool configuration, intelligent intent-based routing, and rigorous prompt safety for disabled tools. It consolidates scattered tool settings into a unified UI, introduces a deterministic routing layer that maps agent intents to the most efficient tools (preferring jcodemunch indexed tools when available), and ensures that disabled tools — including MCP tools — are never visible to the LLM in either tool definitions or system prompt text.

## Glossary

- **Tool Routing Engine**: Deterministic layer mapping intents (e.g., "find_function") to specific tools.
- **SSOT (Single Source of Truth)**: Consolidation of all tool-related settings into one UI tab.
- **Intent**: Coarse classification of agent objective (e.g., `understand_module`).
- **Tool Preference**: Ordered list of tools for an intent (e.g., `search_symbols` > `read_file`).
- **Prompt Safety**: Ensuring disabled tool names are stripped from all prompt text.

## Requirements

### Requirement 1: Intent-Based Tool Routing
1. THE system SHALL route agent intents to preferred tools based on the `ToolPreferenceTable`.
2. THE system SHALL prefer jcodemunch indexed tools (e.g., `search_symbols`) over native read tools when the repository is indexed.
3. THE system SHALL reorder the tool array provided to the API to place recommended tools first.
4. THE system SHALL inject a `TOOL ROUTING` section into the system prompt explaining preferences.

### Requirement 2: Settings Single Source of Truth (SSOT)
1. THE system SHALL consolidate all tool settings (Auto-Approve, Slash Commands, Image Generation, Custom Tools) into the `[Component:ToolsSettings]` within the "Tools" tab.
2. THE system SHALL remove the "Auto-Approve" and "Slash Commands" tabs from the `[Component:SettingsView]` sidebar.
3. THE system SHALL maintain existing state fields and persistence logic during UI reorganization.

### Requirement 3: Prompt Safety for Disabled Tools
1. THE system SHALL ensure disabled MCP tools (via per-server config) are never visible to the LLM.
2. THE system SHALL merge native and MCP disabled tools into a unified `ToolAvailabilityContext`.
3. THE system SHALL strip references to disabled tools from mode base instructions and custom instructions.
4. THE system SHALL hide fully-disabled MCP servers from the capabilities section.

## Out of Scope
- LLM-based tool selection (routing is deterministic).
- Automatic intent detection from agent text (intents are provided as input).
- Changes to the underlying tool execution logic or MCP hub connection.

## Acceptance Criteria Summary

| ID | Description | Key Metric |
|----|-------------|------------|
| AC-1 | Intent Routing | `search_symbols` preferred over `read_file` when indexed |
| AC-2 | UI Consolidation | Single "Tools" tab for all tool configuration |
| AC-3 | Prompt Safety | Disabled tools (incl. MCP) stripped from prompt text |
| AC-4 | Priority Reordering| Recommended tools placed at start of tool array |
| AC-5 | i18n | Tool sub-sections clearly labeled in unified tab |
