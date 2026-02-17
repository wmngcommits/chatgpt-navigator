const test = require("node:test");
const assert = require("node:assert/strict");

const { getKeyboardAction } = require("../navigator-core.js");

function baseInput() {
  return {
    key: "",
    code: "",
    repeat: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isCollapsed: false,
    isTargetEditable: false,
    inPanel: false,
    activeInPanel: false,
    keyboardModeArmed: false,
    hasFilter: false,
  };
}

test("Alt+P toggles panel", () => {
  const action = getKeyboardAction({ ...baseInput(), altKey: true, code: "KeyP" });
  assert.deepEqual(action, { type: "toggle_panel" });
});

test("Alt+P repeat is ignored", () => {
  const action = getKeyboardAction({ ...baseInput(), altKey: true, code: "KeyP", repeat: true });
  assert.equal(action, null);
});

test("slash focuses filter when target is not editable", () => {
  const action = getKeyboardAction({ ...baseInput(), key: "/" });
  assert.deepEqual(action, { type: "focus_filter" });
});

test("slash is ignored when typing in editable target", () => {
  const action = getKeyboardAction({ ...baseInput(), key: "/", isTargetEditable: true });
  assert.equal(action, null);
});

test("arrow down works when armed even outside panel", () => {
  const action = getKeyboardAction({ ...baseInput(), key: "ArrowDown", keyboardModeArmed: true });
  assert.deepEqual(action, { type: "move_selection", delta: 1 });
});

test("arrow keys are ignored when not armed and outside panel", () => {
  const action = getKeyboardAction({ ...baseInput(), key: "ArrowDown" });
  assert.equal(action, null);
});

test("arrow up works when focus is inside panel", () => {
  const action = getKeyboardAction({ ...baseInput(), key: "ArrowUp", inPanel: true });
  assert.deepEqual(action, { type: "move_selection", delta: -1 });
});

test("enter triggers selected prompt in active panel context", () => {
  const action = getKeyboardAction({ ...baseInput(), key: "Enter", activeInPanel: true });
  assert.deepEqual(action, { type: "trigger_selected" });
});

test("escape clears filter first", () => {
  const action = getKeyboardAction({ ...baseInput(), key: "Escape", keyboardModeArmed: true, hasFilter: true });
  assert.deepEqual(action, { type: "clear_filter" });
});

test("escape collapses panel when filter is empty", () => {
  const action = getKeyboardAction({ ...baseInput(), key: "Escape", keyboardModeArmed: true, hasFilter: false });
  assert.deepEqual(action, { type: "collapse_panel" });
});

test("non-toggle actions are ignored while panel is collapsed", () => {
  const action = getKeyboardAction({ ...baseInput(), key: "ArrowDown", isCollapsed: true, keyboardModeArmed: true });
  assert.equal(action, null);
});
