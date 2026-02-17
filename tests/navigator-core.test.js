const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizePromptText,
  truncateText,
  filterPrompts,
  normalizeSelectedPromptId,
  getNextSelectedPromptId,
  hasPromptListChanged,
} = require("../navigator-core.js");

test("normalizePromptText collapses whitespace and trims", () => {
  const input = "  hello \n\n   world\t  ";
  assert.equal(normalizePromptText(input), "hello world");
});

test("truncateText returns ellipsis when exceeding max", () => {
  const input = "this text should be truncated";
  assert.equal(truncateText(input, 11), "this text \u2026");
});

test("truncateText does not change short strings", () => {
  assert.equal(truncateText("short", 10), "short");
});

test("filterPrompts returns all prompts with empty query", () => {
  const prompts = [{ id: "a", fullText: "Alpha" }, { id: "b", fullText: "Beta" }];
  assert.deepEqual(filterPrompts(prompts, "   "), prompts);
});

test("filterPrompts matches case-insensitively", () => {
  const prompts = [
    { id: "a", fullText: "write tests for parser" },
    { id: "b", fullText: "draft launch notes" },
  ];
  assert.deepEqual(filterPrompts(prompts, "TESTS"), [{ id: "a", fullText: "write tests for parser" }]);
});

test("normalizeSelectedPromptId preserves existing selection", () => {
  const filtered = [{ id: "a" }, { id: "b" }];
  assert.equal(normalizeSelectedPromptId(filtered, "b"), "b");
});

test("normalizeSelectedPromptId falls back to first item", () => {
  const filtered = [{ id: "a" }, { id: "b" }];
  assert.equal(normalizeSelectedPromptId(filtered, "missing"), "a");
});

test("normalizeSelectedPromptId returns null for empty list", () => {
  assert.equal(normalizeSelectedPromptId([], "a"), null);
});

test("getNextSelectedPromptId moves forward with wrap-around", () => {
  const filtered = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(getNextSelectedPromptId(filtered, "c", 1), "a");
});

test("getNextSelectedPromptId moves backward with wrap-around", () => {
  const filtered = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(getNextSelectedPromptId(filtered, "a", -1), "c");
});

test("getNextSelectedPromptId starts from first item when selection missing", () => {
  const filtered = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(getNextSelectedPromptId(filtered, "missing", 1), "b");
});

test("getNextSelectedPromptId returns null for empty list", () => {
  assert.equal(getNextSelectedPromptId([], "a", 1), null);
});

test("hasPromptListChanged returns false when prompt list is identical", () => {
  const prev = [
    { id: "a", fullText: "alpha", preview: "alpha" },
    { id: "b", fullText: "beta", preview: "beta" },
  ];
  const next = [
    { id: "a", fullText: "alpha", preview: "alpha" },
    { id: "b", fullText: "beta", preview: "beta" },
  ];
  assert.equal(hasPromptListChanged(prev, next), false);
});

test("hasPromptListChanged returns true when length changes", () => {
  const prev = [{ id: "a", fullText: "alpha", preview: "alpha" }];
  const next = [
    { id: "a", fullText: "alpha", preview: "alpha" },
    { id: "b", fullText: "beta", preview: "beta" },
  ];
  assert.equal(hasPromptListChanged(prev, next), true);
});

test("hasPromptListChanged returns true when prompt order changes", () => {
  const prev = [
    { id: "a", fullText: "alpha", preview: "alpha" },
    { id: "b", fullText: "beta", preview: "beta" },
  ];
  const next = [
    { id: "b", fullText: "beta", preview: "beta" },
    { id: "a", fullText: "alpha", preview: "alpha" },
  ];
  assert.equal(hasPromptListChanged(prev, next), true);
});

test("hasPromptListChanged returns true when fullText changes", () => {
  const prev = [{ id: "a", fullText: "alpha", preview: "alpha" }];
  const next = [{ id: "a", fullText: "alpha updated", preview: "alpha updated" }];
  assert.equal(hasPromptListChanged(prev, next), true);
});
