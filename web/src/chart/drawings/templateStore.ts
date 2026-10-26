// Client cache of the drawing templates document (/api/drawing-templates). Loaded once on first
// use; every change is saved back whole. New drawings start from the tool's default template.

import { deleteTemplate, initialStyle, saveTemplate, setDefaultTemplate, templateOf, type Drawing, type DrawingStyle, type DrawingTemplates } from "@qt/core";
import type { DrawingToolDef } from "./types";

let doc: DrawingTemplates = {};
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

/** Loads the document once (safe to call often). */
export function loadTemplates(): Promise<void> {
  if (!loaded) {
    loaded =
      typeof fetch === "function"
        ? fetch("/api/drawing-templates")
            .then((r) => (r.ok ? r.json() : {}))
            .then((j: DrawingTemplates) => {
              doc = j && typeof j === "object" ? j : {};
              emit();
            })
            .catch(() => undefined)
        : Promise.resolve();
  }
  return loaded;
}

export function templates(): DrawingTemplates {
  return doc;
}

export function onTemplates(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function store(next: DrawingTemplates): Promise<void> {
  doc = next;
  emit();
  try {
    const r = await fetch("/api/drawing-templates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    if (r.ok) {
      doc = (await r.json()) as DrawingTemplates;
      emit();
    }
  } catch {
    /* offline: keep the local copy */
  }
}

/** Style + props a new drawing of this tool starts with (tool defaults + default template). */
export function initialFor(def: Pick<DrawingToolDef, "type" | "defaults" | "defaultProps">): { style?: DrawingStyle; props?: Record<string, unknown> } {
  return initialStyle({ style: def.defaults, props: def.defaultProps }, doc, def.type);
}

export function saveAsTemplate(d: Drawing, name: string): Promise<void> {
  return store(saveTemplate(doc, d.type, templateOf(d, name)));
}

export function saveAsDefault(d: Drawing): Promise<void> {
  return store(setDefaultTemplate(doc, d.type, templateOf(d, "default")));
}

/** Clears the user's default template of a tool (new drawings use the built-in defaults). */
export function resetDefault(type: string): Promise<void> {
  return store(setDefaultTemplate(doc, type, null));
}

export function removeTemplate(type: string, name: string): Promise<void> {
  return store(deleteTemplate(doc, type, name));
}

/** Test hook: replace the cached document without saving. */
export function setTemplatesForTest(next: DrawingTemplates): void {
  doc = next;
  loaded = Promise.resolve();
  emit();
}
