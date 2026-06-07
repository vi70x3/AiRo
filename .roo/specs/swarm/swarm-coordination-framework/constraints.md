# Constraints: Swarm Coordination Framework

## MUST Rules
1. ALL inter-agent communication MUST use the JSON-first protocol with checksums.
2. SUBTASK agents MUST follow the TDD cycle when implementing code.
3. THE system SHALL perform a review before merging parallel subtasks.
4. THE Coordinator SHALL remain the single source of truth for the global plan.

## MUST NOT Rules
1. AGENTS MUST NOT execute tasks based on unverified (checksum failure) or partial messages.
2. THE system MUST NOT auto-resolve conflicts outside of the allowlist (e.g., non-trivial code conflicts).

## Assumptions
1. Git worktrees are available for isolation when requested.
2. The Daemon process is persistent across agent lifetimes.
