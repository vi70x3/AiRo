# API Request Expand for Debug - Design

## Architecture Overview

This feature will be implemented by modifying the existing `ChatRow.tsx` component to add expansion capability to API request messages. The implementation will leverage the existing `expandedRows` state management already present in `ChatView.tsx`.

## Component Changes

### 1. ChatRow.tsx Modifications

#### Current Structure
The `api_req_started` case in `ChatRowContent` currently renders:
- A header with icon, title, and cost
- An optional error row for failed requests

#### New Structure
The modified `api_req_started` case will render:
- A clickable header with icon, title, cost, and expand/collapse indicator
- An optional error row for failed requests
- An expandable content section showing the formatted request JSON

#### Visual Layout

**Collapsed State:**
```
[🔄 API Request] $0.00                          [▶]
```

**Expanded State:**
```
[🔄 API Request] $0.00                          [▼]
┌─────────────────────────────────────────────────┐
│ {                                               │
│   "model": "claude-3-sonnet-20240229",          │
│   "messages": [                                 │
│     {                                           │
│       "role": "user",                           │
│       "content": "..."                          │
│     }                                           │
│   ],                                            │
│   ...                                           │
│ }                                               │
└─────────────────────────────────────────────────┘
```

### 2. State Management

The expansion state will use the existing `expandedRows` state in `ChatView.tsx`:
- Key: `message.ts` (timestamp)
- Value: `boolean` (expanded/collapsed)

No changes needed to `ChatView.tsx` as it already passes `isExpanded` and `onToggleExpand` props to `ChatRow`.

### 3. Data Flow

```
ClineApiReqInfo.request (JSON string)
    ↓
Parse and format JSON
    ↓
Display in expandable code block
```

## Implementation Details

### Expansion Logic

1. **Determine Expandability:**
   - API request is expandable if:
     - Message type is `api_req_started`
     - Request has completed (has cost or cancel reason)
     - `ClineApiReqInfo.request` field is populated

2. **Click Handler:**
   - Only trigger expansion toggle if the request is expandable
   - Use the existing `handleToggleExpand` callback with `message.ts`
   - Prevent event propagation to avoid unintended behavior

3. **Visual Feedback:**
   - Add `cursor-pointer` class when request is expandable
   - Show chevron icon (ChevronRight from lucide-react) that rotates when expanded
   - Apply hover effects to indicate interactivity

4. **JSON Formatting:**
   - Parse the request JSON string
   - Pretty-print with 2-space indentation
   - Display in a code block with monospace font
   - Add syntax highlighting using existing CodeBlock component if possible

### Code Structure

```tsx
case "api_req_started":
    const isApiRequestInProgress = ...
    const isExpandable = !isApiRequestInProgress && requestData?.request
    
    return (
        <>
            <div
                className={`
                    group text-sm transition-opacity
                    ${isApiRequestInProgress ? "opacity-100" : "opacity-40 hover:opacity-100"}
                    ${isExpandable ? "cursor-pointer" : ""}
                `}
                style={{...}}
                onClick={isExpandable ? handleToggleExpand : undefined}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexGrow: 1 }}>
                    {icon}
                    {title}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {/* Cost badge */}
                    {isExpandable && (
                        <ChevronRight 
                            className={cn(
                                "size-4 transition-transform",
                                isExpanded && "rotate-90"
                            )} 
                        />
                    )}
                </div>
            </div>
            
            {/* Expanded content */}
            {isExpanded && isExpandable && (
                <div className="ml-6 mt-2 p-3 bg-vscode-editor-background border border-vscode-border rounded-xs overflow-auto max-h-96">
                    <pre className="text-xs font-mono whitespace-pre-wrap">
                        {formattedRequestJson}
                    </pre>
                </div>
            )}
            
            {/* Error row (existing) */}
            {(((cost === null || cost === undefined) && apiRequestFailedMessage) ||
                apiReqStreamingFailedMessage) && (
                <ErrorRow ... />
            )}
        </>
    )
```

### Styling Considerations

- Use VSCode CSS variables for colors to match the theme
- Ensure the expanded content has proper contrast
- Add subtle border and background to distinguish the expanded content
- Limit max-height and enable scrolling for large requests
- Use monospace font for JSON display

### Accessibility

- Add `role="button"` and `tabIndex={0}` for keyboard navigation
- Handle Enter and Space key presses to toggle expansion
- Add `aria-expanded` attribute for screen readers
- Ensure focus indicators are visible

### Performance

- Memoize the formatted JSON to avoid re-parsing on every render
- Use CSS `max-height` with `overflow: auto` to handle large payloads efficiently
- Consider virtualization for extremely large requests (>100KB) if needed

## Files to Modify

1. **webview-ui/src/components/chat/ChatRow.tsx**
   - Modify the `api_req_started` case in `ChatRowContent`
   - Add expansion UI elements
   - Add click handler for expansion toggle
   - Import ChevronRight icon from lucide-react

## Testing Considerations

- Test expansion/collapse toggle functionality
- Test that only completed requests are expandable
- Test keyboard accessibility
- Test with large request payloads
- Test that expansion state persists during chat updates
- Test with both Anthropic and OpenAI API protocols
