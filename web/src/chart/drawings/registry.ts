// Drawing-tool registry: every tool module listed in tools/<family>/index.ts, looked up by type.
// The toolbar, controller, renderer, settings window, menus and object tree read only this.

import familiesJson from "./families.json";
import groupsJson from "./toolbarGroups.json";
import { TOOLS } from "./tools";
import type { DrawingToolDef, FamilyId } from "./types";

export interface FamilyDef {
  id: FamilyId;
  label: string;
  icon: string;
}

/** Toolbar families in display order (the "measure" family is reached from the bottom controls). */
export const FAMILIES = familiesJson as FamilyDef[];

const byType = new Map<string, DrawingToolDef>();

/** Registers a tool (duplicate types are a programming error). */
export function registerTool(def: DrawingToolDef): void {
  if (byType.has(def.type)) throw new Error(`Duplicate drawing tool type: ${def.type}`);
  byType.set(def.type, def);
}

/** Removes a tool (tests only). */
export function unregisterTool(type: string): void {
  byType.delete(type);
}

for (const def of TOOLS) registerTool(def);

/** Tool of a drawing type, undefined for unknown types (such drawings are kept but not drawn). */
export function getTool(type: string): DrawingToolDef | undefined {
  return byType.get(type);
}

/** Every registered tool, in registration order. */
export function allTools(): DrawingToolDef[] {
  return [...byType.values()];
}

export function toolsOfFamily(family: FamilyId): DrawingToolDef[] {
  return allTools().filter((t) => t.family === family);
}

/** Families that have at least one tool (empty families are not shown). */
export function familiesWithTools(): (FamilyDef & { tools: DrawingToolDef[] })[] {
  return FAMILIES.map((f) => ({ ...f, tools: toolsOfFamily(f.id) })).filter((f) => f.tools.length > 0);
}

export interface ToolbarGroup {
  id: string;
  label: string;
  /** Flyout sections in reference order; only registered tools appear. */
  sections: { title: string; tools: DrawingToolDef[] }[];
  tools: DrawingToolDef[];
}

/** Reference structure of the left toolbar (toolbarGroups.json, from docs/reference/drawing-menus.json). */
export interface ToolbarGroupSpec {
  id: string;
  label: string;
  families: FamilyId[];
  sections: { title: string; items: string[] }[];
}

export const TOOLBAR_GROUPS = groupsJson as ToolbarGroupSpec[];

/**
 * Left-toolbar groups: every reference section and item in reference order, mapped to registered
 * tools by `catalogType` (items whose tool is not registered stay hidden). Registered tools that
 * no item names are appended to a section titled by their `section` or family label, inside the
 * group that lists their family. Empty sections and groups are left out.
 */
export function toolbarGroups(): ToolbarGroup[] {
  const tools = allTools().filter((t) => t.toolbar !== false);
  const byCatalog = new Map(tools.filter((t) => t.catalogType).map((t) => [t.catalogType!, t]));
  const placed = new Set<string>();
  const groups = TOOLBAR_GROUPS.map((g) => {
    const sections = g.sections.map((s) => {
      const list = s.items.map((it) => byCatalog.get(it)).filter((t): t is DrawingToolDef => Boolean(t));
      list.forEach((t) => placed.add(t.type));
      return { title: s.title, tools: list };
    });
    return { spec: g, sections };
  });
  for (const t of tools) {
    if (placed.has(t.type) || t.family === "measure") continue;
    const g = groups.find((x) => x.spec.families.includes(t.family));
    if (!g) continue;
    const title = t.section ?? FAMILIES.find((f) => f.id === t.family)?.label ?? t.family;
    let sec = g.sections.find((s) => s.title === title);
    if (!sec) g.sections.push((sec = { title, tools: [] }));
    sec.tools.push(t);
  }
  return groups
    .map(({ spec, sections }) => {
      const nonEmpty = sections.filter((s) => s.tools.length);
      return { id: spec.id, label: spec.label, sections: nonEmpty, tools: nonEmpty.flatMap((s) => s.tools) };
    })
    .filter((g) => g.tools.length > 0);
}

/** Display label of a drawing type (the type itself when unknown). */
export function toolLabel(type: string): string {
  return getTool(type)?.label ?? type;
}

/** Normalized key combo of a hotkey string ("Alt + Shift + R" → "alt+shift+r"). */
export function comboOf(hotkey: string): string {
  const parts = hotkey.split("+").map((p) => p.trim().toLowerCase()).filter(Boolean);
  const key = parts.pop() ?? "";
  const mods = ["ctrl", "alt", "shift"].filter((m) => parts.includes(m));
  return [...mods, key].join("+");
}

/** Combo of a keyboard event (letters by physical key). */
export function comboOfEvent(e: { code: string; key: string; ctrlKey: boolean; metaKey?: boolean; altKey: boolean; shiftKey: boolean }): string {
  const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : /^Digit\d$/.test(e.code) ? e.code.slice(5) : e.key.toLowerCase();
  return [e.ctrlKey || e.metaKey ? "ctrl" : "", e.altKey ? "alt" : "", e.shiftKey ? "shift" : "", key].filter(Boolean).join("+");
}

/** Tool hotkeys: combo → tool type and what the key does (pick the tool or draw at the cursor). */
export function hotkeyMap(): Record<string, { type: string; action: "select" | "draw-at-cursor" }> {
  const out: Record<string, { type: string; action: "select" | "draw-at-cursor" }> = {};
  for (const t of allTools()) if (t.hotkey) out[comboOf(t.hotkey)] = { type: t.type, action: t.hotkeyAction ?? "select" };
  return out;
}

/** Anchors a click-per-anchor tool needs (freehand/poly tools return null). */
export function anchorCount(type: string): number | null {
  const n = getTool(type)?.anchors;
  return typeof n === "number" ? n : null;
}

/** Union of the registered type names (open string: unknown types still load). */
export type ToolType = (typeof TOOLS)[number]["type"];
