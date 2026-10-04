const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseHTML } = require("linkedom");
const { collectUserPrompts } = require("../navigator-core.js");

function documentFrom(markup) {
  return parseHTML(`<!doctype html><html><body>${markup}</body></html>`).document;
}

function texts(document) {
  return collectUserPrompts(document).map((prompt) => prompt.fullText);
}

test("detects the current ChatGPT user markup and excludes inactive chats, headings, and actions", () => {
  const fixture = fs.readFileSync(path.join(__dirname, "fixtures/chatgpt-current.html"), "utf8");
  const { document } = parseHTML(fixture);
  const prompts = collectUserPrompts(document);
  assert.deepEqual(prompts.map((prompt) => prompt.fullText), ["hello"]);
  assert.equal(prompts[0].element.getAttribute("data-chatgpt-search-message-ids"), "message-1");
});

test("continues to detect legacy role-based user messages without including assistant articles", () => {
  const document = documentFrom(`
    <main>
      <article data-testid="conversation-turn-1"><div data-message-author-role="user">First prompt</div></article>
      <article data-testid="conversation-turn-2"><div data-message-author-role="assistant">Short assistant reply</div></article>
      <article data-testid="conversation-turn-3" data-message-author-role="user">Second prompt</article>
      <article>Unlabeled article</article>
    </main>
  `);
  assert.deepEqual(texts(document), ["First prompt", "Second prompt"]);
});

test("combines current and legacy user markers in conversation order", () => {
  const document = documentFrom(`
    <main>
      <div data-chatgpt-search-unit-key="turn-0:0:user">First</div>
      <div data-message-author-role="user">Second</div>
      <div data-content-search-unit-key="turn-2:0:user">Third</div>
      <div data-user-message-bubble="true">Fourth</div>
    </main>
  `);
  assert.deepEqual(texts(document), ["First", "Second", "Third", "Fourth"]);
});

test("nested user markers produce one prompt, while repeated prompt text remains distinct", () => {
  const document = documentFrom(`
    <div data-chatgpt-search-unit-key="turn-0:0:user" data-message-author-role="user">
      <div data-content-search-unit-key="turn-0:0:user">
        <div data-user-message-bubble="true">Repeat this prompt</div>
        <button>Copy message</button>
      </div>
    </div>
    <div data-user-message-bubble="true">Repeat this prompt</div>
  `);
  assert.deepEqual(texts(document), ["Repeat this prompt", "Repeat this prompt"]);
});

test("only indexes the active page even if it has no prompts", () => {
  const document = documentFrom(`
    <div data-app-shell-active-page="false"><div data-user-message-bubble="true">Old chat</div></div>
    <div data-app-shell-active-page="true"><textarea>Unsent draft</textarea></div>
  `);
  assert.deepEqual(texts(document), []);
});

test("follows attribute-only changes when switching active conversations", () => {
  const document = documentFrom(`
    <div id="first" data-app-shell-active-page="true"><div data-user-message-bubble="true">First chat</div></div>
    <div id="second" data-app-shell-active-page="false"><div data-user-message-bubble="true">Second chat</div></div>
  `);
  assert.deepEqual(texts(document), ["First chat"]);
  document.getElementById("first").setAttribute("data-app-shell-active-page", "false");
  document.getElementById("second").setAttribute("data-app-shell-active-page", "true");
  assert.deepEqual(texts(document), ["Second chat"]);
});

test("ignores hidden and explicitly assistant messages", () => {
  const document = documentFrom(`
    <div hidden><div data-user-message-bubble="true">Hidden message</div></div>
    <div aria-hidden="true"><div data-message-author-role="user">Hidden role message</div></div>
    <article data-message-author-role="assistant"><div data-user-message-bubble="true">Assistant example</div></article>
    <div data-message-author-role="user">Visible user message</div>
  `);
  assert.deepEqual(texts(document), ["Visible user message"]);
});

test("skips empty messages and normalizes whitespace without truncating long prompts", () => {
  const longText = "Long prompt ".repeat(400).trim();
  const document = documentFrom(`
    <div data-user-message-bubble="true">   </div>
    <div data-user-message-bubble="true">  First\n\n  line\t second line  </div>
    <div data-user-message-bubble="true">${longText}</div>
  `);
  assert.deepEqual(texts(document), ["First line second line", longText]);
});

test("finds newly added user messages and updated text on the next scan", () => {
  const document = documentFrom('<main><div data-user-message-bubble="true">First</div></main>');
  assert.deepEqual(texts(document), ["First"]);
  document.querySelector("main").insertAdjacentHTML("beforeend", '<div data-user-message-bubble="true">Second</div>');
  document.querySelector('[data-user-message-bubble="true"]').textContent = "Edited first";
  assert.deepEqual(texts(document), ["Edited first", "Second"]);
});
