# Requirements: Agent Grounding and Metrics

## Introduction

The Agent Grounding and Metrics system ensures agent reliability through explicit state tracking, verifiable evidence collection, automated post-edit verification, and comprehensive performance monitoring. It replaces the implicit state model with a deterministic Execution State Graph and validates all agent claims against an append-only Evidence Registry. By integrating automated linting, type-checking, and testing with a robust metrics collection system, it eliminates self-deception and provides objective, measurable signals about agent performance.

## Glossary

- **Execution State Graph**: Machine-maintained representation of task phase (diagnosis, implementation, testing, VCS).
- **Evidence Registry**: Append-only store of verifiable tool events (file_read, file_edit, test, command).
- **Claim Validation**: Verifying textual claims ("Tests passing") against the evidence registry.
- **Verification Pipeline**: Automatic post-edit checks (patch, lint, typecheck, test).
- **Diagnosis Accuracy**: Ratio of confirmed diagnoses (verified by successful fix) to attempts.
- **Hallucinated Edit**: Claimed success when a tool returned an error or content mismatch occurred.

## Requirements

### Requirement 1: Explicit Execution State and Evidence
1. THE system SHALL maintain an Execution State Graph across four phases: Diagnosis, Implementation, Testing, and VCS.
2. THE system SHALL record every tool execution in an append-only Evidence Registry with UUIDs and timestamps.
3. THE system SHALL only allow state transitions based on verifiable tool evidence, never agent textual claims.

### Requirement 2: Automated Verification Pipeline
1. THE system SHALL run automatic verification after every file edit, including Patch Verification (re-read), Lint, Typecheck, and Test.
2. THE system SHALL block "Fix applied" claims if verification checks fail.
3. THE system SHALL detect new errors (not pre-existing) introduced by edits.

### Requirement 3: Claim Validation & Contradiction Detection
1. THE system SHALL extract verifiable claims from agent messages and validate them against the Evidence Registry.
2. THE system SHALL inject `<contradiction_warning>` blocks into the context when claims are unsupported or contradicted by evidence.
3. THE system SHALL block task completion unless all phases in the Execution State Graph reach required states.

### Requirement 4: Reliability Metrics Collection
1. THE system SHALL quantify five dimensions: Diagnosis Accuracy, Hallucinated Edit Rate, Tool Efficiency, Token Efficiency, and Recovery Rate.
4. THE system SHALL persist reliability metrics alongside task metadata and surface them in the `[Component:TaskHeader]`.

3. THE system SHALL emit events when reliability thresholds are violated.

## Out of Scope
- Automated metrics-driven prompt optimization.
- Cross-session metrics persistence (beyond per-task metadata).
- LLM-based diagnosis quality evaluation (confirmation is deterministic).

## Acceptance Criteria Summary

| ID | Description | Key Metric |
|----|-------------|------------|
| AC-1 | State Grounding | Transitions driven by Evidence Registry |
| AC-2 | Claim Consistency | Zero tolerance for unsupported/contradicted claims |
| AC-3 | Auto-Verification | Patch/Lint/Type/Test run after every edit |
| AC-4 | Performance Monitoring| 5 reliability dimensions tracked deterministically |
| AC-5 | Persistence | State and metrics survive task resume |
