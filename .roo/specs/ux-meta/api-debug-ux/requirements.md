# Requirements: API Debug UX (Expandable Requests)

## Introduction
The API Debug UX feature restores the ability for developers to inspect raw API requests directly in the chat interface. It enables expansion of "API Request" messages to view the full JSON payload, facilitating debugging of provider-specific issues and context management.

## Glossary
- **Expandable Row**: A chat message that can be toggled between collapsed and expanded states.
- **Request Payload**: The raw JSON object sent to the AI provider.
- **ClineApiReqInfo**: The data structure containing the API request details.

## Requirements
### Requirement 1: Expandable API Request Rows
1. THE system SHALL allow users to click on completed API Request messages in the chat to toggle expansion.
2. THE expanded view SHALL display the formatted (2-space indent) JSON payload of the request.
3. THE system SHALL use a rotating chevron icon to indicate expandable state.

### Requirement 2: Performance & Accessibility
1. THE system SHALL memoize formatted JSON to prevent redundant re-parsing.
2. THE expanded view SHALL be scrollable for large payloads (max-h-96).
3. THE header SHALL be keyboard accessible (Enter/Space to toggle).

## Out of Scope
- Editing or re-sending API requests from the chat.
- Expanding in-progress or failed requests (where payload is unavailable).

## Acceptance Criteria Summary
| ID | Description |
|----|-------------|
| AC-1 | Click-to-expand header |
| AC-2 | Formatted JSON display |
| AC-3 | Persisted expansion state |
