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

  const api = {
    normalizePromptText,
    truncateText,
    filterPrompts,
    normalizeSelectedPromptId,
    getNextSelectedPromptId,
  };

  global.CGPTNavCore = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
