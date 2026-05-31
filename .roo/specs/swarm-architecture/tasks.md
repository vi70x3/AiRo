# Implementation Plan: Swarm Architecture

## Overview

This implementation plan transforms the existing async_task system into a full multi-agent coordination framework. The implementation follows a bottom-up approach: first establishing core data models and infrastructure (daemon, communication), then building agent roles (base agent, coordinator, worktree manager), followed by coordination features (conflict detection, plan management), recovery mechanisms, and finally UI components. Each task builds incrementally, with checkpoints to validate functionality before proceeding.

## Tasks

- [ ] 1. Set up core data models and type definitions
  - [ ] 1.1 Create TypeScript interfaces for agent lifecycle and state management
    - Define `AgentState`, `AgentMetadata`, `IAgent` interfaces
    - Define lifecycle state machine types: `spawned`, `ready`, `running`, `blocked`, `completed`, `failed`, `stopped`, `crashed`
    - Create agent type discriminators: `coordinator`, `worktree_manager`, `agent`
    - _Requirements: 1.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_
  
  - [ ] 1.2 Create TypeScript interfaces for communication messages
    - Define `DirectMessage`, `BroadcastMessage`, `ChannelMessage` interfaces
    - Define `TouchNotification`, `IntentNotification`, `ContextKeyNotification` interfaces
    - Define `Notification` and `NotificationQueue` interfaces
    - _Requirements: 5.5, 6.5, 7.6, 9.4, 10.2, 11.4_
  
  - [ ] 1.3 Create TypeScript interfaces for plan management
    - Define `Plan`, `Task`, `Dependency`, `Checkpoint` interfaces
    - Define `PlanUpdate`, `PlanChange`, `PlanUpdateDecision` interfaces
    - Include task status types: `pending`, `in_progress`, `blocked`, `completed`, `failed`
    - _Requirements: 1.1, 15.1, 15.4, 15.5_
  
  - [ ] 1.4 Create TypeScript interfaces for worktree and conflict management
    - Define `WorktreeMetadata`, `ConflictInfo`, `ConflictResolution` interfaces
    - Define `MergePreparation`, `WorkingSet`, `FileStatus` interfaces
    - Include conflict severity levels and resolution strategies
    - _Requirements: 2.1, 2.3, 2.5, 10.4, 13.1, 13.2, 13.3, 13.4_
  
  - [ ] 1.5 Create TypeScript interfaces for completion reporting
    - Define `CompletionReport`, `FileChange`, `ValidationResult`, `Blocker` interfaces
    - Include outcome types: `success`, `failure`, `partial`
    - _Requirements: 1.7, 3.3, 18.1, 18.2, 18.3, 18.4, 18.5_

- [ ] 2. Implement daemon core infrastructure
  - [ ] 2.1 Create daemon process with agent registry
    - Implement `IDaemon` interface with agent registration/unregistration
    - Create in-memory agent registry with CRUD operations
    - Implement `registerAgent()`, `unregisterAgent()`, `getAgent()`, `listAgents()` methods
    - Add agent lifecycle state tracking
    - _Requirements: 1.6, 4.1, 4.2_
  
  - [ ] 2.2 Implement notification queue system
    - Create per-agent notification queues with FIFO ordering
    - Implement `getPendingNotifications()` method
    - Add notification delivery tracking (delivered, acknowledged)
    - Support notification type filtering
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [ ] 2.3 Implement communication channel management
    - Create channel registry with create/join/leave operations
    - Implement `createChannel()`, `joinChannel()`, `leaveChannel()` methods
    - Implement `listChannels()`, `getChannelMembers()` methods
    - Track channel membership and message history
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 19.1, 19.2, 19.3_
  
  - [ ] 2.4 Implement context key storage
    - Create shared key-value store with atomic operations
    - Implement `setContextKey()`, `getContextKey()`, `listContextKeys()` methods
    - Add subscription mechanism for key updates
    - Implement `subscribeToKey()` method
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [ ] 2.5 Implement plan management in daemon
    - Add plan storage and versioning
    - Implement `setPlan()`, `getPlan()` methods
    - Store plan out-of-band (not in repository)
    - Track plan version history
    - _Requirements: 1.1, 1.8, 15.4, 15.5_

- [ ] 3. Implement soft interrupt delivery system
  - [ ] 3.1 Implement direct message delivery
    - Create `sendDM()` method with sender/recipient addressing
    - Deliver DMs as soft interrupts to recipient's notification queue
    - Ensure FIFO ordering per sender-recipient pair
    - Include sender ID, timestamp, message content
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [ ] 3.2 Implement broadcast message delivery
    - Create `broadcast()` method for swarm-wide messages
    - Deliver broadcasts to all active agents as soft interrupts
    - Include sender ID, timestamp, message content, recipient list
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [ ] 3.3 Implement channel message delivery
    - Create `sendToChannel()` method for topic-based messaging
    - Deliver channel messages only to subscribed members
    - Deliver as soft interrupts with channel context
    - _Requirements: 7.3, 7.6_
  
  - [ ] 3.4 Implement touch notification broadcasting
    - Create `notifyFileTouch()` method triggered on file modifications
    - Broadcast touch notifications to all agents except modifier
    - Include file path, modifying agent ID, timestamp, operation type
    - _Requirements: 10.1, 10.2, 10.3_
  
  - [ ] 3.5 Implement intent notification broadcasting
    - Create `broadcastIntent()` method for proactive conflict prevention
    - Broadcast intent to all agents when file modification is planned
    - Include declaring agent ID, file paths, timestamp, tool name
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 4. Checkpoint - Validate daemon infrastructure
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement base agent functionality
  - [ ] 5.1 Create base Agent class with lifecycle management
    - Implement `IAgent` interface
    - Initialize agent with ID, type, parent ID, worktree scope
    - Implement lifecycle state transitions: spawned → ready → running
    - Add heartbeat mechanism for liveness tracking
    - _Requirements: 3.1, 4.2, 4.3, 4.4_
  
  - [ ] 5.2 Implement agent communication methods
    - Implement `sendDM()`, `broadcast()`, `joinChannel()`, `leaveChannel()`, `sendToChannel()` methods
    - Connect to daemon's communication infrastructure
    - Handle communication errors gracefully
    - _Requirements: 5.1, 6.1, 7.1, 7.2, 7.3, 7.7_
  
  - [ ] 5.3 Implement agent context key operations
    - Implement `setContextKey()`, `getContextKey()`, `subscribeToKey()` methods
    - Connect to daemon's context key storage
    - Handle atomic read-modify-write operations
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [ ] 5.4 Implement notification checking and processing
    - Implement `checkPendingNotifications()` method
    - Add coordination points: before file-modifying tools, after checkpoints, when entering blocked state
    - Process notifications in priority order: touch, intent, DMs, channel, broadcast, context key updates
    - _Requirements: 9.3, 9.5_
  
  - [ ] 5.5 Implement working set management
    - Create `WorkingSet` data structure to track file access patterns
    - Track file status: `read`, `intent`, `modified`, `committed`
    - Update working set on file operations
    - _Requirements: 10.4, 11.5_
  
  - [ ] 5.6 Implement plan update proposal
    - Implement `proposePlanUpdate()` method
    - Create `PlanUpdate` with changes, reason, impact assessment
    - Send proposal to Coordinator via DM
    - Handle approval/rejection notifications
    - _Requirements: 3.6, 15.1, 15.2, 15.3_
  
  - [ ] 5.7 Implement completion reporting
    - Implement `reportCompletion()` method
    - Create `CompletionReport` with outcome, changes, validation, blockers
    - Report to Coordinator with detailed results
    - Auto-forward final responses for spawn prompts and assigned tasks
    - _Requirements: 3.3, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

- [ ] 6. Implement Coordinator agent
  - [ ] 6.1 Create Coordinator class extending base Agent
    - Implement `ICoordinator` interface
    - Initialize as root agent with coordinator type
    - Set up coordinator-specific state management
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_
  
  - [ ] 6.2 Implement initial plan creation
    - Implement `createInitialPlan()` method
    - Parse task description into task DAG
    - Assign dependencies, ownership, scope, checkpoints
    - Store plan in daemon
    - _Requirements: 1.1_
  
  - [ ] 6.3 Implement worktree decision logic
    - Implement `decideWorktreeUsage()` method
    - Analyze plan for isolation requirements
    - Decide whether to use git worktrees based on task complexity and conflicts
    - _Requirements: 1.4, 13.1, 13.6_
  
  - [ ] 6.4 Implement agent spawning
    - Implement `spawnAgent()` method for worker agents
    - Implement `spawnWorktreeManager()` method for worktree managers
    - Assign tasks, modes, and context to spawned agents
    - Track spawned agents in registry
    - _Requirements: 1.2, 1.5_
  
  - [ ] 6.5 Implement plan update review and approval
    - Implement `reviewPlanUpdate()` method
    - Validate proposed changes for cycles, conflicts, resource implications
    - Approve or reject updates with reasoning
    - Distribute approved plan updates to all agents
    - _Requirements: 1.3, 15.2, 15.3, 15.4, 15.5_
  
  - [ ] 6.6 Implement agent lifecycle tracking
    - Implement `trackAgentState()` method
    - Monitor agent state transitions
    - Handle agent completion and failure events
    - Maintain audit trail of agent activities
    - _Requirements: 1.6, 1.7_
  
  - [ ] 6.7 Implement plan distribution
    - Implement `distributePlan()` method
    - Serialize plan to JSON
    - Broadcast plan updates to all agents
    - Ensure agents retrieve and apply updated plans
    - _Requirements: 1.8, 15.4_

- [ ] 7. Implement Worktree Manager agent
  - [ ] 7.1 Create WorktreeManager class extending base Agent
    - Implement `IWorktreeManager` interface
    - Initialize with worktree path, branch name, assigned agents
    - Set up worktree-specific state management
    - _Requirements: 2.1, 2.2, 13.2, 13.3_
  
  - [ ] 7.2 Implement intra-worktree conflict detection
    - Implement `detectConflicts()` method
    - Monitor touch notifications within worktree scope
    - Identify conflicting agents and file paths
    - Create `ConflictInfo` records
    - _Requirements: 2.3, 2.5, 10.4_
  
  - [ ] 7.3 Implement conflict resolution coordination
    - Implement `coordinateResolution()` method
    - Facilitate DM-based negotiation between conflicting agents
    - Assign resolution strategies: sequential, merge, rebase, escalate
    - Update conflict status as resolution progresses
    - _Requirements: 2.5, 20.1, 20.2, 20.3, 20.4_
  
  - [ ] 7.4 Implement merge preparation
    - Implement `prepareForMerge()` method
    - Validate all conflicts resolved
    - Run validation checks and tests
    - Create `MergePreparation` report
    - _Requirements: 2.4, 13.4_
  
  - [ ] 7.5 Implement cross-worktree coordination
    - Communicate with Coordinator for cross-worktree conflicts
    - Escalate unresolved conflicts to Coordinator
    - Handle Coordinator decisions and plan updates
    - _Requirements: 2.4, 13.5_

- [ ] 8. Implement conflict detection and resolution
  - [ ] 8.1 Implement touch notification handling in agents
    - Add touch notification handler to base Agent
    - Compare touch notifications against agent's working set
    - Determine conflict severity: critical, high, medium, low
    - Initiate conflict resolution for medium+ severity
    - _Requirements: 10.3, 10.4, 10.5, 12.3_
  
  - [ ] 8.2 Implement intent notification handling in agents
    - Add intent notification handler to base Agent
    - Check intent against agent's working set
    - Negotiate priority via DM when conflicts detected
    - Update working set with conflict awareness
    - _Requirements: 11.4, 11.5, 12.3_
  
  - [ ] 8.3 Implement conflict resolution strategies
    - Implement sequential resolution (one agent waits)
    - Implement merge resolution (both proceed, merge later)
    - Implement rebase resolution (one agent rebases)
    - Implement escalation to Worktree Manager or Coordinator
    - _Requirements: 20.3, 20.4, 20.5_
  
  - [ ] 8.4 Implement optimistic concurrency without locks
    - Ensure agents work without acquiring file locks
    - Use touch and intent notifications for detection, not prevention
    - Allow concurrent file access with reactive conflict resolution
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [ ] 9. Checkpoint - Validate agent coordination
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement daemon snapshot and crash recovery
  - [ ] 10.1 Implement snapshot creation
    - Implement `createSnapshot()` method
    - Collect agent registry, notification queues, channels, context keys, plan
    - Serialize to JSON with snapshot ID and timestamp
    - Write to persistent storage: `~/.kiro/swarm/snapshots/{swarmId}/{snapshotId}.json`
    - _Requirements: 14.1, 14.4_
  
  - [ ] 10.2 Implement periodic snapshot scheduling
    - Schedule snapshots every 30 seconds during active swarm
    - Prune old snapshots (keep last 10)
    - Create final snapshot on swarm completion
    - _Requirements: 14.1_
  
  - [ ] 10.3 Implement crash recovery
    - Implement `restoreFromSnapshot()` method
    - Load most recent snapshot from persistent storage
    - Restore agent states, notification queues, plan
    - Resume agents from crashed state
    - _Requirements: 14.2, 14.3, 14.5_
  
  - [ ] 10.4 Implement snapshot listing and management
    - Implement `listSnapshots()` method
    - Provide snapshot metadata: ID, timestamp, swarm ID, coordinator ID
    - Support snapshot cleanup and archival
    - _Requirements: 14.5_

- [ ] 11. Implement git worktree isolation
  - [ ] 11.1 Implement worktree creation in Coordinator
    - Create git worktrees for isolated scopes when decided
    - Assign unique branch names per worktree
    - Track worktree metadata: path, branch, base branch, manager ID
    - _Requirements: 13.1, 13.2_
  
  - [ ] 11.2 Implement worktree assignment to Worktree Managers
    - Spawn Worktree Manager for each worktree
    - Assign agents to worktree scopes
    - Coordinate work within worktree boundaries
    - _Requirements: 13.2, 13.3_
  
  - [ ] 11.3 Implement worktree integration
    - Handle integration of changes within worktree
    - Coordinate merge back to main branch
    - Resolve cross-worktree conflicts via Coordinator
    - _Requirements: 13.4, 13.5_
  
  - [ ] 11.4 Implement non-worktree mode
    - Support swarm operation without worktrees
    - Use single shared working directory
    - Apply same coordination mechanisms without isolation
    - _Requirements: 13.6_

- [ ] 12. Implement UI components
  - [ ] 12.1 Create Swarm Info Widget
    - Display real-time graph of all agents (Coordinator, Worktree Managers, Agents)
    - Show agent lifecycle states with visual indicators
    - Display active channels and their members
    - Update in real-time as agent states change
    - Support clicking on agents for detailed status
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_
  
  - [ ] 12.2 Create Plan Info Widget
    - Display task DAG with dependencies as directed graph
    - Show task owner, scope, status, checkpoints for each task
    - Highlight critical path and blocked tasks
    - Update in real-time as tasks progress
    - Support clicking on tasks for detailed information
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_
  
  - [ ] 12.3 Implement event streaming infrastructure
    - Create WebSocket or SSE connection from UI to daemon
    - Stream agent state changes, plan updates, communication events
    - Handle reconnection and state synchronization
    - _Requirements: 16.4, 17.4_

- [ ] 13. Integration and wiring
  - [ ] 13.1 Wire daemon to agent lifecycle
    - Connect agent registration to daemon on spawn
    - Connect agent heartbeats to daemon for liveness tracking
    - Connect agent state transitions to daemon for tracking
    - _Requirements: 1.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_
  
  - [ ] 13.2 Wire communication infrastructure to agents
    - Connect agent communication methods to daemon's delivery system
    - Ensure soft interrupt delivery to notification queues
    - Wire notification checking to coordination points
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 7.3, 7.6, 9.1, 9.2, 9.3_
  
  - [ ] 13.3 Wire plan management across Coordinator and agents
    - Connect plan creation to daemon storage
    - Wire plan update proposals from agents to Coordinator
    - Connect plan distribution from Coordinator to all agents
    - _Requirements: 1.1, 1.3, 1.8, 15.1, 15.2, 15.3, 15.4, 15.5_
  
  - [ ] 13.4 Wire conflict detection to touch and intent notifications
    - Connect file modification tools to touch notification broadcasting
    - Wire intent field on tools to intent notification broadcasting
    - Connect notification handlers to conflict detection logic
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 11.1, 11.2, 11.3, 11.4, 11.5_
  
  - [ ] 13.5 Wire UI widgets to daemon state
    - Connect Swarm Info Widget to daemon agent registry
    - Connect Plan Info Widget to daemon plan storage
    - Wire event streaming to real-time updates
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 17.1, 17.2, 17.3, 17.4, 17.5_

- [ ] 14. Final checkpoint - Validate end-to-end swarm execution
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks reference specific requirements for traceability
- Checkpoints ensure incremental validation at major milestones
- The implementation follows a bottom-up approach: infrastructure → roles → coordination → recovery → UI
- Each task builds on previous tasks with clear dependencies
- TypeScript is used throughout for type safety and maintainability
- The design emphasizes optimistic concurrency and explicit coordination
- Daemon snapshots enable crash recovery without data loss
- UI widgets provide real-time visibility into swarm state

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 3, "tasks": ["5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "5.5"] },
    { "id": 5, "tasks": ["5.6", "5.7", "6.1", "7.1"] },
    { "id": 6, "tasks": ["6.2", "6.3"] },
    { "id": 7, "tasks": ["6.4", "7.2"] },
    { "id": 8, "tasks": ["6.5", "6.6", "7.3", "8.1", "8.2"] },
    { "id": 9, "tasks": ["6.7", "7.4", "7.5", "8.3", "8.4"] },
    { "id": 10, "tasks": ["10.1", "11.1"] },
    { "id": 11, "tasks": ["10.2", "10.3", "10.4", "11.2"] },
    { "id": 12, "tasks": ["11.3", "11.4"] },
    { "id": 13, "tasks": ["12.1", "12.2", "12.3"] },
    { "id": 14, "tasks": ["13.1", "13.2"] },
    { "id": 15, "tasks": ["13.3", "13.4", "13.5"] }
  ]
}
```
