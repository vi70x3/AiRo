# DeepSource Fixes Database

This document tracks all DeepSource issues that have been fixed in this codebase.

## JS-0009: Empty Block Statements

Fixed by adding `// noop` comments to empty catch blocks and for-await loops.

| File | Line | Description |
|------|------|-------------|
| src/utils/tts.ts | 35 | Empty catch block |
| src/services/checkpoints/excludes.ts | 196 | Empty catch block |
| src/integrations/terminal/ExecaTerminalProcess.ts | 114 | Empty catch block |
| src/integrations/misc/open-file.ts | 135 | Empty catch block |
| src/api/providers/__tests__/openai.spec.ts | 369, 386, 407, 428, 449, 471, 493 | Empty for-await loops |

## JS-0045: Missing Explicit Returns

Fixed by adding `return undefined` or `default: return undefined` to functions with conditional returns but no explicit return at end.

| File | Line | Description |
|------|------|-------------|
| src/core/checkpoints/index.ts | 215 | Changed `return` to `return undefined` |
| src/core/tools/apply-patch/apply.ts | 183-186 | Added `return undefined` after switch in `processHunk` |
| src/core/webview/ClineProvider.ts | 674 | Changed bare `return` to `return undefined` |
| src/integrations/misc/read-lines.ts | 27-30, 38-41 | Changed `return reject(...)` to `reject(...)` + `return` |
| src/integrations/editor/DecorationController.ts | 28-37 | Added `default: return undefined` inside switch |
| src/services/skills/SkillsManager.ts | 329-340 | Added `default: return undefined` inside switch |
| webview-ui/vite.config.ts | 149, 27, 170 | Added `return undefined` to manualChunks and wasmPlugin |
| webview-ui/src/utils/validate.ts | 174 | Added `return undefined` |
| webview-ui/src/components/settings/SettingsView.tsx | 496 | Added `return undefined` |
| webview-ui/src/components/settings/CreateSkillDialog.tsx | 43 | Added default return to switch |
| webview-ui/src/components/settings/ApiConfigManager.tsx | 100-109, 112-121 | Added `return undefined` to useEffect cleanup functions |
| webview-ui/src/components/modes/ModesView.tsx | 241 | Added `return undefined` |
| webview-ui/src/components/mcp/McpView.tsx | 195 | Added `return undefined` |
| webview-ui/src/components/mcp/McpErrorRow.tsx | 18 | Added `return undefined` |
| webview-ui/src/components/chat/ReasoningBlock.tsx | 36 | Added `return undefined` |
| webview-ui/src/components/chat/FollowUpSuggest.tsx | 76 | Added `return undefined` |
| webview-ui/src/components/chat/ContextMenu.tsx | 210 | Added `default: return null` inside switch |

## JS-0066: Shorthand Type Coercions

Fixed by replacing `!!value` with `Boolean(value)`.

| File | Line | Description |
|------|------|-------------|
| (pending) | | |

## JS-0002: Console Usage in Browser Code

Fixed by removing or replacing `console.*` calls in webview-ui browser code.

| File | Line | Description |
|------|------|-------------|
| (pending) | | |

## Summary

- **JS-0009**: 11 files fixed
- **JS-0045**: 17 files fixed
- **JS-0066**: Pending
- **JS-0002**: Pending