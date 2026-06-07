# Verification: API Debug UX

## Test Strategy
- **Unit Testing**: Test click/keyboard toggle logic in `ChatRow.tsx`.
- **UI Testing**: Verify rotating chevron and formatted JSON block visibility.
- **End-to-End**: Trigger an API request, wait for it to finish, and verify it can be expanded.

## Validation Checks
1. JSON indentation matches 2-space standard.
2. Chevron rotates 90 degrees on expansion.
3. State persists when scrolling.

## Completion Criteria
- [ ] Header clickable with pointer cursor.
- [ ] Formatted JSON displayed on expansion.
- [ ] Keyboard navigation functional.
