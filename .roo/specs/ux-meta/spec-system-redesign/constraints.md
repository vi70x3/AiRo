# Constraints Document

## MUST Rules

1. THE spec template SHALL require exactly five files: requirements.md, design.md, constraints.md, verification.md, tasks.md.
2. THE requirements.md SHALL contain Introduction, Glossary, Requirements (with User Stories and numbered Acceptance Criteria), Out of Scope, and Acceptance Criteria Summary.
3. THE design.md SHALL contain Overview, Architecture (with Component Diagram), Integration Points, Data Structures, Algorithms, and Performance Constraints.
4. THE constraints.md SHALL contain MUST rules, MUST NOT rules, and Assumptions.
5. THE verification.md SHALL contain Test Strategy, Validation Checks, and Completion Criteria.
6. THE tasks.md SHALL contain phased task breakdown with checkboxes, organized by Phase.
7. THE total spec length SHALL NOT exceed 1450 lines across all sections.
8. THE acceptance criteria SHALL use SHALL/MUST/IF/THEN/WHEN format.
9. THE .config.kiro file SHALL be present in every spec directory.

## MUST NOT Rules

1. THE requirements.md MUST NOT contain line-level implementation instructions (e.g., "modify line 42").
2. THE design.md MUST NOT contain step-by-step code modification instructions.
3. THE constraints.md MUST NOT contain user stories or acceptance criteria (those belong in requirements.md).
4. THE verification.md MUST NOT contain test code or test file paths (those belong in tasks.md).
5. THE tasks.md MUST NOT describe implementation at the level of individual code changes (e.g., "add field X as optional prop").
6. THE spec MUST NOT violate any project steering rules defined in `.roo/rules/rules.md` (e.g., Tailwind-only styling, lint rule disabling).

## Assumptions

1. The agent reading the spec has access to the full project context and steering rules.
2. The agent understands the existing codebase structure and conventions.
3. The spec author has sufficient domain knowledge to define acceptance criteria and constraints.
4. The .config.kiro workflow system supports the specType values "feature", "bugfix", and "meta".
5. Specs are read by agents in a single context window, necessitating length limits.
