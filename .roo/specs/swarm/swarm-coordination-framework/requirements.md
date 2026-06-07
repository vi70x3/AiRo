# Requirements: Swarm Coordination Framework

## Introduction

The Swarm Coordination Framework enables sophisticated multi-agent parallel execution through a hierarchical coordination model, reliable inter-agent communication, and systematic development methodologies. It transforms simple parallel subtasks into a collaborative swarm consisting of a Coordinator, Worktree Managers, and specialized Agents. The system ensures reliability via a JSON-first communication protocol with checksums and incorporates "Superpowers" development patterns (TDD, systematic debugging, structured planning) into the parallel workflow.

## Glossary

- **Coordinator**: Orchestrator responsible for planning, spawning, and lifecycle management.
- **Worktree Manager**: Agent owning an isolated git worktree scope for safe parallel work.
- **AgentMessage**: Structured JSON envelope (roo-agent/v1) with SHA-256 checksums.
- **JsonStreamBuffer**: Streaming harness that accumulates full responses before parsing.
- **Superpowers**: Methodology framework providing systematic skills (TDD, debugging).
- **Soft Interrupt**: Non-blocking notification delivery mechanism.

## Requirements

### Requirement 1: Hierarchical Coordination
1. THE system SHALL support a three-tier hierarchy: Coordinator -> Worktree Managers -> Agents.
2. THE Coordinator SHALL manage the global task DAG, dependencies, and ownership.
3. THE Worktree Manager SHALL coordinate agents within an isolated git worktree and handle intra-scope integration.
4. THE system SHALL track agent states: spawned, ready, running, blocked, completed, failed, stopped, crashed.

### Requirement 2: Reliable Inter-Agent Communication
1. ALL inter-agent communication SHALL use the AgentMessage JSON protocol with protocol versioning (e.g., `roo-agent/v1`).
2. EVERY AgentMessage SHALL include a SHA-256 checksum of its payload for integrity verification.
3. THE system SHALL implement a `JsonStreamBuffer` to accumulate complete LLM responses before parsing as structured JSON.
4. THE system SHALL support automatic retries with exponential backoff for failed message deliveries.

### Requirement 3: Systematic Development Methodology (Superpowers)
1. THE system SHALL inject Superpowers skills (TDD, debugging, planning, review) into subtask agent contexts.
2. SUBTASK agents SHALL follow the RED-GREEN-REFACTOR cycle for code implementation.
3. THE system SHALL perform a two-stage code review (spec compliance, then quality) before merging subtask branches.
4. THE system SHALL implement systematic conflict resolution using Superpowers patterns when merging parallel work.

### Requirement 4: Real-time Observation & Evolution
1. THE system SHALL support proactive conflict detection via Touch Notifications and Intent Broadcasting.
2. THE system SHALL provide real-time visualization of the swarm and plan state.
3. AGENTS SHALL be able to propose plan updates (proposePlanUpdate) as new complexity is discovered.

## Out of Scope
- Cross-repository messaging.
- Persistent storage of individual messages (except via daemon snapshots).
- Automatic model-specific prompt optimization for communication.

## Acceptance Criteria Summary

| ID | Description | Key Metric |
|----|-------------|------------|
| AC-1 | Hierarchy | Coordinator/WM/Agent roles established |
| AC-2 | Protocol | JSON-first with SHA-256 checksums |
| AC-3 | Reliability | Retries on checksum/parse failure |
| AC-4 | Methodology | TDD cycle enforced in subtasks |
| AC-5 | Isolation | Git worktrees used for parallel scopes |
