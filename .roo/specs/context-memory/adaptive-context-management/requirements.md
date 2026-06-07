# Requirements: Adaptive Context Management

## Introduction

The Adaptive Context Management system provides a comprehensive architecture for optimizing an agent's context window through layered retrieval, persistent task memory, and intelligent condensation triggers. It replaces the monolithic prompt injection model with a four-layer system that prioritizes information based on token budget, agent mode, and repository state. It also introduces `TaskMemory`, a structured, persistent store that survives context condensation, and triggers automatic condensation on model switches to ensure new models receive a clean summary of prior work.

## Glossary

- **Layer 0 (Permanent Core)**: Essential instructions (identity, safety, tool syntax) always included.
- **Layer 1 (Active Mode)**: Mode-specific instructions (e.g., debug vs. spec mode).
- **Layer 2 (Active Spec)**: Compressed JSON summary of the active specification.
- **Layer 3 (Symbol Retrieval)**: Symbol-level context retrieved via jcodemunch.
- **TaskMemory**: Persistent summary of progress (objective, findings, edits, blockers) stored outside conversation history.
- **Model Switch**: Event where the model ID for an API request differs from the most recent one.
- **Tiered Environment**: Environment details split into Critical (Tier A) and Detailed (Tier B) based on budget.

## Requirements

### Requirement 1: Layered Context Retrieval (L0-L3)
1. THE system SHALL define a Layer 0 containing identity, safety rules, and tool syntax, capped at 1500 tokens.
2. THE system SHALL define a Layer 1 that dynamically loads instructions based on the active mode (e.g., "vibe", "debug", "spec").
3. THE system SHALL define a Layer 2 that provides a compressed JSON summary (max 500 tokens) of the active spec by reading the first 20 lines of spec documents.
4. THE system SHALL define a Layer 3 for symbol-level retrieval (max 1000 tokens) in indexed repositories.

### Requirement 2: Long-Horizon Task Memory
1. THE system SHALL maintain a `TaskMemory` structure containing `objective`, `findings`, `hypotheses`, `edits`, `tests`, and `blockers`.
2. THE system SHALL update `TaskMemory` based on tool signals (e.g., file writes, test results) rather than agent textual claims.
3. THE system SHALL inject a `CompressedSummary` (max 200 tokens) into the context before conversation history.
4. THE system SHALL perform memory compaction (archiving old/resolved findings) to stay within token thresholds.

### Requirement 3: Intelligent Condensation & Triggers
1. THE system SHALL trigger context condensation automatically when a model switch is detected, ensuring the new model receives a condensed summary.
2. THE system SHALL produce structured summaries during condensation that preserve `TaskMemory` and evidence blocks (files modified, tools invoked).
3. THE system SHALL enforce a configurable `contextBudget` (default 6000 tokens) by reducing layers in order: L3 -> L2 -> L1 extended -> Tier B -> L1 base.

### Requirement 4: Tiered Environment Details
1. THE system SHALL split environment details into Tier A (Critical: mode, model, workspace) and Tier B (Detailed: file list, git status, terminals).
2. THE system SHALL prioritize Tier B items (modified files > visible files > terminals) when budget allows.

## Out of Scope
- Model-specific prompt optimization (provider-specific tuning).
- Cross-session context persistence (beyond task metadata).
- Vector-based memory retrieval.

## Acceptance Criteria Summary

| ID | Description | Key Metric |
|----|-------------|------------|
| AC-1 | Layer 0 Core | ≤1500 tokens, always included |
| AC-2 | TaskMemory Persistence | Survives condensation, stored in task metadata |
| AC-3 | Model Switch Trigger | Forces condensation on model change |
| AC-4 | Token Budget Enforcement | Configurable (default 6000), follows reduction order |
| AC-5 | Evidence Preservation | Structured JSON block in condensation summary |
