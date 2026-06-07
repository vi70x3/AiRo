# Requirements Document

## Introduction

The Multi-Agent Architecture with JSON-First Communication Protocol addresses a fundamental reliability problem in inter-agent communication: streaming JSON parsing is fundamentally unreliable for agent-to-agent messaging. When a model drops mid-stream due to rate limits, context window exhaustion, or network issues, the receiving agent gets partial tool calls that are either silently dropped, executed with garbage arguments, or leave orphaned `tool_use` blocks with no matching `tool_result`.

The core innovation is to **force full JSON communication with checksums**. Instead of the current free-form streaming where tool calls are interleaved with text reasoning, multi-agent communication uses a fully structured JSON envelope with a SHA-256 checksum that the worker can verify to know when the task is complete. This protocol enhances the existing swarm architecture (defined in `.roo/specs/swarm-architecture/`) with reliable, verifiable message delivery between agents.

This spec integrates with the existing `NativeToolCallParser` in `src/core/assistant-message/NativeToolCallParser.ts`, the `AsyncSubtaskManager` in `src/core/subtasks/AsyncSubtaskManager.ts`, and the swarm infrastructure in `src/core/swarm/`. The JSON-first protocol is an **enhancement layer** that sits on top of the existing streaming infrastructure, not a replacement.

## Glossary

- **AgentMessage**: A structured JSON envelope used for all inter-agent communication, containing protocol version, sender/recipient, payload, and checksum.
- **Checksum**: A SHA-256 hash of the canonical JSON representation (sorted keys, no whitespace) of the AgentMessage payload, used to verify message completeness.
- **JsonStreamBuffer**: A new component that accumulates the complete streaming response from an LLM API call before attempting to parse it as a structured message, replacing the partial-parse approach for inter-agent communication.
- **ChecksumVerifier**: A new component that computes and verifies SHA-256 checksums of AgentMessage payloads to detect incomplete or corrupted messages.
- **AgentMessageDispatcher**: A new component that routes validated AgentMessage envelopes between agents via the existing `ChannelManager` and `Daemon` infrastructure.
- **Streaming Harness**: The combination of JsonStreamBuffer and ChecksumVerifier that ensures only complete, verified messages are dispatched to worker agents.
- **Protocol Version**: A field in the AgentMessage envelope (e.g., `"roo-agent/v1"`) that enables backwards compatibility with legacy workers.
- **Canonical JSON**: A deterministic JSON representation with sorted keys and no extraneous whitespace, used as input to the checksum algorithm.
- **Legacy Worker**: An agent that does not understand the JSON-first protocol and receives messages in the existing free-form text + tool call format.
- **Coordinator**: The central agent responsible for creating plans, spawning agents, and managing lifecycle, as defined in `.roo/specs/swarm-architecture/`.
- **Worker**: An agent that executes tasks assigned by the Coordinator, as defined in `.roo/specs/swarm-architecture/`.
- **NativeToolCallParser**: The existing streaming tool call parser in `src/core/assistant-message/NativeToolCallParser.ts` that accumulates JSON argument chunks via `processStreamingChunk()` and uses `partial-json` to parse incomplete JSON.
- **AsyncSubtaskManager**: The existing subtask lifecycle manager in `src/core/subtasks/AsyncSubtaskManager.ts` that manages parallel subtask spawning and merging.
- **SpawnManager**: The existing agent spawner in `src/core/swarm/coordinator/spawn-manager.ts` that creates agents and worktree managers.
- **ChannelManager**: The existing communication channel manager in `src/core/swarm/daemon/channel-manager.ts` that manages topic-based group communication.
- **PlanManager**: The existing plan state manager in `src/core/swarm/daemon/plan-manager.ts` that manages plan state and task status updates.
- **PlanInfoWidget**: The existing UI component in `webview-ui/src/components/swarm/PlanInfoWidget.tsx` that displays plan state.

## Requirements

### Requirement 1: AgentMessage Protocol

**User Story:** As a developer, I want inter-agent communication to use a structured JSON envelope format so that messages are unambiguous, self-describing, and verifiable.

#### Acceptance Criteria

1. THE AgentMessage SHALL define a JSON envelope with the following required fields:
   - `protocol`: string identifier (e.g., `"roo-agent/v1"`) for protocol versioning
   - `id`: unique message identifier (UUID v4)
   - `sender`: agent identifier of the sending agent
   - `recipient`: agent identifier of the receiving agent (or `"broadcast"` for broadcast messages)
   - `timestamp`: Unix epoch milliseconds
   - `payload`: structured payload whose type depends on the message type
   - `checksum`: SHA-256 hex digest of the canonical JSON representation of the `payload` field
2. THE AgentMessage SHALL support the following payload types:
   - `task_assignment`: `{ task: Task, context: string, dependencies: string[] }` — Coordinator assigns a task to a Worker
   - `task_result`: `{ taskId: string, outcome: "success" | "failure" | "partial", changes: FileChange[], validation: ValidationResult[], blockers: Blocker[] }` — Worker reports task completion
   - `plan_update`: `{ planId: string, version: number, changes: PlanChange[], reason: string }` — Worker proposes plan modification
   - `plan_approval`: `{ updateId: string, approved: boolean, reason: string }` — Coordinator approves/rejects plan update
   - `message`: `{ content: string, channel?: string }` — Direct or channel text communication
   - `conflict_notification`: `{ filePath: string, conflictingAgent: string, resolution: string }` — Conflict detection and resolution
3. THE AgentMessage SHALL be serializable to and deserializable from JSON without loss of fidelity.
4. WHEN an AgentMessage is serialized, the `checksum` field SHALL be computed from the `payload` field using canonical JSON + SHA-256.
5. THE AgentMessage schema SHALL be defined using Zod for runtime validation, following the existing pattern in `packages/types/src/mode.ts`.

### Requirement 2: Checksum Verification

**User Story:** As a worker agent, I want to verify the integrity of every inter-agent message before acting on it, so that I never execute a task based on a partial or corrupted message.

#### Acceptance Criteria

1. THE ChecksumVerifier SHALL compute a SHA-256 hash of the canonical JSON representation of the payload (sorted keys, no whitespace).
2. WHEN an AgentMessage is received, THE ChecksumVerifier SHALL recompute the checksum from the payload and compare it against the `checksum` field in the envelope.
3. IF the checksums match, THE ChecksumVerifier SHALL mark the message as verified and allow dispatch.
4. IF the checksums do not match, THE ChecksumVerifier SHALL mark the message as incomplete and trigger the retry mechanism (REQ-6).
5. THE ChecksumVerifier SHALL use the `canonicalize()` function to produce deterministic JSON:
   - All object keys sorted alphabetically (Unicode code point order)
   - No whitespace outside of string values
   - Numbers represented in their parsed form (no trailing zeros)
6. THE ChecksumVerifier SHALL operate on the `payload` field only — the envelope metadata (`protocol`, `id`, `sender`, `recipient`, `timestamp`, `checksum`) is excluded from checksum computation.
7. THE ChecksumVerifier SHALL complete verification in under 5ms per message for payloads up to 1MB.

### Requirement 3: Streaming Harness

**User Story:** As a developer, I want a streaming harness that accumulates the complete LLM response before parsing, so that inter-agent messages are never parsed from partial streams.

#### Acceptance Criteria

1. THE JsonStreamBuffer SHALL accumulate the complete streaming response from an LLM API call into a single string buffer before attempting to parse it as an AgentMessage.
2. THE JsonStreamBuffer SHALL be used **only** for inter-agent communication — the existing `NativeToolCallParser` streaming approach (with `partial-json`) continues to work for within-agent tool calls.
3. WHEN the API stream completes (stream ends without error), THE JsonStreamBuffer SHALL attempt to parse the accumulated text as a JSON AgentMessage.
4. IF the accumulated text is not valid JSON, THE JsonStreamBuffer SHALL trigger the retry mechanism (REQ-6).
5. IF the accumulated text is valid JSON but fails Zod schema validation (REQ-1), THE JsonStreamBuffer SHALL trigger the retry mechanism (REQ-6).
6. IF the accumulated text is valid JSON and passes schema validation, THE JsonStreamBuffer SHALL pass the parsed AgentMessage to the ChecksumVerifier (REQ-2).
7. THE JsonStreamBuffer SHALL have a configurable maximum buffer size (default: 10MB) — if the buffer exceeds this limit, the message is declared failed and the retry mechanism triggers.
8. THE JsonStreamBuffer SHALL have a configurable stream timeout (default: 300 seconds) — if the stream does not complete within this period, the buffer is flushed and the retry mechanism triggers.
9. THE JsonStreamBuffer SHALL emit the following events:
   - `stream_complete`: accumulated text is ready for parsing
   - `parse_success`: JSON parsed and schema validated
   - `parse_failure`: JSON parsing or schema validation failed
   - `buffer_overflow`: buffer exceeded maximum size
   - `stream_timeout`: stream exceeded timeout
   - `checksum_verified`: checksum verification passed
   - `checksum_failed`: checksum verification failed

### Requirement 4: Coordinator Protocol

**User Story:** As a Coordinator, I want to emit AgentMessage envelopes instead of free-form text + tool calls when communicating with workers, so that workers receive verifiably complete messages.

#### Acceptance Criteria

1. THE Coordinator SHALL emit AgentMessage envelopes for all inter-agent communication when the target worker supports the JSON-first protocol (as indicated by the protocol version in the worker's registration).
2. WHEN the Coordinator creates a task assignment, THE Coordinator SHALL construct a `task_assignment` AgentMessage with the task details, context, and dependency information.
3. WHEN the Coordinator approves or rejects a plan update, THE Coordinator SHALL construct a `plan_approval` AgentMessage.
4. WHEN the Coordinator sends a direct message to a worker, THE Coordinator SHALL construct a `message` AgentMessage.
5. THE Coordinator SHALL compute the checksum for every outgoing AgentMessage before sending it via the existing `ChannelManager` or `Daemon` infrastructure.
6. THE Coordinator SHALL continue to use the existing `new_task` and `async_task` tools for backwards compatibility with legacy workers (REQ-7).
7. THE Coordinator SHALL include the protocol version in every AgentMessage envelope, enabling the recipient to determine whether it understands the protocol.
8. THE Coordinator SHALL log all sent AgentMessage envelopes (message ID, recipient, payload type, checksum) for observability.

### Requirement 5: Worker Protocol

**User Story:** As a Worker, I want to receive, validate, and act on AgentMessage envelopes, so that I can execute tasks based on verified complete messages.

#### Acceptance Criteria

1. WHEN a Worker receives an AgentMessage, THE Worker SHALL first verify the checksum via the ChecksumVerifier (REQ-2) before acting on the payload.
2. IF the checksum verification passes, THE Worker SHALL dispatch the payload to the appropriate handler based on payload type:
   - `task_assignment` -> execute the assigned task
   - `plan_approval` -> apply or discard the plan update
   - `message` -> process the communication
   - `conflict_notification` -> handle the conflict
3. IF the checksum verification fails, THE Worker SHALL discard the message and request retransmission from the Coordinator.
4. WHEN a Worker completes a task, THE Worker SHALL construct a `task_result` AgentMessage with outcome, changes, validation results, and blockers, compute the checksum, and send it to the Coordinator.
5. WHEN a Worker proposes a plan update, THE Worker SHALL construct a `plan_update` AgentMessage and send it to the Coordinator for review.
6. THE Worker SHALL include the protocol version in every outgoing AgentMessage envelope.
7. THE Worker SHALL log all received and sent AgentMessage envelopes for observability.

### Requirement 6: Retry on Incomplete

**User Story:** As a developer, I want automatic retry when a message fails checksum verification, so that transient streaming failures do not cause task loss.

#### Acceptance Criteria

1. THE RetryMechanism SHALL trigger when any of the following conditions occur:
   - JsonStreamBuffer fails to parse accumulated text as valid JSON
   - JsonStreamBuffer fails Zod schema validation
   - ChecksumVerifier detects a checksum mismatch
   - JsonStreamBuffer exceeds maximum buffer size
   - JsonStreamBuffer stream timeout is exceeded
2. THE RetryMechanism SHALL retry the API call up to N times (configurable via `jsonFirst.retryAttempts`, default: 3).
3. THE RetryMechanism SHALL use exponential backoff between retries with a base delay of 1 second (configurable via `jsonFirst.retryBaseDelayMs`, default: 1000).
4. IF all retry attempts are exhausted, THE RetryMechanism SHALL emit a `permanent_failure` event and mark the task as failed.
5. THE RetryMechanism SHALL log each retry attempt with: attempt number, failure reason, and backoff delay.
6. THE RetryMechanism SHALL reset the retry counter on the next successful message delivery.
7. THE RetryMechanism SHALL be independent per message — a failure on one message does not affect the retry state of other messages.

### Requirement 7: Backwards Compatibility

**User Story:** As a developer, I want the JSON-first protocol to be fully backwards compatible with existing workers, so that I can adopt the protocol incrementally.

#### Acceptance Criteria

1. THE System SHALL support a protocol version field in the AgentMessage envelope (e.g., `"roo-agent/v1"`).
2. WHEN a Worker registers with the Daemon, THE Worker SHALL indicate which protocol versions it supports.
3. IF a Worker does not indicate support for the JSON-first protocol version, THE Coordinator SHALL fall back to the existing communication method (free-form text + tool calls via `new_task` and `async_task` tools).
4. THE existing `new_task` tool (line 987-995 in `NativeToolCallParser.ts`) SHALL continue to work unchanged for legacy workers.
5. THE existing `async_task` tool (line 997-1003 in `NativeToolCallParser.ts`) SHALL continue to work unchanged for legacy workers.
6. THE existing `attempt_completion` tool (line 788-792 in `NativeToolCallParser.ts`) SHALL continue to work unchanged for legacy workers.
7. THE System SHALL support a configuration flag `jsonFirst.enabled` (default: `false`) that enables or disables the JSON-first protocol globally.
8. WHEN `jsonFirst.enabled` is `false`, all inter-agent communication SHALL use the existing free-form text + tool call approach with no overhead.
9. THE System SHALL support per-worker protocol configuration, allowing some workers to use JSON-first while others use legacy communication within the same swarm.

### Requirement 8: Integration with Existing Swarm Architecture

**User Story:** As a developer, I want the JSON-first protocol to integrate cleanly with the existing swarm architecture, so that all existing swarm features (Coordinator, Worktree Manager, Agent roles, communication channels, daemon snapshots) continue to work.

#### Acceptance Criteria

1. THE JSON-first protocol SHALL integrate with the existing `SpawnManager` in `src/core/swarm/coordinator/spawn-manager.ts` — spawned agents SHALL receive the protocol version they should use.
2. THE JSON-first protocol SHALL integrate with the existing `ChannelManager` in `src/core/swarm/daemon/channel-manager.ts` — AgentMessage envelopes SHALL be transmitted through existing channels.
3. THE JSON-first protocol SHALL integrate with the existing `PlanManager` in `src/core/swarm/daemon/plan-manager.ts` — plan updates sent via AgentMessage SHALL update the plan state.
4. THE JSON-first protocol SHALL integrate with the existing `AsyncSubtaskManager` in `src/core/subtasks/AsyncSubtaskManager.ts` — subtask spawning SHALL use AgentMessage when the target supports the protocol.
5. THE JSON-first protocol SHALL integrate with the existing `PlanInfoWidget` in `webview-ui/src/components/swarm/PlanInfoWidget.tsx` — plan state updates from AgentMessage SHALL be reflected in the UI.
6. THE JSON-first protocol SHALL integrate with the existing daemon snapshot mechanism — pending AgentMessage queues SHALL be included in snapshots for crash recovery.
7. THE JSON-first protocol SHALL NOT require changes to the existing agent lifecycle state machine (spawned, ready, running, blocked, completed, failed, stopped, crashed).
8. THE JSON-first protocol SHALL NOT require changes to the existing `NativeToolCallParser` streaming infrastructure for within-agent tool calls.

## Out of Scope

- **Within-agent tool call parsing**: The existing `NativeToolCallParser` streaming approach with `partial-json` for tool calls within a single agent's reasoning is not changed by this spec.
- **LLM API changes**: The JSON-first protocol is a layer above the LLM API — it does not require changes to the API provider or streaming protocol.
- **Message encryption**: Checksums verify integrity, not confidentiality. Encryption of inter-agent messages is out of scope.
- **Protocol version negotiation handshake**: The protocol version is set at worker registration time, not via a dynamic handshake.
- **Message compression**: Large payloads are not compressed; the buffer size limit handles memory concerns.
- **Cross-repository messaging**: Inter-agent communication is within a single repository context.
- **Message persistence**: AgentMessages are not persisted to disk; they are transient communication. Only daemon snapshots capture pending queues.

## Acceptance Criteria Summary

| Req ID | Description | Key Criteria |
|--------|-------------|--------------|
| REQ-1 | AgentMessage Protocol | Structured JSON envelope with protocol version, sender/recipient, payload, checksum; Zod schema validation |
| REQ-2 | Checksum Verification | SHA-256 of canonical JSON payload; verify before dispatch; under 5ms per message |
| REQ-3 | Streaming Harness | JsonStreamBuffer accumulates complete response before parsing; configurable limits; event emission |
| REQ-4 | Coordinator Protocol | Emits AgentMessage envelopes; computes checksums; falls back to legacy tools |
| REQ-5 | Worker Protocol | Verifies checksum before acting; constructs response AgentMessages; requests retransmission on failure |
| REQ-6 | Retry on Incomplete | Up to N retries with exponential backoff; configurable attempts and delay; logs each attempt |
| REQ-7 | Backwards Compatibility | Legacy workers continue to work; per-worker protocol config; global enable/disable flag |
| REQ-8 | Swarm Architecture Integration | Integrates with SpawnManager, ChannelManager, PlanManager, AsyncSubtaskManager, PlanInfoWidget, daemon snapshots |
