# Task Breakdown - Multi-Agent Architecture with JSON-First Communication Protocol

## Phase 1: Core Protocol Foundation

*   [ ] Create `src/core/swarm/protocol/` directory for JSON-first protocol components.
*   [ ] Define `AgentMessage`, `AgentMessagePayload`, and payload type schemas in `packages/types/src/multi-agent.ts` using Zod, following the `modeConfigSchema` pattern from `packages/types/src/mode.ts` (line 96).
*   [ ] Define `JsonFirstConfig` schema and type in `packages/types/src/multi-agent.ts` with `.optional().default()` for all fields: `enabled`, `retryAttempts`, `retryBaseDelayMs`, `maxBufferSizeBytes`, `streamTimeoutMs`, `protocolVersion`.
*   [ ] Add `jsonFirst` to the `globalSettingsSchema` in `packages/types/src/global-settings.ts`.
*   [ ] Add `AgentMessagePayload` type exports to `packages/types/src/index.ts` barrel export.
*   [ ] Add unit tests for `JsonFirstConfig` schema validation (valid config, invalid values, defaults) in `packages/types/src/__tests__/multi-agent.test.ts`.
*   [ ] Add unit tests for `AgentMessage` schema validation (valid message, invalid protocol, invalid checksum format, missing required fields) in `packages/types/src/__tests__/multi-agent.test.ts`.

## Phase 2: ChecksumVerifier and Canonical JSON

*   [ ] Create `ChecksumVerifier` class in `src/core/swarm/protocol/ChecksumVerifier.ts` with `compute()` and `verify()` methods.
*   [ ] Implement `canonicalize()` function for deterministic JSON (sorted keys, no whitespace) in `src/core/swarm/protocol/ChecksumVerifier.ts`.
*   [ ] Use Node.js `crypto.createHash("sha256")` for SHA-256 computation.
*   [ ] Use `crypto.timingSafeEqual()` for checksum comparison to prevent timing attacks.
*   [ ] Add unit tests for `ChecksumVerifier` in `src/core/swarm/protocol/__tests__/ChecksumVerifier.test.ts`:
    *   Same payload produces identical checksums
    *   Different payloads produce different checksums
    *   Key order does not affect checksum (canonicalization)
    *   Whitespace differences do not affect checksum
    *   Timing-safe comparison works correctly
    *   Performance: checksum computation under 5ms for 1MB payload
*   [ ] Add `computeChecksum()` export for use by AgentMessageBuilder and Coordinator.

## Phase 3: JsonStreamBuffer

*   [ ] Create `JsonStreamBuffer` class in `src/core/swarm/protocol/JsonStreamBuffer.ts` with configurable `maxBufferSizeBytes` and `streamTimeoutMs`.
*   [ ] Implement `startStream()` method that resets buffer state and starts timeout watchdog.
*   [ ] Implement `processChunk(chunk: string)` method that accumulates chunks and checks buffer overflow.
*   [ ] Implement `completeStream()` method that attempts JSON parse of accumulated buffer.
*   [ ] Implement event emission: `stream_complete`, `parse_success`, `parse_failure`, `buffer_overflow`, `stream_timeout`.
*   [ ] Add unit tests for `JsonStreamBuffer` in `src/core/swarm/protocol/__tests__/JsonStreamBuffer.test.ts`:
    *   Accumulates chunks correctly
    *   Parses valid JSON on stream complete
    *   Emits parse_failure on invalid JSON
    *   Emits buffer_overflow when limit exceeded
    *   Emits stream_timeout when timeout exceeded
    *   Handles empty stream gracefully
    *   Handles stream with only whitespace
    *   Performance: 10MB buffer accumulation within memory bounds

## Phase 4: AgentMessage Schema and Validation

*   [ ] Create `AgentMessageBuilder` class in `src/core/swarm/protocol/AgentMessageBuilder.ts` that constructs AgentMessage envelopes with automatic checksum computation.
*   [ ] Implement builder methods for each payload type:
    *   `buildTaskAssignment(task, context, dependencies)` -> `task_assignment` payload
    *   `buildTaskResult(taskId, outcome, changes, validation, blockers)` -> `task_result` payload
    *   `buildPlanUpdate(planId, version, changes, reason)` -> `plan_update` payload
    *   `buildPlanApproval(updateId, approved, reason)` -> `plan_approval` payload
    *   `buildMessage(content, channel?)` -> `message` payload
    *   `buildConflictNotification(filePath, conflictingAgent, resolution)` -> `conflict_notification` payload
*   [ ] Each builder method SHALL compute the checksum automatically using `computeChecksum()`.
*   [ ] Add unit tests for `AgentMessageBuilder` in `src/core/swarm/protocol/__tests__/AgentMessageBuilder.test.ts`:
    *   Each builder produces valid AgentMessage with correct payload type
    *   Checksum is automatically computed and valid
    *   Message ID is unique (UUID v4)
    *   Timestamp is set to current time
    *   Protocol version matches configuration

## Phase 5: AgentMessageDispatcher

*   [ ] Create `AgentMessageDispatcher` class in `src/core/swarm/protocol/AgentMessageDispatcher.ts` that routes AgentMessage envelopes via the existing `ChannelManager`.
*   [ ] Implement `send(message: AgentMessage)` method that:
    *   Verifies protocol version matches
    *   Verifies checksum before sending (defense in depth)
    *   Routes to `ChannelManager.sendDM()` for point-to-point messages
    *   Routes to `ChannelManager.broadcast()` for broadcast messages
    *   Logs dispatch via `recordToolError()` pattern from `src/core/task/Task.ts` (line 4512)
*   [ ] Implement `receive(rawMessage: string)` method that:
    *   Parses JSON
    *   Validates schema using `agentMessageSchema.safeParse()`
    *   Verifies checksum
    *   Returns validated `AgentMessage`
    *   Throws descriptive errors on failure (following `MissingToolResultError` pattern from `src/core/task/validateToolResultIds.ts`, line 24)
*   [ ] Implement `determineCommunicationProtocol()` function for protocol version routing.
*   [ ] Add unit tests for `AgentMessageDispatcher` in `src/core/swarm/protocol/__tests__/AgentMessageDispatcher.test.ts`:
    *   Send routes to correct recipient via mocked ChannelManager
    *   Receive parses and validates incoming messages
    *   Receive rejects messages with invalid checksum
    *   Receive rejects messages with invalid schema
    *   Protocol version mismatch detection
    *   Broadcast routing works correctly

## Phase 6: Retry Mechanism

*   [ ] Create `RetryHandler` class in `src/core/swarm/protocol/RetryHandler.ts` with configurable `retryAttempts` and `retryBaseDelayMs`.
*   [ ] Implement exponential backoff with jitter: `min(baseDelay * 2^(attempt-1) * jitter, 60000)`.
*   [ ] Implement `executeWithRetry<T>(operation: () => Promise<T>)` method.
*   [ ] Add structured logging for each retry attempt (attempt number, failure reason, backoff delay).
*   [ ] Add `permanent_failure` event emission when all retries exhausted.
*   [ ] Add unit tests for `RetryHandler` in `src/core/swarm/protocol/__tests__/RetryHandler.test.ts`:
    *   Succeeds on first attempt (no retry)
    *   Retries on failure and succeeds
    *   Throws after max attempts exhausted
    *   Exponential backoff delay increases correctly
    *   Jitter produces varying delays
    *   Maximum backoff capped at 60 seconds
    *   Logs each retry attempt

## Phase 7: Streaming Harness Integration

*   [ ] Create `StreamingHarness` class in `src/core/swarm/protocol/StreamingHarness.ts` that combines `JsonStreamBuffer`, `ChecksumVerifier`, and `RetryHandler` into a single pipeline.
*   [ ] Implement `processInterAgentStream(stream: AsyncIterable<string>, recipientId: string)` method that:
    1. Feeds stream chunks to `JsonStreamBuffer`
    2. On stream complete, passes parsed JSON to `ChecksumVerifier`
    3. On checksum success, returns validated `AgentMessage`
    4. On any failure, triggers `RetryHandler` to retry the API call
*   [ ] Implement `sendInterAgentMessage(message: AgentMessage, recipientId: string)` method that:
    1. Uses `AgentMessageDispatcher` to send the message
    2. On dispatch failure, triggers `RetryHandler` to retry
*   [ ] Add unit tests for `StreamingHarness` in `src/core/swarm/protocol/__tests__/StreamingHarness.test.ts`:
    *   Full pipeline: stream -> buffer -> checksum -> dispatch
    *   Retry on checksum failure
    *   Retry on parse failure
    *   Permanent failure after max retries
    *   Buffer overflow handling
    *   Stream timeout handling

## Phase 8: Coordinator Protocol Integration

*   [ ] Enhance `SpawnManager` in `src/core/swarm/coordinator/spawn-manager.ts` (line 20) to accept and pass `protocolVersion` to spawned agents.
*   [ ] Add `supportedProtocols` field to `AgentMetadata` type in `@roo-code/types`.
*   [ ] Enhance Coordinator to construct `AgentMessage` envelopes using `AgentMessageBuilder` when communicating with JSON-first workers.
*   [ ] Implement protocol version routing in Coordinator: check `worker.supportedProtocols` before sending.
*   [ ] Ensure Coordinator falls back to existing `new_task` tool (line 987-995 in `NativeToolCallParser.ts`) for legacy workers.
*   [ ] Ensure Coordinator falls back to existing `async_task` tool (line 997-1003 in `NativeToolCallParser.ts`) for legacy workers.
*   [ ] Ensure `attempt_completion` tool (line 788-792 in `NativeToolCallParser.ts`) continues to work unchanged.
*   [ ] Add unit tests for Coordinator protocol integration:
    *   Sends AgentMessage to JSON-first worker
    *   Sends legacy tool calls to non-JSON-first worker
    *   Protocol version routing works correctly

## Phase 9: Worker Protocol Integration

*   [ ] Enhance Worker agent to receive and process `AgentMessage` envelopes.
*   [ ] Implement `AgentMessageHandler` class in `src/core/swarm/agent/AgentMessageHandler.ts` that dispatches based on payload type:
    *   `task_assignment` -> execute assigned task
    *   `plan_approval` -> apply or discard plan update
    *   `message` -> process communication
    *   `conflict_notification` -> handle conflict
*   [ ] Implement response construction: Worker builds `task_result` AgentMessage via `AgentMessageBuilder` on completion.
*   [ ] Implement retransmission request: Worker requests retransmission on checksum failure.
*   [ ] Add unit tests for Worker protocol integration:
    *   Receives and processes task_assignment
    *   Constructs valid task_result response
    *   Requests retransmission on checksum failure
    *   Processes plan_approval correctly

## Phase 10: AsyncSubtaskManager Integration

*   [ ] Enhance `AsyncSubtaskManager` in `src/core/subtasks/AsyncSubtaskManager.ts` (line 52) to use AgentMessage when target supports protocol.
*   [ ] Add `protocolVersion` field to `AsyncSubtaskSpec` interface (line 9).
*   [ ] Add `protocolVersion` field to `SpawnSubtasksParams` interface (line 15).
*   [ ] Add `supportedProtocols` field to `AsyncSubtaskStatus` interface (line 20).
*   [ ] Modify `spawnSubtasks()` (line 70) to use `determineCommunicationProtocol()` for choosing between JSON-first and legacy communication.
*   [ ] Ensure `MergeResult` type (line 44) remains unchanged — merge logic is independent of communication protocol.
*   [ ] Add unit tests for AsyncSubtaskManager protocol integration:
    *   Uses JSON-first for protocol-supporting subtasks
    *   Falls back to legacy for non-supporting subtasks
    *   Mixed protocol scenario works correctly

## Phase 11: Daemon Snapshot Integration

*   [ ] Enhance daemon snapshot to include pending AgentMessage queues for crash recovery.
*   [ ] Add `pendingAgentMessages` field to `DaemonSnapshot` interface.
*   [ ] On snapshot creation, serialize pending message queues.
*   [ ] On snapshot restore, restore pending message queues.
*   [ ] Add unit tests for snapshot integration:
    *   Pending messages included in snapshot
    *   Messages restored correctly from snapshot
    *   Checksum verification still works after restore

## Phase 12: Configuration and Observability

*   [ ] Add structured logging for AgentMessage events: message sent, message received, checksum verified, checksum failed, retry attempted, permanent failure.
*   [ ] Add metrics counters: total messages sent, total messages received, total checksum failures, total retries, total permanent failures.
*   [ ] Ensure all log entries exclude sensitive data (no task content, no file contents, no user input).
*   [ ] Verify runtime configuration updates work without agent restart (toggle `jsonFirst.enabled`, adjust `retryAttempts`).
*   [ ] Add unit tests for observability (correct event logging, metrics accumulation, sensitive data exclusion).

## Phase 13: Integration Testing and Migration

*   [ ] Create integration test: Coordinator sends task_assignment via AgentMessage, Worker receives and executes, Worker sends task_result back.
*   [ ] Create integration test: Simulated stream truncation triggers retry mechanism.
*   [ ] Create integration test: Mixed protocol swarm (some JSON-first workers, some legacy workers).
*   [ ] Create integration test: Checksum failure triggers retry and eventual success.
*   [ ] Create integration test: Buffer overflow triggers retry with backoff.
*   [ ] Create integration test: Protocol version mismatch falls back to legacy.
*   [ ] Create integration test: Daemon snapshot captures and restores AgentMessage queues.
*   [ ] Run existing test suite to verify no regressions in:
    *   `src/core/assistant-message/NativeToolCallParser.ts` (within-agent tool calls unchanged)
    *   `src/core/subtasks/AsyncSubtaskManager.ts` (legacy path still works)
    *   `src/core/swarm/coordinator/spawn-manager.ts` (spawning still works)
    *   `src/core/swarm/daemon/channel-manager.ts` (channels still work)
    *   `src/core/swarm/daemon/plan-manager.ts` (plan management still works)
*   [ ] Benchmark performance impact: measure inter-agent message latency with and without JSON-first protocol.
*   [ ] Create migration guide document for adopting JSON-first protocol in existing swarms.
