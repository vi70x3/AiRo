# Requirements: Terminal Output 50KB Default

## Overview

Add a new `xlarge` (50KB) option to the terminal output preview size setting and make it the default, while keeping existing `small` (5KB), `medium` (10KB), and `large` (20KB) options unchanged.

## Background

The terminal output preview size controls how much command output the LLM sees directly before needing to use `read_command_output` to retrieve more. Currently the options are:

| Size | Bytes | Description |
|------|-------|-------------|
| small | 5KB | Best for long-running commands with verbose output |
| medium | 10KB | Balanced default |
| large | 20KB | Best when commands produce critical info early |

The current default is `medium` (10KB). The user wants the default to be 50KB to give the LLM more immediate context from command output.

## Requirements

### R1: Add `xlarge` size tier
- Add `"xlarge"` as a new valid value in the `TerminalOutputPreviewSize` type
- Map `xlarge` to 50 * 1024 = 51,200 bytes in `TERMINAL_PREVIEW_BYTES`
- Add `"xlarge"` to the Zod schema enum for `terminalOutputPreviewSize`

### R2: Change default to `xlarge`
- Change `DEFAULT_TERMINAL_OUTPUT_PREVIEW_SIZE` from `"medium"` to `"xlarge"`
- Update all fallback references that use `"medium"` as the implicit default

### R3: Update UI dropdown
- Add an `xlarge` option to the terminal output preview size dropdown in `TerminalSettings.tsx`
- The option should display as "Extra Large (50KB)" in English

### R4: Update all locale translations
- Add the `xlarge` option translation to all 18 locale settings.json files
- Each locale should translate "Extra Large" appropriately and show "(50KB)"

### R5: Maintain backward compatibility
- Existing users with `small`, `medium`, or `large` settings must keep their current preference
- Users with no explicit setting will get the new `xlarge` default
- No migration needed since the setting is optional in the schema

## Out of Scope

- Changing the `compressTerminalOutput` hardcoded limits (500 lines / 50K characters) — those are UI display limits, not preview size limits
- Changing the accumulated output buffer size (100KB) in `ExecuteCommandTool.ts`
- Modifying the `OutputInterceptor` head/tail buffer strategy