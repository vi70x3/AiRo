# Requirements Document

## Introduction

This document specifies the integration of the Superpowers software development methodology framework into AiRoo's async_task workflow. Superpowers provides composable skills for systematic development including test-driven development (TDD), debugging, planning, code review, and git worktree management. The integration will enhance async_task's parallel subtask execution with structured workflows, quality gates, and systematic development practices.

The integration targets the existing async_task feature (alpha) which uses git worktrees for isolation, opens subtasks in separate editor tabs, and auto-merges after completion. The goal is to layer Superpowers' methodology on top of this infrastructure to provide agents with systematic workflows during parallel development.

## Glossary

- **Async_Task_Tool**: The existing AiRoo tool that spawns parallel subtasks in isolated git worktrees
- **Superpowers_Framework**: The obra/superpowers methodology framework with composable skills
- **Skill**: A reusable workflow component in Superpowers (e.g., test-driven-development, systematic-debugging)
- **Subtask_Agent**: An agent instance executing a single subtask within an async_task workflow
- **Orchestrator_Agent**: The parent agent that spawns and coordinates subtasks
- **Worktree**: An isolated git working directory for parallel development
- **Quality_Gate**: A verification checkpoint that must pass before proceeding
- **TDD_Cycle**: The RED-GREEN-REFACTOR test-driven development pattern
- **Skill_Loader**: Component that loads and activates Superpowers skills for agents
- **Merge_Manager**: Component that handles auto-merging of completed subtask branches
- **Review_Stage**: A two-phase review process (spec compliance, then code quality)

## Requirements

### Requirement 1: Skill Loading Infrastructure

**User Story:** As a developer, I want Superpowers skills to be available to subtask agents, so that they can follow systematic development workflows.

#### Acceptance Criteria

1. THE Skill_Loader SHALL load Superpowers skills from the obra/superpowers repository structure
2. WHEN a subtask agent is spawned, THE Skill_Loader SHALL inject relevant skills into the agent's context
3. THE Skill_Loader SHALL support loading skills from both local filesystem and remote repository
4. WHEN a skill is loaded, THE Skill_Loader SHALL parse the SKILL.md file and extract workflow instructions
5. THE Skill_Loader SHALL cache loaded skills to avoid repeated parsing

### Requirement 2: TDD Integration for Subtasks

**User Story:** As a developer, I want subtasks to follow test-driven development, so that code quality is maintained during parallel execution.

#### Acceptance Criteria

1. WHEN a subtask begins implementation, THE Subtask_Agent SHALL activate the test-driven-development skill
2. THE Subtask_Agent SHALL enforce the RED-GREEN-REFACTOR cycle: write failing test, verify failure, implement code, verify pass, commit
3. IF code is written before tests, THEN THE Subtask_Agent SHALL delete the premature code and restart with tests
4. WHEN a test passes, THE Subtask_Agent SHALL commit the change before proceeding to the next task
5. THE Subtask_Agent SHALL verify that all tests pass before marking the subtask as complete

### Requirement 3: Systematic Debugging for Subtask Failures

**User Story:** As a developer, I want subtasks to use systematic debugging when errors occur, so that root causes are identified efficiently.

#### Acceptance Criteria

1. WHEN a subtask encounters an error, THE Subtask_Agent SHALL activate the systematic-debugging skill
2. THE Subtask_Agent SHALL follow the 4-phase debugging process: reproduce, isolate, identify root cause, verify fix
3. THE Subtask_Agent SHALL use root-cause-tracing techniques to identify the underlying issue
4. WHEN a fix is proposed, THE Subtask_Agent SHALL verify the fix resolves the issue before proceeding
5. THE Subtask_Agent SHALL document the root cause and fix in the commit message

### Requirement 4: Implementation Planning for Async Tasks

**User Story:** As a developer, I want the orchestrator to create detailed implementation plans, so that subtasks have clear, actionable specifications.

#### Acceptance Criteria

1. WHEN async_task is invoked, THE Orchestrator_Agent SHALL activate the writing-plans skill
2. THE Orchestrator_Agent SHALL break work into bite-sized tasks (2-5 minutes each)
3. FOR ALL subtasks, THE Orchestrator_Agent SHALL specify exact file paths, complete code expectations, and verification steps
4. THE Orchestrator_Agent SHALL present the plan to the user for approval before spawning subtasks
5. WHEN the plan is approved, THE Orchestrator_Agent SHALL pass task specifications to each Subtask_Agent

### Requirement 5: Two-Stage Code Review for Subtasks

**User Story:** As a developer, I want completed subtasks to undergo two-stage review, so that both specification compliance and code quality are verified.

#### Acceptance Criteria

1. WHEN a subtask completes, THE Review_Stage SHALL activate the requesting-code-review skill
2. THE Review_Stage SHALL perform spec compliance review: verify the subtask meets its specification
3. WHEN spec compliance passes, THE Review_Stage SHALL perform code quality review: check for anti-patterns, test coverage, and maintainability
4. IF critical issues are found, THEN THE Review_Stage SHALL block the subtask from merging and report issues to the Subtask_Agent
5. WHEN both review stages pass, THE Review_Stage SHALL mark the subtask as ready for merge

### Requirement 6: Git Worktree Management Integration

**User Story:** As a developer, I want Superpowers' git worktree workflows to integrate with async_task's worktree infrastructure, so that branch management is systematic.

#### Acceptance Criteria

1. WHEN async_task spawns subtasks, THE Async_Task_Tool SHALL activate the using-git-worktrees skill
2. THE Async_Task_Tool SHALL create isolated worktrees on new branches for each subtask
3. WHEN a worktree is created, THE Async_Task_Tool SHALL run project setup and verify a clean test baseline
4. WHEN all subtasks complete, THE Merge_Manager SHALL activate the finishing-a-development-branch skill
5. THE Merge_Manager SHALL run automated tests at two levels before merging: (a) subtask worktree pre-merge verification on each subtask branch, and (b) parent-branch integrated verification immediately after merging each subtask. THE Merge_Manager SHALL block/abort the merge on any failed integrated verification and present manual resolution options to the user.

### Requirement 7: Parallel Subagent Coordination

**User Story:** As a developer, I want the orchestrator to coordinate parallel subagents using Superpowers patterns, so that concurrent work is managed systematically.

#### Acceptance Criteria

1. WHEN async_task is invoked with multiple subtasks, THE Orchestrator_Agent SHALL activate the dispatching-parallel-agents skill
2. THE Orchestrator_Agent SHALL dispatch fresh subagents per task with isolated contexts
3. THE Orchestrator_Agent SHALL track subtask progress and collect results from all subagents
4. WHEN a subtask fails, THE Orchestrator_Agent SHALL report the failure and continue with remaining subtasks
5. WHEN all subtasks complete, THE Orchestrator_Agent SHALL aggregate results and present a summary to the user

### Requirement 8: Brainstorming Integration for Task Decomposition

**User Story:** As a developer, I want the orchestrator to use brainstorming before creating subtasks, so that task decomposition is well-considered.

#### Acceptance Criteria

1. WHEN the user requests async_task without a detailed plan, THE Orchestrator_Agent SHALL activate the brainstorming skill
2. THE Orchestrator_Agent SHALL refine rough ideas through Socratic questions
3. THE Orchestrator_Agent SHALL explore design alternatives and present options in digestible sections
4. WHEN the design is validated, THE Orchestrator_Agent SHALL save the design document
5. THE Orchestrator_Agent SHALL use the approved design to generate subtask specifications

### Requirement 9: Skill Configuration and Customization

**User Story:** As a developer, I want to configure which Superpowers skills are active, so that I can customize the workflow for my project.

#### Acceptance Criteria

1. THE Skill_Loader SHALL read skill configuration from a .superpowers.json file in the workspace root
2. THE Skill_Loader SHALL support enabling/disabling individual skills via configuration
3. THE Skill_Loader SHALL support skill priority ordering to control activation sequence
4. WHEN a skill is disabled, THE Skill_Loader SHALL skip loading that skill for all agents
5. THE Skill_Loader SHALL provide default configuration with all core skills enabled

### Requirement 10: Merge Conflict Resolution with Superpowers

**User Story:** As a developer, I want merge conflicts to be resolved systematically, so that parallel subtask results can be integrated reliably.

#### Acceptance Criteria

1. WHEN the Merge_Manager encounters conflicts, THE Merge_Manager SHALL activate conflict resolution workflows
2. THE Merge_Manager SHALL analyze conflicts and categorize them by type (code, tests, documentation)
3. THE Merge_Manager SHALL attempt automatic resolution only for allowlisted conflict types (e.g., whitespace, import ordering) and SHALL NOT auto-resolve other conflict categories.
4. IF conflicts fall outside the allowlist or automatic resolution cannot be confidently applied, THEN THE Merge_Manager SHALL fall back to explicit manual resolution by presenting conflicts to the user with resolution suggestions.
5. WHEN conflicts are resolved, THE Merge_Manager SHALL run mandatory post-resolution verification (full test suite and integrity checks) before completing any auto-merge. IF verification fails, THE Merge_Manager SHALL abort the auto-merge and present manual resolution options to the user.

### Requirement 11: Verification Before Subtask Completion

**User Story:** As a developer, I want subtasks to verify their work before completion, so that incomplete or broken work is not merged.

#### Acceptance Criteria

1. WHEN a subtask claims completion, THE Subtask_Agent SHALL activate the verification-before-completion skill
2. THE Subtask_Agent SHALL run all relevant tests at the subtask worktree level (subtask worktree pre-merge verification) and verify they pass before claiming completion.
3. THE Subtask_Agent SHALL verify the subtask specification is fully satisfied
4. THE Subtask_Agent SHALL check for common issues: missing error handling, incomplete edge cases, missing documentation
5. IF verification fails, THEN THE Subtask_Agent SHALL continue working until verification passes

### Requirement 12: Skill Execution Telemetry

**User Story:** As a developer, I want to see which Superpowers skills were activated during async_task execution, so that I can understand the workflow that was followed.

#### Acceptance Criteria

1. THE Skill_Loader SHALL log skill activation events with timestamps
2. WHEN a skill is activated, THE Skill_Loader SHALL record the agent ID, skill name, and context
3. WHEN async_task completes, THE Orchestrator_Agent SHALL include a skill execution summary in the results
4. THE Skill_Loader SHALL track skill execution duration for performance analysis
5. THE Skill_Loader SHALL expose skill telemetry via a diagnostic command or UI panel

### Requirement 13: Incremental Skill Adoption

**User Story:** As a developer, I want to adopt Superpowers skills incrementally, so that I can validate each integration step before proceeding.

#### Acceptance Criteria

1. THE Skill_Loader SHALL support a "compatibility mode" that makes skills advisory rather than mandatory
2. WHEN compatibility mode is enabled, THE Skill_Loader SHALL log skill recommendations without enforcing workflows
3. THE Skill_Loader SHALL support per-skill enforcement levels: disabled, advisory, enforced
4. THE Skill_Loader SHALL provide migration guidance when transitioning from advisory to enforced mode
5. THE Skill_Loader SHALL default to advisory mode for new skill integrations
6. THE Skill_Loader SHALL keep per-skill enforcement disabled (or advisory only) unless experiments.asyncSubtasks is enabled at runtime. THE Skill_Loader SHALL check experiments.asyncSubtasks before allowing any skill enforcement; when the flag is disabled, all skills SHALL remain in advisory mode regardless of per-skill enforcement level settings.

### Requirement 14: Subagent Context Isolation

**User Story:** As a developer, I want each subtask agent to have isolated context with only relevant skills, so that agents don't interfere with each other.

#### Acceptance Criteria

1. WHEN a Subtask_Agent is spawned, THE Skill_Loader SHALL create an isolated skill context
2. THE Skill_Loader SHALL load only skills relevant to the subtask's mode and specification
3. THE Skill_Loader SHALL prevent subtask agents from accessing other subtasks' contexts
4. WHEN a subtask completes, THE Skill_Loader SHALL clean up the isolated context
5. THE Skill_Loader SHALL support context snapshots for debugging subtask behavior

### Requirement 15: Superpowers Skill Repository Integration

**User Story:** As a developer, I want AiRoo to fetch Superpowers skills from the official repository, so that I always have the latest skill definitions.

#### Acceptance Criteria

1. THE Skill_Loader SHALL fetch skills from the obra/superpowers GitHub repository
2. THE Skill_Loader SHALL support specifying a Superpowers version or commit hash
3. THE Skill_Loader SHALL cache fetched skills locally to avoid repeated network requests
4. WHEN the Superpowers repository is updated, THE Skill_Loader SHALL detect updates and prompt the user to refresh
5. THE Skill_Loader SHALL support offline mode using cached skills when network is unavailable
