# API Request Expand for Debug - Requirements

## Overview
Users need the ability to click on sent API requests in the chat to expand them for debugging purposes. This feature was available in older Roo code but was removed. We will restore this useful debugging capability.

## Problem Statement
When developing and debugging Roo, users often need to inspect the raw API requests being sent to AI providers. Currently, API request messages in the chat only show a brief summary with cost information. There's no way to view the full request payload, which makes debugging API issues difficult.

## User Stories

### US-1: Expand API Request on Click
**As a** developer debugging Roo issues
**I want** to click on an API request message in the chat
**So that** I can view the full request payload for debugging

**Acceptance Criteria:**
- Clicking on a completed API request message expands/collapses the request details
- The expanded view shows the raw request JSON in a readable format
- The expansion state is preserved when scrolling back to previously expanded requests
- Only one click is needed to toggle expansion (no complex interactions)

### US-2: Readable JSON Display
**As a** developer reviewing API requests
**I want** the request JSON to be formatted and syntax-highlighted
**So that** I can easily read and understand the request structure

**Acceptance Criteria:**
- Request JSON is pretty-printed with proper indentation
- JSON is displayed in a code block with monospace font
- Long requests are scrollable within the expanded view

### US-3: Visual Indication of Expandable State
**As a** user scanning the chat
**I want** to see which API requests can be expanded
**So that** I know which items are interactive

**Acceptance Criteria:**
- Completed API requests show a subtle visual indicator (e.g., chevron icon)
- The cursor changes to pointer when hovering over expandable requests
- In-progress and failed requests remain non-expandable (as they don't have complete request data)

## Functional Requirements

### FR-1: Expansion Trigger
- Only `api_req_started` messages with completed data (not in-progress) should be expandable
- The click target should be the entire API request header row
- Expansion should toggle on/off with each click

### FR-2: Request Data Display
- Display the `request` field from `ClineApiReqInfo`
- Show the raw JSON in a formatted code block
- Include syntax highlighting for JSON if possible

### FR-3: State Management
- Expansion state should be managed in the existing `expandedRows` state in `ChatView.tsx`
- State should persist when messages are re-rendered during normal chat activity
- State should be preserved when user scrolls

### FR-4: Animation
- Expansion/collapse should have a smooth animation for better UX
- Animation should be subtle and not distracting

## Non-Functional Requirements

### NFR-1: Performance
- Expanding API requests should not cause noticeable lag
- Large request payloads (up to 100KB) should render without performance issues

### NFR-2: Accessibility
- Expansion should be keyboard accessible (Enter/Space to toggle)
- Screen readers should announce the expanded/collapsed state
- Focus management should be proper when expanding/collapsing

### NFR-3: Consistency
- The expansion behavior should match other expandable elements in the chat (e.g., command execution, MCP responses)
- Styling should be consistent with VSCode's design language

## Constraints
- Only API requests with the `request` field populated in `ClineApiReqInfo` should be expandable
- In-progress requests (no cost, no cancel reason) should not be expandable
- The feature should work with both Anthropic and OpenAI API protocols
