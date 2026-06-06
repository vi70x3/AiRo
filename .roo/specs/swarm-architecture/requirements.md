# Requirements Document

## Introduction

The Swarm Architecture is a comprehensive system for parallel agent coordination in async_task environments. It enables multiple agents to work concurrently on complex tasks through explicit communication, optional isolation via git worktrees, and coordinated planning. The system consists of three core roles: a Coordinator that manages overall planning and agent lifecycle, Worktree Managers that handle integration within isolated scopes, and Agents that execute tasks in parallel. The architecture emphasizes optimistic concurrency, explicit coordination through multiple communication channels, and crash recovery through daemon snapshots.

## Glossary

- **Coordinator**: The central agent responsible for creating initial plans, spawning agents, managing agent lifecycle, reviewing plan updates, and deciding on worktree usage
- **Worktree_Manager**: An agent that owns a single git worktree scope, coordinates work within that scope, and handles integration of changes
- **Agent**: A worker entity that executes tasks in parallel, proposes plan updates, and coordinates with other agents via communication channels
- **Swarm**: The collective system of Coordinator, Worktree Managers, and Agents working together
- **Plan**: The task execution strategy including task DAG, dependencies, ownership, scope, and checkpoints
- **Worktree**: An isolated git working directory that allows parallel work without conflicts
- **DM**: Direct message communication between two specific agents
- **Channel**: A topic-based group communication mechanism for multiple agents
- **Broadcast**: A message sent to all agents in the swarm
- **Context_Key**: A shared key-value storage mechanism for agent coordination
- **Daemon**: The persistent process that manages swarm state and enables crash recovery
- **Soft_Interrupt**: A non-blocking notification delivery mechanism for agent communication
- **Touch_Notification**: A signal indicating that a file has been modified by another agent
- **Intent_Field**: An optional declaration on tool calls indicating planned file modifications

## Requirements

### Requirement 1: Coordinator Agent Management

**User Story:** As a developer, I want a Coordinator to manage the overall swarm, so that complex tasks can be decomposed and executed in parallel.

#### Acceptance Criteria

1. THE Coordinator SHALL create an initial plan with task DAG, dependencies, ownership, scope, and checkpoints
2. WHEN a task requires execution, THE Coordinator SHALL spawn new Agents with appropriate context
3. WHEN an Agent proposes a plan update, THE Coordinator SHALL review and approve or reject the update
4. THE Coordinator SHALL decide whether to use git worktrees for task isolation
5. WHEN worktrees are used, THE Coordinator SHALL spawn Worktree_Managers for each worktree scope
6. THE Coordinator SHALL track agent lifecycle states: spawned, ready, running, blocked, completed, failed, stopped, crashed
7. WHEN an Agent reports completion, THE Coordinator SHALL record the outcome, changes, validation results, and blockers
8. THE Coordinator SHALL distribute plans out-of-band without storing them in the repository

### Requirement 2: Worktree Manager Coordination

**User Story:** As a developer, I want Worktree Managers to handle integration within isolated scopes, so that parallel work can be merged without conflicts.

#### Acceptance Criteria

1. THE Worktree_Manager SHALL own exactly one git worktree scope
2. THE Worktree_Manager SHALL coordinate work among all Agents assigned to its worktree
3. THE Worktree_Manager SHALL handle integration of changes within its worktree scope
4. THE Worktree_Manager SHALL communicate with the Coordinator for cross-worktree coordination
5. WHEN conflicts arise within its scope, THE Worktree_Manager SHALL coordinate resolution among assigned Agents

### Requirement 3: Agent Task Execution

**User Story:** As a developer, I want Agents to execute tasks in parallel, so that work can be completed faster.

#### Acceptance Criteria

1. WHEN spawned, THE Agent SHALL transition through lifecycle states: spawned → ready → running
2. THE Agent SHALL execute assigned tasks independently without requiring locks
3. WHEN a task is completed, THE Agent SHALL report back to the Coordinator with outcome, changes, validation, and blockers
4. WHEN a task cannot proceed, THE Agent SHALL transition to blocked state and communicate the blocker
5. IF an Agent crashes, THEN THE Agent SHALL transition to crashed state and enable recovery via daemon snapshot
6. THE Agent SHALL propose plan updates when task decomposition or dependencies change
7. THE Agent SHALL forward final responses automatically for spawn prompts, assigned tasks, and explicit task-control runs

### Requirement 4: Agent Lifecycle State Management

**User Story:** As a developer, I want clear agent lifecycle states, so that I can monitor and debug swarm execution.

#### Acceptance Criteria

1. THE Swarm SHALL support agent lifecycle states: spawned, ready, running, blocked, completed, failed, stopped, crashed
2. WHEN an Agent is created, THE Agent SHALL start in spawned state
3. WHEN an Agent is initialized and ready to work, THE Agent SHALL transition to ready state
4. WHEN an Agent begins task execution, THE Agent SHALL transition to running state
5. WHEN an Agent cannot proceed due to dependencies, THE Agent SHALL transition to blocked state
6. WHEN an Agent finishes successfully, THE Agent SHALL transition to completed state
7. WHEN an Agent encounters an unrecoverable error, THE Agent SHALL transition to failed state
8. WHEN an Agent is explicitly stopped, THE Agent SHALL transition to stopped state
9. WHEN an Agent crashes unexpectedly, THE Agent SHALL transition to crashed state

### Requirement 5: Direct Message Communication

**User Story:** As an Agent, I want to send direct messages to specific agents, so that I can coordinate one-on-one without broadcasting.

#### Acceptance Criteria

1. THE Agent SHALL send direct messages to any other Agent by agent identifier
2. WHEN a DM is sent, THE Swarm SHALL deliver it as a soft interrupt to the recipient
3. THE Agent SHALL receive DMs without blocking current execution
4. THE Agent SHALL query pending DMs at coordination points
5. THE DM SHALL include sender identifier, timestamp, and message content

### Requirement 6: Broadcast Communication

**User Story:** As an Agent, I want to broadcast messages to all agents, so that I can share important updates with the entire swarm.

#### Acceptance Criteria

1. THE Agent SHALL broadcast messages to all agents in the Swarm
2. WHEN a broadcast is sent, THE Swarm SHALL deliver it as a soft interrupt to all Agents
3. THE Agent SHALL receive broadcasts without blocking current execution
4. THE Agent SHALL query pending broadcasts at coordination points
5. THE Broadcast SHALL include sender identifier, timestamp, and message content

### Requirement 7: Topic Channel Communication

**User Story:** As an Agent, I want to join topic channels for group discussions, so that I can coordinate with relevant agents without spamming everyone.

#### Acceptance Criteria

1. THE Agent SHALL create new topic channels with a unique channel name
2. THE Agent SHALL join existing topic channels by channel name
3. THE Agent SHALL send messages to a channel that all members receive
4. THE Agent SHALL discover available channels in the Swarm
5. THE Agent SHALL inspect channel membership to see who is subscribed
6. WHEN a channel message is sent, THE Swarm SHALL deliver it as a soft interrupt to all channel members
7. THE Agent SHALL leave channels when no longer needed

### Requirement 8: Shared Context Keys

**User Story:** As an Agent, I want to share data via context keys, so that I can coordinate state without direct messaging.

#### Acceptance Criteria

1. THE Agent SHALL write values to shared context keys by key name
2. THE Agent SHALL read values from shared context keys by key name
3. THE Agent SHALL list all available context keys in the Swarm
4. WHEN a context key is updated, THE Swarm SHALL optionally notify subscribed Agents
5. THE Context_Key SHALL support atomic read-modify-write operations for coordination

### Requirement 9: Soft Interrupt Notification Delivery

**User Story:** As an Agent, I want notifications delivered as soft interrupts, so that I can continue working without blocking on communication.

#### Acceptance Criteria

1. THE Swarm SHALL deliver DMs, broadcasts, and channel messages as soft interrupts
2. THE Soft_Interrupt SHALL not block the receiving Agent's current execution
3. THE Agent SHALL check for pending notifications at coordination points
4. THE Soft_Interrupt SHALL include notification type, sender, timestamp, and content
5. THE Agent SHALL process notifications in FIFO order within each notification type

### Requirement 10: File Touch Notifications

**User Story:** As an Agent, I want to be notified when files I'm working on are modified, so that I can detect and resolve conflicts.

#### Acceptance Criteria

1. WHEN an Agent modifies a file, THE Swarm SHALL send touch notifications to all other Agents
2. THE Touch_Notification SHALL include file path, modifying agent identifier, and timestamp
3. THE Agent SHALL receive touch notifications as soft interrupts
4. THE Agent SHALL compare touch notifications against its own working set to detect conflicts
5. WHEN a conflict is detected, THE Agent SHALL coordinate directly with the modifying Agent for resolution

### Requirement 11: Intent Field for Conflict Prevention

**User Story:** As an Agent, I want to declare my intent before modifying files, so that other agents can avoid conflicts proactively.

#### Acceptance Criteria

1. THE Agent SHALL optionally include an intent field on tool calls that modify files
2. THE Intent_Field SHALL specify the file paths the Agent plans to modify
3. WHEN an intent is declared, THE Swarm SHALL broadcast the intent to all Agents
4. THE Agent SHALL receive intent notifications as soft interrupts
5. THE Agent SHALL use intent notifications to avoid conflicting modifications

### Requirement 12: Optimistic Concurrency Without Locks

**User Story:** As a developer, I want agents to work without locks, so that parallelism is maximized.

#### Acceptance Criteria

1. THE Swarm SHALL allow multiple Agents to work concurrently without acquiring locks
2. THE Swarm SHALL use touch notifications and intent fields for conflict detection, not prevention
3. WHEN conflicts occur, THE Agents SHALL coordinate directly to resolve them
4. THE Swarm SHALL not block Agent execution based on file access patterns

### Requirement 13: Git Worktree Isolation

**User Story:** As a developer, I want optional git worktree isolation, so that agents can work on separate branches without conflicts.

#### Acceptance Criteria

1. WHEN the Coordinator decides to use worktrees, THE Coordinator SHALL create separate git worktrees for isolated work
2. THE Coordinator SHALL assign each worktree to exactly one Worktree_Manager
3. THE Worktree_Manager SHALL coordinate all Agents working within its worktree scope
4. THE Worktree_Manager SHALL handle integration of changes within its worktree
5. THE Coordinator SHALL coordinate integration across multiple worktrees
6. WHEN worktrees are not used, THE Swarm SHALL operate in a single shared working directory

### Requirement 14: Daemon Snapshot for Crash Recovery

**User Story:** As a developer, I want daemon snapshots for crash recovery, so that swarm state can be restored after failures.

#### Acceptance Criteria

1. THE Daemon SHALL periodically snapshot swarm state including agent states, plan, and communication queues
2. WHEN an Agent crashes, THE Daemon SHALL preserve the crashed state in the snapshot
3. THE Daemon SHALL enable recovery by restoring swarm state from the most recent snapshot
4. THE Daemon SHALL include agent lifecycle states, pending messages, and plan state in snapshots
5. THE Daemon SHALL persist snapshots to durable storage

### Requirement 15: Plan Evolution and Updates

**User Story:** As an Agent, I want to propose plan updates, so that the plan can adapt to discovered complexity or changing requirements.

#### Acceptance Criteria

1. THE Agent SHALL propose plan updates including new tasks, modified dependencies, or changed scope
2. WHEN a plan update is proposed, THE Agent SHALL send it to the Coordinator for review
3. THE Coordinator SHALL review the proposed update and approve or reject it
4. WHEN a plan update is approved, THE Coordinator SHALL distribute the updated plan to all Agents
5. THE Coordinator SHALL maintain plan version history for rollback and debugging

### Requirement 16: Swarm Info Widget UI

**User Story:** As a developer, I want a real-time swarm info widget, so that I can visualize agent status and communication channels.

#### Acceptance Criteria

1. THE Swarm_Info_Widget SHALL display a real-time graph of all Agents, Worktree_Managers, and the Coordinator
2. THE Swarm_Info_Widget SHALL show agent lifecycle states with visual indicators
3. THE Swarm_Info_Widget SHALL display active channels and their members
4. THE Swarm_Info_Widget SHALL update in real-time as agent states change
5. THE Swarm_Info_Widget SHALL allow clicking on agents to view detailed status

### Requirement 17: Plan Info Widget UI

**User Story:** As a developer, I want a plan info widget, so that I can visualize task dependencies and progress.

#### Acceptance Criteria

1. THE Plan_Info_Widget SHALL display the task DAG with dependencies as a directed graph
2. THE Plan_Info_Widget SHALL show task owner, scope, status, and checkpoints for each task
3. THE Plan_Info_Widget SHALL highlight critical path and blocked tasks
4. THE Plan_Info_Widget SHALL update in real-time as tasks progress
5. THE Plan_Info_Widget SHALL allow clicking on tasks to view detailed information

### Requirement 18: Completion Reporting

**User Story:** As an Agent, I want to report completion with detailed results, so that the Coordinator can track progress and outcomes.

#### Acceptance Criteria

1. WHEN a task completes, THE Agent SHALL report outcome (success, failure, partial)
2. THE Agent SHALL report changes made including modified files and their diffs
3. THE Agent SHALL report validation results including test outcomes and verification status
4. THE Agent SHALL report blockers encountered during execution
5. THE Coordinator SHALL record all completion reports for audit and debugging
6. THE Agent SHALL automatically forward final responses for spawn prompts, assigned tasks, and explicit task-control runs

### Requirement 19: Channel Discovery and Inspection

**User Story:** As an Agent, I want to discover and inspect channels, so that I can join relevant discussions.

#### Acceptance Criteria

1. THE Agent SHALL list all active channels in the Swarm
2. THE Agent SHALL query channel metadata including name, topic, and creation time
3. THE Agent SHALL inspect channel membership to see all subscribed Agents
4. THE Agent SHALL query channel message history
5. THE Agent SHALL search for channels by topic or keyword

### Requirement 20: Cross-Agent Conflict Resolution

**User Story:** As an Agent, I want to coordinate directly with other agents for conflict resolution, so that conflicts can be resolved efficiently.

#### Acceptance Criteria

1. WHEN a conflict is detected via touch notification, THE Agent SHALL identify the conflicting Agent
2. THE Agent SHALL initiate direct communication with the conflicting Agent via DM
3. THE Agents SHALL negotiate conflict resolution strategy (merge, rebase, manual resolution)
4. WHEN resolution requires Coordinator involvement, THE Agents SHALL escalate to the Coordinator
5. THE Agents SHALL report resolution outcome to the Coordinator for plan updates
