// Drawing-tool conformance harness (pure functions, used by web/test/drawings-conformance.test.ts):
// catalog coverage (registration, anchors, fields with tab/type/choices/factory default, coordinates
// and visibility tabs, context menu sequence, floating toolbar, hotkey), settings wiring (each
// visual field changes the recorded canvas output), interaction smoke (create, hit/miss, handle
// drags, menu, settings tabs, JSON round trip) and the left-toolbar mapping.

import fs from "node:fs";
import path from "node:path";
import type { Anchor, Bar, Drawing, FibLevel } from "@qt/core";
import { DrawingController, type DrawingHost } from "../../src/chart/drawings/DrawingController";
import { floatButtons } from "../../src/chart/drawings/floatbar";
import { allTools, comboOf, getTool, TOOLBAR_GROUPS, toolbarGroups } from "../../src/chart/drawings/registry";
import { drawDrawing } from "../../src/chart/drawings/render";
import { fieldSet, fieldValue, FONT_SIZES, getField, setField } from "../../src/chart/drawings/schema";
import type { DrawingToolDef, SettingsField, ValueField } from "../../src/chart/drawings/types";
import { drawingVisible } from "../../src/chart/drawings/visible";
import { chartTheme } from "../../src/chart/theme";
import { settingsTabs } from "../../src/components/drawing/settingsTabs";
import { drawingMenuFor, menuSequence, type DrawingMenuActions } from "../../src/state/drawingMenu";
import { recordingContext, type DrawCall } from "./recordingContext";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SchemaFields } from "../../src/components/drawing/SchemaFields";

const ROOT = path.resolve(__dirname, "../../..");

export interface CatalogField {
  key: string;
  label: string;
  type: string;
  default?: unknown;
  choices?: { value: unknown; label: string }[];
  sub?: string;
}
export interface CatalogTool {
  type: string;
  label: string;
  family: string;
  anchors: number | string;
  hotkey?: { keys: string; action: string };
  settingsTabs: { tab: string; fields: CatalogField[] }[] | string;
  contextMenuSequence?: string[] | string;
  floatingToolbar?: string[] | string;
  contextMenuExtras?: unknown;
}

export const CATALOG: CatalogTool[] = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/reference/drawing-tools-catalog.json"), "utf8"));
export const ALLOW: { tools: Record<string, string>; toolbarItems: Record<string, string> } = JSON.parse(fs.readFileSync(path.join(__dirname, "allowlist.json"), "utf8"));

/** Catalog family → our family ids (by type for the tools outside the drawing toolbar). */
const FAMILY: Record<string, string> = {
  Lines: "lines",
  Channels: "channels",
  Pitchforks: "pitchforks",
  Gann: "gann",
  Fibonacci: "fibonacci",
  "Chart patterns": "patterns",
  "Elliott waves": "elliott",
  Cycles: "cycles",
  Forecasting: "projection",
  "Volume-based": "projection",
  Measurers: "projection",
  Brushes: "brushes",
  Arrows: "arrows",
  Shapes: "shapes",
  "Text and notes": "text",
  Icons: "icons",
  Content: "text",
};
const BY_TYPE: Record<string, string> = {
  LineToolArrowMarkLeft: "arrows",
  LineToolArrowMarkRight: "arrows",
  LineToolBalloon: "text",
  LineToolNoteAbsolute: "text",
  LineToolTextAbsolute: "text",
  LineToolElliott: "elliott",
  LineToolOrder: "projection",
  LineToolPosition: "projection",
  LineToolVbPFixed: "projection",
};
export const familyOf = (t: CatalogTool): string => BY_TYPE[t.type] ?? FAMILY[t.family] ?? t.family;

export const theme = chartTheme("dark");
export const toolFor = (catalogType: string) => allTools().find((t) => t.catalogType === catalogType);

// ---------- geometry of the test chart: time = x, price = 1000 - y ----------

export const W = 800;
export const H = 600;
const toPx = (a: Anchor) => ({ x: a.time, y: 1000 - a.price });
const toData = (p: { x: number; y: number }): Anchor => ({ time: Math.round(p.x), price: 1000 - p.y });
export const BARS: Bar[] = Array.from({ length: W + 1 }, (_, i) => {
  const c = 650 + 120 * Math.sin(i / 40);
  return { time: i, open: c - 3, high: c + 8, low: c - 8, close: c, volume: 100 + (i % 7) * 10 };
});
const PTS = [
  { x: 200, y: 400 },
  { x: 420, y: 230 },
  { x: 300, y: 330 },
  { x: 520, y: 380 },
  { x: 600, y: 210 },
  { x: 660, y: 340 },
  { x: 720, y: 260 },
];
export const geom = { toPx, toData, viewport: { width: W, height: H }, bars: BARS, intervalSec: 1 };

/** A drawing of the tool with its factory defaults at sample anchors (text "Sample"). */
export function factoryDrawing(def: DrawingToolDef): Drawing {
  const d: Drawing = { id: `t-${def.type}`, type: def.type, anchors: [] };
  if (typeof def.anchors === "number") d.anchors = PTS.slice(0, def.anchors).map(toData);
  else d.points = PTS.slice(0, 5).map(toData);
  if (def.defaults && Object.keys(def.defaults).length) d.style = structuredClone(def.defaults);
  if (def.defaultProps && Object.keys(def.defaultProps).length) d.props = structuredClone(def.defaultProps);
  d.text = def.defaultText !== undefined ? "Sample" : "Sample";
  return d;
}

/** Recorded draw calls of one render (selected or not). */
export function renderLog(d: Drawing, selected = false): DrawCall[] {
  const { ctx, calls } = recordingContext();
  const ps = { toY: (p: number) => 1000 - p, fromY: (y: number) => 1000 - y, format: (p: number) => p.toFixed(2), formatDecimals: () => 2 };
  const ts = { timeToX: (t: number) => t, xToTime: (x: number) => x, indexToX: (i: number) => i, xToBar: (x: number) => Math.round(x), barSpacing: 6, timeToIndex: (t: number) => t, indexToTime: (i: number) => i };
  const rc = { ctx, ts, ps, width: W, height: H, from: 0, to: W, dpr: 1, theme } as unknown as Parameters<typeof drawDrawing>[0];
  drawDrawing(rc, d, {
    toPx,
    toData,
    bars: BARS,
    selected,
    hovered: false,
    intervalSec: 1,
    formatPrice: (p) => p.toFixed(2),
    priceDecimals: 2,
    profile: () => null,
  });
  return calls;
}

const logKey = (calls: DrawCall[]) => JSON.stringify(calls);
/** True when the field change shows in either the plain or the selected render. */
export const renders = (a: Drawing, b: Drawing) => logKey(renderLog(a)) !== logKey(renderLog(b)) || logKey(renderLog(a, true)) !== logKey(renderLog(b, true));

// ---------- value normalization ----------

/** "#2962FF" / "#2962ff33" / "rgba(41, 98, 255, 0.2)" → [r, g, b, a]. */
export function rgba(v: unknown): [number, number, number, number] | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), m[2] ? Math.round((parseInt(m[2], 16) / 255) * 100) / 100 : 1];
  m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i.exec(s);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : Math.round(Number(m[4]) * 100) / 100];
  return null;
}
const sameColor = (a: unknown, b: unknown) => {
  const x = rgba(a);
  const y = rgba(b);
  if (!x || !y) return a == b; // eslint-disable-line eqeqeq
  return x[0] === y[0] && x[1] === y[1] && x[2] === y[2] && Math.abs(x[3] - y[3]) <= 0.02;
};
const LINE_STYLE: Record<string, string> = { 0: "solid", 1: "dotted", 2: "dashed" };

/** Catalog type → our field kinds that implement it. */
const KINDS: Record<string, string[]> = {
  color: ["color", "opacity", "number"],
  width: ["width", "select", "number"],
  linestyle: ["lineStyle", "select"],
  bool: ["checkbox", "select"],
  select: ["select", "checkbox", "fontSize", "lineStyle", "width"],
  font: ["fontSize", "select"],
  text: ["text", "select"],
  number: ["number", "opacity", "select"],
  levels: ["levels"],
};

const TAB_ID: Record<string, string> = { Style: "style", Text: "text", Inputs: "inputs" };

function schemaTabs(def: DrawingToolDef): Record<string, SettingsField[]> {
  const s = def.settings;
  const out: Record<string, SettingsField[]> = { style: s.style, text: s.text ?? [], inputs: s.inputs ?? [] };
  for (const t of s.tabs ?? []) out[t.label] = t.fields;
  return out;
}

const valueFields = (fields: SettingsField[]) => fields.filter((f): f is ValueField => f.kind !== "section");

/** Factory value of a field: the tool's defaults, else the field fallback. */
export function factoryValue(def: DrawingToolDef, f: ValueField): unknown {
  const d = factoryDrawing(def);
  const v = f.get ? f.get(d) : getField(d, f.key);
  return v !== undefined ? v : fieldValue(d, f, theme);
}

/** Level-table catalog keys: "level3.coeff", "levels.0.color", "fanlines.2.width". */
const LEVEL_RE = /^([A-Za-z]+\.?)(\d+)\.(\w+)$/;

function levelPart(row: FibLevel | undefined, part: string): unknown {
  if (!row) return undefined;
  const p = part.toLowerCase();
  if (p === "coeff") return row.ratio;
  if (p === "visible") return row.visible !== false;
  if (p === "color") return row.color;
  if (p === "linewidth" || p === "width") return row.width ?? 1;
  if (p === "linestyle") return row.lineStyle ?? "solid";
  return undefined;
}

export interface Gap {
  tool: string;
  kind: string;
  detail: string;
}

export interface FieldReport {
  total: number;
  ok: number;
  exempt: string[];
}

/** Coverage of one catalog tool: returns gaps (empty = conformant). */
export function coverage(cat: CatalogTool, report: FieldReport): Gap[] {
  const gaps: Gap[] = [];
  const gap = (kind: string, detail: string) => gaps.push({ tool: cat.type, kind, detail });
  const def = toolFor(cat.type);
  if (!def) {
    gap("registration", `${cat.label} (${cat.type}) is not registered`);
    return gaps;
  }
  // Anchors / creation mode.
  if (typeof cat.anchors === "number" && def.anchors !== cat.anchors) gap("anchors", `catalog ${cat.anchors}, tool ${def.anchors}`);
  if (typeof cat.anchors === "string" && cat.anchors.startsWith("variable") && def.anchors !== "poly" && def.anchors !== "freehand") gap("anchors", `catalog variable, tool ${def.anchors}`);
  // Hotkey.
  if (cat.hotkey) {
    if (!def.hotkey || comboOf(def.hotkey) !== comboOf(cat.hotkey.keys)) gap("hotkey", `catalog ${cat.hotkey.keys}, tool ${def.hotkey ?? "none"}`);
    const action = cat.hotkey.action === "drawRightThere" ? "draw-at-cursor" : "select";
    if ((def.hotkeyAction ?? "select") !== action) gap("hotkey", `action should be ${action}`);
  }
  // Fields.
  if (!Array.isArray(cat.settingsTabs)) {
    report.exempt.push(`${cat.type}: settings unknown in the catalog`);
  } else {
    const tabs = schemaTabs(def);
    const dflt = factoryDrawing(def);
    for (const tab of cat.settingsTabs) {
      if (tab.tab === "Coordinates") {
        const subs = new Set(tab.fields.map((f) => f.sub));
        const want = subs.has("price") && subs.has("bar index") ? "time-price" : subs.has("price") ? "price" : subs.has("bar index") ? "time" : "time-price";
        const have = def.settings.coordinates === undefined ? "time-price" : def.settings.coordinates;
        report.total++;
        if (have !== want && !(want === "time-price" && have !== false)) gap("coordinates", `catalog ${want}, tool ${have}`);
        else report.ok++;
        continue;
      }
      if (tab.tab === "Visibility") {
        report.total++;
        if (def.settings.visibility === false) gap("visibility", "catalog has a Visibility tab");
        else report.ok++;
        continue;
      }
      const ours = valueFields(tabs[TAB_ID[tab.tab] ?? tab.tab] ?? []);
      // Level rows are numbered from 0 when a "<prefix>0.*" key exists, else from 1.
      const zeroBased = new Set(tab.fields.map((f) => LEVEL_RE.exec(f.key)).filter((m) => m && m[2] === "0").map((m) => m![1]));
      const elsewhere = valueFields(Object.values(tabs).flat());
      for (const cf of tab.fields) {
        report.total++;
        if (cf.type === "unknown") {
          report.exempt.push(`${cat.type}.${cf.key}: unknown in the catalog`);
          report.ok++;
          continue;
        }
        const lv = LEVEL_RE.exec(cf.key);
        if (lv) {
          const table = ours.find((f) => f.kind === "levels" && f.catalogLevels?.prefix === lv[1]) as Extract<ValueField, { kind: "levels" }> | undefined;
          if (!table) {
            gap("field", `${tab.tab}: no level table for ${lv[1]}N.* (${cf.key})`);
            continue;
          }
          const rows = (getField(dflt, table.key) as FibLevel[] | undefined) ?? table.defaults(theme);
          const idx = zeroBased.has(lv[1]) ? Number(lv[2]) : Number(lv[2]) - 1;
          const got = levelPart(rows[idx], lv[3]);
          const want = lv[3].toLowerCase() === "linestyle" ? LINE_STYLE[String(cf.default)] ?? cf.default : cf.default;
          const ok = lv[3] === "color" ? sameColor(got, want) : got === want;
          if (!ok) gap("default", `${cf.key}: catalog ${JSON.stringify(want)}, tool ${JSON.stringify(got)}`);
          else report.ok++;
          continue;
        }
        const f = ours.find((x) => x.catalog === cf.key) ?? elsewhere.find((x) => x.catalog === cf.key);
        if (!f) {
          gap("field", `${tab.tab}: missing ${cf.key} (${cf.label})`);
          continue;
        }
        const problems: string[] = [];
        if (!ours.includes(f)) problems.push(`in the wrong tab (catalog ${tab.tab})`);
        if (!(KINDS[cf.type] ?? [cf.type]).includes(f.kind)) problems.push(`kind ${f.kind} for catalog type ${cf.type}`);
        // Choices.
        if (Array.isArray(cf.choices) && f.kind === "select") {
          const ourLabels = f.options.map((o) => o.label.toLowerCase());
          const missing = cf.choices.filter((c) => !ourLabels.includes(c.label.toLowerCase()));
          if (missing.length) problems.push(`choices missing ${missing.map((m) => m.label).join(", ")}`);
        }
        if (Array.isArray(cf.choices) && f.kind === "fontSize") {
          const sizes = f.sizes ?? FONT_SIZES;
          const want = cf.choices.map((c) => Number(c.value));
          if (JSON.stringify(sizes) !== JSON.stringify(want)) problems.push(`font sizes ${JSON.stringify(sizes)} ≠ ${JSON.stringify(want)}`);
        }
        // Factory default ("per-drawing" values have none).
        const got = factoryValue(def, f);
        let ok: boolean;
        const separateTransparency = tab.fields.some((x) => x.key === "transparency");
        if (typeof cf.default === "string" && /^per-drawing/.test(cf.default)) ok = true;
        else if (cf.type === "color" && (cf.default === null || cf.default === undefined)) ok = got === undefined || got === null;
        else if (cf.type === "color" && separateTransparency && cf.key !== "transparency") {
          const a = rgba(got);
          const b = rgba(cf.default);
          ok = !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
        } else if (cf.key === "transparency" && cf.type === "color" && typeof cf.default === "number") {
          const c = rgba(got);
          ok = c !== null && Math.abs(c[3] - (1 - cf.default / 100)) <= 0.02;
        } else if (cf.type === "color") ok = cf.default === null || cf.default === undefined ? got === undefined || got === null : sameColor(got, cf.default);
        else if (cf.type === "linestyle") ok = got === (LINE_STYLE[String(cf.default)] ?? cf.default);
        else if (f.kind === "select" && Array.isArray(cf.choices)) {
          const wantLabel = cf.choices.find((c) => c.value === cf.default)?.label?.toLowerCase();
          const gotLabel = f.options.find((o) => o.value === got)?.label?.toLowerCase();
          ok = wantLabel !== undefined ? wantLabel === gotLabel : got === cf.default;
        } else if (cf.type === "text") ok = (got ?? "") === (cf.default ?? "") || cf.key.endsWith("(derived)");
        else ok = got === cf.default || (cf.default === null && got === undefined);
        if (!ok) problems.push(`factory default ${JSON.stringify(got)} ≠ catalog ${JSON.stringify(cf.default)}`);
        if (problems.length) gap("field", `${cf.key}: ${problems.join("; ")}`);
        else report.ok++;
      }
    }
  }
  // Context menu.
  if (Array.isArray(cat.contextMenuSequence)) {
    const d = factoryDrawing(def);
    const seq = menuSequence(drawingMenuFor(d, [d.id], { groups: [], templates: {}, unit: { group: "days", n: 1 }, drawings: [d] }, NOOP_ACTIONS));
    if (JSON.stringify(seq) !== JSON.stringify(cat.contextMenuSequence)) gap("menu", `catalog ${JSON.stringify(cat.contextMenuSequence)} | tool ${JSON.stringify(seq)}`);
  }
  // Floating toolbar.
  if (Array.isArray(cat.floatingToolbar)) {
    const want = cat.floatingToolbar.map((b) =>
      b
        .split(" ")[0]
        .replace(/^toggle-insert-cells-button-Chart\.SelectedObject\.InsertColumnTable$/, "insert-column")
        .replace(/^toggle-insert-cells-button-Chart\.SelectedObject\.InsertRowTable$/, "insert-row"),
    );
    // A second background button (two-color tools, e.g. Sector) is our "background-color-2".
    const firstBg = want.indexOf("background-color");
    want.forEach((b, i) => {
      if (b === "background-color" && i > firstBg) want[i] = "background-color-2";
    });
    const have = floatButtons(def);
    if (JSON.stringify([...new Set(want)].sort()) !== JSON.stringify([...have].sort())) gap("floating toolbar", `catalog ${want.join(",")} | tool ${have.join(",")}`);
  }
  return gaps;
}

const noop = () => undefined;
export const NOOP_ACTIONS: DrawingMenuActions = {
  settings: noop,
  alert: noop,
  objectTree: noop,
  clone: noop,
  copy: noop,
  order: noop,
  setLocked: noop,
  setHidden: noop,
  remove: noop,
  visibility: noop,
  groupNew: noop,
  groupAdd: noop,
  groupRemove: noop,
  update: noop,
  template: { saveAs: noop, saveDefault: noop, applyDefault: noop, apply: noop, reset: noop },
};

// ---------- wiring ----------

/** A different value of the field to try. */
function altValue(f: ValueField, cur: unknown): unknown[] {
  if (f.testValue !== undefined) return [f.testValue];
  switch (f.kind) {
    case "color":
      return [sameColor(cur, "#ff00ff") ? "#00ff00" : "#ff00ff"];
    case "opacity":
      return [Number(cur) === 0.5 ? 0.9 : 0.5];
    case "width":
      return [Number(cur) === 3 ? 1 : 3];
    case "lineStyle":
      return [cur === "dashed" ? "dotted" : "dashed"];
    case "checkbox":
      return [!cur];
    case "fontSize":
      return [Number(cur) === 24 ? 12 : 24];
    case "number": {
      const n = Number(cur ?? 0);
      const step = f.step ?? 1;
      const cand = [n + step * 10, n - step * 10, n + step, n - step, n * 2 || 5];
      return cand.filter((v) => (f.min === undefined || v >= f.min) && (f.max === undefined || v <= f.max));
    }
    case "select":
      return f.options.filter((o) => o.value !== cur).map((o) => o.value);
    case "text":
      return [`${cur ?? ""}Changed text`];
    case "levels":
      return [];
  }
}

/** Level-table mutations that each must change the output. */
function levelMutations(rows: FibLevel[]): { name: string; rows: FibLevel[] }[] {
  const vis = rows.findIndex((r) => r.visible !== false);
  if (vis < 0) return [{ name: "add a row", rows: [...rows, { ratio: 0.5, color: "#ff00ff", visible: true }] }];
  const mod = (patch: Partial<FibLevel>) => rows.map((r, i) => (i === vis ? { ...r, ...patch } : r));
  return [
    { name: "hide a level", rows: mod({ visible: false }) },
    { name: "change a level color", rows: mod({ color: "#ff00ff" }) },
    { name: "change a level value", rows: mod({ ratio: rows[vis].ratio + 0.123 }) },
    { name: "add a level", rows: [...rows, { ratio: (rows[vis].ratio ?? 0) + 0.777, color: "#ff00ff", visible: true, width: 2 }] },
    { name: "remove a level", rows: rows.filter((_, i) => i !== vis) },
  ];
}

export interface WiringResult {
  wired: number;
  total: number;
  nonVisual: string[];
  gaps: Gap[];
}

/** Every visual field must change the recorded output; coordinates move it; visibility hides it. */
export function wiring(def: DrawingToolDef): WiringResult {
  const res: WiringResult = { wired: 0, total: 0, nonVisual: [], gaps: [] };
  const gap = (detail: string) => res.gaps.push({ tool: def.type, kind: "wiring", detail });
  const base0 = factoryDrawing(def);
  const s = def.settings;
  const fields = valueFields([...s.style, ...(s.inputs ?? []), ...(s.text ?? []), ...(s.tabs ?? []).flatMap((t) => t.fields)]);
  for (const f of fields) {
    if (f.visual === false) {
      res.nonVisual.push(`${def.type}.${f.key}`);
      continue;
    }
    res.total++;
    const base = f.testWith ? f.testWith(base0) : base0;
    if (f.kind === "levels") {
      const rows = (getField(base, f.key) as FibLevel[] | undefined) ?? f.defaults(theme);
      const withRows = setField(base, f.key, rows);
      const failed = levelMutations(rows).filter((m) => !renders(withRows, setField(base, f.key, m.rows)));
      if (failed.length) gap(`tool ${def.type} field ${f.key} is not wired (${failed.map((m) => m.name).join(", ")})`);
      else res.wired++;
      continue;
    }
    const cur = fieldValue(base, f, theme);
    const withCur = fieldSet(base, f, cur);
    const ok = altValue(f, cur).some((v) => renders(withCur, fieldSet(base, f, v)));
    if (ok) res.wired++;
    else gap(`tool ${def.type} field ${f.key} is not wired`);
  }
  // Coordinates move the geometry.
  if (s.coordinates !== false) {
    res.total++;
    const moved = { ...base0, anchors: base0.anchors.map((a) => ({ time: a.time + 17, price: a.price - 23 })), points: base0.points?.map((a) => ({ time: a.time + 17, price: a.price - 23 })) };
    if (!moved.points) delete moved.points;
    if (renders(base0, moved)) res.wired++;
    else gap(`tool ${def.type}: coordinates do not move the drawing`);
  }
  // Visibility hides it on the chosen interval group.
  if (s.visibility !== false) {
    res.total++;
    const v = { ...base0, visibility: { minutes: false } };
    if (!drawingVisible(v, 900) && drawingVisible(v, 3600) && drawingVisible(base0, 900)) res.wired++;
    else gap(`tool ${def.type}: visibility on intervals does not hide the drawing`);
  }
  return res;
}

// ---------- interaction smoke ----------

function controller(): DrawingController {
  const host: DrawingHost = { toPx, toData, bars: () => BARS, viewport: () => ({ width: W, height: H }), tolerance: 6, intervalSec: () => 1 };
  return new DrawingController(host, { changed: noop, tool: noop, selection: noop, textRequest: noop, redraw: noop });
}

/** Create, hit/miss, handle drags, menu, settings, JSON round trip. Returns failure messages. */
export function smoke(def: DrawingToolDef): string[] {
  const out: string[] = [];
  const c = controller();
  c.setTool(def.type);
  if (def.anchors === "freehand") {
    c.pointerDown(PTS[0].x, PTS[0].y);
    for (let k = 1; k <= 40; k++) c.pointerMove(PTS[0].x + k * 8, PTS[0].y + Math.sin(k / 4) * 40);
    c.pointerUp(PTS[0].x + 320, PTS[0].y);
  } else if (def.anchors === "poly") {
    for (const p of PTS.slice(0, 4)) {
      c.pointerDown(p.x, p.y);
      c.pointerUp(p.x, p.y);
    }
    c.keyDown({ key: "Enter" });
  } else {
    for (const p of PTS.slice(0, def.anchors)) {
      c.pointerDown(p.x, p.y);
      c.pointerUp(p.x, p.y);
    }
  }
  const d = c.drawings[0];
  if (!d) return [`${def.type}: creation (${String(def.anchors)}) produced no drawing`];
  if (typeof def.anchors === "number" && d.anchors.length !== def.anchors) out.push(`${def.type}: created with ${d.anchors.length} anchors, expected ${def.anchors}`);
  if (typeof def.anchors !== "number" && !(d.points && d.points.length >= 2)) out.push(`${def.type}: ${def.anchors} creation produced no path points`);
  // Hit a stroke point, miss 20 px away.
  let hitAt: { x: number; y: number } | null = null;
  const handles = def.handles(d, geom);
  for (let y = 5; y < H && !hitAt; y += 3)
    for (let x = 5; x < W && !hitAt; x += 3) {
      if (handles.some((h) => Math.hypot(h.x - x, h.y - y) < 8)) continue;
      if (def.hitTest(d, geom, x, y, 4)) hitAt = { x, y };
    }
  if (!hitAt) out.push(`${def.type}: no body point hits`);
  else {
    const dirs = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => ({ x: hitAt!.x + 20 * Math.cos((deg * Math.PI) / 180), y: hitAt!.y + 20 * Math.sin((deg * Math.PI) / 180) }));
    if (dirs.every((p) => def.hitTest(d, geom, p.x, p.y, 4))) out.push(`${def.type}: every point 20 px around a hit also hits (no miss)`);
  }
  // Drag each handle.
  handles.forEach((h, i) => {
    const before = JSON.stringify(c.drawings[0]);
    c.selectIds([d.id]);
    c.pointerDown(h.x, h.y);
    c.pointerMove(h.x + 9, h.y + 6);
    c.pointerMove(h.x + 23, h.y + 17);
    c.pointerUp(h.x + 23, h.y + 17);
    if (JSON.stringify(c.drawings[0]) === before) out.push(`${def.type}: dragging handle ${i} changed nothing`);
    c.undo();
  });
  // Menu, settings tabs, JSON round trip.
  try {
    const items = drawingMenuFor(d, [d.id], { groups: [], templates: {}, unit: { group: "days", n: 1 }, drawings: [d] }, NOOP_ACTIONS);
    if (!items.length) out.push(`${def.type}: empty context menu`);
    if (!settingsTabs(def.type).length) out.push(`${def.type}: settings window has no tabs`);
  } catch (e) {
    out.push(`${def.type}: menu/settings threw ${(e as Error).message}`);
  }
  const f = { ...factoryDrawing(def), ...d };
  const copy = JSON.parse(JSON.stringify(f)) as Drawing;
  if (JSON.stringify(copy) !== JSON.stringify(f) || JSON.stringify(renderLog(copy)) !== JSON.stringify(renderLog(f))) out.push(`${def.type}: JSON round trip changes the drawing`);
  return out;
}

// ---------- left toolbar mapping ----------

/** Every reference toolbar item maps to a registered tool or an allow-listed exclusion; order kept. */
export function toolbarGaps(): Gap[] {
  const gaps: Gap[] = [];
  const groups = toolbarGroups();
  for (const g of TOOLBAR_GROUPS) {
    for (const s of g.sections) {
      for (const item of s.items) {
        const t = toolFor(item);
        if (!t && !ALLOW.toolbarItems[item] && !ALLOW.tools[item]) gaps.push({ tool: item, kind: "toolbar", detail: `${g.label} / ${s.title}: ${item} has no registered tool` });
      }
      const want = s.items.map(toolFor).filter(Boolean).map((t) => t!.type);
      const have = groups.find((x) => x.id === g.id)?.sections.find((x) => x.title === s.title)?.tools.map((t) => t.type).filter((ty) => want.includes(ty)) ?? [];
      if (JSON.stringify(want) !== JSON.stringify(have)) gaps.push({ tool: g.id, kind: "toolbar", detail: `${s.title}: order ${have.join(",")} ≠ reference ${want.join(",")}` });
    }
  }
  // The flyouts list exactly the reference items: no extra tools, no extra sections.
  for (const g of groups) {
    const spec = TOOLBAR_GROUPS.find((x) => x.id === g.id);
    for (const s of g.sections) {
      const ref = spec?.sections.find((x) => x.title === s.title);
      for (const t of s.tools) {
        if (!ref || !t.catalogType || !ref.items.includes(t.catalogType)) gaps.push({ tool: t.type, kind: "toolbar", detail: `${g.label} / ${s.title}: ${t.type} is not a reference toolbar item (set toolbar: false)` });
      }
    }
  }
  return gaps;
}

export { getTool };

// ---------- settings window reachability ----------

/**
 * Every value field renders a control in its tab (data-field) in a state where it is shown, and
 * writing a new value through the field (what the control does) changes the stored value.
 */
/** Number of value fields the settings window shows for a tool (every tab), for the reachability count. */
export function reachFieldCount(def: DrawingToolDef): number {
  const s = def.settings;
  return [s.style, s.inputs ?? [], s.text ?? [], ...(s.tabs ?? []).map((t) => t.fields)].reduce((n, fields) => n + valueFields(fields).length, 0);
}

export function uiReach(def: DrawingToolDef): Gap[] {
  const gaps: Gap[] = [];
  const s = def.settings;
  const tabs: [string, SettingsField[]][] = [["style", s.style], ["inputs", s.inputs ?? []], ["text", s.text ?? []], ...(s.tabs ?? []).map((t): [string, SettingsField[]] => [t.label, t.fields])];
  const base0 = factoryDrawing(def);
  for (const [tab, fields] of tabs) {
    for (const f of valueFields(fields)) {
      const base = f.testWith ? f.testWith(base0) : base0;
      if (f.showIf && !f.showIf(base)) {
        gaps.push({ tool: def.type, kind: "settings", detail: `${tab}: ${f.key} is never shown (showIf false; give it testWith)` });
        continue;
      }
      const html = renderToStaticMarkup(createElement(SchemaFields, { fields, drawing: base, theme, onChange: () => undefined }));
      if (!html.includes(`data-field="${f.key}"`)) {
        gaps.push({ tool: def.type, kind: "settings", detail: `${tab}: ${f.key} has no control in the settings window` });
        continue;
      }
      const cur = fieldValue(base, f, theme);
      if (f.kind === "levels") {
        const rows = (cur as FibLevel[] | undefined) ?? f.defaults(theme);
        const next = levelMutations(rows)[0]?.rows ?? rows;
        if (JSON.stringify(fieldValue(fieldSet(base, f, next), f, theme)) !== JSON.stringify(next)) gaps.push({ tool: def.type, kind: "settings", detail: `${tab}: editing ${f.key} does not store the rows` });
        continue;
      }
      const alt = altValue(f, cur);
      if (!alt.length) continue;
      const stored = fieldValue(fieldSet(base, f, alt[0]), f, theme);
      if (JSON.stringify(stored) !== JSON.stringify(alt[0])) gaps.push({ tool: def.type, kind: "settings", detail: `${tab}: setting ${f.key} to ${JSON.stringify(alt[0])} stores ${JSON.stringify(stored)}` });
    }
  }
  return gaps;
}
