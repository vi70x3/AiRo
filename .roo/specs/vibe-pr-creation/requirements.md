# Requirements Document: Vibe PR Creation

## Introduction

The Vibe mode currently pushes the implementation branch to `origin` and includes a passive text suggestion in `attempt_completion` like "Consider opening a PR...". This requires the user to manually navigate to their repo, find the branch, and create a PR. The experience is not streamlined.

This feature replaces the passive PR suggestion with an **interactive PR creation step** that uses `ask_followup_question` to offer the user a one-click PR creation experience into their own repository's default branch. The implementation must be resilient to different user setups by supporting three fallback methods:

1. **GitHub MCP server** (`mcp--github--create_pull_request`) — preferred, if the MCP tool is available
2. **`gh` CLI** (`gh pr create`) — fallback, since most users have `gh` installed
3. **Pre-filled GitHub URL** — last resort, opens a browser URL for manual review/submission

## Glossary

- **Vibe Mode**: The code implementation mode (slug: `vibe`) defined in `DEFAULT_MODES` at [`packages/types/src/mode.ts`](packages/types/src/mode.ts:182)
- **Origin**: The git remote pointing to the user's own repository (typically named `origin`)
- **Upstream**: The git remote pointing to the original/source repository (never the target for PR creation in this spec)
- **Default Branch**: The default branch of the user's repo (typically `main` or `master`)
- **Spec Name**: The kebab-case directory name under `.roo/specs/` identifying a feature (e.g., `vibe-git-workflow`)
- **customInstructions**: A field on `ModeConfig` that provides mode-specific behavioral instructions injected into the system prompt
- **MCP Tool**: A tool provided by an MCP (Model Context Protocol) server, available only when the user has configured that server
- **gh CLI**: The GitHub command-line tool (`gh`), commonly installed by developers who work with GitHub

## Requirements

### Requirement 1: Ask User Before Creating PR

**User Story:** As a developer, when Vibe mode finishes pushing my implementation branch, I want the agent to ask me if I want to create a PR into my own repo's default branch, so I can choose whether to create a PR or not.

#### Acceptance Criteria

1. AFTER pushing the branch to `origin` and BEFORE calling `attempt_completion`, THE agent SHALL use `ask_followup_question` to ask the user if they want to create a PR
2. THE question SHALL clearly state the target: the user's own repo (origin), NOT upstream
3. THE question SHALL include the branch name and target default branch in the prompt (e.g., "Create a PR from `spec/my-feature` to `main` on your repository?")
4. THE `ask_followup_question` SHALL offer at least two options: "Yes, create the PR" and "No, I'll do it later"
5. IF the user selects "No", THE agent SHALL proceed to `attempt_completion` without creating a PR
6. IF the user selects "Yes", THE agent SHALL attempt to create the PR using the fallback chain (Requirement 2)

### Requirement 2: PR Creation Fallback Chain

**User Story:** As a developer, when I say "Yes" to creating a PR, I want the agent to automatically use the best available method to create the PR, so I don't have to do it manually.

#### Acceptance Criteria

1. WHEN the user confirms PR creation, THE agent SHALL attempt methods in this order:

   **Method 1 — GitHub MCP Tool (preferred):**
   - IF the `mcp--github--create_pull_request` tool is available, THE agent SHALL use it with:
     - `head`: `spec/<spec-name>`
     - `base`: the default branch of the user's repo (e.g., `main` or `master`)
     - `title`: derived from the spec name or latest commit message
     - `body`: a brief description referencing the spec
   - THE agent SHALL NOT pass an `owner` or `repo` parameter that points to the upstream repository

   **Method 2 — gh CLI (fallback):**
   - IF the MCP tool is NOT available, THE agent SHALL check if `gh` CLI is available by running `gh --version`
   - IF `gh` is available, THE agent SHALL run: `gh pr create --head spec/<spec-name> --base <default-branch> --title "<title>" --body "<body>"`
   - IF `gh pr create` fails (e.g., not authenticated), THE agent SHALL fall through to Method 3

   **Method 3 — Pre-filled URL (last resort):**
   - IF neither MCP tool nor `gh` CLI is available/functional, THE agent SHALL construct a pre-filled GitHub "new PR" URL using the format: `https://github.com/<owner>/<repo>/compare/<default-branch>...spec/<spec-name>?title=<title>&body=<body>`
   - THE agent SHALL inform the user with the URL and ask them to open it in their browser

2. THE agent SHALL only attempt each method if the previous method is unavailable or fails
3. THE agent SHALL NOT attempt to create a PR to any remote other than `origin`
4. THE agent SHALL determine the default branch dynamically (e.g., `git symbolic-ref refs/remotes/origin/HEAD` or fallback to `main`)

### Requirement 3: Non-Tool-Agnostic Prompt Engineering

**User Story:** As a developer who doesn't have the GitHub MCP server configured, I want the PR creation workflow to still work seamlessly using `gh` CLI or a URL, so I get the same one-click UX regardless of my setup.

#### Acceptance Criteria

1. THE `customInstructions` SHALL NOT assume the `mcp--github--create_pull_request` tool exists
2. THE `customInstructions` SHALL instruct the agent to check for tool availability at runtime, not at prompt time
3. THE `customInstructions` SHALL describe the fallback chain logic (MCP → gh CLI → URL) so the agent can adapt to whatever is available
4. THE `customInstructions` SHALL NOT reference MCP tool names directly in a way that would cause errors if the tool is absent; instead, it should instruct the agent to "check if a GitHub MCP tool is available" and use conditional logic
5. THE agent SHALL handle each method's failure gracefully and fall through to the next method without stopping the workflow

### Requirement 4: Integration with Existing Git Workflow

**User Story:** As a developer, I want the new PR creation step to integrate cleanly with the existing Vibe git workflow (branch management, committing, pushing, task completion), so the overall flow remains coherent.

#### Acceptance Criteria

1. THE PR creation step SHALL occur AFTER pushing to `origin` (existing behavior in the `vibe-git-workflow` spec)
2. THE PR creation step SHALL occur BEFORE marking all tasks as completed and calling `attempt_completion`
3. THE updated completion sequence SHALL be:
   1. Commit changes
   2. Push branch to `origin`
   3. **Ask user about PR creation (NEW)**
   4. **Create PR if confirmed (NEW)**
   5. Mark all tasks completed
   6. Call `attempt_completion`
4. THE `attempt_completion` result SHALL include a note about whether a PR was created, including a link to the PR if one was successfully created

### Requirement 5: No PR Creation for Ad-Hoc Changes

**User Story:** As a developer making quick ad-hoc changes without a spec, I don't want to be asked about PR creation since there's no spec branch to create a PR from.

#### Acceptance Criteria

1. IF the agent is working on ad-hoc changes (no spec name determined), THE agent SHALL skip the PR creation step
2. IF the agent is on the default branch (e.g., `main` or `master`), THE agent SHALL skip the PR creation step
3. THE PR creation step SHALL only be offered when the agent is on a `spec/<spec-name>` branch

## Out of Scope

- Automatic PR merging after creation
- PR review or approval automation
- Creating PRs to upstream repositories
- Modifying the `create_pull_request` MCP tool implementation
- Modifying the `gh` CLI tool implementation
- Adding new MCP server configuration UI
- Changing the `ask_followup_question` tool schema

## Assumptions

- The user's git repository has a remote named `origin` pointing to their personal repo/fork
- The `upstream` remote (if it exists) is never the target for PR creation
- The user has push access to their `origin` remote
- The `gh` CLI, if installed, may or may not be authenticated — the agent should handle auth failures gracefully
- The default branch is determined dynamically (not hardcoded)
- The spec name is in kebab-case and matches the branch name pattern `spec/<spec-name>`

## Dependencies

- This spec builds on the `vibe-git-workflow` spec which established the branch management, committing, and pushing behavior
- The `execute_command` tool must be available in Vibe mode (it is — groups include `command`)
- The `ask_followup_question` tool must be available (it is always available)
- The `update_todo_list` tool must be available (it is always available)
- The `mcp--github--create_pull_request` tool is optionally available (only if user has configured GitHub MCP server)
