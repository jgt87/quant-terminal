// Drawing templates: named style + tool-props presets per tool type, plus an optional default
// template per tool that new drawings start from. Stored server-side (/api/drawing-templates).

import type { Drawing, DrawingStyle } from "../types";

export interface DrawingTemplate {
  name: string;
  style: DrawingStyle;
  props?: Record<string, unknown>;
}

export interface ToolTemplates {
  /** Style/props new drawings of this tool start with (missing = the tool's built-in defaults). */
  default?: { style: DrawingStyle; props?: Record<string, unknown> };
  saved: DrawingTemplate[];
}

/** Templates document: tool type → its templates. */
export type DrawingTemplates = Record<string, ToolTemplates>;

const clean = <T extends object>(o: T | undefined): T | undefined => {
  if (!o) return undefined;
  const out = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
  return Object.keys(out).length ? out : undefined;
};

/**
 * Style and props a new drawing of `type` starts with: the tool defaults overlaid with the
 * user's default template (template values win; undefined values never erase defaults).
 */
export function initialStyle(
  defaults: { style?: DrawingStyle; props?: Record<string, unknown> },
  templates: DrawingTemplates | null | undefined,
  type: string,
): { style?: DrawingStyle; props?: Record<string, unknown> } {
  const t = templates?.[type]?.default;
  return {
    style: clean({ ...defaults.style, ...clean(t?.style) }),
    props: clean({ ...defaults.props, ...clean(t?.props) }),
  };
}

/** Applies a template to a drawing: replaces its style and merges the template's props. */
export function applyTemplate(d: Drawing, t: { name?: string; style: DrawingStyle; props?: Record<string, unknown> }): Drawing {
  const next: Drawing = { ...d, style: clean({ ...t.style }) };
  const props = clean({ ...d.props, ...t.props });
  if (props) next.props = props;
  else delete next.props;
  if (t.name) next.templateName = t.name;
  else delete next.templateName;
  if (!next.style) delete next.style;
  return next;
}

/** Captures a drawing's style + props as a template. */
export function templateOf(d: Drawing, name: string): DrawingTemplate {
  const t: DrawingTemplate = { name, style: structuredClone(d.style ?? {}) };
  if (d.props && Object.keys(d.props).length) t.props = structuredClone(d.props);
  return t;
}

/** Adds or replaces (same name) a saved template of `type`; returns a new document. */
export function saveTemplate(doc: DrawingTemplates, type: string, t: DrawingTemplate): DrawingTemplates {
  const cur = doc[type] ?? { saved: [] };
  const saved = [...cur.saved.filter((s) => s.name !== t.name), t].sort((a, b) => a.name.localeCompare(b.name));
  return { ...doc, [type]: { ...cur, saved } };
}

/** Sets (or with null clears) the default template of `type`; returns a new document. */
export function setDefaultTemplate(doc: DrawingTemplates, type: string, t: { style: DrawingStyle; props?: Record<string, unknown> } | null): DrawingTemplates {
  const cur = doc[type] ?? { saved: [] };
  const next: ToolTemplates = { saved: cur.saved };
  if (t) next.default = { style: structuredClone(t.style), ...(t.props ? { props: structuredClone(t.props) } : {}) };
  return { ...doc, [type]: next };
}

/** Removes a saved template; returns a new document. */
export function deleteTemplate(doc: DrawingTemplates, type: string, name: string): DrawingTemplates {
  const cur = doc[type];
  if (!cur) return doc;
  return { ...doc, [type]: { ...cur, saved: cur.saved.filter((s) => s.name !== name) } };
}
