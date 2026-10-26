import { describe, expect, it } from "vitest";
import { comboOf, matchShortcut, SHORTCUTS, type KeyLike } from "../src/state/shortcuts";

const ev = (key: string, code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key,
  code,
  altKey: false,
  ctrlKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe("workspace shortcuts", () => {
  it("builds layout-independent combos", () => {
    expect(comboOf(ev("x", "KeyT", { altKey: true }))).toBe("Alt+T");
    expect(comboOf(ev("T", "KeyT", { altKey: true, shiftKey: true }))).toBe("Alt+Shift+T");
    expect(comboOf(ev("?", "Slash", { shiftKey: true }))).toBe("?");
    expect(comboOf(ev("PageDown", "PageDown", { altKey: true }))).toBe("Alt+PageDown");
  });

  it("matches every documented shortcut", () => {
    expect(matchShortcut(ev("n", "KeyN", { altKey: true }))).toEqual({ id: "newTab" });
    expect(matchShortcut(ev("w", "KeyW", { altKey: true }))).toEqual({ id: "closeTab" });
    expect(matchShortcut(ev("T", "KeyT", { altKey: true, shiftKey: true }))).toEqual({ id: "reopenTab" });
    expect(matchShortcut(ev("D", "KeyD", { altKey: true, shiftKey: true }))).toEqual({ id: "duplicateTab" });
    expect(matchShortcut(ev("PageDown", "PageDown", { altKey: true }))).toEqual({ id: "nextTab" });
    expect(matchShortcut(ev("PageUp", "PageUp", { altKey: true }))).toEqual({ id: "prevTab" });
    expect(matchShortcut(ev("3", "Digit3", { altKey: true }))).toEqual({ id: "goToTab", arg: 3 });
    expect(matchShortcut(ev("Enter", "Enter", { altKey: true }))).toEqual({ id: "maximizeCell" });
    expect(matchShortcut(ev("?", "Slash", { shiftKey: true }))).toEqual({ id: "help" });
    expect(SHORTCUTS.every((s) => typeof s.label === "string" && s.keys)).toBe(true);
  });

  it("leaves browser-reserved keys and drawing hotkeys alone", () => {
    expect(matchShortcut(ev("t", "KeyT", { ctrlKey: true }))).toBeNull();
    expect(matchShortcut(ev("w", "KeyW", { ctrlKey: true }))).toBeNull();
    expect(matchShortcut(ev("Tab", "Tab", { ctrlKey: true }))).toBeNull();
    expect(matchShortcut(ev("1", "Digit1", { ctrlKey: true }))).toBeNull();
    expect(matchShortcut(ev("t", "KeyT", { altKey: true }))).toBeNull(); // trend line tool
    expect(matchShortcut(ev("0", "Digit0", { altKey: true }))).toBeNull();
  });
});
