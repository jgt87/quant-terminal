// Lines family (Info line, Trend angle, Crossline): catalog coverage, settings wiring (every
// visual field changes the rendering), menus, floating toolbar, hit-test, handles, round trip.

import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Anchor, Drawing } from "@qt/core";
import { CATALOG_LINESTYLE, catalogColor } from "../src/chart/drawings/builders";
import { floatBinding, floatButtons } from "../src/chart/drawings/floatbar";
import { getTool } from "../src/chart/drawings/registry";
import { fieldValue, setField } from "../src/chart/drawings/schema";
import { LINES } from "../src/chart/drawings/tools/lines";
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

describe("Lines family: registration", () => {
  it("registers info line, trend angle and crossline after the migrated tools", () => {
    const types = LINES.map((t) => t.type);
    for (const t of ["infoline", "trendangle", "crossline"]) expect(types).toContain(t);
    expect(getTool("crossline")!.hotkey).toBe("Alt+C");
    expect(getTool("crossline")!.hotkeyAction).toBe("draw-at-cursor");
  });
});

describe("Lines family: catalog conformance", () => {
  const two = [A(100, 450), A(400, 150)];
  const report: string[] = [];
  it.each([
    ["infoline", two],
    ["trendangle", two],
    ["crossline", [A(200, 300)]],
  ] as [string, Anchor[]][])("%s matches the catalog and every field is wired", (type, anchors) => {
    const r = conformance(getTool(type)!, anchors);
    expect(r.wired).toBe(r.total);
    report.push(`${type}: ${r.wired}/${r.total}`);
  });
  afterAll(() => console.log(`fields wired: ${report.join(", ")}`));
});

describe("Lines family: interaction", () => {
  const g = geom;
  it("info line hits its segment and misses 20 px away; extends reach further", () => {
    const def = getTool("infoline")!;
    const d = make(def, [A(100, 400), A(300, 200)]);
    expect(def.hitTest(d, g, 200, 300, 6)).toBe(true);
    expect(def.hitTest(d, g, 214, 314, 6)).toBe(false);
    expect(def.hitTest(d, g, 400, 100, 6)).toBe(false);
    expect(def.hitTest(setField(d, "props.extendRight", true), g, 400, 100, 6)).toBe(true);
    expect(def.handles(d, g)).toEqual([
      { x: 100, y: 400 },
      { x: 300, y: 200 },
    ]);
  });
  it("info line stats: price, percent, pips, bars, span, distance, angle", () => {
    const def = getTool("infoline")!;
    const d = make(def, [
      { time: 0, price: 100 },
      { time: 3600, price: 110 },
    ]);
    const s = def.stats!(d, g);
    expect(s[0]).toContain("10.00");
    expect(s[0]).toContain("10.00%");
    expect(s[0]).toContain("100 pips");
    expect(s[1]).toBe("60 bars, 1h");
    expect(s[2]).toMatch(/^61 px, 9\.5°$/);
  });
  it("info line stats are drawn even when not selected (always show stats), and only then", () => {
    const def = getTool("infoline")!;
    const d = make(def, [A(100, 400), A(300, 200)]);
    const off = setField(d, "props.alwaysShowStats", false);
    expect(render(def, d).some((l) => l.startsWith("fillText"))).toBe(true);
    expect(render(def, off).some((l) => l.startsWith("fillText"))).toBe(false);
    expect(render(def, off, true).some((l) => l.startsWith("fillText"))).toBe(true);
  });
  it("trend angle reads the on-screen angle (scale aware)", () => {
    const def = getTool("trendangle")!;
    const d = make(def, [A(100, 400), A(200, 300)]);
    expect(def.stats!(d, g)[0]).toBe("45.0°");
    expect(render(def, d).some((l) => l.includes("45.0°"))).toBe(true);
    // A steeper price scale changes the angle of the same anchors.
    const steep = { ...g, toPx: (a: Anchor) => ({ x: a.time / 60, y: 1000 - 2 * a.price }) };
    expect(def.stats!(d, steep)[0]).toBe("63.4°");
    expect(def.hitTest(d, g, 150, 350, 5)).toBe(true);
    expect(def.hitTest(d, g, 150, 370, 5)).toBe(false);
  });
  it("crossline hits both lines through its anchor", () => {
    const def = getTool("crossline")!;
    const d = make(def, [A(200, 300)]);
    expect(def.hitTest(d, g, 700, 302, 5)).toBe(true);
    expect(def.hitTest(d, g, 198, 20, 5)).toBe(true);
    expect(def.hitTest(d, g, 220, 320, 5)).toBe(false);
    expect(def.bounds!(d, g)).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
  it("floating toolbar value buttons edit the shared style keys", () => {
    const def = getTool("infoline")!;
    const d = make(def, [A(100, 400), A(300, 200)]);
    const color = floatBinding(def, "line-tool-color", THEME)!;
    expect(color.get(d, THEME)).toBe("#2962ff");
    expect(color.set(d, "#ff0000").style!.color).toBe("#ff0000");
    expect(floatBinding(def, "text-color", THEME)!.set(d, "#00ff00").style!.textColor).toBe("#00ff00");
    expect(floatBinding(def, "line-tool-width", THEME)!.set(d, 3).style!.width).toBe(3);
  });
});
