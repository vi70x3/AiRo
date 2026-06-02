# Requirements Document

## Introduction

When a user switches between different AI models during a task, the new model has no awareness of the reasoning history accumulated by the previous model. This can lead to redundant exploration, inconsistent behavior, and wasted context window space. The Auto-Condense on Model Switch feature automatically triggers context condensing when the user sends a message using a model that differs from the model used in the most recent API request. This gives the new model a clean, condensed summary of prior work instead of the full conversation history, improving coherence and reducing token waste.

## Glossary

- **Model**: An AI model identified by a unique model ID (e.g., `claude-sonnet-4-20250514`, `gpt-4o`) within a provider. A model is the combination of provider name and model ID.
- **Provider**: The service hosting the model (e.g., `anthropic`, `openai-native`, `openrouter`).
- **Model Switch**: An event where the model ID used for an upcoming API request differs from the model ID used in the most recent completed API request within the same task.
- **Context Condensing**: The AI-powered summarization of conversation history into a compact representation, preserving task objectives, conclusions, files modified, and current blockers while reducing token count.
- **API Request Turn**: A single call to the AI provider's API, consisting of the full conversation history sent and the streaming response received.
- **Auto-Condense**: The existing feature that automatically triggers condensing when token usage exceeds a configurable threshold (see `autoCondenseContext` and `autoCondenseContextPercent`).
- **Condense-Aware Model**: A model that benefits from receiving a condensed summary rather than full history when it has not participated in prior turns.
- **Recent Model Record**: A stored entry capturing which model was used for a given API request turn, including the provider, model ID, and turn timestamp.

## Requirements

### Requirement 1: Model Usage Tracking

**User Story:** As a user, I want the system to remember which model was used for each API request so that it can detect when I switch to a different model.

#### Acceptance Criteria

1. THE Task SHALL maintain a record of the model used for each API request turn, storing at minimum: the provider name, the model ID, and the turn number or timestamp.
2. THE Model_Usage_Tracker SHALL update the model record at the beginning of each `attemptApiRequest()` call, before any context management or API streaming begins.
3. THE Model_Usage_Tracker SHALL store the model identity as a composite key of `{ provider, modelId }` to distinguish between models with the same ID across different providers.
4. THE Model_Usage_Tracker SHALL persist model records for the lifetime of the Task instance and SHALL discard them when the Task is disposed.
5. THE Model_Usage_Tracker SHALL track at least the current and immediately preceding model records to enable switch detection.

### Requirement 2: Model Switch Detection

**User Story:** As a user, I want the system to detect when I have switched to a different model so that it can trigger condensing before the new model processes the conversation.

#### Acceptance Criteria

1. WHEN the user submits a message that will use a different model than the one recorded for the most recent API request turn, THE Model_Switch_Detector SHALL identify the transition as a model switch.
2. THE Model_Switch_Detector SHALL compare the upcoming model's composite key `{ provider, modelId }` against the most recent recorded model's composite key.
3. IF the provider is the same but the model ID differs, THEN THE Model_Switch_Detector SHALL classify the transition as a model switch.
4. IF the provider differs, THEN THE Model_Switch_Detector SHALL classify the transition as a model switch regardless of model ID.
5. IF the composite key `{ provider, modelId }` is identical to the most recent record, THEN THE Model_Switch_Detector SHALL NOT classify the transition as a model switch.
6. THE Model_Switch_Detector SHALL perform the comparison in `attemptApiRequest()` before the `willManageContext()` check, so that the switch signal can influence context management decisions.
7. IF no prior model record exists (first API request of a task), THEN THE Model_Switch_Detector SHALL NOT classify the transition as a model switch.

### Requirement 3: Auto-Condense Trigger on Model Switch

**User Story:** As a user, I want context condensing to trigger automatically when I send my next response with a model that is different than a model used recently so that the new model receives a clean summary instead of raw history.

#### Acceptance Criteria

1. WHEN a model switch is detected in `attemptApiRequest()`, THE Auto_Condense_Trigger SHALL force context management to run regardless of the current token usage threshold.
2. THE Auto_Condense_Trigger SHALL cause `willManageContext()` to return `true` when a model switch is detected, even if `contextPercent` is below `effectiveThreshold` and `prevContextTokens` is below `allowedTokens`.
3. WHEN a model switch is detected and `autoCondenseContext` is `false`, THE Auto_Condense_Trigger SHALL NOT force condensing but SHALL log a informational message indicating the model switch was detected and condensing is disabled.
4. WHEN condensing is triggered by a model switch and the condensing operation succeeds, THE system SHALL produce a summary that includes: the task objective, key conclusions reached, files modified or created, and any current blockers or open questions.
5. WHEN condensing triggered by a model switch fails, THE system SHALL fall back to the existing error handling behavior (error message via `say("condense_context_error", ...)`) and SHALL NOT abort the API request.
6. THE Auto_Condense_Trigger SHALL NOT cause condensing to run more than once per API request turn, even if multiple switch indicators are present.

### Requirement 4: Configuration

**User Story:** As a system administrator, I want to configure the auto-condense-on-model-switch behavior so that I can enable, disable, or tune it for different workflows.

#### Acceptance Criteria

1. THE Configuration_Manager SHALL provide a boolean setting `autoCondenseOnModelSwitch` (default: `true`) that enables or disables the automatic condensing trigger when a model switch is detected.
2. THE Configuration_Manager SHALL provide an integer setting `autoCondenseModelSwitchLookback` (default: `1`, valid range: `1` to `10`) that controls how many recent API request turns are considered "recent" for switch detection purposes.
3. WHEN `autoCondenseOnModelSwitch` is `false`, THE Model_Switch_Detector SHALL still record model usage but SHALL NOT trigger condensing.
4. WHEN `autoCondenseModelSwitchLookback` is set to a value greater than `1`, THE Model_Switch_Detector SHALL compare the upcoming model against all models recorded within the lookback window and SHALL trigger a switch only if the upcoming model differs from ALL recorded models in that window.
5. THE Configuration_Manager SHALL read both settings from provider state (via `getState()`) at the same point in `attemptApiRequest()` where other condensing settings are read.
6. IF `autoCondenseOnModelSwitch` is not explicitly set in configuration, THEN THE Configuration_Manager SHALL use the default value of `true`.

### Requirement 5: Integration with Existing Condensing Flow

**User Story:** As a user, I want model-switch condensing to work seamlessly with the existing auto-condense behavior so that I get a consistent experience regardless of what triggers condensing.

#### Acceptance Criteria

1. WHEN a model switch is detected AND the token threshold is also exceeded, THE system SHALL perform a single condensing operation (not two) that serves both triggers.
2. WHEN condensing is triggered by a model switch, the existing `manageContext()` function SHALL be invoked with the same parameters and options as a threshold-based trigger.
3. THE existing `condenseTaskContextStarted` and `condenseTaskContextResponse` webview notifications SHALL be sent when model-switch condensing runs, providing the same UI indicator behavior as threshold-based condensing.
4. THE existing `say("condense_context", ...)` message with `ContextCondense` metadata SHALL be emitted after successful model-switch condensing, identical to threshold-based condensing.
5. THE existing `say("condense_context_error", ...)` error message SHALL be emitted if model-switch condensing fails, identical to threshold-based condensing error handling.
6. WHEN model-switch condensing completes successfully, the conversation history SHALL be overwritten with the condensed result via `overwriteApiConversationHistory()` following the same pattern as threshold-based condensing.

### Requirement 6: Edge Cases and Guardrails

**User Story:** As a user, I want the model-switch condensing to handle edge cases gracefully so that it does not disrupt normal task execution.

#### Acceptance Criteria

1. IF the conversation history contains fewer than 2 messages (system prompt and one user message only), THEN THE Auto_Condense_Trigger SHALL NOT force condensing even if a model switch is detected, because there is insufficient history to condense.
2. IF the conversation history already contains a condensed summary (a message tagged with `condenseParent`), AND a model switch is detected, THEN THE Auto_Condense_Trigger SHALL condense the history again, including the prior summary as input, to produce a fresh summary for the new model.
3. IF the user switches back to a model that was used within the lookback window, AND `autoCondenseModelSwitchLookback` is greater than `1`, THEN THE Auto_Condense_Trigger SHALL NOT force condensing because the model is not considered "different" within the lookback scope.
4. THE Auto_Condense_Trigger SHALL NOT interfere with the sliding window truncation fallback — if condensing fails and token usage exceeds `allowedTokens`, truncation SHALL proceed as normal.
5. IF the API handler (`this.api`) is in a state where `getModel()` returns `undefined` for the model ID, THEN THE Model_Switch_Detector SHALL log a warning and SHALL NOT trigger condensing.
