# Constraints: API Debug UX

## MUST Rules
1. THE system MUST use the existing `expandedRows` state in `ChatView.tsx`.
2. THE expanded view MUST use VSCode theme variables for colors.
3. THE system SHALL only enable expansion for `api_req_started` messages where the `request` field is populated.

## MUST NOT Rules
1. THE system MUST NOT cause noticeable lag when expanding large payloads (up to 100KB).
2. THE expanded view MUST NOT exceed a maximum height (max-h-96).

## Assumptions
1. `ClineApiReqInfo` contains the raw request JSON string.
2. The user has access to a monospace font for JSON display.
