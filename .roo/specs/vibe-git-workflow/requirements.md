# Requirements Document: Vibe Git Workflow

## Introduction

The Vibe mode (✨ Vibe, slug: `vibe`) currently lacks any git workflow instructions. When a user completes a spec in Spec mode and switches to Vibe for implementation, the agent has no guidance on branch management, committing, PR creation, or task completion tracking. This results in Vibe making changes directly on the current branch without committing, never suggesting PRs, and often leaving tasks unmarked in the todo list.

This feature adds `customInstructions` to the Vibe mode definition in [`packages/types/src/mode.ts`](packages/types/src/mode.ts:182) that enforce a structured git workflow: branch creation for new specs, branch reuse for existing specs, committing changes, opening PRs to the user's repo (NOT upstream), and marking all tasks as completed before finishing.

## Glossary

- **Vibe Mode**: The code implementation mode (slug: `vibe`) defined in `DEFAULT_MODES` at [`packages/types/src/mode.ts`](packages/types/src/mode.ts:182)
- **Spec Mode**: The planning mode (slug: `spec`) that creates spec documents and hands off to Vibe
- **Spec Name**: The kebab-case directory name under `.roo/specs/` identifying a feature (e.g., `vibe-git-workflow`)
- **New Spec**: A spec that has just been created and has no existing implementation branch
- **Existing Spec**: A spec that already has a branch with prior work, and the user is iterating on it
- **User Repo / Origin**: The git remote that belongs to the user's fork or personal repository (typically named `origin`)
- **Upstream**: The git remote that belongs to the original/source repository (typically named `upstream` or the organization repo)
- **customInstructions**: A field on `ModeConfig` that provides mode-specific behavioral instructions injected into the system prompt

## Requirements

### Requirement 1: Branch Creation for New Specs

**User Story:** As a developer, when I start implementing a new spec in Vibe mode, I want the agent to automatically create a new git branch so that my work is isolated from the main/default branch.

#### Acceptance Criteria

1. WHEN Vibe mode starts working on a **new spec** (no existing branch), THE agent SHALL create a new git branch before making any code changes
2. THE branch name SHALL be derived from the spec name using the format `spec/<spec-name>` (e.g., `spec/vibe-git-workflow`)
3. THE agent SHALL use `git checkout -b spec/<spec-name>` to create and switch to the new branch
4. IF the branch already exists locally, THE agent SHALL switch to it with `git checkout spec/<spec-name>` rather than creating a new one
5. THE agent SHALL NOT make any file changes until it is on the correct branch

### Requirement 2: Branch Reuse for Existing Specs

**User Story:** As a developer, when I iterate on an existing spec that already has a branch with prior work, I want the agent to reuse that existing branch rather than creating a new one, so my incremental changes accumulate on the same branch.

#### Acceptance Criteria

1. WHEN Vibe mode starts working on an **existing spec** (there is already a branch named `spec/<spec-name>`), THE agent SHALL switch to the existing branch using `git checkout spec/<spec-name>`
2. THE agent SHALL NOT create a new branch when one already exists for the spec
3. THE agent SHALL NOT reset or discard existing changes on the branch
4. IF the spec directory `.roo/specs/<spec-name>/` already exists AND a matching branch exists, THE agent SHALL treat this as iteration on an existing spec

### Requirement 3: Commit Changes Before Completion

**User Story:** As a developer, when Vibe mode finishes implementing a task, I want all changes to be committed with a descriptive message so that my work is saved in git history.

#### Acceptance Criteria

1. BEFORE calling `attempt_completion`, THE agent SHALL commit all uncommitted changes
2. THE agent SHALL stage all changes with `git add -A`
3. THE commit message SHALL follow conventional commit format: `type(scope): brief description`
4. IF pre-commit hooks fail, THE agent SHALL fix the identified issues and retry the commit
5. THE agent SHALL NOT call `attempt_completion` with uncommitted changes

### Requirement 4: Push and Open PR to User Repo

**User Story:** As a developer, when Vibe mode completes implementation, I want the agent to push the branch and suggest opening a PR to my own repository (origin), NOT to the upstream repository, so that I can review my changes before they reach the main project.

#### Acceptance Criteria

1. AFTER committing, THE agent SHALL push the branch to the **origin** remote using `git push origin spec/<spec-name>`
2. THE agent SHALL NOT push to the upstream remote
3. THE agent SHALL suggest creating a PR from `origin:spec/<spec-name>` to the default branch of the user's repo
4. IF the push fails due to remote not existing, THE agent SHALL inform the user and ask for guidance
5. IF the push fails due to authentication issues, THE agent SHALL inform the user rather than retrying indefinitely
6. THE PR suggestion SHALL be included in the `attempt_completion` result message, NOT as a separate question

### Requirement 5: Mark All Tasks as Completed

**User Story:** As a developer, when Vibe mode finishes all implementation work, I want the agent to mark every task in the todo list as completed so that the task tracker accurately reflects the finished state.

#### Acceptance Criteria

1. BEFORE calling `attempt_completion`, THE agent SHALL use `update_todo_list` to mark ALL tasks as `[x]` completed
2. THE agent SHALL NOT leave any tasks in `[ ]` pending or `[-]` in-progress state
3. THE agent SHALL only mark a task as completed when that task's work is actually done
4. IF a task cannot be completed, THE agent SHALL inform the user via `ask_followup_question` rather than silently marking it

### Requirement 6: Spec Mode Handoff Context

**User Story:** As a developer, when Spec mode switches to Vibe mode for implementation, I want the handoff to include the spec name so that Vibe knows whether to create a new branch or reuse an existing one.

#### Acceptance Criteria

1. WHEN Spec mode calls `switch_mode` to switch to Vibe, THE reason parameter SHALL include the spec name (e.g., "Implementing spec: vibe-git-workflow")
2. THE Vibe mode customInstructions SHALL instruct the agent to extract the spec name from the switch_mode reason or from the `.roo/specs/` directory
3. THE Vibe mode SHALL check if a branch named `spec/<spec-name>` already exists to determine new vs. existing spec
4. IF no spec name can be determined, THE agent SHALL ask the user which spec they are working on

## Out of Scope

- Automatic PR creation via GitHub API (the agent only suggests the PR, the user creates it)
- Merging the PR automatically
- Handling merge conflicts on push
- Changing the `switch_mode` tool schema to add new parameters
- Modifying any tool implementations (only mode `customInstructions` and `roleDefinition` changes)

## Assumptions

- The user's git repository has a remote named `origin` pointing to their personal repo/fork
- The `upstream` remote (if it exists) points to the original project repository
- The user has push access to their `origin` remote
- The spec name is always in kebab-case and matches the directory name under `.roo/specs/`
- The default branch is either `main` or `master`

## Dependencies

- The `execute_command` tool must be available in Vibe mode (it is — groups include `command`)
- The `update_todo_list` tool must be available (it is always available)
- The `switch_mode` tool must be available in Spec mode (it is always available)
- The `ask_followup_question` tool must be available (it is always available)