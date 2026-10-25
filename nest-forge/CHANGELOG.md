# Changelog

All notable changes to the "Nest Forge" extension will be documented in this file.

## [0.3.0] - 2026-10-25

### Security
- Harden Matrix Webview with nonce CSP, HTML escaping, and event delegation (`fix(SEC-01)`).
- Enforce workspace trust before loading custom templates or running local formatters (`fix(SEC-02)`).
- Validate language, namespace, and resolved i18n file paths before writing or deleting (`fix(store)`).
- Apply custom route path with strict decorator sanitization (`fix(CORR-03)`).

### Fixes
- Guard against silent file overwrites and re-enable forge button on cancel (`fix(CORR-01)`).
- Wire generated listeners into module providers in flat and grouped modes (`fix(CORR-02)`).
- Prevent double pluralization and enforce valid identifier naming (`fix(CORR-09)`).
- Pass spec import paths in grouped mode and respect `pathAlias` in policy and repository (`fix(CORR-11)`).
- Prevent `renameFeature` corruption using word boundary replacements (`fix(CORR-04)`).
- Allow preceding lowercase letter for PascalCase in compound identifiers during feature rename (`fix(CORR-04b)`).
- Dispose `store.onDidUpdate` listener in `MatrixWebviewPanel` (`fix(CORR-12)`).

### Performance
- Clean up activation events and eliminate eager language triggers (`fix(PERF-01)`).
- Drop redundant `onCommand` and over-broad i18n activation events (`fix(PERF-01b)`).
- Batch `fixAllMissing` writes per file and debounce watcher reload (`fix(PERF-04)`).
- Ignore watcher events caused by the store's own writes (`fix(PERF-04b)`).
- Optimize matrix typography indexing, parity caching, and search debounce (`fix(PERF-05)`).
- Debounce form preview and strip context payload from webview preview messages (`fix(PERF-06)`).
- Remove duplicate resources in vsix and ignore `AGENTS.md` and `GEMINI.md` (`fix(PERF-07)`).

### Changes
- Group explorer context menu items into Nest Forge submenu (`fix(UI)`).
- Add `nestForge.formatter` and `nestForge.validator` to `contributes.configuration` (`fix(config)`).
