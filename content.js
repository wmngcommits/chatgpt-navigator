(() => {
  const ROOT_ID = "cgpt-nav-root";
  const PANEL_ID = "cgpt-nav-panel";
  const MAX_PREVIEW = 110;
  const PANEL_MARGIN = 8;
  const Core = globalThis.CGPTNavCore;
  if (!Core) {
    throw new Error("CGPTNavCore is required but was not loaded.");
  }

  const state = {
    collapsed: false,
    filter: "",
    prompts: [],
    elementsById: new Map(),
    elementToPromptId: new WeakMap(),
    nextPromptId: 0,
    selectedPromptId: null,
    keyboardModeArmed: false,
    position: null,
    mutationObserver: null,
    scanTimer: null,
    initialized: false,
    copiedPromptId: null,
    copiedResetTimer: null,
  };

  function getStorageKey() {
    return `cgpt-nav:${location.pathname}`;
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
      try {
        api.get([key], (res) => {
          try {
            const err = typeof chrome !== "undefined" ? chrome.runtime?.lastError : null;
            if (err) {
              resolve(undefined);
              return;
            }
            resolve(res?.[key]);
          } catch (_err) {
            resolve(undefined);
          }
        });
      } catch (_err) {
        resolve(undefined);
      }
    });
  }

  function storageSet(key, value) {
    const api = getStorageApi();
    if (!api) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        api.set({ [key]: value }, () => {
          try {
            const err = typeof chrome !== "undefined" ? chrome.runtime?.lastError : null;
            if (err) {
              resolve();
              return;
            }
            resolve();
          } catch (_err) {
            resolve();
          }
        });
      } catch (_err) {
        resolve();
      }
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

    for (const turnEl of candidates) {
      if (!isLikelyUserTurn(turnEl)) continue;
      const fullText = Core.normalizePromptText(extractPromptText(turnEl) || "");
      if (!fullText) continue;

      let id = state.elementToPromptId.get(turnEl);
      if (!id) {
        id = `turn-${state.nextPromptId++}`;
        state.elementToPromptId.set(turnEl, id);
      }

      prompts.push({
        id,
        fullText,
        preview: Core.truncateText(fullText, MAX_PREVIEW),
      });
      elementsById.set(id, turnEl);
    }

    const promptsChanged = Core.hasPromptListChanged(state.prompts, prompts);

    state.prompts = prompts;
    state.elementsById = elementsById;
    if (promptsChanged) {
      renderList();
    }
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

  function findElementForPrompt(id, fullText) {
    let el = state.elementsById.get(id);
    if (el instanceof HTMLElement && el.isConnected) return el;

    if (fullText) {
      const exactMatch = state.prompts.find((prompt) => prompt.fullText === fullText);
      if (exactMatch) {
        el = state.elementsById.get(exactMatch.id);
        if (el instanceof HTMLElement && el.isConnected) return el;
      }
    }

    // One synchronous resync can recover from transient SPA re-renders.
    rebuildPrompts();
    el = state.elementsById.get(id);
    if (el instanceof HTMLElement && el.isConnected) return el;

    if (fullText) {
      const exactMatchAfterResync = state.prompts.find((prompt) => prompt.fullText === fullText);
      if (exactMatchAfterResync) {
        el = state.elementsById.get(exactMatchAfterResync.id);
        if (el instanceof HTMLElement && el.isConnected) return el;
      }
    }

    return null;
  }

  function onPromptClick(id, fullText = "") {
    const el = findElementForPrompt(id, fullText);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    flashElement(el);
  }

  function getUi() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return null;

    const panel = root.querySelector(`#${PANEL_ID}`);
    const header = root.querySelector("#cgpt-nav-header");
    const toggleBtn = root.querySelector("#cgpt-nav-toggle");
    const input = root.querySelector("#cgpt-nav-input");
    const list = root.querySelector("#cgpt-nav-list");
    const empty = root.querySelector("#cgpt-nav-empty");
    if (!(panel && header && toggleBtn && input && list && empty)) return null;

    return { root, panel, header, toggleBtn, input, list, empty };
  }

  function clamp(num, min, max) {
    return Math.min(max, Math.max(min, num));
  }

  function clampPosition(x, y, root) {
    const rect = root.getBoundingClientRect();
    const maxX = Math.max(PANEL_MARGIN, window.innerWidth - rect.width - PANEL_MARGIN);
    const maxY = Math.max(PANEL_MARGIN, window.innerHeight - rect.height - PANEL_MARGIN);

    return {
      x: clamp(x, PANEL_MARGIN, maxX),
      y: clamp(y, PANEL_MARGIN, maxY),
    };
  }

  function applyPosition() {
    const ui = getUi();
    if (!ui) return;

    if (!state.position) {
      ui.root.style.left = "";
      ui.root.style.top = "";
      ui.root.style.right = "16px";
      ui.root.style.bottom = "";
      return;
    }

    const clamped = clampPosition(state.position.x, state.position.y, ui.root);
    state.position = clamped;
    ui.root.style.left = `${clamped.x}px`;
    ui.root.style.top = `${clamped.y}px`;
    ui.root.style.right = "auto";
    ui.root.style.bottom = "auto";
  }

  function updatePanelState() {
    const ui = getUi();
    if (!ui) return;
    ui.panel.setAttribute("data-collapsed", String(state.collapsed));
    ui.toggleBtn.textContent = state.collapsed ? "Expand" : "Collapse";
  }

  function getFilteredPrompts() {
    return Core.filterPrompts(state.prompts, state.filter);
  }

  function normalizeSelection(filtered) {
    state.selectedPromptId = Core.normalizeSelectedPromptId(filtered, state.selectedPromptId);
  }

  function selectByDelta(delta) {
    const filtered = getFilteredPrompts();
    state.selectedPromptId = Core.getNextSelectedPromptId(filtered, state.selectedPromptId, delta);
    renderList();
  }

  function triggerSelectedPrompt() {
    if (!state.selectedPromptId) return;
    const selectedPrompt = state.prompts.find((prompt) => prompt.id === state.selectedPromptId);
    onPromptClick(state.selectedPromptId, selectedPrompt?.fullText || "");
  }

  function isEditableTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
    if (target.isContentEditable) return true;
    return target.getAttribute("role") === "textbox";
  }

  function resetCopiedStateSoon() {
    if (state.copiedResetTimer !== null) {
      window.clearTimeout(state.copiedResetTimer);
    }
    state.copiedResetTimer = window.setTimeout(() => {
      state.copiedPromptId = null;
      state.copiedResetTimer = null;
      renderList();
    }, 1200);
  }

  async function copyText(text) {
    const value = String(text || "");
    if (!value) return false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_err) {
      // fall through to execCommand fallback
    }

    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (_err) {
      return false;
    }
  }

  function renderList() {
    const ui = getUi();
    if (!ui) return;

    const filtered = getFilteredPrompts();
    normalizeSelection(filtered);
    ui.list.textContent = "";

    if (filtered.length === 0) {
      ui.empty.style.display = "block";
      ui.empty.textContent = state.prompts.length === 0 ? "No prompts found yet." : "No prompts match your filter.";
      return;
    }

    ui.empty.style.display = "none";

    for (const prompt of filtered) {
      const li = document.createElement("li");
      li.className = "cgpt-nav-row";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cgpt-nav-item";
      btn.setAttribute("data-prompt-id", prompt.id);
      btn.setAttribute("data-selected", String(prompt.id === state.selectedPromptId));
      btn.title = prompt.fullText;
      btn.textContent = prompt.preview;
      btn.addEventListener("click", () => {
        state.selectedPromptId = prompt.id;
        onPromptClick(prompt.id, prompt.fullText);
        renderList();
      });
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "cgpt-nav-copy";
      copyBtn.textContent = state.copiedPromptId === prompt.id ? "Copied" : "Copy";
      copyBtn.title = "Copy full prompt";
      copyBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const ok = await copyText(prompt.fullText);
        if (!ok) return;
        state.copiedPromptId = prompt.id;
        renderList();
        resetCopiedStateSoon();
      });
      li.appendChild(btn);
      li.appendChild(copyBtn);
      ui.list.appendChild(li);
    }

    const selectedButton = ui.list.querySelector('[data-selected="true"]');
    if (selectedButton instanceof HTMLElement) {
      selectedButton.scrollIntoView({ block: "nearest" });
    }
  }

  async function saveUiState() {
    await storageSet(getStorageKey(), {
      collapsed: state.collapsed,
      filter: state.filter,
      position: state.position,
    });
  }

  async function loadUiState() {
    const saved = await storageGet(getStorageKey());
    if (saved && typeof saved === "object") {
      state.collapsed = Boolean(saved.collapsed);
      state.filter = typeof saved.filter === "string" ? saved.filter : "";
      if (
        saved.position &&
        typeof saved.position === "object" &&
        Number.isFinite(saved.position.x) &&
        Number.isFinite(saved.position.y)
      ) {
        state.position = { x: saved.position.x, y: saved.position.y };
      } else {
        state.position = null;
      }
    } else {
      state.position = null;
    }
  }

  function installDragging(ui) {
    let dragState = null;

    const endDrag = async () => {
      if (!dragState) return;
      dragState = null;
      ui.panel.removeAttribute("data-dragging");
      await saveUiState();
    };

    ui.header.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("#cgpt-nav-toggle")) return;

      const rect = ui.root.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      ui.panel.setAttribute("data-dragging", "true");
      ui.header.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    ui.header.addEventListener("pointermove", (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const next = clampPosition(event.clientX - dragState.offsetX, event.clientY - dragState.offsetY, ui.root);
      state.position = next;
      applyPosition();
    });

    ui.header.addEventListener("pointerup", (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      void endDrag();
    });

    ui.header.addEventListener("pointercancel", (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      void endDrag();
    });
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
    installDragging(ui);
    state.keyboardModeArmed = true;

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

    ui.root.addEventListener("pointerdown", () => {
      state.keyboardModeArmed = true;
    });

    ui.input.addEventListener("focus", () => {
      state.keyboardModeArmed = true;
    });

    document.addEventListener("pointerdown", (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;
      if (ui.root.contains(target)) return;
      state.keyboardModeArmed = false;
    });

    document.addEventListener("keydown", async (event) => {
      const uiRef = getUi();
      if (!uiRef) return;

      const target = event.target instanceof HTMLElement ? event.target : null;
      const isTargetEditable = target ? isEditableTarget(target) : false;
      const inPanel = target ? uiRef.root.contains(target) : false;
      const activeInPanel = document.activeElement instanceof HTMLElement ? uiRef.root.contains(document.activeElement) : false;
      const action = Core.getKeyboardAction({
        key: event.key,
        code: event.code,
        repeat: event.repeat,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        isCollapsed: state.collapsed,
        isTargetEditable,
        inPanel,
        activeInPanel,
        keyboardModeArmed: state.keyboardModeArmed,
        hasFilter: Boolean(state.filter),
      });
      if (!action) return;

      if (action.type === "toggle_panel") {
        state.collapsed = !state.collapsed;
        updatePanelState();
        await saveUiState();
        event.preventDefault();
        return;
      }

      if (action.type === "focus_filter") {
        state.keyboardModeArmed = true;
        uiRef.input.focus();
        uiRef.input.select();
        event.preventDefault();
        return;
      }

      if (action.type === "move_selection") {
        selectByDelta(action.delta);
        event.preventDefault();
        return;
      }

      if (action.type === "trigger_selected") {
        triggerSelectedPrompt();
        event.preventDefault();
        return;
      }

      if (action.type === "clear_filter") {
        state.filter = "";
        uiRef.input.value = "";
        renderList();
        await saveUiState();
        event.preventDefault();
        return;
      }

      if (action.type === "collapse_panel") {
        state.collapsed = true;
        updatePanelState();
        await saveUiState();
        event.preventDefault();
      }
    });

    window.addEventListener("resize", () => {
      if (!state.position) return;
      applyPosition();
    });

    applyPosition();
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
      applyPosition();
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
