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

1. THE Semantic_State_Tracker SHALL maintain a sliding window of the N most recent reasoning steps, where N is a configurable parameter with a valid range of 1 to 100 (inclusive) and a default of 20 steps.
2. WHEN a new reasoning step occurs, THE Semantic_State_Tracker SHALL add the step to the window and evict the oldest step if the window contains N steps.
3. THE Semantic_State_Tracker SHALL capture the following attributes for each reasoning step: step type (from a predefined set of step types), target identifier (non-empty string), timestamp (ISO 8601 format), and step outcome (from a predefined set of outcome values).
4. THE Semantic_State_Tracker SHALL store the semantic state in memory for the duration of the agent session.
5. IF the agent session terminates, THEN THE Semantic_State_Tracker SHALL discard the semantic state immediately when termination begins, regardless of whether the termination process completes successfully.

### Requirement 2: Similarity Scoring

**User Story:** As a user, I want agents to recognize when they are repeating themselves so that they spend time solving the problem rather than revisiting previously explored thoughts.

#### Acceptance Criteria

1. WHEN a new reasoning step is recorded and the semantic state window is not empty, THE Similarity_Scorer SHALL compute a similarity score between the current step and each step in the semantic state window.
2. THE Similarity_Scorer SHALL use symbolic feature matching to detect repetition patterns, including: repeated tool invocations with identical parameters, repeated file access, repeated conclusions or hypotheses, and repeated analysis paths.
3. THE Similarity_Scorer SHALL compute an aggregate similarity score as the maximum similarity across all individual feature scores between the current step and any prior step in the window.
4. THE Similarity_Scorer SHALL return a similarity score in the range 0.0 (no similarity) to 1.0 (exact match).
5. WHERE the configuration specifies embedding-based similarity, THE Similarity_Scorer SHALL compute semantic similarity using text embeddings of reasoning step descriptions.
6. IF embedding-based similarity is configured and the embedding computation fails, THEN THE Similarity_Scorer SHALL fall back to symbolic feature matching and log a warning.

### Requirement 3: Progress Detection

**User Story:** As a user, I want successful exploration to continue uninterrupted so that agents are not compressed while still making progress.

#### Acceptance Criteria

1. THE Progress_Detector SHALL identify forward progress indicators including: new files examined (not previously recorded in the unique resources list), new tools invoked (not previously recorded), new conclusions reached, task state transitions, and user feedback incorporation.
2. WHEN a reasoning step produces at least one forward progress indicator, THE Progress_Detector SHALL mark the step as progressive.
3. WHEN a reasoning step produces no forward progress indicators and has similarity score ≥ 0.7 to prior steps, THE Progress_Detector SHALL mark the step as stagnant.
4. THE Progress_Detector SHALL maintain a list of unique resources accessed during the current session, including file paths, tool names, and conclusion identifiers, with a maximum capacity equal to the configured reasoning window size.
5. THE Progress_Detector SHALL report progress status to the Loop_Confidence_Calculator after each reasoning step, including step classification (progressive or stagnant) and the forward progress indicators detected.
6. WHEN the unique resources list reaches maximum capacity and a new resource is added, THE Progress_Detector SHALL evict the oldest resource entry.

### Requirement 4: Loop Confidence Calculation

**User Story:** As a user, I want agents to recognize when they are repeating themselves so that they spend time solving the problem rather than revisiting previously explored thoughts.

#### Acceptance Criteria

1. THE Loop_Confidence_Calculator SHALL maintain a loop confidence score initialized to 0.0 at the start of each agent session.
2. WHEN the Progress_Detector reports a stagnant step, THE Loop_Confidence_Calculator SHALL increase the loop confidence score by a configurable increment value with a valid range of 0.01 to 0.5 (inclusive).
3. WHEN the Progress_Detector reports a progressive step, THE Loop_Confidence_Calculator SHALL decrease the loop confidence score by a configurable decrement value with a valid range of 0.01 to 0.5 (inclusive).
4. THE Loop_Confidence_Calculator SHALL clamp the loop confidence score to the range 0.0 to 1.0 after each increment or decrement operation.
5. WHEN the loop confidence score exceeds the compression threshold (valid range: 0.5 to 0.95 inclusive), THE Loop_Confidence_Calculator SHALL emit a compression trigger event.
6. THE Loop_Confidence_Calculator SHALL expose the current loop confidence score as a numeric value accessible via a programmatic interface for observability and debugging purposes.
7. WHEN both progressive and stagnant steps are reported simultaneously, THE Loop_Confidence_Calculator SHALL skip emission of the compression trigger event until the conflict resolves.

### Requirement 5: Compression Trigger and Execution

**User Story:** As a user, I want context compression to activate when an agent is stuck so that fresh reasoning can occur using a condensed representation of prior work.

#### Acceptance Criteria

1. WHEN a compression trigger event is received, THE Compression_Executor SHALL invoke the context compression mechanism.
2. THE Compression_Executor SHALL summarize the reasoning history into a compact representation that preserves: task objective, conclusions reached, files modified, and current blockers.
3. THE Compression_Executor SHALL replace the full reasoning context with the compressed representation.
4. WHEN compression completes successfully, THE Compression_Executor SHALL reset the loop confidence score to 0.0.
5. WHEN compression completes successfully, THE Compression_Executor SHALL clear the semantic state window.
6. IF context compression fails, THEN THE Compression_Executor SHALL retain the full reasoning context unchanged, retain the current loop confidence score, and log an error indicating the failure reason.
7. THE Compression_Executor SHALL log compression events for observability, including timestamp, pre-compression token count, and post-compression token count.

### Requirement 6: Configuration

**User Story:** As a system administrator, I want configurable loop detection parameters so that I can tune the feature for different use cases and model behaviors.

#### Acceptance Criteria

1. THE Configuration_Manager SHALL provide the following configurable parameters with valid ranges: reasoning window size (range: 5 to 100, default: 20), compression threshold (range: 0.5 to 0.95, default: 0.7), similarity increment value (range: 0.01 to 0.5, default: 0.1), progress decrement value (range: 0.01 to 0.5, default: 0.15), and similarity method (valid values: symbolic, semantic; default: symbolic).
2. WHEN configuration values are not explicitly set, THE Configuration_Manager SHALL use documented default values.
3. THE Configuration_Manager SHALL validate each parameter independently and accept valid parameters while rejecting only invalid parameters with an error log containing the parameter name and invalid value.
4. IF an unsupported similarity method value is provided, THEN THE Configuration_Manager SHALL reject the configuration, retain the previous valid configuration, and log an error with the unsupported method name.
5. THE Configuration_Manager SHALL apply runtime configuration updates within 1 second without requiring agent restart, while preserving the previous configuration during the update process and maintaining ongoing calculations and the current semantic state window contents.

### Requirement 7: Observability

**User Story:** As a system administrator, I want visibility into loop detection behavior so that I can monitor effectiveness and troubleshoot issues.

#### Acceptance Criteria

1. THE Observability_Logger SHALL log the following events with timestamp and relevant numeric values: loop confidence threshold exceeded (including the threshold value and current confidence score), compression executed (including pre-compression token count and post-compression token count), compression statistics, and configuration changes (including parameter name, old value, and new value).
2. THE Observability_Logger SHALL provide metrics including: total compressions per session, average loop confidence at compression, average token reduction per compression, and time between compressions.
3. THE Observability_Logger SHALL expose metrics as structured key-value entries containing a timestamp, metric name, and numeric value.
4. THE Observability_Logger SHALL exclude the following from all log entries: user message text, file contents, tool parameters containing user input, and reasoning content that includes task-specific information.
