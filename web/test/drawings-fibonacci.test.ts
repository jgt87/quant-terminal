// Fibonacci family: catalog coverage (anchors, fields, factory defaults, level tables, floating
// toolbar, menu), settings wiring (every visual field changes what render draws), hit / miss and
// the time-based / round geometry as drawn.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Anchor, Drawing, FibLevel } from "@qt/core";
import { fibonacciOffsets } from "@qt/core";
import { CATALOG_LINESTYLE, catalogColor } from "../src/chart/drawings/builders";
import { floatBinding, floatButtons } from "../src/chart/drawings/floatbar";
import { getTool } from "../src/chart/drawings/registry";
import { fieldValue, setField } from "../src/chart/drawings/schema";
import type { DrawCtx, DrawingToolDef, SettingsField, ValueField } from "../src/chart/drawings/types";
import { THEME } from "../src/chart/theme";
import { settingsTabs } from "../src/components/drawing/settingsTabs";
import { genericDrawingMenu, menuSequence, type DrawingMenuActions, type DrawingMenuState } from "../src/state/drawingMenu";

interface CatField {
  key: string;
  type: string;
  default: unknown;
  levelRow?: string;
  choices?: { value: unknown; label: string }[];
}
interface CatTool {
  type: string;
  label: string;
  family: string;
  anchors: number;
  hiddenTabs?: string[];
  floatingToolbar: string[];
  contextMenuSequence: string[];
  settingsTabs: { tab: string; fields: CatField[] }[];
  factoryDefaults: Record<string, unknown>;
}

const CATALOG = JSON.parse(readFileSync(new URL("../../docs/reference/drawing-tools-catalog.json", import.meta.url), "utf8")) as CatTool[];
const FAMILY = CATALOG.filter((t) => t.family === "Fibonacci" && t.type !== "LineToolFibRetracement");

const TYPES: Record<string, string> = {
  LineToolTrendBasedFibExtension: "fibExtension",
  LineToolFibChannel: "fibChannel",
  LineToolFibTimeZone: "fibTimeZone",
  LineToolFibSpeedResistanceFan: "fibSpeedFan",
  LineToolTrendBasedFibTime: "fibTrendTime",
  LineToolFibCircles: "fibCircles",
  LineToolFibSpiral: "fibSpiral",
  LineToolFibSpeedResistanceArcs: "fibSpeedArcs",
  LineToolFibWedge: "fibWedge",
  LineToolPitchfan: "pitchfan",
};

// Projection: time = x, price = 1000 - y.
const toPx = (a: Anchor) => ({ x: a.time, y: 1000 - a.price });
const toData = (p: { x: number; y: number }): Anchor => ({ time: Math.round(p.x), price: 1000 - p.y });
const W = 800;
const H = 600;
const geom = { toPx, toData, viewport: { width: W, height: H }, bars: [], intervalSec: 60 };
const ANCHORS: Anchor[] = [toData({ x: 200, y: 400 }), toData({ x: 350, y: 250 }), toData({ x: 450, y: 330 })];

/** Canvas 2D stand-in that records every call and style assignment (rounded numbers). */
function recorder() {
  const log: string[] = [];
  const strokes: { x: number; y: number }[][] = [];
  let path: { x: number; y: number }[][] = [];
  const r = (v: unknown): string | number => (typeof v === "number" ? Math.round(v * 100) / 100 : typeof v === "string" ? v : Array.isArray(v) ? `[${v.map(r).join(",")}]` : typeof v);
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(_t, k: string) {
      if (k in state) return state[k];
      return (...args: unknown[]) => {
        log.push(`${k}(${args.map(r).join(",")})`);
        if (k === "beginPath") path = [];
        if (k === "moveTo") path.push([{ x: args[0] as number, y: args[1] as number }]);
        if (k === "lineTo") path[path.length - 1]?.push({ x: args[0] as number, y: args[1] as number });
        if (k === "stroke") strokes.push(...path.map((p) => [...p]));
        if (k === "measureText") return { width: String(args[0]).length * 6 };
        return undefined;
      };
    },
    set(_t, k: string, v) {
      state[k] = v;
      log.push(`${k}=${r(v)}`);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log, strokes };
}

function drawCtx(ctx: CanvasRenderingContext2D, d: Drawing): DrawCtx {
  return {
    ctx,
    theme: THEME,
    width: W,
    height: H,
    dpr: 1,
    from: 0,
    to: 0,
    ts: undefined as never,
    ps: undefined as never,
    ...geom,
    color: d.style?.color ?? THEME.drawing,
    selected: false,
    hovered: false,
    formatPrice: (p: number) => p.toFixed(2),
    priceDecimals: 2,
  };
}

function render(def: DrawingToolDef, d: Drawing) {
  const rec = recorder();
  def.render(drawCtx(rec.ctx, d), d);
  return rec;
}

function make(def: DrawingToolDef): Drawing {
  const n = def.anchors as number;
  return {
    id: "d1",
    type: def.type,
    anchors: ANCHORS.slice(0, n),
    style: structuredClone(def.defaults),
    props: structuredClone(def.defaultProps ?? {}),
  };
}

const valueFields = (def: DrawingToolDef): ValueField[] =>
  [...def.settings.style, ...(def.settings.inputs ?? []), ...(def.settings.text ?? []), ...(def.settings.tabs ?? []).flatMap((t) => t.fields)].filter(
    (f): f is ValueField => f.kind !== "section",
  );

/** A value different from the current one, by field kind. */
function changed(f: ValueField, cur: unknown): unknown {
  if (f.testValue !== undefined) return f.testValue;
  switch (f.kind) {
    case "checkbox":
      return !cur;
    case "color":
      return cur === "#123456" ? "#654321" : "#123456";
    case "width":
      return cur === 1 ? 3 : 1;
    case "lineStyle":
      return cur === "dotted" ? "dashed" : "dotted";
    case "number":
      return Number(cur) + 7;
    case "select":
      return f.options.find((o) => o.value !== cur)!.value;
    case "levels": {
      const rows = (cur as FibLevel[]).map((r) => ({ ...r }));
      const i = rows.findIndex((r) => r.visible !== false);
      rows[i] = { ...rows[i], ratio: rows[i].ratio + 0.11, color: "#123456" };
      return rows;
    }
    default:
      return "x";
  }
}

const catalogDefault = (f: CatField): unknown => {
  if (f.type === "linestyle") return CATALOG_LINESTYLE[f.default as number];
  if (f.type === "color" && typeof f.default === "string") return catalogColor(f.default);
  return f.default;
};
const KIND: Record<string, string> = { bool: "checkbox", width: "width", linestyle: "lineStyle", color: "color", number: "number", select: "select" };

describe.each(FAMILY.map((c) => [c.type, c] as const))("%s", (catType, cat) => {
  const def = getTool(TYPES[catType])!;

  it("is registered with the catalog's anchors, label and own icon", () => {
    expect(def).toBeDefined();
    expect(def.catalogType).toBe(catType);
    expect(def.family).toBe("fibonacci");
    expect(def.label).toBe(cat.label);
    expect(def.anchors).toBe(cat.anchors);
    expect(def.iconPath).toMatch(/^M/);
  });

  it("floating toolbar and context menu follow the catalog", () => {
    const want = cat.floatingToolbar.map((s) => s.split(" ")[0]);
    expect(floatButtons(def)).toEqual(want);
    const a = new Proxy({}, { get: (_t, k) => (k === "template" ? new Proxy({}, { get: () => () => undefined }) : () => undefined) }) as DrawingMenuActions;
    const s: DrawingMenuState = { groups: [], templates: {} as DrawingMenuState["templates"], unit: { group: "minutes", mult: 1 } as never, drawings: [] };
    expect(menuSequence(genericDrawingMenu(make(def), s, a))).toEqual(cat.contextMenuSequence);
  });

  it("every catalog style field exists with its type, choices and factory default", () => {
    const fields = valueFields(def);
    const style = cat.settingsTabs.find((t) => t.tab === "Style")!.fields.filter((f) => !f.levelRow);
    for (const cf of style) {
      const f = fields.find((x) => x.catalog === cf.key);
      expect(f, cf.key).toBeDefined();
      if (cf.key.includes("(derived)")) continue;
      expect(f!.kind, cf.key).toBe(KIND[cf.type]);
      const d = make(def);
      expect(fieldValue(d, f!, THEME), `${cf.key} factory`).toEqual(catalogDefault(cf));
      expect(fieldValue({ id: "x", type: def.type, anchors: [] }, f!, THEME), `${cf.key} fallback`).toEqual(catalogDefault(cf));
      if (cf.choices && f!.kind === "select") expect(f!.options.map((o) => o.value)).toEqual(cf.choices.map((c) => c.value));
    }
  });

  it("level tables carry the catalog's rows", () => {
    const tables = valueFields(def).filter((f): f is Extract<ValueField, { kind: "levels" }> => f.kind === "levels");
    const fd = cat.factoryDefaults;
    for (const t of tables) {
      const prefix = t.catalogLevels!.prefix;
      const keys = Object.keys(fd)
        .filter((k) => new RegExp(`^${prefix}\\d+$`).test(k))
        .sort((x, y) => Number(x.slice(prefix.length)) - Number(y.slice(prefix.length)));
      const rows = fieldValue(make(def), t, THEME) as FibLevel[];
      expect(rows.length, prefix).toBe(keys.length);
      keys.forEach((k, i) => {
        const lv = fd[k] as { coeff: number; color: string; visible: boolean; linewidth?: number; linestyle?: number };
        expect(rows[i].ratio).toBe(lv.coeff);
        expect(rows[i].color).toBe(catalogColor(lv.color));
        expect(rows[i].visible).toBe(lv.visible);
        if (lv.linewidth !== undefined) expect(rows[i].width).toBe(lv.linewidth);
        if (lv.linestyle !== undefined) expect(rows[i].lineStyle).toBe(CATALOG_LINESTYLE[lv.linestyle]);
      });
    }
    const levelRowCount = cat.settingsTabs.flatMap((t) => t.fields).filter((f) => f.levelRow).length;
    expect(tables.length > 0).toBe(levelRowCount > 0);
  });

  it("settings tabs match the catalog (Coordinates hidden when the catalog hides it)", () => {
    const tabs = settingsTabs(def.type).map((t) => t.label);
    const want = cat.settingsTabs.map((t) => t.tab).filter((t) => !(cat.hiddenTabs ?? []).includes(t));
    expect(tabs).toEqual(want);
  });

  it("every visual field changes the rendering", () => {
    const notWired: string[] = [];
    for (const f of valueFields(def)) {
      if (f.visual === false) continue;
      const base = f.testWith ? f.testWith(make(def)) : make(def);
      const cur = fieldValue(base, f, THEME);
      const next = setField(base, f.key, changed(f, cur));
      if (render(def, base).log.join("|") === render(def, next).log.join("|")) notWired.push(f.catalog ?? f.key);
    }
    expect(notWired).toEqual([]);
  });

  it("coordinates move the geometry", () => {
    const d = make(def);
    const moved = { ...d, anchors: d.anchors.map((a, i) => (i === 1 ? { ...a, price: a.price + 37, time: a.time + 11 } : a)) };
    expect(render(def, d).log.join("|")).not.toBe(render(def, moved).log.join("|"));
  });

  it("hit-test agrees with the drawn strokes (hit on a stroke, miss 20 px away)", () => {
    const d = make(def);
    const { strokes } = render(def, d);
    const pts = strokes.flatMap((s) => s.flatMap((q, i) => (i ? [q, { x: (q.x + s[i - 1].x) / 2, y: (q.y + s[i - 1].y) / 2 }] : [q]))).filter((p) => p.x > 5 && p.x < W - 5 && p.y > 5 && p.y < H - 5);
    expect(pts.length).toBeGreaterThan(0);
    for (const p of pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 25)) === 0)) expect(def.hitTest(d, geom, p.x, p.y, 4), `${p.x},${p.y}`).toBe(true);
    // a point at least 20 px away from everything drawn
    const segDist = (x: number, y: number) => {
      let best = Infinity;
      for (const s of strokes)
        for (let i = 1; i < s.length; i++) {
          const [a, b] = [s[i - 1], s[i]];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const l2 = dx * dx + dy * dy;
          const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
          best = Math.min(best, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
        }
      return best;
    };
    let miss: { x: number; y: number } | null = null;
    for (let y = 10; y < H && !miss; y += 10) for (let x = 10; x < W && !miss; x += 10) if (segDist(x, y) >= 20) miss = { x, y };
    expect(miss).not.toBeNull();
    expect(def.hitTest(d, geom, miss!.x, miss!.y, 6)).toBe(false);
  });

  it("handles are the anchors and the drawing survives a JSON round trip", () => {
    const d = make(def);
    expect(def.handles(d, geom)).toEqual(d.anchors.map(toPx));
    const back = JSON.parse(JSON.stringify(d)) as Drawing;
    expect(render(def, back).log).toEqual(render(def, d).log);
  });

  it("floating-toolbar value buttons read and write", () => {
    const d = make(def);
    for (const b of floatButtons(def)) {
      const bind = floatBinding(def, b, THEME);
      if (!bind) continue;
      const v = b === "line-tool-color" ? "#123456" : b === "style" ? "dotted" : 3;
      const next = bind.set(d, v);
      expect(bind.get(next, THEME), b).toBe(v);
      expect(render(def, next).log.join("|"), b).not.toBe(render(def, d).log.join("|"));
    }
  });
});

describe("fibonacci geometry as drawn", () => {
  const xsOfVerticals = (strokes: { x: number; y: number }[][]) =>
    strokes.filter((s) => s.length === 2 && s[0].x === s[1].x && s[0].y === 0).map((s) => s[0].x);

  it("time zones sit at Fibonacci-numbered bar offsets", () => {
    const def = getTool("fibTimeZone")!;
    const d = { ...make(def), anchors: [toData({ x: 100, y: 300 }), toData({ x: 110, y: 300 })] };
    const xs = xsOfVerticals(render(def, d).strokes);
    expect(xs).toEqual(fibonacciOffsets(11).map((k) => 100 + 10 * k));
  });

  it("trend-based time projects the A→B span from C", () => {
    const def = getTool("fibTrendTime")!;
    const d = { ...make(def), anchors: [toData({ x: 100, y: 300 }), toData({ x: 200, y: 200 }), toData({ x: 250, y: 260 })] };
    const xs = xsOfVerticals(render(def, d).strokes);
    expect(xs).toEqual([0, 0.382, 0.618, 1, 1.382, 1.618, 2, 2.382, 2.618, 3].map((k) => 250 + 100 * k));
  });

  it("extension levels are C + k × (B − A) and reverse flips them", () => {
    const def = getTool("fibExtension")!;
    const d = make(def);
    const ys = (dd: Drawing) => [...new Set(render(def, dd).strokes.filter((s) => s.length === 2 && s[0].y === s[1].y).map((s) => Math.round(s[0].y * 1000) / 1000))].sort((p, q) => p - q);
    const [a, b, c] = ANCHORS;
    const want = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236].map((k) => Math.round(toPx({ time: 0, price: c.price + k * (b.price - a.price) }).y * 1000) / 1000).sort((p, q) => p - q);
    expect(ys(d)).toEqual(want);
    expect(ys({ ...d, props: { ...d.props, reverse: true } })).not.toEqual(want);
  });

  it("circles keep the anchors' aspect: level 1 passes through B", () => {
    const def = getTool("fibCircles")!;
    const d = make(def);
    const { strokes } = render(def, d);
    const b = toPx(ANCHORS[1]);
    const near = (s: { x: number; y: number }[]) => Math.min(...s.map((p) => Math.hypot(p.x - b.x, p.y - b.y)));
    expect(strokes.some((s) => s.length > 50 && near(s) < 3)).toBe(true);
  });

  it("use one color recolors every level; transparency changes the bands", () => {
    const def = getTool("fibExtension")!;
    const d = make(def);
    const one = render(def, { ...d, props: { ...d.props, linesColors: "#abcdef" } }).log.filter((l) => l.startsWith("strokeStyle="));
    expect(new Set(one.filter((l) => l !== "strokeStyle=#808080"))).toEqual(new Set(["strokeStyle=#abcdef"]));
    const fills = (t: number) => render(def, { ...d, props: { ...d.props, transparency: t } }).log.filter((l) => l.startsWith("fillStyle=rgba"));
    expect(fills(80)[0]).toMatch(/,0\.2\)$/);
    expect(fills(50)[0]).toMatch(/,0\.5\)$/);
  });
});
