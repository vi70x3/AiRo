# Requirements Document

## Introduction

The Spec System Redesign is a meta-spec that restructures the spec template and authoring process for all future specs in the airiOS Code project. The current spec format mixes implementation details with intent, producing bloated documents that reduce agent reasoning quality. Tasks read like generated code instructions ("modify line x, add variable y"), which shifts agent focus from understanding the problem to mechanically following steps. This redesign separates **what** and **why** from **how**, establishing a cleaner structure: Requirements (what), Design (why), Constraints (boundaries), and Verification (tests). Implementation details are confined to tasks.md and expressed at the level of "what to implement," not "how to implement it."

## Glossary

- **Spec**: A structured document set (requirements, design, tasks) that defines a feature or system for agent implementation.
- **Agent**: An AI-powered assistant that reads specs and implements features using available tools and reasoning capabilities.
- **Meta-Spec**: A spec that defines the spec template and authoring process itself, rather than a feature implementation.
- **Requirements Section**: The "what" of a spec — user stories, acceptance criteria, and scope boundaries.
- **Design Section**: The "why" of a spec — architecture decisions, trade-offs, and rationale.
- **Constraints Section**: Hard boundaries — what the feature MUST do and MUST NOT do.
- **Verification Section**: How to verify the feature works — test strategies, validation checks, and completion criteria.
- **Tasks Section**: Implementation breakdown — what to implement, organized by phase, without line-level instructions.
- **Spec Template**: The reusable document structure that all specs follow.
- **Kiro Config**: The `.config.kiro` file that tracks spec metadata (specId, workflowType, specType).
- **Reasoning Load**: The cognitive effort required by an agent to understand and act on a spec.

## Requirements

### Requirement 1: Four-Section Spec Structure

**User Story:** As a spec author, I want a clear four-section structure (Requirements, Design, Constraints, Verification) so that I can express intent without mixing in implementation details.

#### Acceptance Criteria

1. THE Spec_Template SHALL define four mandatory sections: Requirements (what), Design (why), Constraints (boundaries), and Verification (tests).
2. THE Requirements section SHALL contain: Introduction, Glossary, Requirements (with User Stories and numbered Acceptance Criteria using SHALL/MUST/IF/THEN/WHEN), Out of Scope, and Acceptance Criteria summary.
3. THE Design section SHALL contain: Overview, Architecture (with Component Diagram), Integration Points, Data Structures (with TypeScript interfaces where applicable), Algorithms (with rationale, not just steps), and Performance Constraints.
4. THE Constraints section SHALL contain: MUST rules (hard requirements), MUST NOT rules (prohibitions), and Assumptions (explicit assumptions the spec makes about the environment or context).
5. THE Verification section SHALL contain: Test Strategy (unit, integration, end-to-end), Validation Checks (how to confirm the feature works), and Completion Criteria (what "done" looks like).
6. THE Tasks section SHALL contain: Phased task breakdown with checkboxes, organized by Phase (Foundation, Core Logic, Integration, Verification), with each task describing what to implement, not how.

### Requirement 2: Implementation Detail Isolation

**User Story:** As an agent, I want implementation details isolated in the tasks section so that I can focus on understanding the problem before jumping to solutions.

#### Acceptance Criteria

1. THE Requirements, Design, and Constraints sections SHALL NOT contain line-level implementation instructions (e.g., "modify line 42," "add variable X as optional prop").
2. THE Tasks section SHALL describe implementation at the level of "what to implement" (e.g., "Implement the SemanticStateTracker class") rather than "how to implement it" (e.g., "Add a new field to the ToolsSettingsProps type at line 47").
3. IF a specific line reference is absolutely necessary for clarity, THEN it SHALL be accompanied by a rationale explaining why that location is significant.
4. THE Design section SHALL explain trade-offs and rationale for architectural decisions rather than listing implementation steps.
5. THE Requirements section SHALL define behavior and outcomes, not implementation mechanisms.

### Requirement 3: Section Length Limits

**User Story:** As an agent, I want each spec section to have a maximum length so that I can process the full spec without context overflow.

#### Acceptance Criteria

1. THE Spec_Template SHALL define maximum lengths for each section: Requirements (400 lines), Design (500 lines), Constraints (100 lines), Verification (150 lines), Tasks (300 lines).
2. THE total spec length SHALL NOT exceed 1450 lines across all sections.
3. IF a spec exceeds the maximum length for any section, THEN the author SHALL split the content into sub-specs or extract shared definitions into a separate reference document.
4. THE Spec_Template SHALL include a length check in the authoring checklist that flags sections exceeding their limit.

### Requirement 4: Self-Documenting Template

**User Story:** As a spec author, I want the template itself to demonstrate the structure so that I can follow it without separate documentation.

#### Acceptance Criteria

1. THE Spec_Template SHALL use the four-section structure it defines, serving as its own example.
2. THE template SHALL include inline comments or annotations explaining the purpose of each section and subsection.
3. THE template SHALL include example content for each subsection that illustrates the expected level of detail.
4. THE template SHALL be usable as a starting point for both feature specs and meta-specs.

### Requirement 5: Kiro Config Compatibility

**User Story:** As a spec author, I want the new spec format to be compatible with the existing `.config.kiro` workflow system so that I don't need to change the tooling.

#### Acceptance Criteria

1. THE new spec format SHALL support the `.config.kiro` file with fields: `specId` (string), `workflowType` (one of: "requirements-first", "design-first", "fast-task"), and `specType` (one of: "feature", "bugfix", "meta").
2. THE Spec_Template SHALL include a `.config.kiro` file with appropriate default values.
3. THE workflow system SHALL be able to create, update, and track specs using the new four-section structure without modification to the `.config.kiro` format.

### Requirement 6: Authoring Checklist

**User Story:** As a spec author, I want a checklist to complete before considering a spec done, so that I don't miss critical sections or quality checks.

#### Acceptance Criteria

1. THE Spec_Template SHALL include an authoring checklist at the end of the spec.
2. THE checklist SHALL include the following items: all four sections present, acceptance criteria use SHALL/MUST/IF/THEN/WHEN format, constraints section includes MUST NOT rules, verification section includes test strategy, no line-level implementation details in requirements/design/constraints, section length limits respected, glossary defines all domain terms, diagrams included for architecture, and `.config.kiro` file created.
3. THE checklist SHALL be marked as complete only when all items are checked.
4. THE checklist SHALL be included in the spec template as a copyable markdown checklist.

### Requirement 7: Reduced Agent Reasoning Load

**User Story:** As an agent, I want specs that focus on what and why rather than how, so that I can apply reasoning to the problem rather than mechanically following instructions.

#### Acceptance Criteria

1. THE Spec_Template SHALL separate intent (requirements/design) from implementation (tasks).
2. THE Design section SHALL include trade-off analysis for each major architectural decision, explaining why one approach was chosen over alternatives.
3. THE Requirements section SHALL define acceptance criteria in terms of observable behavior, not internal state.
4. THE Tasks section SHALL group related changes into phases rather than listing individual code modifications.
5. THE Spec_Template SHALL discourage the use of specific line numbers, variable names, or function signatures in the requirements and design sections.

## Out of Scope

- Changes to the codebase implementation — this is a meta-spec about the spec format itself
- Modifications to the `.config.kiro` file format — the existing format is sufficient
- Automated spec generation tooling — this spec defines the template, not a generator
- Migration of existing specs to the new format — that is a separate follow-up effort
- Changes to the steering rules in `.roo/steering/rules.md` — those are project-wide and not spec-specific

## Acceptance Criteria Summary

| ID | Criterion | Section |
|----|-----------|---------|
| AC-1 | Four-section structure (Requirements, Design, Constraints, Verification) is defined and mandatory | Requirement 1 |
| AC-2 | Implementation details are isolated in tasks.md only | Requirement 2 |
| AC-3 | Section length limits are defined and enforced | Requirement 3 |
| AC-4 | Template is self-documenting with examples | Requirement 4 |
| AC-5 | `.config.kiro` compatibility is maintained | Requirement 5 |
| AC-6 | Authoring checklist is included and complete | Requirement 6 |
| AC-7 | Agent reasoning load is reduced through intent/implementation separation | Requirement 7 |
