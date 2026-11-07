// Workspace keyboard shortcuts (config/shortcuts.json). Browsers reserve Ctrl+T/W/Tab/1..9 for
// their own tabs, so the app binds Alt-based equivalents and never intercepts the browser keys.
// Matching uses `code` for letters and digits so it does not depend on the keyboard layout.

import list from "../config/shortcuts.json";

export interface ShortcutDef {
  id: ShortcutId;
  keys: string;
  label: string;
  /** The browser's own binding for the same action, which the app leaves alone. */
  browser?: string;
  note?: string;
}

export type ShortcutId =
  | "newTab"
  | "closeTab"
  | "reopenTab"
  | "duplicateTab"
  | "nextTab"
  | "prevTab"
  | "goToTab"
  | "maximizeCell"
  | "fullscreen"
  | "help";

export const SHORTCUTS = list as ShortcutDef[];

export interface KeyLike {
  key: string;
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export interface ShortcutMatch {
  id: ShortcutId;
  /** Tab number for goToTab (1..9). */
  arg?: number;
}

/** Combo text such as "Alt+Shift+T" for a key event (letters/digits by physical key). */
export function comboOf(e: KeyLike): string {
  let k = e.key;
  if (/^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) k = e.code.slice(5);
  else if (/^Numpad[0-9]$/.test(e.code)) k = e.code.slice(6);
  if (k === "?") return "?"; // Shift is implied by the character
  const mods = [e.ctrlKey && "Ctrl", e.metaKey && "Meta", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean);
  return [...mods, k.length === 1 ? k.toUpperCase() : k].join("+");
}

export function matchShortcut(e: KeyLike, defs: readonly ShortcutDef[] = SHORTCUTS): ShortcutMatch | null {
  const combo = comboOf(e);
  for (const d of defs) {
    const range = /^(.*\+)?(\d)\.\.(\d)$/.exec(d.keys);
    if (range) {
      const prefix = range[1] ?? "";
      if (!combo.startsWith(prefix)) continue;
      const rest = combo.slice(prefix.length);
      const n = Number(rest);
      if (/^\d$/.test(rest) && n >= Number(range[2]) && n <= Number(range[3])) return { id: d.id, arg: n };
      continue;
    }
    if (d.keys === combo) return { id: d.id };
  }
  return null;
}
