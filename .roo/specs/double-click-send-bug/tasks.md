# Tasks: Double-Click Send Bug Fix

## Implementation Tasks

- [ ] Fix the empty switch statement in `handleSendMessage` in [`ChatView.tsx`](webview-ui/src/components/chat/ChatView.tsx:621) — add `vscode.postMessage` calls for each ask type:
  - `tool`, `command`, `use_mcp_server` → send `askResponse: "yesButtonClicked"` with text/images
  - `followup`, `completion_result`, `resume_task`, `resume_completed_task` → send `askResponse: "messageResponse"` with text/images
- [ ] Verify `markFollowUpAsAnswered()` call before the switch remains intact
- [ ] Add test case: sending message during followup ask sends `messageResponse`
- [ ] Add test case: sending message during tool ask sends `yesButtonClicked`
- [ ] Add test case: sending message during command ask sends `yesButtonClicked`
- [ ] Add test case: sending message during use_mcp_server ask sends `yesButtonClicked`
- [ ] Add test case: sending message during completion_result ask sends `messageResponse`
- [ ] Add test case: queuing path still works when sendingDisabled/isStreaming is true
- [ ] Run all existing ChatView tests to verify no regressions