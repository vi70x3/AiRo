# API Request Expand for Debug - Tasks

## Task List

### Task 1: Add Request Data Parsing
**Description:** Parse the request data from `ClineApiReqInfo` in the `api_req_started` case.

**Acceptance Criteria:**
- Extract `request` field from the parsed `ClineApiReqInfo` object
- Store it in a memoized variable for performance
- Handle cases where `request` field is undefined or empty

**Files to Modify:**
- `[Component:ChatRow]`

---

### Task 2: Determine Expandability Logic
**Description:** Add logic to determine when an API request should be expandable.

**Acceptance Criteria:**
- Request is expandable only when:
  - Message type is `api_req_started`
  - Request is not in-progress (has cost or cancel reason)
  - `request` field is populated and not empty
- Create a boolean variable `isExpandable` for use in rendering

**Files to Modify:**
- `[Component:ChatRow]`

---

### Task 3: Add Click Handler
**Description:** Implement the click handler for toggling expansion.

**Acceptance Criteria:**
- Add `onClick` handler to the header div
- Only trigger expansion when `isExpandable` is true
- Use the existing `handleToggleExpand` callback with `message.ts`
- Prevent event propagation for non-expandable requests

**Files to Modify:**
- `[Component:ChatRow]`

---

### Task 4: Add Visual Indicators
**Description:** Add visual cues to indicate expandable state.

**Acceptance Criteria:**
- Import `ChevronRight` icon from lucide-react
- Add chevron icon to the header when request is expandable
- Rotate chevron 90 degrees when expanded
- Add `cursor-pointer` class when request is expandable
- Add hover effects for better UX

**Files to Modify:**
- `[Component:ChatRow]`

---

### Task 5: Create Expanded Content View
**Description:** Build the expanded content section that displays the request JSON.

**Acceptance Criteria:**
- Format JSON with 2-space indentation
- Display in a code block with monospace font
- Add proper styling with VSCode CSS variables
- Limit max-height to 384px (max-h-96) with overflow scrolling
- Add proper padding and margins for visual hierarchy

**Files to Modify:**
- `[Component:ChatRow]`

---

### Task 6: Add Accessibility Attributes
**Description:** Ensure the expansion feature is accessible.

**Acceptance Criteria:**
- Add `role="button"` to clickable header
- Add `tabIndex={0}` for keyboard navigation
- Handle Enter and Space key presses
- Add `aria-expanded` attribute
- Ensure focus indicators are visible

**Files to Modify:**
- `[Component:ChatRow]`

---

### Task 7: Add Keyboard Event Handling
**Description:** Implement keyboard event handlers for accessibility.

**Acceptance Criteria:**
- Handle `onKeyDown` event for Enter and Space keys
- Toggle expansion on key press when expandable
- Prevent default behavior for Space key to avoid scrolling
- Maintain consistent behavior with click handler

**Files to Modify:**
- `[Component:ChatRow]`

---

### Task 8: Memoize Formatted JSON
**Description:** Optimize performance by memoizing the formatted JSON.

**Acceptance Criteria:**
- Create a memoized variable for the formatted request JSON
- Only re-parse and format when `request` data changes
- Use `JSON.parse` and `JSON.stringify` with proper error handling

**Files to Modify:**
- `[Component:ChatRow]`

---

### Task 9: Update Styling
**Description:** Apply consistent styling matching VSCode design language.

**Acceptance Criteria:**
- Use VSCode CSS variables for colors
- Ensure proper contrast in both light and dark themes
- Match styling with other expandable elements in the chat
- Add subtle transitions for smooth animations

**Files to Modify:**
- `[Component:ChatRow]`

---

### Task 10: Write Unit Tests
**Description:** Add tests for the new expansion functionality.

**Acceptance Criteria:**
- Test that expandable requests show the chevron icon
- Test that non-expandable requests don't show the chevron
- Test click/keyboard toggle behavior
- Test that expanded content displays formatted JSON
- Test that expansion state persists correctly

**Files to Create/Modify:**
- `webview-ui/src/components/chat/__tests__/ChatRow.api-request-expand.spec.tsx`

---

### Task 11: Manual Testing
**Description:** Perform manual testing to ensure everything works correctly.

**Acceptance Criteria:**
- Test with in-progress requests (should not be expandable)
- Test with completed requests (should be expandable)
- Test with failed requests (should not be expandable)
- Test with large request payloads
- Test keyboard navigation
- Test with both light and dark VSCode themes
- Test expansion state persistence during chat updates

---

## Dependencies

- Task 1 must be completed before Task 2
- Task 2 must be completed before Task 3
- Task 3 must be completed before Task 4
- Tasks 4, 5, 6, 7, 8, 9 can be implemented in parallel after Task 3
- Task 10 depends on all implementation tasks
- Task 11 depends on all implementation tasks

## Estimated Effort

This is a focused feature with clear requirements. The implementation involves:
- Modifying a single component file
- Adding a new icon import
- Creating a new test file
- No backend changes required
- No new dependencies needed

## Notes

- The existing `expandedRows` state in `[Component:ChatView]` already handles state management
- The `ChevronRight` icon is already used elsewhere in the codebase
- The `ClineApiReqInfo` interface already has the `request` field defined
- No changes to the backend or message types are required
