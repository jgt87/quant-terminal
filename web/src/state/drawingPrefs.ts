// Per-browser drawing preferences shared by every chart and the drawing toolbar: magnet mode,
// stay in drawing mode, lock/hide all, drawing sync, cursor style, favorites (bar position),
// the last-used tool per family (button face). Persisted in localStorage; never required state.

import { useEffect, useState } from "react";
import type { MagnetMode } from "@qt/core";
import type { CursorStyle } from "../chart/drawings/DrawingController";

export interface DrawingPrefs {
  magnet: MagnetMode;
  /** Last non-off magnet mode (the magnet button toggles between off and this). */
  magnetOn: Exclude<MagnetMode, "off">;
  stayInDrawingMode: boolean;
  lockAll: boolean;
  hideAll: boolean;
  /** Mirror drawing changes to every chart of the same symbol in the active tab. */
  syncDrawings: boolean;
  cursor: CursorStyle;
  /** Long press on the chart shows a values tooltip. */
  valuesTooltip: boolean;
  /** Starred tool types, in star order. */
  favorites: string[];
  /** Favorites bar position (px from the top-left of the window) and visibility. */
  favoritesBar: { x: number; y: number; visible: boolean };
  /** Last used tool per family (toolbar button face). */
  faces: Record<string, string>;
}

const KEY = "qt.pref.drawing";

export const DEFAULT_DRAWING_PREFS: DrawingPrefs = {
  magnet: "off",
  magnetOn: "weak",
  stayInDrawingMode: false,
  lockAll: false,
  hideAll: false,
  syncDrawings: false,
  cursor: "cross",
  valuesTooltip: false,
  favorites: [],
  favoritesBar: { x: 64, y: 110, visible: true },
  faces: {},
};

function load(): DrawingPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_DRAWING_PREFS, ...(JSON.parse(raw) as Partial<DrawingPrefs>) };
    // Older builds kept only a boolean magnet (always "strong").
    const old = localStorage.getItem("qt.pref.magnet");
    if (old === "true") return { ...DEFAULT_DRAWING_PREFS, magnet: "strong", magnetOn: "strong" };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_DRAWING_PREFS };
}

let prefs: DrawingPrefs | null = null;
const listeners = new Set<(p: DrawingPrefs) => void>();

export function drawingPrefs(): DrawingPrefs {
  if (!prefs) prefs = load();
  return prefs;
}

export function setDrawingPrefs(patch: Partial<DrawingPrefs> | ((p: DrawingPrefs) => Partial<DrawingPrefs>)): void {
  const cur = drawingPrefs();
  prefs = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
  for (const fn of listeners) fn(prefs);
}

export function onDrawingPrefs(fn: (p: DrawingPrefs) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React binding: current prefs, re-rendering on change. */
export function useDrawingPrefs(): DrawingPrefs {
  const [p, setP] = useState(drawingPrefs);
  useEffect(() => onDrawingPrefs(setP), []);
  return p;
}

/** Toggles a tool in the favorites list. */
export function toggleFavorite(type: string): void {
  setDrawingPrefs((p) => ({ favorites: p.favorites.includes(type) ? p.favorites.filter((t) => t !== type) : [...p.favorites, type] }));
}
