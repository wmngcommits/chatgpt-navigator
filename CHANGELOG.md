# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-02-14

### Added
- Draggable overlay panel with viewport clamping.
- Per-thread persistence for panel position in `chrome.storage.local`.
- Store-ready icon set in required sizes (`16`, `32`, `48`, `128`).

### Changed
- Tightened permissions by removing unnecessary `host_permissions` from `manifest.json`.
- Release packaging flow cleaned up for Chrome Web Store submission.

## [0.1.0] - 2026-02-14

### Added
- Initial Chrome MV3 extension scaffold.
- Content script support on:
  - `https://chatgpt.com/*`
  - `https://chat.openai.com/*`
- Defensive parsing for user prompts with fallback selectors.
- Fixed-position prompt navigator overlay with:
  - prompt list
  - filter input
  - collapse/expand button
- Smooth scroll + highlight flash when selecting a prompt.
- MutationObserver-based prompt list rebuild for SPA updates.
- Per-thread UI state persistence in `chrome.storage.local` keyed by `location.pathname`.
- Extension icons and packaging flow for release zip.
