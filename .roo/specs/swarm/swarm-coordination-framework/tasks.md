# Tasks: Swarm Coordination Framework

## Phase 1: Core Protocol & Infrastructure
- [ ] Implement `ChecksumVerifier` and `JsonStreamBuffer`.
- [ ] Define `AgentMessage` Zod schemas.
- [ ] Create `IDaemon` core with agent registry and notification queues.

## Phase 2: Agent Roles & Communication
- [ ] Create base `Agent` class with lifecycle management.
- [ ] Implement `AgentMessageDispatcher` and point-to-point DM delivery.
- [ ] Create `Coordinator` and `WorktreeManager` specializations.

## Phase 3: Methodology Integration
- [ ] Implement `SkillLoader` for Superpowers integration.
- [ ] Integrate TDD and systematic debugging skills into worker agents.
- [ ] Implement two-stage review stage and systematic conflict resolution.

## Phase 4: Coordination & UI
- [ ] Implement Touch Notifications and Intent Broadcasting.
- [ ] Build Swarm and Plan info widgets with real-time event streaming.
- [ ] Implement daemon snapshots and crash recovery logic.

## Phase 5: Verification & End-to-End
- [ ] Comprehensive multi-agent simulation tests.
- [ ] Benchmark protocol latency and memory usage.
- [ ] Final integration with async_task tool.
