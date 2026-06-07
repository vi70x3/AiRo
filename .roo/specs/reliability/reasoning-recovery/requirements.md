# Requirements: Reasoning Recovery

## Introduction

The Reasoning Recovery system identifies when an agent is stuck in repetitive cycles or unproductive exploration and provides deterministic mechanisms to break these patterns. It combines **Semantic Loop Detection** — which monitors tool patterns and file interactions to detect reasoning loops — with **Debug Workflow Enforcement**, which uses a Finite State Machine (FSM) to guide the agent through structured investigation, hypothesis, and verification phases.

## Glossary

- **Semantic Loop**: A pattern where the agent repeats tool sequences or file visits without making progress.
- **Loop Confidence**: Certainty score (0.0–1.0) that the agent is stuck.
- **Debug FSM**: A six-state machine (Investigate, Hypothesize, Validate, Confirm, Fix, Verify) for debug mode.
- **Hypothesis**: Structured JSON output required to advance from the Hypothesize state.
- **Progress Tier**: Classification of action impact (Strong: code change; Medium: new evidence; Weak: redundant read).

## Requirements

### Requirement 1: Semantic Loop Detection
1. THE system SHALL track a rolling window of `ReasoningTurn` objects (default 20).
2. THE system SHALL compute a similarity score based on tool pattern overlap and file set overlap.
3. THE system SHALL trigger context compression with a recovery prompt when loop confidence exceeds a threshold (default 0.7).
4. THE system SHALL detect "wandering" (low similarity + low progress) and provide feedback to focus the agent.

### Requirement 2: Debug Workflow Enforcement (FSM)
1. THE system SHALL enforce an ordered workflow in debug mode: Investigate -> Hypothesize -> Validate -> Confirm -> Fix -> Verify.
2. THE system SHALL restrict tools based on the current FSM state (e.g., block edit tools during Investigation).
3. THE system SHALL require a structured JSON hypothesis with `possible_causes` (3-7) and `likely_causes` (1-2) before allowing the agent to proceed to Validation.
4. THE system SHALL implement a Confirmation Gate requiring user approval or high confidence (> 0.9) before transitioning to the Fix state.

### Requirement 3: Recovery Feedback & Monitoring
1. THE system SHALL inject structured `<loop_feedback>` blocks after compression to guide the agent out of a loop.
2. THE system SHALL track `StrategyMemory` to detect higher-order cycles across strategies.
3. THE system SHALL detect "silent failures" (empty responses, no-tool-use turns) and provide targeted hints.

## Out of Scope
- Automatic model-driven fix generation.
- Integration with external IDE debuggers or remote protocols.
- Historical loop analysis across different user sessions.

## Acceptance Criteria Summary

| ID | Description | Key Metric |
|----|-------------|------------|
| AC-1 | Loop Detection | Detection of repetitive tool/file patterns |
| AC-2 | Recovery Trigger | Context compression on loop confidence > 0.7 |
| AC-3 | Debug FSM | Six-state workflow enforcement with tool gating |
| AC-4 | Structured Hypothesis| Validated JSON required in debug mode |
| AC-5 | Feedback Injection| Post-compression hints based on loop characteristics |
