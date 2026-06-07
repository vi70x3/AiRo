# Requirements: Tool Routing Engine

## Introduction

The Tool Routing Engine introduces a deterministic routing layer between the agent's intent and tool selection. Currently, the agent sees all available tools and picks one based on its own judgment — leading to violations of tool preference rules (e.g., using `read_file` instead of `search_symbols` when the repo is indexed). The router constrains the available tools and injects guidance into the system prompt based on the agent's declared intent and the current execution context.

This feature integrates with the existing tool filtering pipeline in `src/core/prompts/tools/` and the system prompt generation in `src/core/prompts/sections/`. It also consumes the Execution State Graph from the Agent State Management spec (Phase 1) to determine which tools are appropriate for the current task phase.

## Glossary

- **Agent**: An AI-powered assistant that processes user requests and executes tasks using available tools and reasoning capabilities.
- **Tool Router**: A deterministic function that maps `(intent, context) -> toolRecommendation`. Given the same inputs, it always produces the same output.
- **Intent**: A coarse classification of what the agent is trying to accomplish (e.g., "find_function", "find_usage", "search_text").
- **Tool Recommendation**: A structured suggestion containing a primary tool, fallback tools, and optional prompt guidance.
- **ToolAvailabilityContext**: The existing class in `src/core/prompts/tools/tool-availability-context.ts` that tracks which tools are disabled.
- **Execution State Graph**: The deterministic state tracker from the Agent State Management spec (Phase 1), maintaining phase states (diagnosis, implementation, testing, vcs).
- **Repo Indexed**: A state indicating the current workspace has been indexed by jcodemunch, enabling `search_symbols`, `get_context_bundle`, and other indexed tools.
- **System Prompt**: The full prompt sent to the model, including tool definitions, guidelines, and routing guidance.
- **buildNativeToolsArrayWithRestrictions**: The function in `src/core/task/build-tools.ts` that builds the filtered tool array for API requests.
- **filterNativeToolsForMode**: The function in `src/core/prompts/tools/filter-tools-for-mode.ts` that filters tools based on mode restrictions.

## Requirements

### Requirement 1: Intent-Based Tool Routing

**User Story:** As a user, I want the system to route agent intents to the correct tools automatically, so that the agent uses the right tool for the task instead of guessing.

#### Acceptance Criteria

1. THE Tool_Router SHALL accept an intent string and routing context as input and return a deterministic tool recommendation.
2. THE Tool_Router SHALL support the following intents with the specified tool preference order:
   - `find_function`: 1) `search_symbols`, 2) `get_context_bundle`
   - `find_usage`: 1) `find_references`
   - `understand_module`: 1) `get_context_bundle`
   - `search_text`: 1) `search_text`
   - `impact_analysis`: 1) `get_blast_radius`
   - `refactor`: 1) `plan_refactoring`
3. WHEN the intent is `find_function` and the repo is indexed, THE Tool_Router SHALL recommend `search_symbols` as the primary tool.
4. WHEN the intent is `find_function` and the repo is NOT indexed, THE Tool_Router SHALL recommend `read_file` as the primary tool.
5. THE Tool_Router SHALL be a pure deterministic function — no LLM calls, no randomness, no external state lookups beyond the provided context.

### Requirement 2: Routing Context

**User Story:** As a developer, I want the router to receive structured context about the current execution environment so that it can make informed tool recommendations.

#### Acceptance Criteria

1. THE Routing_Context SHALL include the following fields:
   - `repoIndexed`: boolean — whether the current workspace has been indexed
   - `executionPhase`: `"diagnosis" | "implementation" | "testing" | "vcs"` — current phase from the Execution State Graph
   - `availableTools`: string[] — tools that are currently available (from `ToolAvailabilityContext`)
   - `mode`: string — the current mode slug
2. WHEN `repoIndexed` is `true`, THE Tool_Router SHALL prefer indexed tools (`search_symbols`, `get_context_bundle`, `find_references`, `search_text`, `get_blast_radius`, `plan_refactoring`) over their native counterparts.
3. WHEN `repoIndexed` is `false`, THE Tool_Router SHALL fall back to native tools (`read_file`, `search_files`, `list_files`).
4. THE Routing_Context SHALL be constructed during tool array building, not inside the router itself.

### Requirement 3: Dynamic Tool Filtering

**User Story:** As a user, I want the available tools to be filtered based on the current execution phase, so that the agent is not distracted by irrelevant tools.

#### Acceptance Criteria

1. THE system SHALL filter the tool array based on the current execution phase:
   - `diagnosis`: Prioritize read/explore tools (`read_file`, `search_files`, `list_files`, `codebase_search`, `search_symbols`, `get_context_bundle`, `search_text`). Deprioritize write tools.
   - `implementation`: Make all read and write tools available. Include edit tools (`apply_diff`, `write_to_file`, `edit`).
   - `testing`: Prioritize command execution (`execute_command`). Keep read tools available.
   - `vcs`: Prioritize command execution. Include git-related command guidance.
2. THE phase-based filtering SHALL NOT remove tools entirely — it SHALL reorder tool descriptions and inject guidance to influence priority.
3. THE phase-based filtering SHALL respect `ToolAvailabilityContext` — disabled tools SHALL remain disabled regardless of phase.
4. WHEN the execution phase is not available (Phase 1 not enabled), THE system SHALL fall back to the existing mode-based filtering without phase guidance.

### Requirement 4: System Prompt Routing Guidance

**User Story:** As a user, I want the system prompt to include tool routing guidance so that the model knows which tools to prefer for common intents.

#### Acceptance Criteria

1. THE system prompt SHALL include a `TOOL ROUTING` section that lists the tool preference table for common intents.
2. THE `TOOL ROUTING` section SHALL be dynamically generated based on whether the repo is indexed.
3. WHEN `repoIndexed` is `true`, THE `TOOL ROUTING` section SHALL include guidance to use jcodemunch tools over native tools.
4. THE `TOOL ROUTING` section SHALL be injected via `getSharedToolUseSection()` or `getToolUseGuidelinesSection()`.
5. THE routing guidance SHALL use the format:
   ```
   TOOL ROUTING
   When the user asks to:
   - Find a function/class: use search_symbols (or read_file if repo not indexed)
   - Find usage of a symbol: use find_references
   - Understand a module: use get_context_bundle
   - Search text: use search_text (not grep)
   - Analyze impact: use get_blast_radius
   - Refactor: use plan_refactoring
   ```

### Requirement 5: Configuration

**User Story:** As a system administrator, I want configurable tool routing parameters so that I can enable, disable, or tune the routing engine.

#### Acceptance Criteria

1. THE Configuration_Manager SHALL add a `toolRouting` section to the global settings schema in `packages/types/src/global-settings.ts` with the following parameters:
   - `enabled`: boolean (default: `false`) — enables or disables the tool routing engine
   - `enforceJcodemunch`: boolean (default: `true`) — when true and repo is indexed, jcodemunch tools are strictly preferred over native tools
   - `phaseBasedFiltering`: boolean (default: `false`) — enables phase-based tool guidance (requires Phase 1)
2. WHEN `enabled` is `false`, THE system SHALL operate without routing guidance — no changes to tool filtering or system prompt.
3. WHEN `enforceJcodemunch` is `true` and `repoIndexed` is `true`, THE system SHALL add explicit guidance to prefer jcodemunch tools and SHALL add native read tools to the bottom of the tool preference list.
4. WHEN `phaseBasedFiltering` is `true` but the Execution State Graph is not available, THE system SHALL log a warning and fall back to mode-based filtering only.
5. THE Configuration_Manager SHALL validate each parameter independently and accept valid parameters while rejecting only invalid parameters.
6. THE Configuration_Manager SHALL apply runtime configuration updates within 1 second without requiring agent restart.

### Requirement 6: Observability

**User Story:** As a system administrator, I want visibility into tool routing decisions so that I can monitor routing effectiveness and debug issues.

#### Acceptance Criteria

1. THE Observability_Logger SHALL log the following events with timestamp and relevant values:
   - Routing decision (intent, context summary, recommended tool, fallback tools)
   - Routing guidance injection (whether guidance was added to prompt, which section)
   - Configuration change (old values, new values)
   - Phase-based filtering applied (phase, tools deprioritized)
2. THE Observability_Logger SHALL exclude the following from all log entries: user message text, file contents, tool parameters containing user input, and routing context larger than 1KB.
3. THE Observability_Logger SHALL expose metrics as structured key-value entries containing a timestamp, metric name, and numeric value.

### Requirement 7: Integration with Existing Tool Pipeline

**User Story:** As a developer, I want the tool router integrated into the existing tool pipeline so that routing works seamlessly with mode filtering, disabled tools, and MCP tools.

#### Acceptance Criteria

1. THE Tool_Router SHALL be invoked during `buildNativeToolsArrayWithRestrictions()` in `src/core/task/build-tools.ts` — after mode filtering but before returning the tool array.
2. THE routing guidance SHALL be injected into the system prompt via `getSharedToolUseSection()` or `getToolUseGuidelinesSection()` in `src/core/prompts/sections/`.
3. THE Tool_Router SHALL respect `ToolAvailabilityContext` — it SHALL NOT recommend tools that are disabled.
4. THE Tool_Router SHALL work alongside the existing `filterNativeToolsForMode()` — it SHALL NOT replace mode filtering, only augment it with routing guidance.
5. THE Tool_Router SHALL handle the `includeAllToolsWithRestrictions` flag — when true, it SHALL provide routing guidance in the prompt but SHALL NOT remove tools from the array (the `allowedFunctionNames` mechanism handles restriction).
6. THE Tool_Router SHALL be backward-compatible — when `enabled` is `false`, the existing pipeline SHALL operate identically.

## Out of Scope

- **LLM-based tool selection**: The router is deterministic, not ML-based. The model still selects the final tool — the router only constrains and guides.
- **Tool execution**: The router does not execute tools. It only recommends and constrains.
- **Dynamic tool definition modification**: The router does not modify tool definitions (parameters, descriptions). It only injects guidance and reorders priority.
- **Cross-repository routing**: The router operates on the current workspace only. Cross-repo tool routing is out of scope.
- **Tool routing for MCP tools**: MCP tools are handled by the existing `filterMcpToolsForMode()` and are not affected by this router.
- **Automatic intent detection**: The router accepts intents as input. Automatic intent detection from agent text is a future enhancement.
- **Replacing `applyRouterToolPreferences`**: The existing `src/api/providers/utils/router-tool-preferences.ts` handles model-specific tool exclusions for API providers and is orthogonal to this feature.

## Acceptance Criteria Summary

| Req ID | Description | Key Criteria |
|--------|-------------|--------------|
| REQ-1 | Intent-Based Tool Routing | Deterministic intent-to-tool mapping with indexed/native fallback |
| REQ-2 | Routing Context | Structured context with repoIndexed, executionPhase, availableTools, mode |
| REQ-3 | Dynamic Tool Filtering | Phase-based tool guidance without removing tools, respects disabled tools |
| REQ-4 | System Prompt Guidance | Dynamic TOOL ROUTING section in system prompt, indexed-aware |
| REQ-5 | Configuration | Enable/disable/tune via global settings with zod schema |
| REQ-6 | Observability | Structured logging of routing decisions, guidance injection, config changes |
| REQ-7 | Pipeline Integration | Invoked in buildNativeToolsArrayWithRestrictions, respects existing filtering |
