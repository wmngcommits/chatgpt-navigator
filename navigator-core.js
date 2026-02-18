(function (global) {
  function normalizePromptText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function truncateText(text, max) {
    const limit = Number.isFinite(max) ? max : 110;
    const normalized = normalizePromptText(text);
    if (normalized.length <= limit) return normalized;
    return `${normalized.slice(0, limit - 1)}\u2026`;
  }

  function filterPrompts(prompts, query) {
    const items = Array.isArray(prompts) ? prompts : [];
    const q = String(query || "").trim().toLowerCase();
    if (!q) return items;
    return items.filter((prompt) => String(prompt?.fullText || "").toLowerCase().includes(q));
  }

  function normalizeSelectedPromptId(filteredPrompts, selectedPromptId) {
    const items = Array.isArray(filteredPrompts) ? filteredPrompts : [];
    if (items.length === 0) return null;
    const exists = items.some((prompt) => prompt?.id === selectedPromptId);
    return exists ? selectedPromptId : items[0].id;
  }

  function getNextSelectedPromptId(filteredPrompts, selectedPromptId, delta) {
    const items = Array.isArray(filteredPrompts) ? filteredPrompts : [];
    if (items.length === 0) return null;
    const direction = Number.isFinite(delta) ? delta : 0;
    const currentIndex = items.findIndex((prompt) => prompt?.id === selectedPromptId);
    const startIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (startIndex + direction + items.length) % items.length;
    return items[nextIndex].id;
  }

  function getKeyboardAction(input) {
    const data = input && typeof input === "object" ? input : {};
    const key = data.key || "";
    const code = data.code || "";
    const isRepeat = Boolean(data.repeat);
    const altKey = Boolean(data.altKey);
    const ctrlKey = Boolean(data.ctrlKey);
    const metaKey = Boolean(data.metaKey);
    const shiftKey = Boolean(data.shiftKey);
    const isCollapsed = Boolean(data.isCollapsed);
    const isTargetEditable = Boolean(data.isTargetEditable);
    const inPanel = Boolean(data.inPanel);
    const activeInPanel = Boolean(data.activeInPanel);
    const keyboardModeArmed = Boolean(data.keyboardModeArmed);
    const hasFilter = Boolean(data.hasFilter);

    if (altKey && code === "KeyP") {
      if (isRepeat) return null;
      return { type: "toggle_panel" };
    }

    if (isCollapsed) return null;

    if (!metaKey && !ctrlKey && !altKey && !shiftKey && key === "/" && !isTargetEditable) {
      return { type: "focus_filter" };
    }

    const canUseArmedMode = keyboardModeArmed && !isTargetEditable;
    if (!(inPanel || activeInPanel || canUseArmedMode)) return null;

    if (metaKey || ctrlKey || altKey) return null;

    if (key === "ArrowDown") return { type: "move_selection", delta: 1 };
    if (key === "ArrowUp") return { type: "move_selection", delta: -1 };
    if (key === "Enter") return { type: "trigger_selected" };

    if (key === "Escape") {
      if (hasFilter) return { type: "clear_filter" };
      return { type: "collapse_panel" };
    }

    return null;
  }

  function hasPromptListChanged(previousPrompts, nextPrompts) {
    const prev = Array.isArray(previousPrompts) ? previousPrompts : [];
    const next = Array.isArray(nextPrompts) ? nextPrompts : [];

    if (prev.length !== next.length) return true;
    for (let i = 0; i < next.length; i += 1) {
      const a = prev[i];
      const b = next[i];
      if (!a || !b) return true;
      if (a.id !== b.id || a.fullText !== b.fullText || a.preview !== b.preview) {
        return true;
      }
    }
    return false;
  }

  async function copyTextWithFallback(text, deps) {
    const value = String(text || "");
    if (!value) return false;

    const api = deps && typeof deps === "object" ? deps : {};
    const writeText =
      typeof api.writeText === "function"
        ? api.writeText
        : async (nextValue) => {
            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(nextValue);
              return;
            }
            throw new Error("Clipboard API unavailable");
          };

    try {
      await writeText(value);
      return true;
    } catch (_err) {
      // fall through to execCommand fallback
    }

    const execCopy =
      typeof api.execCopy === "function"
        ? api.execCopy
        : (nextValue) => {
            if (typeof document === "undefined") return false;
            const ta = document.createElement("textarea");
            ta.value = nextValue;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(ta);
            return ok;
          };

    try {
      return Boolean(execCopy(value));
    } catch (_err) {
      return false;
    }
  }

  const api = {
    normalizePromptText,
    truncateText,
    filterPrompts,
    normalizeSelectedPromptId,
    getNextSelectedPromptId,
    getKeyboardAction,
    hasPromptListChanged,
    copyTextWithFallback,
  };

  global.CGPTNavCore = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
