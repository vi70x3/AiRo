# Constraints: Adaptive Context Management

## MUST Rules
1. THE system SHALL always include Layer 0 in every prompt.
2. THE `TaskMemory` SHALL only be updated by tool signals, not agent text.
3. THE system SHALL force condensation on model switch if `autoCondenseOnModelSwitch` is enabled.
4. THE total context injection SHALL NOT exceed the `contextBudget`.

## MUST NOT Rules
1. THE system MUST NOT reduce Layer 0 below its full content.
2. THE system MUST NOT make additional LLM calls for context management (except for the condensation itself).

## Assumptions
1. Repositories are indexed via jcodemunch for Layer 3 retrieval.
2. Task metadata is available for persistent `TaskMemory` storage.
