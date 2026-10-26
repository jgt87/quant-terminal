// Internal drawing clipboard, shared by every chart of the page (copy in one cell or symbol,
// paste in another). Pasted drawings get new ids and land at the same coordinates.

import type { Drawing } from "@qt/core";

let clip: Drawing[] = [];
const listeners = new Set<() => void>();

export function copyDrawings(list: readonly Drawing[]): void {
  clip = list.map((d) => structuredClone(d));
  for (const fn of listeners) fn();
}

export function clipboardCount(): number {
  return clip.length;
}

export function onClipboard(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Copies of the clipboard with fresh ids, unlocked, visible and without group membership
 * (groups belong to one symbol's drawings).
 */
export function pasteDrawings(newId: () => string): Drawing[] {
  return clip.map((d) => {
    const copy: Drawing = { ...structuredClone(d), id: newId() };
    delete copy.groupId;
    delete copy.locked;
    delete copy.hidden;
    return copy;
  });
}

/** Clears the clipboard (tests). */
export function clearClipboard(): void {
  clip = [];
}
