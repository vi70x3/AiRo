# Component Symbols Registry

This document serves as the single source of truth mapping logical component symbols used in specifications to their physical implementation files. Use these symbols in `requirements.md`, `design.md`, and `tasks.md` to prevent documentation desynchronization during refactors.

## Core System
| Symbol | Implementation Path | Description |
| :--- | :--- | :--- |
| `[Component:Task]` | `src/core/task/Task.ts` | The core agentic execution loop and task state manager. |
| `[Component:PromptGenerator]` | `src/core/prompts/system.ts` | Orchestrates system prompt assembly. |
| `[Component:EnvironmentDetails]` | `src/core/environment/getEnvironmentDetails.ts` | Injects machine/session state into the user message. |
| `[Component:CondensePipeline]` | `src/core/condense/index.ts` | Manages conversation history summarization and truncation. |

## Tooling & Editor
| Symbol | Implementation Path | Description |
| :--- | :--- | :--- |
| `[Component:DiffViewProvider]` | `src/integrations/editor/DiffViewProvider.ts` | Manages file writes and diff review interactions. |
| `[Component:McpHub]` | `src/services/mcp/McpHub.ts` | Central registry and connection manager for MCP servers. |

## Webview UI
| Symbol | Implementation Path | Description |
| :--- | :--- | :--- |
| `[Component:ChatView]` | `webview-ui/src/components/chat/ChatView.tsx` | Primary container for the conversation and message input. |
| `[Component:ChatRow]` | `webview-ui/src/components/chat/ChatRow.tsx` | Renders individual message types and tool results in the chat. |
| `[Component:SettingsView]` | `webview-ui/src/components/settings/SettingsView.tsx` | Main navigation and state orchestration for extension settings. |
| `[Component:ToolsSettings]` | `webview-ui/src/components/settings/ToolsSettings.tsx` | UI component for managing tool groups, auto-approval, and experiments. |
| `[Component:TaskHeader]` | `webview-ui/src/components/chat/TaskHeader.tsx` | Displays task-level metadata (costs, tokens, reliability). |
