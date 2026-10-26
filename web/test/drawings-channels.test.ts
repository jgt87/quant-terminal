// Channels family (Regression trend, Flat top/bottom, Disjoint channel): catalog coverage, settings
// wiring (every visual field changes the rendering), menus, floating toolbar, hit-test, handles.

import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { regressionChannel, type Anchor, type Bar, type Drawing } from "@qt/core";
import { CATALOG_LINESTYLE, catalogColor } from "../src/chart/drawings/builders";
import { floatBinding, floatButtons } from "../src/chart/drawings/floatbar";
import { getTool } from "../src/chart/drawings/registry";
import { fieldValue, setField } from "../src/chart/drawings/schema";
import { CHANNELS } from "../src/chart/drawings/tools/channels";
import type { DrawCtx, DrawingToolDef, SettingsField, ValueField } from "../src/chart/drawings/types";
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
// Bars every 60 s (1 px): a falling wave so the regression has residuals; open differs from close.
const bars: Bar[] = Array.from({ length: 600 }, (_, i) => {
  const close = 600 - i * 0.4 - 40 * Math.sin(i / 9);
  const open = close + 6 * Math.cos(i / 3);
  return { time: i * 60, open, high: Math.max(open, close) + 4, low: Math.min(open, close) - 4, close, volume: 1 };
});
const geom = { toPx, toData, viewport: { width: 800, height: 600 }, bars, intervalSec: 60 };

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

describe("Channels family: registration", () => {
  it("registers regression trend, flat top/bottom and disjoint channel after the parallel channel", () => {
    expect(CHANNELS.map((t) => t.type)).toEqual(["channel", "regressionTrend", "flatBottom", "disjointChannel"]);
    expect(CHANNELS.slice(1).map((t) => t.catalogType)).toEqual(["LineToolRegressionTrend", "LineToolFlatBottom", "LineToolDisjointAngle"]);
  });
});

describe("Channels family: catalog conformance", () => {
  const three = [A(100, 450), A(400, 300), A(250, 500)];
  const report: string[] = [];
  it.each(["flatBottom", "disjointChannel"])("%s matches the catalog and every field is wired", (type) => {
    const r = conformance(getTool(type)!, three);
    expect(r.wired).toBe(r.total);
    report.push(`${type}: ${r.wired}/${r.total}`);
  });
  it("regression trend (catalog fields unknown): Inputs/Style tabs per spec, every field wired", () => {
    const def = getTool("regressionTrend")!;
    const cat = catalog.find((c) => c.type === "LineToolRegressionTrend")!;
    expect(cat.label).toBe(def.label);
    expect(def.anchors).toBe(2);
    expect(settingsTabs(def.type).map((t) => t.label)).toEqual(["Inputs", "Style", "Coordinates", "Visibility"]);
    expect(valueFields(def.settings.inputs).map((f) => f.key)).toEqual([
      "props.source",
      "props.upperDeviation",
      "props.lowerDeviation",
      "props.useUpperDeviation",
      "props.useLowerDeviation",
    ]);
    expect(valueFields(def.settings.style).map((f) => f.key)).toContain("props.showPearsons");
    const d0 = make(def, [A(100, 0), A(400, 0)]);
    const all = [...valueFields(def.settings.inputs), ...valueFields(def.settings.style)];
    let wired = 0;
    for (const f of all) {
      const v = fieldValue(d0, f, THEME);
      const same = render(def, d0).join("\n") === render(def, setField(d0, f.key, changed(f, v))).join("\n");
      expect(same, `regressionTrend field ${f.key} is not wired`).toBe(false);
      wired++;
    }
    const moved = { ...d0, anchors: [{ time: d0.anchors[0].time + 1200, price: 0 }, d0.anchors[1]] };
    expect(render(def, moved).join()).not.toBe(render(def, d0).join());
    expect(menuSequence(genericDrawingMenu(d0, menuState, actions))).toEqual([
      "Template",
      "Visual order",
      "Visibility on intervals",
      "Object tree",
      "---",
      "Clone",
      "Copy",
      "---",
      "Lock",
      "Hide",
      "Remove",
      "---",
      "Settings…",
    ]);
    report.push(`regressionTrend: ${wired}/${all.length}`);
  });
  afterAll(() => console.log(`fields wired: ${report.join(", ")}`));
});

describe("Channels family: interaction", () => {
  const g = geom;
  it("flat top/bottom: hits both lines and the fill, misses outside; four handles", () => {
    const def = getTool("flatBottom")!;
    const d = make(def, [A(100, 300), A(300, 200), A(180, 400)]);
    expect(def.hitTest(d, g, 200, 250, 5)).toBe(true); // trend line
    expect(def.hitTest(d, g, 250, 400, 5)).toBe(true); // flat line
    expect(def.hitTest(d, g, 200, 330, 5)).toBe(true); // inside the fill
    expect(def.hitTest(setField(d, "props.fillBackground", false), g, 200, 330, 5)).toBe(false);
    expect(def.hitTest(d, g, 500, 330, 5)).toBe(false);
    expect(def.handles(d, g)).toEqual([
      { x: 100, y: 300 },
      { x: 300, y: 200 },
      { x: 100, y: 400 },
      { x: 300, y: 400 },
    ]);
    // Dragging the flat line's right end changes its price and the shared end time.
    const moved = def.onAnchorDrag!(d, 3, A(320, 420), g, {});
    expect(def.handles(moved, g)).toEqual([
      { x: 100, y: 300 },
      { x: 320, y: 200 },
      { x: 100, y: 420 },
      { x: 320, y: 420 },
    ]);
  });
  it("disjoint channel: the second line mirrors the first; handle drags keep the mirror", () => {
    const def = getTool("disjointChannel")!;
    const d = make(def, [A(100, 300), A(300, 200), A(250, 400)]);
    const h = def.handles(d, g);
    expect(h[2]).toEqual({ x: 100, y: 400 });
    expect(h[3]).toEqual({ x: 300, y: 500 });
    expect(def.hitTest(d, g, 200, 450, 5)).toBe(true);
    expect(def.hitTest(d, g, 200, 250, 5)).toBe(true);
    expect(def.hitTest(d, g, 600, 100, 5)).toBe(false);
    const m = def.onAnchorDrag!(d, 3, A(320, 520), g, {});
    const h2 = def.handles(m, g);
    expect(h2[3]).toEqual({ x: 320, y: 520 });
    expect(h2[1].x).toBe(320);
    expect(h2[1].y - h2[0].y).toBeCloseTo(-(h2[3].y - h2[2].y));
    expect(def.hitTest(setField(d, "props.extendRight", true), g, 500, 100, 5)).toBe(true);
  });
  it("two-anchor preview draws only the first line", () => {
    const def = getTool("disjointChannel")!;
    const d = make(def, [A(100, 300), A(300, 200)]);
    expect(def.handles(d, g)).toHaveLength(2);
    expect(render(def, d).filter((l) => l.startsWith("lineTo"))).toHaveLength(1);
  });
  it("regression trend follows the bars between the anchor times; handles sit on the line", () => {
    const def = getTool("regressionTrend")!;
    const d = make(def, [A(100, 0), A(400, 0)]);
    const pts = def.handles(d, g);
    const r = regressionChannel(bars, 6000, 24000, "close", 2, -2)!;
    expect(pts[0]).toEqual(toPx({ time: 6000, price: r.base[0] }));
    expect(pts[1]).toEqual(toPx({ time: 24000, price: r.base[1] }));
    const mid = toPx({ time: 15000, price: (r.base[0] + r.base[1]) / 2 });
    expect(def.hitTest(d, g, mid.x, mid.y, 4)).toBe(true);
    expect(def.hitTest(d, g, 700, 10, 4)).toBe(false);
    expect(def.stats!(d, g)[0]).toBe(`Pearson's R ${r.pearsonR.toFixed(4)}`);
    expect(render(def, d).some((l) => l.includes(r.pearsonR.toFixed(4)))).toBe(true);
    // Reversed anchors give the same line; dragging a handle moves that anchor's time.
    const rev = { ...d, anchors: [d.anchors[1], d.anchors[0]] };
    expect(def.handles(rev, g)).toEqual([pts[1], pts[0]]);
    const dragged = def.onAnchorDrag!(d, 1, A(450, 0), g, {});
    expect(dragged.anchors[1].time).toBe(27000);
  });
  it("regression trend without bars in range draws the anchor line and does not hit", () => {
    const def = getTool("regressionTrend")!;
    const d = make(def, [
      { time: 1e9, price: 1 },
      { time: 1e9 + 60, price: 2 },
    ]);
    expect(def.hitTest(d, g, 10, 10, 5)).toBe(false);
    expect(render(def, d).filter((l) => l.startsWith("lineTo"))).toHaveLength(1);
  });
  it("floating toolbar: background button edits style.fillColor", () => {
    const def = getTool("flatBottom")!;
    const d = make(def, [A(100, 300), A(300, 200), A(180, 400)]);
    const bg = floatBinding(def, "background-color", THEME)!;
    expect(bg.get(d, THEME)).toBe("#ff980033");
    expect(bg.set(d, "#00000080").style!.fillColor).toBe("#00000080");
  });
});
