// Indicator templates: a named set of indicators with their inputs, styles and pane placement,
// saved once and applied to any chart. Applying replaces the chart's indicators with fresh copies.

import type { IndicatorInstance } from "./types";

export interface IndicatorTemplate {
  name: string;
  indicators: IndicatorInstance[];
}

export interface IndicatorTemplates {
  saved: IndicatorTemplate[];
}

export const MAX_INDICATOR_TEMPLATES = 100;
export const MAX_TEMPLATE_INDICATORS = 50;

const byName = (a: IndicatorTemplate, b: IndicatorTemplate) => a.name.localeCompare(b.name);

/** Saves the indicators under `name` (an existing template with that name is replaced). */
export function saveIndicatorTemplate(doc: IndicatorTemplates, name: string, indicators: readonly IndicatorInstance[]): IndicatorTemplates {
  const n = name.trim();
  if (!n) return doc;
  const t: IndicatorTemplate = { name: n, indicators: indicators.slice(0, MAX_TEMPLATE_INDICATORS).map((i) => structuredClone(i)) };
  const rest = doc.saved.filter((s) => s.name !== n);
  return { saved: [...rest, t].sort(byName).slice(0, MAX_INDICATOR_TEMPLATES) };
}

export function deleteIndicatorTemplate(doc: IndicatorTemplates, name: string): IndicatorTemplates {
  return { saved: doc.saved.filter((s) => s.name !== name) };
}

/**
 * The template's indicators with new uids from `newUid`; pane sharing (`paneWith`) follows the
 * new uids, and a link to an indicator outside the template is dropped.
 */
export function instantiateTemplate(t: IndicatorTemplate, newUid: () => string): IndicatorInstance[] {
  const ids = new Map(t.indicators.map((i) => [i.uid, newUid()]));
  return t.indicators.map((i) => {
    const copy: IndicatorInstance = { ...structuredClone(i), uid: ids.get(i.uid) as string };
    const host = i.paneWith ? ids.get(i.paneWith) : undefined;
    if (host) copy.paneWith = host;
    else delete copy.paneWith;
    return copy;
  });
}
