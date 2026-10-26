// Floating-toolbar model: which buttons a tool shows (catalog layouts) and what each button edits.

import type { Drawing } from "@qt/core";
import type { ChartTheme } from "../theme";
import { fieldValue, findField, getField, setField } from "./schema";
import type { DrawingToolDef, FieldKey, FloatBinding, FloatButton, ValueField } from "./types";

/** Master order of the floating toolbar (reference: drawing-menus.json floatingToolbar.buttonOrderMaster). */
export const FLOAT_ORDER: FloatButton[] = [
  "templates",
  "insert-column",
  "insert-row",
  "line-tool-color",
  "background-color",
  "background-color-2",
  "text-color",
  "font-size",
  "line-tool-width",
  "highlighter-width",
  "style",
  "settings",
  "add-alert",
  "lock",
  "toggle-anchor",
  "remove",
  "more",
];

/** Tooltips of the buttons. */
export const FLOAT_TITLES: Record<FloatButton, string> = {
  templates: "Templates",
  "insert-column": "Add column to right",
  "insert-row": "Add row below",
  "line-tool-color": "Line tool colors",
  "background-color": "Line tool backgrounds",
  "background-color-2": "Line tool backgrounds",
  "text-color": "Line tool text colors",
  "font-size": "Font size",
  "line-tool-width": "Line tool width",
  "highlighter-width": "Line tool width",
  style: "Style",
  settings: "Settings",
  "add-alert": "Add Alert",
  lock: "Lock",
  "toggle-anchor": "Anchor drawing",
  remove: "Remove",
  more: "More",
};

/** Field each value button edits unless the tool overrides it. */
const DEFAULT_KEYS: Partial<Record<FloatButton, FieldKey>> = {
  "line-tool-color": "style.color",
  "background-color": "style.fillColor",
  "text-color": "style.textColor",
  "font-size": "style.textSize",
  "line-tool-width": "style.width",
  "highlighter-width": "style.width",
  style: "style.lineStyle",
  "toggle-anchor": "props.anchored",
};

/** Buttons of a tool in master order: its declared layout, or one derived from its schema. */
export function floatButtons(def: DrawingToolDef): FloatButton[] {
  const declared = def.floatingToolbar;
  const has = (k: FieldKey) => Boolean(findField(def.settings, k));
  const derived: FloatButton[] = ["templates", "settings", "lock", "remove", "more"];
  if (!declared) {
    if (has("style.color")) derived.push("line-tool-color");
    if (has("style.fillColor")) derived.push("background-color");
    if (has("style.textColor")) derived.push("text-color");
    if (has("style.textSize")) derived.push("font-size");
    if (has("style.width")) derived.push("line-tool-width");
    if (has("style.lineStyle")) derived.push("style");
    if (def.alert) derived.push("add-alert");
  }
  const set = new Set(declared ?? derived);
  return FLOAT_ORDER.filter((b) => set.has(b));
}

/** Read/write binding of a value button (null for action buttons). */
export function floatBinding(def: DrawingToolDef, b: FloatButton, theme: ChartTheme): FloatBinding | null {
  const o = def.floatBindings?.[b];
  if (o && typeof o === "object") return o;
  const key = (o as FieldKey | undefined) ?? DEFAULT_KEYS[b];
  if (!key) return null;
  const f = findField(def.settings, key);
  return {
    get: (d: Drawing) => (f ? fieldValue(d, f, theme) : getField(d, key)),
    set: (d: Drawing, v: unknown) => setField(d, key, v),
  };
}

/** The settings field a value button edits (null for custom bindings and action buttons). */
export function floatField(def: DrawingToolDef, b: FloatButton): ValueField | null {
  const o = def.floatBindings?.[b];
  if (o && typeof o === "object") return null;
  const key = (o as FieldKey | undefined) ?? DEFAULT_KEYS[b];
  const f = key ? findField(def.settings, key) : undefined;
  return f && f.kind !== "section" ? f : null;
}

/** Width choices of the width button: the field's own options (e.g. 8–96 px highlighters), else 1–4 px. */
export function widthChoices(def: DrawingToolDef, b: FloatButton): { value: number; label: string }[] {
  const f = floatField(def, b);
  if (f?.kind === "select") return f.options.map((o) => ({ value: Number(o.value), label: o.label }));
  if (f?.kind === "number" && f.min !== undefined && f.max !== undefined) {
    const step = Math.max(f.step ?? 1, (f.max - f.min) / 12);
    const out: { value: number; label: string }[] = [];
    for (let v = f.min; v <= f.max + 1e-9; v += step) out.push({ value: Math.round(v), label: `${Math.round(v)}px` });
    return out;
  }
  return [1, 2, 3, 4].map((w) => ({ value: w, label: `${w}px` }));
}
