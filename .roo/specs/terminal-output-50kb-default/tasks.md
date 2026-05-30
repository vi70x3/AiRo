# Tasks: Terminal Output 50KB Default

## Type/Schema Layer

- [ ] Update `TerminalOutputPreviewSize` type in [`global-settings.ts`](packages/types/src/global-settings.ts:39) — add `"xlarge"` to the union
- [ ] Add `xlarge: 50 * 1024` entry to [`TERMINAL_PREVIEW_BYTES`](packages/types/src/global-settings.ts:48) mapping
- [ ] Change [`DEFAULT_TERMINAL_OUTPUT_PREVIEW_SIZE`](packages/types/src/global-settings.ts:59) from `"medium"` to `"xlarge"`
- [ ] Update Zod schema for [`terminalOutputPreviewSize`](packages/types/src/global-settings.ts:169) — add `"xlarge"` to the enum
- [ ] Update doc comments in [`global-settings.ts`](packages/types/src/global-settings.ts:32) to describe the new `xlarge` tier

## UI State Layer

- [ ] Update [`ExtensionStateContext.tsx`](webview-ui/src/context/ExtensionStateContext.tsx:82) — change hardcoded `"small" | "medium" | "large"` to imported `TerminalOutputPreviewSize` type on lines 82-83

## Settings View

- [ ] Update [`SettingsView.tsx`](webview-ui/src/components/settings/SettingsView.tsx:386) — change fallback from `"medium"` to `"xlarge"`

## Terminal Settings Component

- [ ] Update [`TerminalSettings.tsx`](webview-ui/src/components/settings/TerminalSettings.tsx:104) — change dropdown fallback from `"medium"` to `"xlarge"`
- [ ] Add `xlarge` `<SelectItem>` to the dropdown in [`TerminalSettings.tsx`](webview-ui/src/components/settings/TerminalSettings.tsx:118) with translation key `settings:terminal.outputPreviewSize.options.xlarge`

## Locale Files

- [ ] Add `"xlarge": "Extra Large (50KB)"` to [`en/settings.json`](webview-ui/src/i18n/locales/en/settings.json:752)
- [ ] Add `"xlarge"` translation to [`ca/settings.json`](webview-ui/src/i18n/locales/ca/settings.json)
- [ ] Add `"xlarge"` translation to [`de/settings.json`](webview-ui/src/i18n/locales/de/settings.json)
- [ ] Add `"xlarge"` translation to [`es/settings.json`](webview-ui/src/i18n/locales/es/settings.json)
- [ ] Add `"xlarge"` translation to [`fr/settings.json`](webview-ui/src/i18n/locales/fr/settings.json)
- [ ] Add `"xlarge"` translation to [`hi/settings.json`](webview-ui/src/i18n/locales/hi/settings.json)
- [ ] Add `"xlarge"` translation to [`id/settings.json`](webview-ui/src/i18n/locales/id/settings.json)
- [ ] Add `"xlarge"` translation to [`it/settings.json`](webview-ui/src/i18n/locales/it/settings.json)
- [ ] Add `"xlarge"` translation to [`ja/settings.json`](webview-ui/src/i18n/locales/ja/settings.json)
- [ ] Add `"xlarge"` translation to [`ko/settings.json`](webview-ui/src/i18n/locales/ko/settings.json)
- [ ] Add `"xlarge"` translation to [`nl/settings.json`](webview-ui/src/i18n/locales/nl/settings.json)
- [ ] Add `"xlarge"` translation to [`pl/settings.json`](webview-ui/src/i18n/locales/pl/settings.json)
- [ ] Add `"xlarge"` translation to [`pt-BR/settings.json`](webview-ui/src/i18n/locales/pt-BR/settings.json)
- [ ] Add `"xlarge"` translation to [`ru/settings.json`](webview-ui/src/i18n/locales/ru/settings.json)
- [ ] Add `"xlarge"` translation to [`tr/settings.json`](webview-ui/src/i18n/locales/tr/settings.json)
- [ ] Add `"xlarge"` translation to [`vi/settings.json`](webview-ui/src/i18n/locales/vi/settings.json)
- [ ] Add `"xlarge"` translation to [`zh-CN/settings.json`](webview-ui/src/i18n/locales/zh-CN/settings.json)
- [ ] Add `"xlarge"` translation to [`zh-TW/settings.json`](webview-ui/src/i18n/locales/zh-TW/settings.json)

## Verification

- [ ] Run type check to verify no type errors across packages
- [ ] Run existing tests to verify no regressions
- [ ] Verify the dropdown renders all four options correctly in the UI