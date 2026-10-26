// Pitchforks family (Pitchfork, Schiff, Modified Schiff, Inside): catalog coverage incl. the nine
// level rows, settings wiring, the variant radio group, floating toolbar, hit-test, handles.

import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Anchor, Drawing } from "@qt/core";
import { CATALOG_LINESTYLE, catalogColor } from "../src/chart/drawings/builders";
import { floatBinding, floatButtons } from "../src/chart/drawings/floatbar";
import { getTool } from "../src/chart/drawings/registry";
import { fieldValue, setField } from "../src/chart/drawings/schema";
import { PITCHFORKS } from "../src/chart/drawings/tools/pitchforks";
import type { DrawCtx, DrawingToolDef, LevelRow, SettingsField, ValueField } from "../src/chart/drawings/types";
import { PITCHFORK_VARIANTS, pitchforkDefaultLevels, switchVariant } from "../src/chart/drawings/tools/pitchforks/pitchforkTool";
import { dashFor, THEME } from "../src/chart/theme";
import { settingsTabs } from "../src/components/drawing/settingsTabs";
import { genericDrawingMenu, menuSequence, type DrawingMenuActions, type DrawingMenuState } from "../src/state/drawingMenu";

type CatField = { key: string; type: string; default: unknown; choices?: { value: unknown }[] };
const catalog = JSON.parse(readFileSync(fileURLToPath(new URL("../../docs/reference/drawing-tools-catalog.json", import.meta.url)), "utf8")) as {
  type: string;
  label: string;
  anchors: number;
  floatingToolbar: string[];
  contextMenuSequence: string[];
  settingsTabs: { tab: string; fields: CatField[] }[];
}[];

// ---------- probe (projection, recording canvas, factory drawings) ----------

const toPx = (a: Anchor) => ({ x: a.time / 60, y: 1000 - a.price });
const toData = (p: { x: number; y: number }): Anchor => ({ time: Math.round(p.x) * 60, price: 1000 - p.y });
const A = (x: number, y: number): Anchor => toData({ x, y });
const geom = { toPx, toData, viewport: { width: 800, height: 600 }, bars: [], intervalSec: 60 };

function render(def: DrawingToolDef, d: Drawing, selected = false): string[] {
  const log: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, k: string) {
      if (k === "measureText") return (s: string) => ({ width: s.length * 6 });
      if (k in target) return target[k];
      return (...args: unknown[]) => log.push(`${k}(${args.map((a) => (typeof a === "number" ? a.toFixed(1) : JSON.stringify(a))).join(",")})`);
    },
    set(_t, k: string, v) {
      target[k] = v;
      log.push(`${k}=${String(v)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const c = {
    ctx,
    theme: THEME,
    dpr: 1,
    width: 800,
    height: 600,
    ...geom,
    color: d.style?.color ?? THEME.drawing,
    selected,
    hovered: false,
    formatPrice: (p: number) => p.toFixed(2),
    priceDecimals: 2,
  } as unknown as DrawCtx;
  // Stroke preset of the generic renderer (render.ts drawDrawing).
  ctx.globalAlpha = d.style?.opacity ?? 1;
  ctx.strokeStyle = c.color;
  ctx.fillStyle = c.color;
  ctx.lineWidth = d.style?.width ?? 1;
  ctx.setLineDash(dashFor(d.style?.lineStyle, d.style?.width ?? 1));
  def.render(c, d);
  return log;
}

const make = (def: DrawingToolDef, anchors: Anchor[]): Drawing =>
  JSON.parse(JSON.stringify({ id: def.type, type: def.type, anchors, style: def.defaults, props: def.defaultProps ?? {} }));

const valueFields = (fs: SettingsField[] | undefined): ValueField[] => (fs ?? []).filter((f): f is ValueField => f.kind !== "section");

/** A different value for a field (wiring test). */
function changed(f: ValueField, v: unknown): unknown {
  if (f.testValue !== undefined) return f.testValue;
  switch (f.kind) {
    case "color":
      return v === "#ff00ff" ? "#00ffff" : "#ff00ff";
    case "width":
      return v === 4 ? 1 : 4;
    case "lineStyle":
      return v === "dotted" ? "dashed" : "dotted";
    case "checkbox":
      return !v;
    case "select":
      return f.options.find((o) => o.value !== v)!.value;
    case "number":
      return Number(v) + 10 > (f.max ?? Infinity) ? Number(v) - 10 : Number(v) + 10;
    case "fontSize":
      return v === 20 ? 24 : 20;
    case "text":
      return "Changed text";
    case "levels": {
      // Toggle the first row (a hidden level becomes visible, or the other way round).
      const rows = ((v as unknown[] | undefined) ?? f.defaults(THEME)).map((r) => ({ ...(r as object) })) as { visible?: boolean }[];
      rows[0].visible = rows[0].visible === false;
      return rows;
    }
    default:
      throw new Error(`no test value for ${f.kind}`);
  }
}

/** Normalizes a catalog default to our stored form. */
function catalogDefault(f: CatField): unknown {
  if (f.type === "linestyle") return CATALOG_LINESTYLE[f.default as number];
  if (f.type === "color" && typeof f.default === "string") return catalogColor(f.default);
  return f.default;
}

const actions = new Proxy({}, { get: (_t, k) => (k === "template" ? new Proxy({}, { get: () => () => undefined }) : () => undefined) }) as unknown as DrawingMenuActions;
const menuState: DrawingMenuState = { groups: [], templates: {}, unit: { group: "days", n: 1 } as DrawingMenuState["unit"], drawings: [] };

/** Coverage, factory defaults, wiring, menu, toolbar and tabs of one tool against the catalog. */
function conformance(def: DrawingToolDef, anchors: Anchor[]): { wired: number; total: number } {
  const cat = catalog.find((c) => c.type === def.catalogType)!;
  expect(cat, def.type).toBeDefined();
  expect(getTool(def.type)).toBe(def);
  expect(def.label).toBe(cat.label);
  expect(def.anchors).toBe(cat.anchors);
  expect(def.iconPath).toBeTruthy();
  expect(floatButtons(def)).toEqual(cat.floatingToolbar.map((b) => b.split(" ")[0]));
  expect(menuSequence(genericDrawingMenu(make(def, anchors), menuState, actions))).toEqual(cat.contextMenuSequence);
  const tabs: Record<string, ValueField[]> = { Style: valueFields(def.settings.style), Text: valueFields(def.settings.text), Inputs: valueFields(def.settings.inputs) };
  const d0 = make(def, anchors);
  for (const t of cat.settingsTabs) {
    if (t.tab === "Coordinates") {
      expect(def.settings.coordinates, def.type).toBe("time-price");
      continue;
    }
    if (t.tab === "Visibility") {
      expect(def.settings.visibility).not.toBe(false);
      continue;
    }
    for (const cf of t.fields) {
      const lv = /^([a-z]+)(\d+)\.(\w+)$/i.exec(cf.key);
      const table = lv && tabs[t.tab]?.find((x) => x.kind === "levels" && x.catalogLevels?.prefix === lv[1]);
      if (lv && table && table.kind === "levels") {
        // Level rows: <prefix><n>.<coeff|visible|color|linewidth|linestyle> → row n.
        const row = table.defaults(THEME)[Number(lv[2])] as unknown as Record<string, unknown>;
        const part = { coeff: "ratio", linewidth: "width", linestyle: "lineStyle" }[lv[3]] ?? lv[3];
        expect(row?.[part], `${def.type} ${cf.key}`).toEqual(catalogDefault(cf));
        continue;
      }
      const f = tabs[t.tab]?.find((x) => x.catalog === cf.key);
      expect(f, `${def.type} ${t.tab}/${cf.key}`).toBeDefined();
      const want = catalogDefault(cf);
      expect(f!.default, `${def.type} ${cf.key} fallback`).toEqual(want);
      expect(fieldValue(d0, f!, THEME), `${def.type} ${cf.key} factory`).toEqual(want);
      if (cf.choices && f!.kind === "select") expect(f!.options.map((o) => o.value)).toEqual(cf.choices.map((c) => c.value));
    }
  }
  expect(settingsTabs(def.type).map((t) => t.label)).toEqual(cat.settingsTabs.map((t) => t.tab));
  // Wiring: every visual field changes the rendering.
  let wired = 0;
  const all = Object.values(tabs).flat();
  for (const f of all) {
    if (f.visual === false) continue;
    const base = f.testWith ? f.testWith(d0) : d0;
    const v = fieldValue(base, f, THEME);
    const a = render(def, base).join("\n");
    const b = render(def, setField(base, f.key, changed(f, v))).join("\n");
    expect(a === b, `${def.type} field ${f.key} is not wired`).toBe(false);
    wired++;
  }
  // Coordinates move the geometry; JSON round trip keeps the drawing.
  const moved = { ...d0, anchors: d0.anchors.map((x, i) => (i === 0 ? { time: x.time + 600, price: x.price + 20 } : x)) };
  expect(render(def, moved).join()).not.toBe(render(def, d0).join());
  expect(JSON.parse(JSON.stringify(d0))).toEqual(d0);
  return { wired, total: all.length };
}

// ---------- tests ----------

const VARIANTS: [string, string, number][] = [
  ["pitchfork", "LineToolPitchfork", 0],
  ["schiffPitchfork", "LineToolSchiffPitchfork2", 3],
  ["modifiedSchiffPitchfork", "LineToolSchiffPitchfork", 1],
  ["insidePitchfork", "LineToolInsidePitchfork", 2],
];

// A left, B upper right, C lower right (pixels): M = (300, 300).
const ANCHORS = [A(100, 400), A(300, 200), A(300, 400)];

describe("Pitchforks family: registration", () => {
  it("registers the four variants with their catalog types and style values", () => {
    expect(PITCHFORKS.map((t) => [t.type, t.catalogType, t.defaultProps!.style])).toEqual(VARIANTS);
  });
});

describe("Pitchforks family: catalog conformance", () => {
  const report: string[] = [];
  it.each(VARIANTS.map((v) => v[0]))("%s matches the catalog (incl. nine level rows) and every field is wired", (type) => {
    const r = conformance(getTool(type)!, ANCHORS);
    expect(r.wired).toBe(r.total);
    report.push(`${type}: ${r.wired}/${r.total}`);
  });
  afterAll(() => console.log(`fields wired: ${report.join(", ")}`));

  it("every level column (visible, coefficient, color, width, style) changes the rendering", () => {
    const def = getTool("pitchfork")!;
    const d = make(def, ANCHORS);
    const rows = pitchforkDefaultLevels();
    const base = render(def, { ...d, style: { levels: rows } }).join("\n");
    const edits: ((r: LevelRow) => LevelRow)[] = [
      (r) => ({ ...r, visible: false }),
      (r) => ({ ...r, ratio: 0.8 }),
      (r) => ({ ...r, color: "#123456" }),
      (r) => ({ ...r, width: 4 }),
      (r) => ({ ...r, lineStyle: "dashed" }),
    ];
    for (const e of edits) {
      const next = rows.map((r, i) => (i === 2 ? e(r) : r));
      expect(render(def, { ...d, style: { levels: next } }).join("\n")).not.toBe(base);
    }
  });
});

describe("Pitchforks family: variant radio group", () => {
  const actionsLog: Drawing[] = [];
  const menuFor = (d: Drawing) => {
    const def = getTool(d.type)!;
    return def.menuSection!(d, { update: (fn) => actionsLog.push(fn(d)) });
  };
  it("menu: Original / Schiff / Modified Schiff / Inside between Copy and Lock, current variant checked", () => {
    for (const [type, , style] of VARIANTS) {
      const d = make(getTool(type)!, ANCHORS);
      const items = menuFor(d) as { label: string; checked?: boolean }[];
      expect(items.map((m) => m.label)).toEqual(["Original", "Schiff", "Modified Schiff", "Inside"]);
      const checked = items.filter((m) => m.checked).map((m) => m.label);
      expect(checked).toEqual([PITCHFORK_VARIANTS.find((v) => v.id === style)!.label]);
    }
  });
  it("selecting a variant switches the drawing in place (type and style), keeping everything else", () => {
    const d = { ...make(getTool("pitchfork")!, ANCHORS), id: "keep", style: { levels: pitchforkDefaultLevels().slice(0, 3) } };
    const items = menuFor(d) as { label: string; onSelect(): void }[];
    items.find((m) => m.label === "Inside")!.onSelect();
    const next = actionsLog.pop()!;
    expect(next.type).toBe("insidePitchfork");
    expect(next.props!.style).toBe(2);
    expect(next.id).toBe("keep");
    expect(next.anchors).toEqual(d.anchors);
    expect(next.style).toEqual(d.style);
    expect(switchVariant(next, 0).type).toBe("pitchfork");
    expect(switchVariant(next, 1).type).toBe("modifiedSchiffPitchfork");
    expect(switchVariant(next, 3).type).toBe("schiffPitchfork");
    // The rendering follows the variant.
    expect(render(getTool(next.type)!, next).join()).not.toBe(render(getTool("pitchfork")!, d).join());
  });
});

describe("Pitchforks family: interaction", () => {
  const g = geom;
  it("hits median, tines and base; misses 20 px off; fill is hit only with background on", () => {
    const def = getTool("pitchfork")!;
    const d = make(def, ANCHORS);
    expect(def.hitTest(d, g, 200, 350, 5)).toBe(true); // median from (100,400) to (300,300)
    expect(def.hitTest(d, g, 300, 300, 5)).toBe(true);
    expect(def.hitTest(d, g, 400, 350, 5)).toBe(true); // C-side tine: (300,400) → (500,300)
    expect(def.hitTest(d, g, 300, 260, 5)).toBe(true); // base B–C
    expect(def.hitTest(d, g, 200, 330, 5)).toBe(false); // 20 px above the median, outside the fork
    expect(def.hitTest(d, g, 420, 300, 5)).toBe(true); // inside the fill
    expect(def.hitTest(setField(d, "props.fillBackground", false), g, 420, 300, 5)).toBe(false);
    expect(def.handles(d, g)).toEqual([
      { x: 100, y: 400 },
      { x: 300, y: 200 },
      { x: 300, y: 400 },
    ]);
  });
  it("the Schiff variant moves the median origin", () => {
    const d = make(getTool("schiffPitchfork")!, ANCHORS);
    // Origin (100, 300): the median is horizontal at y = 300.
    expect(getTool("schiffPitchfork")!.hitTest(d, g, 150, 300, 3)).toBe(true);
    expect(getTool("pitchfork")!.hitTest({ ...d, type: "pitchfork", props: { ...d.props, style: 0 } }, g, 150, 300, 3)).toBe(false);
  });
  it("creation preview with two anchors draws the handle line only", () => {
    const def = getTool("pitchfork")!;
    const d = make(def, ANCHORS.slice(0, 2));
    expect(render(def, d).filter((l) => l.startsWith("lineTo"))).toHaveLength(1);
    expect(def.hitTest(d, g, 200, 300, 5)).toBe(false);
  });
  it("floating toolbar: color applies one color to every line, width to median and levels", () => {
    const def = getTool("pitchfork")!;
    const d = make(def, ANCHORS);
    const color = floatBinding(def, "line-tool-color", THEME)!;
    expect(color.get(d, THEME)).toBe("#f23645");
    const red = color.set(d, "#ff0000");
    expect(red.props!.linesColors).toBe("#ff0000");
    expect(color.get(red, THEME)).toBe("#ff0000");
    const strokes = render(def, red).filter((l) => l.startsWith("strokeStyle="));
    expect(new Set(strokes.slice(1))).toEqual(new Set(["strokeStyle=#ff0000"]));
    const width = floatBinding(def, "line-tool-width", THEME)!;
    const w = width.set(d, 3);
    expect(w.props!.median_linewidth).toBe(3);
    expect(w.style!.levels!.every((l) => l.width === 3)).toBe(true);
    expect(width.get(w, THEME)).toBe(3);
  });
});
