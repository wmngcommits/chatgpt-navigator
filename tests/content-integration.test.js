const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parseHTML } = require("linkedom");

async function flushMutations() {
  await Promise.resolve();
  await Promise.resolve();
}

async function loadExtension(markup) {
  const { document, window: dom } = parseHTML(markup);
  const timers = new Map();
  let nextTimer = 0;
  let notifyMutation;
  let observationOptions;
  // linkedom has no layout engine; scrolling is verified in the live browser.
  dom.HTMLElement.prototype.scrollIntoView = () => {};
  const context = vm.createContext({
    document,
    location: { pathname: "/c/test-conversation" },
    HTMLElement: dom.HTMLElement,
    HTMLInputElement: dom.HTMLInputElement,
    HTMLTextAreaElement: dom.HTMLTextAreaElement,
    HTMLButtonElement: dom.HTMLButtonElement,
    // linkedom reports the observed root as every childList record's target.
    // Supply browser-shaped records to test the content script's observer logic.
    MutationObserver: class {
      constructor(callback) { notifyMutation = callback; }
      observe(_target, options) { observationOptions = options; }
    },
    window: {
      addEventListener() {},
      setInterval() {},
      setTimeout(callback) {
        const id = ++nextTimer;
        timers.set(id, callback);
        return id;
      },
      clearTimeout(id) { timers.delete(id); },
    },
  });
  for (const file of ["navigator-core.js", "content.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  }
  await flushMutations();

  return {
    document,
    timers,
    listTexts: () => Array.from(document.querySelectorAll(".cgpt-nav-item"), (item) => item.textContent),
    notify(record) {
      const enabled = observationOptions[record.type === "attributes" ? "attributes" : record.type];
      if (!enabled) return;
      if (record.type === "attributes" && !observationOptions.attributeFilter.includes(record.attributeName)) return;
      notifyMutation([record]);
    },
    async scan() {
      const scheduled = Array.from(timers.entries());
      for (const [id, callback] of scheduled) {
        timers.delete(id);
        callback();
      }
      await flushMutations();
    },
  };
}

test("the loaded content scripts populate the panel from current ChatGPT markup", async () => {
  const fixture = fs.readFileSync(path.join(__dirname, "fixtures/chatgpt-current.html"), "utf8");
  const extension = await loadExtension(fixture);
  assert.deepEqual(extension.listTexts(), ["hello"]);
  assert.equal(extension.document.getElementById("cgpt-nav-empty").style.display, "none");
});

test("streaming mutations keep one pending scan and navigator rendering does not schedule itself", async () => {
  const extension = await loadExtension(`<!doctype html><html><body><main>
    <div data-user-message-bubble="true">First prompt</div>
    <div id="assistant" data-message-author-role="assistant">Streaming</div>
  </main></body></html>`);
  extension.document.querySelector("main").insertAdjacentHTML("beforeend", '<div data-user-message-bubble="true">Second prompt</div>');
  extension.notify({ type: "childList", target: extension.document.querySelector("main") });
  await flushMutations();
  const pendingTimer = Array.from(extension.timers.keys());
  assert.equal(pendingTimer.length, 1);

  for (let i = 0; i < 5; i += 1) {
    extension.document.getElementById("assistant").textContent = `Streaming update ${i}`;
    extension.notify({ type: "characterData", target: extension.document.getElementById("assistant").firstChild });
    await flushMutations();
    assert.deepEqual(Array.from(extension.timers.keys()), pendingTimer);
  }
  await extension.scan();
  assert.deepEqual(extension.listTexts(), ["First prompt", "Second prompt"]);
  extension.notify({ type: "childList", target: extension.document.getElementById("cgpt-nav-list") });
  assert.equal(extension.timers.size, 0);
  extension.document.getElementById("cgpt-nav-title").textContent = "Navigator title update";
  extension.notify({ type: "characterData", target: extension.document.getElementById("cgpt-nav-title").firstChild });
  await flushMutations();
  assert.equal(extension.timers.size, 0);
});

test("attribute-only active-page switches refresh the visible prompt list", async () => {
  const extension = await loadExtension(`<!doctype html><html><body>
    <div id="first" data-app-shell-active-page="true"><div data-user-message-bubble="true">First chat</div></div>
    <div id="second" data-app-shell-active-page="false"><div data-user-message-bubble="true">Second chat</div></div>
  </body></html>`);
  assert.deepEqual(extension.listTexts(), ["First chat"]);
  extension.document.getElementById("first").setAttribute("data-app-shell-active-page", "false");
  extension.document.getElementById("second").setAttribute("data-app-shell-active-page", "true");
  extension.notify({ type: "attributes", attributeName: "data-app-shell-active-page", target: extension.document.getElementById("second") });
  await flushMutations();
  assert.equal(extension.timers.size, 1);
  await extension.scan();
  assert.deepEqual(extension.listTexts(), ["Second chat"]);
});
