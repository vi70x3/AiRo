# Bugfix: Double-Click Send Required During Active Task

## Summary

When a task is already running and the AI asks a question (followup, tool approval, command, etc.), the user must double-click the send button or press Enter twice to actually send their message. The first attempt silently drops the message — the input clears as if it was sent, but the message never reaches the backend. The second attempt works because state has reset by then.

## Reproduction Steps

1. Start a new task (this works fine)
2. While the task is running, wait for the AI to ask a followup question or request tool approval
3. Type a message in the text area
4. Press Enter or click the send button
5. **Observed**: Input clears as if sent, but the message never appears in the conversation
6. Press Enter or click send again
7. **Observed**: The message is now actually sent

## Root Cause Analysis

The bug is in [`handleSendMessage`](webview-ui/src/components/chat/ChatView.tsx:573) in `ChatView.tsx`.

### Code Flow During the Bug

When the user presses Enter or clicks the send button during an active ask:

1. [`ChatTextArea`](webview-ui/src/components/chat/ChatTextArea.tsx:496) calls `onSend(inputValue, selectedImages)` on Enter key or send button click
2. `onSend` maps to [`handleSendMessage`](webview-ui/src/components/chat/ChatView.tsx:573) in ChatView

Inside `handleSendMessage`, the queuing check at lines 590-594:

```typescript
if (
    sendingDisabled ||
    isStreaming ||
    messageQueue.length > 0 ||
    clineAskRef.current === "command_output"
) {
    // Queue the message — this works correctly
    vscode.postMessage({ type: "queueMessage", text, images })
    setInputValue("")
    setSelectedImages([])
    return
}
```

For a **complete ask** (e.g., followup, tool), these conditions are all **false**:
- `sendingDisabled` = `isPartial` = `false` (the ask is complete, not partial)
- `isStreaming` = `false` (task is waiting for user input)
- `messageQueue.length` = `0`
- `clineAskRef.current` ≠ `"command_output"`

So the code proceeds past queuing to the main logic at lines 613-638:

```typescript
if (messagesRef.current.length === 0) {
    vscode.postMessage({ type: "newTask", text, images })  // Works for new tasks
} else if (clineAskRef.current) {
    if (clineAskRef.current === "followup") {
        markFollowUpAsAnswered()
    }

    switch (clineAskRef.current) {
        case "followup":
        case "tool":
        case "command":
        case "use_mcp_server":
        case "completion_result":
        case "resume_task":
        case "resume_completed_task":
        // There is no other case that a textfield should be enabled.
    }
    // *** NO vscode.postMessage IS CALLED — THE MESSAGE IS SILENTLY DROPPED ***
} else {
    vscode.postMessage({ type: "askResponse", askResponse: "messageResponse", text, images })
    // This works when clineAsk is undefined
}

handleChatReset()  // Clears input, sets sendingDisabled=true — user thinks message was sent
```

The `switch` statement at lines 621-632 lists all the ask cases but **has no body for any of them**. They all fall through to a comment. No `vscode.postMessage` is ever called, so the message disappears into the void.

Then [`handleChatReset()`](webview-ui/src/components/chat/ChatView.tsx:548) clears the input and sets `sendingDisabled = true`, making the user think the message was successfully sent.

### Why the Second Click Works

After the first failed attempt:
1. `handleChatReset()` sets `sendingDisabled = true` and clears `clineAsk`
2. The task continues (the ask was never responded to)
3. Eventually the ask gets auto-approved, superseded, or the task cycles to a new state
4. `sendingDisabled` becomes `false` again, `clineAsk` becomes `undefined`
5. The user clicks again — this time `clineAskRef.current` is `undefined`
6. The `else` branch at line 633-636 sends `askResponse: "messageResponse"` — **this works**

### Contrast with `handlePrimaryButtonClick`

[`handlePrimaryButtonClick`](webview-ui/src/components/chat/ChatView.tsx:694) correctly handles ask types — it sends `yesButtonClicked` with text/images for tool/command asks. But the Enter key and send button route through `handleSendMessage`, not `handlePrimaryButtonClick`.

### Contrast with Backend Queue Drain Logic

The backend drain logic in [`Task.ts`](src/core/task/Task.ts:1375) correctly differentiates ask types:

```typescript
if (type === "tool" || type === "command" || type === "use_mcp_server") {
    this.handleWebviewAskResponse("yesButtonClicked", message.text, message.images)
} else {
    this.handleWebviewAskResponse("messageResponse", message.text, message.images)
}
```

The frontend `handleSendMessage` switch statement should follow the same pattern.

## Proposed Fix

Add proper message sending logic to the empty `switch` cases in [`handleSendMessage`](webview-ui/src/components/chat/ChatView.tsx:621). The fix should match the backend drain pattern:

- For **tool/command/use_mcp_server** asks: send `askResponse: "yesButtonClicked"` with text/images (user is approving the tool with additional feedback)
- For **followup/completion_result/resume_task/resume_completed_task** asks: send `askResponse: "messageResponse"` with text/images (user is responding to the question)

The switch statement should become:

```typescript
switch (clineAskRef.current) {
    case "tool":
    case "command":
    case "use_mcp_server":
        vscode.postMessage({
            type: "askResponse",
            askResponse: "yesButtonClicked",
            text,
            images,
        })
        break
    case "followup":
    case "completion_result":
    case "resume_task":
    case "resume_completed_task":
        vscode.postMessage({
            type: "askResponse",
            askResponse: "messageResponse",
            text,
            images,
        })
        break
}
```

Note: The `markFollowUpAsAnswered()` call at line 616-618 should remain as-is since it handles UI state for followup questions before the switch.

## Affected Files

- [`webview-ui/src/components/chat/ChatView.tsx`](webview-ui/src/components/chat/ChatView.tsx) — primary fix location (lines 621-632)
- [`webview-ui/src/components/chat/__tests__/ChatView.spec.tsx`](webview-ui/src/components/chat/__tests__/ChatView.spec.tsx) — needs new test cases for the fix

## Risk Assessment

- **Low risk**: The fix adds missing functionality to an empty switch statement. No existing working code paths are modified.
- **The queuing path** (sendingDisabled/isStreaming) continues to work unchanged.
- **The new task path** (messagesRef.current.length === 0) continues to work unchanged.
- **The no-ask path** (else branch with messageResponse) continues to work unchanged.