# Constraints: Agent Grounding and Metrics

## MUST Rules
1. THE Execution State Graph MUST be updated only via the Evidence Registry.
2. ALL verification checks SHALL respect `ToolAvailabilityContext` (e.g., skip `execute_command` if disabled).
3. THE system SHALL block task completion unless all required phases reach "confirmed", "verified", or "passed".
4. THE system SHALL re-read modified regions (Patch Verification) after every edit.

## MUST NOT Rules
1. THE system MUST NOT use LLM calls to infer state or validate claims (must be deterministic).
2. THE system MUST NOT log or commit full file contents or user message text in metrics/logs.

## Assumptions
1. Project-specific lint and test commands are available or can be detected from file extensions.
2. The agent has access to a persistent metadata store for state/metrics.
