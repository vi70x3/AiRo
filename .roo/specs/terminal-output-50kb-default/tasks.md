# Tasks: Terminal Output 50KB Default

## Type/Schema Layer

- [x] Update `TerminalOutputPreviewSize` type in [`global-settings.ts`](packages/types/src/global-settings.ts:39) — add `"xlarge"` to the union
- [x] Add `xlarge: 50 * 1024` entry to [`TERMINAL_PREVIEW_BYTES`](packages/types/src/global-settings.ts:48) mapping
- [x] Change [`DEFAULT_TERMINAL_OUTPUT_PREVIEW_SIZE`](packages/types/src/global-settings.ts:59) from `"medium"` to `"xlarge"`
- [x] Update Zod schema for [`terminalOutputPreviewSize`](packages/types/src/global-settings.ts:169) — add `"xlarge"` to the enum
- [x] Update doc comments in [`global-settings.ts`](packages/types/src/global-settings.ts:32) to describe the new `xlarge` tier

## UI State Layer

- [x] Update [`ExtensionStateContext.tsx`](webview-ui/src/context/ExtensionStateContext.tsx:82) — change hardcoded `"small" | "medium" | "large"` to imported `TerminalOutputPreviewSize` type on lines 82-83

## Settings View

- [x] Update [`SettingsView.tsx`](webview-ui/src/components/settings/SettingsView.tsx:386) — change fallback from `"medium"` to `"xlarge"`

## Terminal Settings Component

- [x] Update [`TerminalSettings.tsx`](webview-ui/src/components/settings/TerminalSettings.tsx:104) — change dropdown fallback from `"medium"` to `"xlarge"`
- [x] Add `xlarge` `<SelectItem>` to the dropdown in [`TerminalSettings.tsx`](webview-ui/src/components/settings/TerminalSettings.tsx:118) with translation key `settings:terminal.outputPreviewSize.options.xlarge`

## Locale Files

- [x] Add `"xlarge": "Extra Large (50KB)"` to [`en/settings.json`](webview-ui/src/i18n/locales/en/settings.json:752)
- [x] Add `"xlarge"` translation to [`ca/settings.json`](webview-ui/src/i18n/locales/ca/settings.json)
- [x] Add `"xlarge"` translation to [`de/settings.json`](webview-ui/src/i18n/locales/de/settings.json)
- [x] Add `"xlarge"` translation to [`es/settings.json`](webview-ui/src/i18n/locales/es/settings.json)
- [x] Add `"xlarge"` translation to [`fr/settings.json`](webview-ui/src/i18n/locales/fr/settings.json)
- [x] Add `"xlarge"` translation to [`hi/settings.json`](webview-ui/src/i18n/locales/hi/settings.json)
- [x] Add `"xlarge"` translation to [`id/settings.json`](webview-ui/src/i18n/locales/id/settings.json)
- [x] Add `"xlarge"` translation to [`it/settings.json`](webview-ui/src/i18n/locales/it/settings.json)
- [x] Add `"xlarge"` translation to [`ja/settings.json`](webview-ui/src/i18n/locales/ja/settings.json)
- [x] Add `"xlarge"` translation to [`ko/settings.json`](webview-ui/src/i18n/locales/ko/settings.json)
- [x] Add `"xlarge"` translation to [`nl/settings.json`](webview-ui/src/i18n/locales/nl/settings.json)
- [x] Add `"xlarge"` translation to [`pl/settings.json`](webview-ui/src/i18n/locales/pl/settings.json)
- [x] Add `"xlarge"` translation to [`pt-BR/settings.json`](webview-ui/src/i18n/locales/pt-BR/settings.json)
- [x] Add `"xlarge"` translation to [`ru/settings.json`](webview-ui/src/i18n/locales/ru/settings.json)
- [x] Add `"xlarge"` translation to [`tr/settings.json`](webview-ui/src/i18n/locales/tr/settings.json)
- [x] Add `"xlarge"` translation to [`vi/settings.json`](webview-ui/src/i18n/locales/vi/settings.json)
- [x] Add `"xlarge"` translation to [`zh-CN/settings.json`](webview-ui/src/i18n/locales/zh-CN/settings.json)
- [x] Add `"xlarge"` translation to [`zh-TW/settings.json`](webview-ui/src/i18n/locales/zh-TW/settings.json)

## Verification

- [x] Run type check to verify no type errors across packages
- [x] Run existing tests to verify no regressions
- [x] Verify the dropdown renders all four options correctly in the UI