# ChatGPT Prompt Navigator (MVP)

Chrome extension (Manifest V3) that adds a prompt navigation overlay to ChatGPT pages.

## Features

- Runs on:
  - `https://chatgpt.com/*`
  - `https://chat.openai.com/*`
- Parses likely user turns defensively (role/data-testid/article fallbacks).
- Builds a clickable list of your prompts (truncated to ~110 chars).
- Optional filter input for quick search.
- Collapse/expand button and hotkey (`Alt+P`).
- Smooth scroll to prompt turn + highlight flash.
- `MutationObserver` re-indexing for SPA updates/new messages.
- Per-thread UI state persisted in `chrome.storage.local` keyed by `location.pathname`.

## Files

- `manifest.json`: MV3 config + content script registration.
- `content.js`: DOM parsing, overlay UI, observer, storage, navigation.
- `content.css`: overlay styling and highlight animation.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `chatgpt-navigator`.
5. Open a ChatGPT conversation page and verify the panel appears at top-right.

## Notes

- ChatGPT DOM can drift. Selectors are intentionally defensive and observer-driven.
- Side Panel API is not included in this MVP (overlay implementation only).
