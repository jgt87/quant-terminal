// Drawing context menus (pure builders): the generic single-drawing menu, the multi-selection
// menu and the Template / Visual order / Visibility / Group submenus, in the order of
// docs/reference/drawing-menus.json. Tools add their own items through menuTop / menuSection
// (or replace the menu with contextMenu); the caller supplies state + actions.

import { matchingPreset, type Drawing, type DrawingGroup, type DrawingTemplate, type DrawingTemplates, type IntervalUnit, type VisibilityPreset } from "@qt/core";
import { getTool } from "../chart/drawings/registry";
import type { DrawingToolDef, GenericMenuOptions, ToolGeom } from "../chart/drawings/types";
import { isAction, SEP, type MenuItem } from "../components/menuTypes";

export type OrderWhere = "front" | "forward" | "backward" | "back";

export interface DrawingMenuActions {
  settings(id: string): void;
  /** Add alert on this drawing (only offered for tools with `alert`). */
  alert(id: string): void;
  objectTree(): void;
  clone(ids: string[]): void;
  copy(ids: string[]): void;
  order(ids: string[], where: OrderWhere): void;
  setLocked(ids: string[], locked: boolean): void;
  setHidden(ids: string[], hidden: boolean): void;
  remove(ids: string[]): void;
  visibility(ids: string[], preset: VisibilityPreset): void;
  groupNew(ids: string[]): void;
  groupAdd(ids: string[], groupId: string): void;
  groupRemove(ids: string[]): void;
  update(id: string, fn: (d: Drawing) => Drawing): void;
  template: {
    saveAs(d: Drawing): void;
    saveDefault(d: Drawing): void;
    applyDefault(d: Drawing): void;
    apply(d: Drawing, t: DrawingTemplate): void;
    reset(d: Drawing): void;
  };
}

export interface DrawingMenuState {
  /** Groups of the current symbol. */
  groups: DrawingGroup[];
  templates: DrawingTemplates;
  /** Current chart interval as group + multiplier (visibility presets). */
  unit: IntervalUnit;
  /** All drawings of the chart (to read the selection's state). */
  drawings: Drawing[];
  /** Chart projection (tool menu items that pin drawings to the screen). */
  geom?: ToolGeom;
}

const ORDER: { where: OrderWhere; label: string }[] = [
  { where: "front", label: "Bring to front" },
  { where: "back", label: "Send to back" },
  { where: "forward", label: "Bring forward" },
  { where: "backward", label: "Send backward" },
];

const PRESETS: { id: VisibilityPreset; label: string }[] = [
  { id: "above", label: "Current interval and above" },
  { id: "below", label: "Current interval and below" },
  { id: "only", label: "Current interval only" },
  { id: "all", label: "All intervals" },
];

/** Name used in "Add alert on {name}…". */
export function menuName(def: Pick<DrawingToolDef, "label" | "menuName">): string {
  return def.menuName ?? def.label.charAt(0).toLowerCase() + def.label.slice(1);
}

export function orderMenu(ids: string[], a: DrawingMenuActions): MenuItem[] {
  return ORDER.map((o) => ({ id: `order-${o.where}`, label: o.label, onSelect: () => a.order(ids, o.where) }));
}

const savedItems = (d: Drawing, templates: DrawingTemplates, a: DrawingMenuActions): MenuItem[] => {
  const saved = templates[d.type]?.saved ?? [];
  return saved.length ? [SEP, ...saved.map((s) => ({ label: s.name, checked: d.templateName === s.name, onSelect: () => a.template.apply(d, s) }))] : [];
};

/** Template ▸ of the context menu: Save as…, Apply default, then the saved templates. */
export function templateMenu(d: Drawing, templates: DrawingTemplates, a: DrawingMenuActions): MenuItem[] {
  return [
    { id: "template-save-as", label: "Save as…", onSelect: () => a.template.saveAs(d) },
    { id: "template-apply-default", label: "Apply default", onSelect: () => a.template.applyDefault(d) },
    ...savedItems(d, templates, a),
  ];
}

/** Templates dropdown of the floating toolbar. */
export function floatTemplateMenu(d: Drawing, templates: DrawingTemplates, a: DrawingMenuActions): MenuItem[] {
  return [
    { id: "template-save-as", label: "Save Drawing Template As…", onSelect: () => a.template.saveAs(d) },
    { id: "template-apply-default", label: "Apply Default Drawing Template", onSelect: () => a.template.applyDefault(d) },
    ...savedItems(d, templates, a),
  ];
}

/** Template button of the settings window footer: also sets / resets the tool's default. */
export function dialogTemplateMenu(d: Drawing, templates: DrawingTemplates, a: DrawingMenuActions): MenuItem[] {
  return [
    { id: "template-save-as", label: "Save as…", onSelect: () => a.template.saveAs(d) },
    { id: "template-save-default", label: "Save as default", onSelect: () => a.template.saveDefault(d) },
    { id: "template-apply-default", label: "Apply default", onSelect: () => a.template.applyDefault(d) },
    ...savedItems(d, templates, a),
    SEP,
    { id: "template-reset", label: "Reset settings", onSelect: () => a.template.reset(d) },
  ];
}

export function visibilityMenu(ids: string[], s: DrawingMenuState, a: DrawingMenuActions): MenuItem[] {
  const first = s.drawings.find((d) => d.id === ids[0]);
  const cur = ids.length === 1 ? matchingPreset(first?.visibility, s.unit) : null;
  return PRESETS.map((p) => ({ id: `visibility-${p.id}`, label: p.label, checked: cur === p.id, onSelect: () => a.visibility(ids, p.id) }));
}

/** Group ▸ (object-tree groups); not part of the reference menus, available to tools and panels. */
export function groupMenu(ids: string[], s: DrawingMenuState, a: DrawingMenuActions): MenuItem[] {
  const sel = s.drawings.filter((d) => ids.includes(d.id));
  const inGroup = sel.some((d) => d.groupId);
  const one = sel.length && sel.every((d) => d.groupId === sel[0].groupId) ? sel[0].groupId : undefined;
  return [
    { id: "group-new", label: "Add to new group", onSelect: () => a.groupNew(ids) },
    ...s.groups.map((g) => ({ label: `Add to ${g.name}`, checked: one === g.id, disabled: one === g.id, onSelect: () => a.groupAdd(ids, g.id) })),
    ...(inGroup ? [SEP, { id: "group-remove", label: "Remove from group", onSelect: () => a.groupRemove(ids) }] : []),
  ];
}

/** Insert / omit items by id (used by tools that build on the generic menu). */
export function customizeMenu(items: MenuItem[], o: GenericMenuOptions = {}): MenuItem[] {
  let out = o.omit?.length ? items.filter((m) => !(isAction(m) && m.id && o.omit!.includes(m.id))) : [...items];
  for (const ins of o.insertAfter ?? []) {
    let i = out.findIndex((m) => isAction(m) && m.id === ins.id);
    if (i < 0) i = Math.max(0, out.findIndex((m) => isAction(m) && m.id === "remove") - 1);
    out = [...out.slice(0, i + 1), ...ins.items, ...out.slice(i + 1)];
  }
  return tidySeparators(out);
}

/** Drops leading, trailing and doubled separators. */
export function tidySeparators(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const m of items) {
    if (m.type === "separator" && (!out.length || out[out.length - 1].type === "separator")) continue;
    out.push(m);
  }
  while (out.length && out[out.length - 1].type === "separator") out.pop();
  return out;
}

/**
 * Generic menu of one drawing (reference order): Add alert on {tool}… · ─ · Template ▸ ·
 * Visual order ▸ · Visibility on intervals ▸ · Object tree · ─ · Clone · Copy · ─ ·
 * [tool section · ─] · Lock · Hide · Remove · ─ · Settings…  (tool top items + ─ first).
 */
export function genericDrawingMenu(d: Drawing, s: DrawingMenuState, a: DrawingMenuActions, o: GenericMenuOptions = {}): MenuItem[] {
  const def = getTool(d.type);
  const ids = [d.id];
  const ctx = { update: (fn: (x: Drawing) => Drawing) => a.update(d.id, fn), geom: s.geom };
  const top = def?.menuTop?.(d, ctx) ?? [];
  const section = def?.menuSection?.(d, ctx) ?? [];
  const items: MenuItem[] = [
    ...(top.length ? [...top, SEP] : []),
    ...(def?.alert ? [{ id: "alert", label: `Add alert on ${menuName(def)}…`, icon: "alertBell", shortcut: "Alt+A", onSelect: () => a.alert(d.id) }, SEP] : []),
    { id: "template", label: "Template", submenu: templateMenu(d, s.templates, a) },
    { id: "order", label: "Visual order", icon: "layers", submenu: orderMenu(ids, a) },
    { id: "visibility", label: "Visibility on intervals", submenu: visibilityMenu(ids, s, a) },
    { id: "objectTree", label: "Object tree", onSelect: a.objectTree },
    SEP,
    { id: "clone", label: "Clone", icon: "clone", shortcut: "Ctrl+Drag", onSelect: () => a.clone(ids) },
    { id: "copy", label: "Copy", shortcut: "Ctrl+C", onSelect: () => a.copy(ids) },
    SEP,
    ...(section.length ? [...section, SEP] : []),
    { id: "lock", label: "Lock", icon: "lock", checked: Boolean(d.locked), onSelect: () => a.setLocked(ids, !d.locked) },
    { id: "hide", label: "Hide", icon: "eyeOff", checked: Boolean(d.hidden), onSelect: () => a.setHidden(ids, !d.hidden) },
    { id: "remove", label: "Remove", icon: "trash", shortcut: "Del", onSelect: () => a.remove(ids) },
    SEP,
    { id: "settings", label: "Settings…", icon: "settings", onSelect: () => a.settings(d.id) },
  ];
  return customizeMenu(items, o);
}

/** Multi-selection menu (reference order): no alert and no template. */
export function multiDrawingMenu(ids: string[], s: DrawingMenuState, a: DrawingMenuActions): MenuItem[] {
  const sel = s.drawings.filter((d) => ids.includes(d.id));
  const allLocked = sel.length > 0 && sel.every((d) => d.locked);
  return [
    { id: "objectTree", label: "Object tree", onSelect: a.objectTree },
    { id: "order", label: "Visual order", icon: "layers", submenu: orderMenu(ids, a) },
    { id: "visibility", label: "Visibility on intervals", submenu: visibilityMenu(ids, s, a) },
    SEP,
    { id: "clone", label: "Clone", icon: "clone", shortcut: "Ctrl+Drag", onSelect: () => a.clone(ids) },
    { id: "copy", label: "Copy", shortcut: "Ctrl+C", onSelect: () => a.copy(ids) },
    SEP,
    { id: "lock", label: "Lock", icon: "lock", checked: allLocked, onSelect: () => a.setLocked(ids, !allLocked) },
    { id: "hide", label: "Hide", icon: "eyeOff", checked: false, onSelect: () => a.setHidden(ids, true) },
    { id: "remove", label: "Remove", icon: "trash", shortcut: "Del", onSelect: () => a.remove(ids) },
    SEP,
    { id: "settings", label: "Settings…", icon: "settings", onSelect: () => a.settings(ids[ids.length - 1]) },
  ];
}

/**
 * Menu for a right click on drawing `d` with the current selection `selected`: the multi menu
 * when several drawings are selected, else the tool's own menu (contextMenu) or the generic one.
 */
export function drawingMenuFor(d: Drawing, selected: string[], s: DrawingMenuState, a: DrawingMenuActions): MenuItem[] {
  if (selected.length > 1 && selected.includes(d.id)) return multiDrawingMenu(selected, s, a);
  const def = getTool(d.type);
  if (def?.contextMenu) {
    const ctx = { update: (fn: (x: Drawing) => Drawing) => a.update(d.id, fn), geom: s.geom };
    return def.contextMenu(d, { ...ctx, generic: (o?: GenericMenuOptions) => genericDrawingMenu(d, s, a, o) });
  }
  return genericDrawingMenu(d, s, a);
}

/** Menu labels with "---" separators (conformance: compare with the catalog's contextMenuSequence). */
export function menuSequence(items: MenuItem[]): string[] {
  return items.map((m) => (m.type === "separator" ? "---" : m.type === "header" ? `#${m.label}` : m.label));
}

/** "More" dropdown of the floating toolbar: Visual order ▸, Visibility on intervals ▸, Clone, Copy, Hide. */
export function floatMoreMenu(d: Drawing, s: DrawingMenuState, a: DrawingMenuActions): MenuItem[] {
  const ids = [d.id];
  return [
    { id: "order", label: "Visual order", icon: "layers", submenu: orderMenu(ids, a) },
    { id: "visibility", label: "Visibility on intervals", submenu: visibilityMenu(ids, s, a) },
    SEP,
    { id: "clone", label: "Clone", icon: "clone", shortcut: "Ctrl+Drag", onSelect: () => a.clone(ids) },
    { id: "copy", label: "Copy", shortcut: "Ctrl+C", onSelect: () => a.copy(ids) },
    { id: "hide", label: "Hide", icon: "eyeOff", onSelect: () => a.setHidden(ids, true) },
  ];
}
