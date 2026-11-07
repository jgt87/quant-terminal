// Client cache of the indicator templates document (/api/indicator-templates). Loaded once on
// first use; every change is saved back whole.

import { deleteIndicatorTemplate, saveIndicatorTemplate, type IndicatorInstance, type IndicatorTemplates } from "@qt/core";

let doc: IndicatorTemplates = { saved: [] };
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function loadIndicatorTemplates(): Promise<void> {
  if (!loaded) {
    loaded =
      typeof fetch === "function"
        ? fetch("/api/indicator-templates")
            .then((r) => (r.ok ? r.json() : null))
            .then((j: IndicatorTemplates | null) => {
              if (j && Array.isArray(j.saved)) doc = j;
              emit();
            })
            .catch(() => undefined)
        : Promise.resolve();
  }
  return loaded;
}

export function indicatorTemplates(): IndicatorTemplates {
  return doc;
}

export function onIndicatorTemplates(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function store(next: IndicatorTemplates): Promise<void> {
  doc = next;
  emit();
  try {
    const r = await fetch("/api/indicator-templates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    if (r.ok) {
      doc = (await r.json()) as IndicatorTemplates;
      emit();
    }
  } catch {
    /* offline: the change stays in this session */
  }
}

export function saveCurrentAsTemplate(name: string, indicators: readonly IndicatorInstance[]): Promise<void> {
  return store(saveIndicatorTemplate(doc, name, indicators));
}

export function removeIndicatorTemplate(name: string): Promise<void> {
  return store(deleteIndicatorTemplate(doc, name));
}
