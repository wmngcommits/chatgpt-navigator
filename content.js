(() => {
  const ROOT_ID = "cgpt-nav-root";
  const PANEL_ID = "cgpt-nav-panel";
  const STORAGE_KEY = `cgpt-nav:${location.pathname}`;
  const HOTKEY_CODE = "KeyP"; // Alt+P toggles panel
  const MAX_PREVIEW = 110;

  const state = {
    collapsed: false,
    filter: "",
    prompts: [],
    elementsById: new Map(),
    mutationObserver: null,
    scanTimer: null,
    initialized: false,
  };

  function truncate(text, max = MAX_PREVIEW) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 1)}\u2026`;
  }

  function getStorageApi() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        return chrome.storage.local;
      }
    } catch (_err) {
      // ignored; fallback to in-memory only
    }
    return null;
  }

  function storageGet(key) {
    const api = getStorageApi();
    if (!api) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      api.get([key], (res) => resolve(res?.[key]));
    });
  }

  function storageSet(key, value) {
    const api = getStorageApi();
    if (!api) return Promise.resolve();
    return new Promise((resolve) => {
      api.set({ [key]: value }, () => resolve());
    });
  }

  function getTurnCandidates() {
    const selectors = [
      '[data-message-author-role="user"]',
      'article[data-testid*="conversation-turn"] [data-message-author-role="user"]',
      'article[data-testid*="conversation-turn"][data-message-author-role="user"]',
      'article[data-testid*="conversation-turn"]',
      '[data-testid*="conversation-turn"]',
      'main article',
    ];

    const results = [];
    const seen = new Set();

    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        const el = node instanceof HTMLElement ? node : null;
        if (!el || seen.has(el)) continue;
        seen.add(el);
        results.push(el);
      }
      if (results.length > 0) {
        break;
      }
    }

    return results;
  }

  function isLikelyUserTurn(el) {
    if (!(el instanceof HTMLElement)) return false;

    const role = el.getAttribute("data-message-author-role");
    if (role === "user") return true;
    if (role && role !== "assistant") return true;

    const roleDescendants = el.querySelector('[data-message-author-role="user"]');
    if (roleDescendants) return true;

    const text = (el.innerText || "").trim();
    if (!text) return false;

    if (el.matches("article") && text.length < 3000) {
      // Weak fallback when explicit role attribute is absent.
      return true;
    }

    return false;
  }

  function extractPromptText(turnEl) {
    if (!(turnEl instanceof HTMLElement)) return "";

    const roleNode = turnEl.matches('[data-message-author-role="user"]')
      ? turnEl
      : turnEl.querySelector('[data-message-author-role="user"]');

    const source = roleNode instanceof HTMLElement ? roleNode : turnEl;
    return source.innerText || "";
  }

  function rebuildPrompts() {
    const candidates = getTurnCandidates();
    const prompts = [];
    const elementsById = new Map();

    let index = 0;
    for (const turnEl of candidates) {
      if (!isLikelyUserTurn(turnEl)) continue;
      const fullText = (extractPromptText(turnEl) || "").replace(/\s+/g, " ").trim();
      if (!fullText) continue;

      const id = `turn-${index++}`;
      prompts.push({
        id,
        fullText,
        preview: truncate(fullText),
      });
      elementsById.set(id, turnEl);
    }

    state.prompts = prompts;
    state.elementsById = elementsById;
    renderList();
  }

  function flashElement(el) {
    el.classList.remove("cgpt-nav-highlight");
    // Force reflow so repeated clicks can retrigger animation.
    void el.offsetHeight;
    el.classList.add("cgpt-nav-highlight");
    setTimeout(() => {
      el.classList.remove("cgpt-nav-highlight");
    }, 1300);
  }

  function onPromptClick(id) {
    const el = state.elementsById.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    flashElement(el);
  }

  function getUi() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return null;

    const panel = root.querySelector(`#${PANEL_ID}`);
    const toggleBtn = root.querySelector("#cgpt-nav-toggle");
    const input = root.querySelector("#cgpt-nav-input");
    const list = root.querySelector("#cgpt-nav-list");
    const empty = root.querySelector("#cgpt-nav-empty");
    if (!(panel && toggleBtn && input && list && empty)) return null;

    return { root, panel, toggleBtn, input, list, empty };
  }

  function updatePanelState() {
    const ui = getUi();
    if (!ui) return;
    ui.panel.setAttribute("data-collapsed", String(state.collapsed));
    ui.toggleBtn.textContent = state.collapsed ? "Expand" : "Collapse";
  }

  function getFilteredPrompts() {
    const q = state.filter.trim().toLowerCase();
    if (!q) return state.prompts;
    return state.prompts.filter((p) => p.fullText.toLowerCase().includes(q));
  }

  function renderList() {
    const ui = getUi();
    if (!ui) return;

    const filtered = getFilteredPrompts();
    ui.list.textContent = "";

    if (filtered.length === 0) {
      ui.empty.style.display = "block";
      ui.empty.textContent = state.prompts.length === 0 ? "No prompts found yet." : "No prompts match your filter.";
      return;
    }

    ui.empty.style.display = "none";

    for (const prompt of filtered) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cgpt-nav-item";
      btn.title = prompt.fullText;
      btn.textContent = prompt.preview;
      btn.addEventListener("click", () => onPromptClick(prompt.id));
      li.appendChild(btn);
      ui.list.appendChild(li);
    }
  }

  async function saveUiState() {
    await storageSet(STORAGE_KEY, {
      collapsed: state.collapsed,
      filter: state.filter,
    });
  }

  async function loadUiState() {
    const saved = await storageGet(STORAGE_KEY);
    if (saved && typeof saved === "object") {
      state.collapsed = Boolean(saved.collapsed);
      state.filter = typeof saved.filter === "string" ? saved.filter : "";
    }
  }

  function installUI() {
    if (document.getElementById(ROOT_ID)) return;

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
      <section id="${PANEL_ID}" data-collapsed="false" aria-label="Prompt navigator panel">
        <header id="cgpt-nav-header">
          <span id="cgpt-nav-title">Prompt Navigator</span>
          <button id="cgpt-nav-toggle" type="button" title="Toggle panel (Alt+P)">Collapse</button>
        </header>
        <div id="cgpt-nav-body">
          <input id="cgpt-nav-input" type="text" placeholder="Filter prompts..." aria-label="Filter prompts" />
          <div id="cgpt-nav-empty">No prompts found yet.</div>
          <ul id="cgpt-nav-list" aria-label="Prompt list"></ul>
        </div>
      </section>
    `;
    document.body.appendChild(root);

    const ui = getUi();
    if (!ui) return;

    ui.input.value = state.filter;

    ui.toggleBtn.addEventListener("click", async () => {
      state.collapsed = !state.collapsed;
      updatePanelState();
      await saveUiState();
    });

    ui.input.addEventListener("input", async (event) => {
      const value = event.target instanceof HTMLInputElement ? event.target.value : "";
      state.filter = value;
      renderList();
      await saveUiState();
    });

    document.addEventListener("keydown", async (event) => {
      if (!(event.altKey && event.code === HOTKEY_CODE)) return;
      if (event.repeat) return;

      state.collapsed = !state.collapsed;
      updatePanelState();
      await saveUiState();
      event.preventDefault();
    });

    updatePanelState();
    renderList();
  }

  function scheduleRebuild() {
    if (state.scanTimer !== null) {
      window.clearTimeout(state.scanTimer);
    }

    state.scanTimer = window.setTimeout(() => {
      rebuildPrompts();
      state.scanTimer = null;
    }, 150);
  }

  function startObserver() {
    if (state.mutationObserver) return;

    state.mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList" || mutation.type === "characterData") {
          scheduleRebuild();
          return;
        }
      }
    });

    state.mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }

  async function init() {
    if (state.initialized) return;
    state.initialized = true;

    await loadUiState();
    installUI();
    rebuildPrompts();
    startObserver();

    let lastPath = location.pathname;
    window.setInterval(async () => {
      if (location.pathname === lastPath) return;
      lastPath = location.pathname;
      state.filter = "";
      state.collapsed = false;
      await loadUiState();
      const ui = getUi();
      if (ui) {
        ui.input.value = state.filter;
      }
      updatePanelState();
      rebuildPrompts();
    }, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void init();
    });
  } else {
    void init();
  }
})();
