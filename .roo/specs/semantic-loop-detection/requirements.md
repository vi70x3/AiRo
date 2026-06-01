# Requirements Document

## Introduction

The Semantic Loop Detection feature identifies when an agent repeatedly explores the same reasoning path without making meaningful progress. When detected, the system reduces context complexity through compression before additional tokens are spent. This improves task completion quality when model quality varies between requests and when agents become trapped in repetitive internal reasoning.

## Glossary

- **Agent**: An AI-powered assistant that processes user requests and executes tasks using available tools and reasoning capabilities.
- **Reasoning Step**: A discrete unit of agent thought or action, including tool invocations, conclusions, file examinations, or state transitions.
- **Semantic State**: A lightweight representation of the agent's recent reasoning steps, capturing the essence of what was explored without full context.
- **Similarity Score**: A numerical measure (0.0 to 1.0) indicating how closely current reasoning matches prior reasoning within the semantic state window.
- **Progress Evidence**: Observable indicators that the agent is advancing toward task completion, such as new files examined, new tools invoked, new conclusions reached, or task state changes.
- **Loop Confidence**: A numerical score (0.0 to 1.0) representing the system's certainty that the agent is stuck in a reasoning loop. Increases when reasoning repeats without progress, decreases when forward progress is detected.
- **Context Compression**: The process of summarizing and condensing reasoning history into a compact representation, preserving essential information while reducing token count.
- **Compression Threshold**: A configurable value (0.0 to 1.0) that triggers context compression when loop confidence exceeds it.
- **Reasoning Window**: The number of recent reasoning steps maintained in the semantic state for comparison purposes.

## Requirements

### Requirement 1: Semantic State Tracking

**User Story:** As a user, I want agents to recognize when they are repeating themselves so that they spend time solving the problem rather than revisiting previously explored thoughts.

#### Acceptance Criteria

1. THE Semantic_State_Tracker SHALL maintain a sliding window of the N most recent reasoning steps, where N is a configurable parameter with a default of 20 steps.
2. WHEN a new reasoning step occurs, THE Semantic_State_Tracker SHALL add the step to the window and evict the oldest step if the window is full.
3. THE Semantic_State_Tracker SHALL capture the following attributes for each reasoning step: step type, target identifier, timestamp, and step outcome.
4. THE Semantic_State_Tracker SHALL store the semantic state in memory for the duration of the agent session.
5. IF the agent session terminates, THEN THE Semantic_State_Tracker SHALL discard the semantic state.

### Requirement 2: Similarity Scoring

**User Story:** As a user, I want agents to recognize when they are repeating themselves so that they spend time solving the problem rather than revisiting previously explored thoughts.

#### Acceptance Criteria

1. WHEN a new reasoning step is recorded, THE Similarity_Scorer SHALL compute a similarity score between the current step and each step in the semantic state window.
2. THE Similarity_Scorer SHALL use symbolic feature matching to detect repetition patterns, including: repeated tool invocations with identical parameters, repeated file access, repeated conclusions or hypotheses, and repeated analysis paths.
3. THE Similarity_Scorer SHALL compute an aggregate similarity score representing the maximum similarity between the current step and any prior step in the window.
4. THE Similarity_Scorer SHALL return a similarity score in the range 0.0 (no similarity) to 1.0 (exact match).
5. WHERE the configuration specifies embedding-based similarity, THE Similarity_Scorer SHALL compute semantic similarity using text embeddings of reasoning step descriptions.

### Requirement 3: Progress Detection

**User Story:** As a user, I want successful exploration to continue uninterrupted so that agents are not compressed while still making progress.

#### Acceptance Criteria

1. THE Progress_Detector SHALL identify forward progress indicators including: new files examined, new tools invoked, new conclusions reached, task state transitions, and user feedback incorporation.
2. WHEN a reasoning step produces at least one forward progress indicator, THE Progress_Detector SHALL mark the step as progressive.
3. WHEN a reasoning step produces no forward progress indicators and has high similarity to prior steps, THE Progress_Detector SHALL mark the step as stagnant.
4. THE Progress_Detector SHALL maintain a list of unique resources accessed during the current session, including file paths, tool names, and conclusion identifiers.
5. THE Progress_Detector SHALL report progress status to the Loop_Confidence_Calculator after each reasoning step.

### Requirement 4: Loop Confidence Calculation

**User Story:** As a user, I want agents to recognize when they are repeating themselves so that they spend time solving the problem rather than revisiting previously explored thoughts.

#### Acceptance Criteria

1. THE Loop_Confidence_Calculator SHALL maintain a loop confidence score initialized to 0.0 at the start of each agent session.
2. WHEN the Progress_Detector reports a stagnant step, THE Loop_Confidence_Calculator SHALL increase the loop confidence score by a configurable increment value.
3. WHEN the Progress_Detector reports a progressive step, THE Loop_Confidence_Calculator SHALL decrease the loop confidence score by a configurable decrement value.
4. THE Loop_Confidence_Calculator SHALL clamp the loop confidence score to the range 0.0 to 1.0.
5. WHEN the loop confidence score exceeds the compression threshold, THE Loop_Confidence_Calculator SHALL emit a compression trigger event.
6. THE Loop_Confidence_Calculator SHALL expose the current loop confidence score for observability and debugging purposes.

### Requirement 5: Compression Trigger and Execution

**User Story:** As a user, I want context compression to activate when an agent is stuck so that fresh reasoning can occur using a condensed representation of prior work.

#### Acceptance Criteria

1. WHEN a compression trigger event is received, THE Compression_Executor SHALL invoke the context compression mechanism.
2. THE Compression_Executor SHALL summarize the reasoning history into a compact representation that preserves: task objective, conclusions reached, files modified, and current blockers.
3. THE Compression_Executor SHALL replace the full reasoning context with the compressed representation.
4. AFTER compression completes, THE Compression_Executor SHALL reset the loop confidence score to 0.0.
5. AFTER compression completes, THE Compression_Executor SHALL clear the semantic state window.
6. THE Compression_Executor SHALL log compression events for observability, including timestamp, pre-compression token count, and post-compression token count.

### Requirement 6: Configuration

**User Story:** As a system administrator, I want configurable loop detection parameters so that I can tune the feature for different use cases and model behaviors.

#### Acceptance Criteria

1. THE Configuration_Manager SHALL provide the following configurable parameters: reasoning window size (default: 20), compression threshold (default: 0.7), similarity increment value (default: 0.1), progress decrement value (default: 0.15), and similarity method (default: symbolic).
2. WHEN configuration values are not explicitly set, THE Configuration_Manager SHALL use documented default values.
3. IF invalid configuration values are provided, THEN THE Configuration_Manager SHALL reject the configuration and log an error.
4. THE Configuration_Manager SHALL support runtime configuration updates without requiring agent restart.

### Requirement 7: Observability

**User Story:** As a system administrator, I want visibility into loop detection behavior so that I can monitor effectiveness and troubleshoot issues.

#### Acceptance Criteria

1. THE Observability_Logger SHALL log the following events: loop confidence threshold exceeded, compression executed, compression statistics, and configuration changes.
2. THE Observability_Logger SHALL provide metrics including: total compressions per session, average loop confidence at compression, average token reduction per compression, and time between compressions.
3. THE Observability_Logger SHALL expose metrics in a format compatible with standard monitoring systems.
4. THE Observability_Logger SHALL not log user data or sensitive reasoning content.
