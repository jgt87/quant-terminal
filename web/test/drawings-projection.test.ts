// Forecasting / measuring / volume tools: catalog coverage, settings wiring (recording canvas),
// hit-test, handles, menus, floating toolbar, and the stats each tool shows.
import { describe, expect, it } from "vitest";
import type { Anchor, Bar, Drawing } from "@qt/core";
import catalog from "../../docs/reference/drawing-tools-catalog.json";
import { getTool } from "../src/chart/drawings/registry";
import { fieldSet, fieldValue, setField } from "../src/chart/drawings/schema";
import { floatButtons } from "../src/chart/drawings/floatbar";
import { THEME } from "../src/chart/theme";
import type { DrawCtx, DrawingToolDef, SettingsField, ToolGeom, ValueField } from "../src/chart/drawings/types";
import { drawingMenuFor, menuSequence, type DrawingMenuActions, type DrawingMenuState } from "../src/state/drawingMenu";
import { isAction } from "../src/components/menuTypes";
import { positionLevels, positionStatsOf } from "../src/chart/drawings/tools/projection/position";
import { forecastOutcome } from "../src/chart/drawings/tools/projection/prediction";
import { capturedPattern, patternOf } from "../src/chart/drawings/tools/projection/barsPattern";
import { rangeLines } from "../src/chart/drawings/tools/measure/ranges";
import { vwapOf } from "../src/chart/drawings/tools/volume/avwap";

// ---------- harness ----------

const T0 = 1_700_000_000;
const SEC = 60;
/** 1 bar per 10 px; price 100 at y = 300, 1 px per 0.1. */
const toPx = (a: Anchor) => ({ x: (a.time - T0) / SEC * 10, y: 300 - (a.price - 100) * 10 });
const toData = (p: { x: number; y: number }): Anchor => ({ time: T0 + Math.round(p.x / 10) * SEC, price: 100 + (300 - p.y) / 10 });
const A = (bar: number, price: number): Anchor => ({ time: T0 + bar * SEC, price });

function makeBars(n = 60): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const c = 100 + Math.sin(i / 4) * 3 + i * 0.05;
    const o = 100 + Math.sin((i - 1) / 4) * 3 + (i - 1) * 0.05;
    return { time: T0 + i * SEC, open: o, high: Math.max(o, c) + 0.4, low: Math.min(o, c) - 0.4, close: c, volume: 1000 + i * 10 };
  });
}
const BARS = makeBars();

function recorder() {
  const log: string[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(
    {},
    {
      get(_t, k: string) {
        if (k in state) return state[k];
        if (k === "measureText") return (s: string) => ({ width: s.length * 6 });
        if (k === "createLinearGradient") return (...a: number[]) => ({ addColorStop: (o: number, c: string) => log.push(`stop ${o} ${c}`), toString: () => `grad(${a.map((v) => v.toFixed(1)).join(",")})` });
        if (k === "getLineDash") return () => [];
        return (...args: unknown[]) => log.push(`${k}(${args.map((v) => (typeof v === "number" ? v.toFixed(2) : String(v))).join(",")})`);
      },
      set(_t, k: string, v) {
        state[k] = v;
        log.push(`${k}=${String(v)}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

function geom(bars: readonly Bar[] = BARS): ToolGeom {
  return { toPx, toData, viewport: { width: 800, height: 600 }, bars, intervalSec: SEC };
}

function renderLog(def: DrawingToolDef, d: Drawing, o: { bars?: readonly Bar[]; selected?: boolean } = {}): string[] {
  const { ctx, log } = recorder();
  const c: DrawCtx = {
    ...geom(o.bars),
    ctx,
    ts: {} as never,
    ps: {} as never,
    width: 800,
    height: 600,
    from: 0,
    to: 60,
    dpr: 1,
    theme: THEME,
    color: d.style?.color ?? THEME.drawing,
    selected: Boolean(o.selected),
    hovered: false,
    formatPrice: (p) => p.toFixed(2),
    priceDecimals: 2,
  };
  // The drawing renderer presets stroke color / width / dash / opacity from the style.
  ctx.strokeStyle = c.color;
  ctx.lineWidth = d.style?.width ?? 1;
  ctx.setLineDash(d.style?.lineStyle === "dashed" ? [6, 4] : d.style?.lineStyle === "dotted" ? [1, 2] : []);
  ctx.globalAlpha = d.style?.opacity ?? 1;
  def.render(c, d);
  return log;
}

function create(def: DrawingToolDef, anchors: Anchor[], points?: Anchor[]): Drawing {
  const d: Drawing = { id: "t1", type: def.type, anchors, style: { ...def.defaults }, props: structuredClone(def.defaultProps ?? {}) };
  if (points) d.points = points;
  return d;
}

const allFields = (def: DrawingToolDef): SettingsField[] => [...(def.settings.inputs ?? []), ...def.settings.style, ...(def.settings.text ?? []), ...(def.settings.tabs ?? []).flatMap((t) => t.fields)];
const valueFields = (def: DrawingToolDef) => allFields(def).filter((f): f is ValueField => f.kind !== "section");

function changed(f: ValueField, cur: unknown): unknown {
  if (f.testValue !== undefined) return f.testValue;
  switch (f.kind) {
    case "color":
      return cur === "#123456" ? "#654321" : "#123456";
    case "width":
      return cur === 3 ? 1 : 3;
    case "checkbox":
      return !cur;
    case "number":
      return Number(cur ?? 0) * 2 + 3;
    case "select":
      return f.options.find((o) => o.value !== cur)!.value;
    case "fontSize":
      return cur === 20 ? 14 : 20;
    case "lineStyle":
      return cur === "dashed" ? "solid" : "dashed";
    case "opacity":
      return 0.3;
    case "text":
      return "Hello";
    default:
      return undefined;
  }
}

const SAMPLE: Record<string, () => Drawing> = {};
const cat = (t: string) => (catalog as { type: string }[]).find((c) => c.type === t) as Record<string, unknown> & { settingsTabs?: { tab: string; fields: { key: string; type: string }[] }[] };

const TOOLS: { type: string; sample: () => Drawing }[] = [
  { type: "longPosition", sample: () => create(getTool("longPosition")!, [A(10, 100), A(30, 103)]) },
  { type: "shortPosition", sample: () => create(getTool("shortPosition")!, [A(10, 100), A(30, 97)]) },
  { type: "prediction", sample: () => create(getTool("prediction")!, [A(5, 100), A(20, 104)]) },
  { type: "barsPattern", sample: () => create(getTool("barsPattern")!, [A(5, 100), A(15, 101)]) },
  { type: "ghostFeed", sample: () => create(getTool("ghostFeed")!, [], [A(60, 103), A(66, 106), A(70, 104)]) },
  { type: "projectionSector", sample: () => create(getTool("projectionSector")!, [A(10, 100), A(30, 100), A(20, 106)]) },
  { type: "priceRange", sample: () => create(getTool("priceRange")!, [A(10, 100), A(30, 104)]) },
  { type: "dateRange", sample: () => create(getTool("dateRange")!, [A(10, 100), A(30, 104)]) },
  { type: "dateAndPriceRange", sample: () => create(getTool("dateAndPriceRange")!, [A(10, 100), A(30, 104)]) },
  { type: "anchoredVwap", sample: () => create(getTool("anchoredVwap")!, [A(10, 100)]) },
];
for (const t of TOOLS) SAMPLE[t.type] = t.sample;

const actions = (): DrawingMenuActions =>
  new Proxy({}, { get: (_t, k) => (k === "template" ? new Proxy({}, { get: () => () => undefined }) : () => undefined) }) as DrawingMenuActions;
const menuState = (d: Drawing): DrawingMenuState => ({ groups: [], templates: {}, unit: { group: "minutes", value: 1 } as never, drawings: [d] });

// ---------- tests ----------

describe("forecasting / measuring / volume tools: registry and catalog coverage", () => {
  for (const { type } of TOOLS) {
    const def = getTool(type)!;
    it(`${type}: registered with catalog type, icon and creation mode`, () => {
      expect(def).toBeDefined();
      const c = cat(def.catalogType!);
      expect(c, def.catalogType).toBeDefined();
      expect(def.iconPath).toMatch(/^M/);
      if (typeof c.anchors === "number") expect(def.anchors).toBe(c.anchors);
      else if (type === "ghostFeed") expect(def.anchors).toBe("poly");
    });

    it(`${type}: every catalog field (Inputs / Style / Text) is in the settings with its catalog key`, () => {
      const c = cat(def.catalogType!);
      const tags = new Set(valueFields(def).map((f) => f.catalog));
      const tabs = Array.isArray(c.settingsTabs) ? c.settingsTabs : [];
      for (const tab of tabs) {
        if (tab.tab === "Visibility" || tab.tab === "Coordinates") continue;
        for (const f of tab.fields) expect(tags.has(f.key), `${type} ${f.key}`).toBe(true);
      }
      // Coordinates tab present exactly when the catalog has one and it is not hidden.
      const coords = tabs.some((t) => t.tab === "Coordinates");
      if (coords) expect(def.settings.coordinates).not.toBe(false);
    });

    it(`${type}: floating toolbar and context menu follow the catalog`, () => {
      const c = cat(def.catalogType!);
      if (Array.isArray(c.floatingToolbar)) {
        const ids = (c.floatingToolbar as string[]).map((b) => b.split(" ")[0]);
        // A second background button (two-color tools) is "background-color-2".
        const want = [...new Set(ids.map((b, i) => (b === "background-color" && ids.indexOf(b) < i ? "background-color-2" : b)))];
        expect(floatButtons(def)).toEqual(want);
      }
      const d = SAMPLE[type]();
      const seq = menuSequence(drawingMenuFor(d, [d.id], menuState(d), actions()));
      if (Array.isArray(c.contextMenuSequence)) expect(seq).toEqual(c.contextMenuSequence);
      else expect(seq).toContain("Settings…");
    });
  }
});

describe("settings wiring: every visual field changes the rendering", () => {
  for (const { type } of TOOLS) {
    const def = getTool(type)!;
    for (const f of valueFields(def)) {
      if (f.visual === false || f.kind === "levels") continue;
      it(`${type}: ${f.key}`, () => {
        let d = SAMPLE[type]();
        if (f.testWith) d = f.testWith(d);
        const cur = fieldValue(d, f, THEME);
        const before = renderLog(def, setField(d, f.key, cur)).join("\n");
        const after = renderLog(def, setField(d, f.key, changed(f, cur))).join("\n");
        expect(after, `${type} field ${f.key} is not wired`).not.toBe(before);
      });
    }
  }

  it("coordinates move the geometry", () => {
    for (const { type } of TOOLS) {
      const def = getTool(type)!;
      if (def.settings.coordinates === false) continue;
      const d = SAMPLE[type]();
      const moved: Drawing = { ...d, anchors: d.anchors.map((a) => ({ time: a.time + SEC, price: a.price + 0.5 })), points: d.points?.map((a) => ({ time: a.time + SEC, price: a.price + 0.5 })) };
      expect(renderLog(def, moved).join("\n"), type).not.toBe(renderLog(def, d).join("\n"));
    }
  });
});

describe("interaction smoke", () => {
  for (const { type } of TOOLS) {
    const def = getTool(type)!;
    it(`${type}: hit on the body, miss 20 px away, handles drag, JSON round trip`, () => {
      const g = geom();
      const d = SAMPLE[type]();
      const hs = def.handles(d, g);
      expect(hs.length).toBeGreaterThan(0);
      // A body point: just inside the first handle towards the drawing's center.
      const b = def.bounds ? def.bounds(d, g) : null;
      const pts = b ? [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }, ...hs] : hs;
      expect(pts.some((p) => def.hitTest(d, g, p.x, p.y, 6)), `${type} hit`).toBe(true);
      expect(def.hitTest(d, g, 790, 20, 6), `${type} miss`).toBe(false);
      hs.forEach((h, i) => {
        const to = toData({ x: h.x + 20, y: h.y - 20 });
        const n = d.anchors.length;
        const next = def.onAnchorDrag
          ? def.onAnchorDrag(d, i, to, g, {})
          : i < n
            ? { ...d, anchors: d.anchors.map((a, k) => (k === i ? to : a)) }
            : { ...d, points: d.points!.map((a, k) => (k === i - n ? to : a)) };
        expect(JSON.stringify(next)).not.toBe(JSON.stringify(d));
      });
      const back = JSON.parse(JSON.stringify(d)) as Drawing;
      expect(renderLog(def, back)).toEqual(renderLog(def, d));
    });
  }
});

describe("position tools", () => {
  const long = getTool("longPosition")!;
  const short = getTool("shortPosition")!;

  it("creation hint sets the target, stop defaults to the same distance", () => {
    const lv = positionLevels(SAMPLE.longPosition(), "long");
    expect(lv.entry).toBe(100);
    expect(lv.target).toBeCloseTo(103);
    expect(lv.stop).toBeCloseTo(97);
    const sv = positionLevels(SAMPLE.shortPosition(), "short");
    expect(sv.target).toBeCloseTo(97);
    expect(sv.stop).toBeCloseTo(103);
  });

  it("ticks and price inputs: tick distances, price overrides win, handle drags write ticks", () => {
    let d = setField(SAMPLE.longPosition(), "props.stopLevel", 100);
    expect(positionLevels(d, "long").stop).toBeCloseTo(99);
    d = setField(d, "props.profitPrice", 105.5);
    expect(positionLevels(d, "long").target).toBe(105.5);
    const g = geom();
    const dragged = long.onAnchorDrag!(d, 1, { time: A(10, 0).time, price: 102 }, g, {});
    expect(dragged.props?.profitPrice).toBeUndefined();
    expect(dragged.props?.profitLevel).toBe(200);
    expect(positionLevels(dragged, "long").target).toBeCloseTo(102);
    // Stop handle on the wrong side stays one tick below the entry.
    const s = long.onAnchorDrag!(dragged, 2, { time: A(10, 0).time, price: 101 }, g, {});
    expect(positionLevels(s, "long").stop).toBeCloseTo(99.99);
    // Right edge never left of the entry.
    const r = long.onAnchorDrag!(d, 3, A(2, 0), g, {});
    expect(r.anchors[1].time).toBe(d.anchors[0].time);
    // Entry drag keeps the distances.
    const e = short.onAnchorDrag!(SAMPLE.shortPosition(), 0, A(12, 110), g, {});
    const ev = positionLevels(e, "short");
    expect(ev.entry).toBe(110);
    expect(ev.target).toBeCloseTo(107);
    expect(ev.stop).toBeCloseTo(113);
  });

  it("derived inputs stay in sync: ticks <-> price, Entry price moves the anchor", () => {
    const fieldOf = (def: DrawingToolDef, key: string) => (def.settings.inputs ?? []).find((x) => x.kind !== "section" && x.key === key) as ValueField;
    const field = (key: string) => fieldOf(long, key);
    const val = (d: Drawing, key: string) => fieldValue(d, field(key), THEME);
    let d = SAMPLE.longPosition();
    expect(val(d, "props.entryPrice")).toBe(100);
    expect(val(d, "props.profitLevel")).toBe(300);
    expect(val(d, "props.profitPrice")).toBeCloseTo(103);
    // Ticks -> price.
    d = fieldSet(d, field("props.profitLevel"), 500);
    expect(val(d, "props.profitPrice")).toBeCloseTo(105);
    // Price -> ticks (the typed price is kept exactly).
    d = fieldSet(d, field("props.stopPrice"), 98.5);
    expect(val(d, "props.stopPrice")).toBe(98.5);
    expect(val(d, "props.stopLevel")).toBe(150);
    // Entry price edits the anchor; both levels keep their distances.
    d = fieldSet(d, field("props.entryPrice"), 110);
    expect(d.anchors[0].price).toBe(110);
    expect(d.props?.entryPrice).toBeUndefined();
    expect(val(d, "props.entryPrice")).toBe(110);
    expect(val(d, "props.profitPrice")).toBeCloseTo(115);
    expect(val(d, "props.stopPrice")).toBeCloseTo(108.5);
    expect(val(d, "props.profitLevel")).toBe(500);
    expect(val(d, "props.stopLevel")).toBe(150);
    // Ticks after a price: the price override is replaced.
    d = fieldSet(d, field("props.stopLevel"), 200);
    expect(d.props?.stopPrice).toBeUndefined();
    expect(val(d, "props.stopPrice")).toBeCloseTo(108);
    // Old layouts with an explicit entryPrice override: the field edits the anchor and clears it.
    const old = { ...SAMPLE.longPosition(), props: { ...SAMPLE.longPosition().props, entryPrice: 101 } };
    expect(val(old, "props.entryPrice")).toBe(101);
    const moved = fieldSet(old, field("props.entryPrice"), 102);
    expect(moved.anchors[0].price).toBe(102);
    expect(moved.props?.entryPrice).toBeUndefined();
    // The short side mirrors it.
    const s = fieldSet(SAMPLE.shortPosition(), fieldOf(short, "props.profitLevel"), 100);
    expect(positionLevels(s, "short").target).toBeCloseTo(99);
  });

  it("sizing from account inputs", () => {
    const d = { ...SAMPLE.longPosition(), props: { ...SAMPLE.longPosition().props, risk: 10, qtyPrecision: "0" } };
    const st = positionStatsOf(d, "long");
    expect(st.riskAmount).toBe(100);
    expect(st.qty).toBe(33);
    expect(st.riskReward).toBeCloseTo(1);
    const cash = { ...d, props: { ...d.props, riskDisplayMode: "money", risk: 30, lotSize: 2, qtyPrecision: "1" } };
    expect(positionStatsOf(cash, "long").qty).toBe(5);
  });

  it("labels show stats when selected / always, compact mode shortens them, P&L follows the bars", () => {
    const d = SAMPLE.longPosition();
    const hidden = renderLog(long, d).join("\n");
    expect(hidden).not.toContain("Risk/Reward");
    const shown = renderLog(long, d, { selected: true }).join("\n");
    expect(shown).toContain("Risk/Reward Ratio: 1.00");
    expect(shown).toMatch(/(Open|Closed) P&L/);
    expect(shown).toContain("Target:");
    const compact = renderLog(long, setField(d, "props.compact", true), { selected: true }).join("\n");
    expect(compact).toContain("R:R 1.00");
    expect(compact).not.toContain("Target:");
    const flat = BARS.map((b) => ({ ...b, open: 100, high: 100.2, low: 99.8, close: 100 }));
    expect(renderLog(long, d, { bars: flat, selected: true }).join("\n")).toContain("Open P&L: 0.00");
    expect(renderLog(long, d, { bars: [], selected: true }).join("\n")).toContain("Open P&L: 0.00");
  });
});

describe("forecast, bars pattern, ranges, VWAP", () => {
  it("forecast outcome after the end bar", () => {
    const d = SAMPLE.prediction();
    const o = forecastOutcome(d, geom());
    expect(o.status).not.toBe("pending");
    const log = renderLog(getTool("prediction")!, d).join("\n");
    expect(log).toMatch(o.status === "success" ? /Success/ : /Failure/);
    expect(forecastOutcome({ ...d, anchors: [A(5, 100), A(500, 120)] }, geom()).status).toBe("pending");
  });

  it("bars pattern copies the bars between the anchors once (onCreate) and keeps them when moved", () => {
    const raw = SAMPLE.barsPattern();
    const before = JSON.stringify(raw);
    expect(patternOf(raw, BARS).length).toBe(11);
    // Rendering and reading never mutate the drawing.
    renderLog(getTool("barsPattern")!, raw);
    expect(JSON.stringify(raw)).toBe(before);
    const d = getTool("barsPattern")!.onCreate!(raw, geom());
    expect(d).toEqual(capturedPattern(raw, BARS));
    const p = patternOf(d, BARS);
    expect(p.length).toBe(11);
    expect(d.props?.pattern).toEqual(p);
    const moved = { ...d, anchors: d.anchors.map((a) => ({ time: a.time + 20 * SEC, price: a.price + 2 })) };
    expect(patternOf(moved, BARS)).toEqual(p);
    const menu = drawingMenuFor(d, [d.id], menuState(d), actions()).filter(isAction);
    const mirrored = menu.find((m) => m.label === "Mirrored")!;
    expect(mirrored.checked).toBe(false);
  });

  it("range readouts: price, percent, ticks, bars, span, volume", () => {
    const d = SAMPLE.dateAndPriceRange();
    const lines = rangeLines(d, geom(), "dateAndPrice", 2);
    expect(lines[0]).toBe("+4.00 (+4.00%) 400");
    expect(lines[1]).toBe("20 bars, 20m");
    expect(lines[2]).toMatch(/^Vol \d/);
    expect(rangeLines(SAMPLE.priceRange(), geom(), "price", 2)).toEqual(["+4.00 (+4.00%) 400"]);
    expect(rangeLines(SAMPLE.dateRange(), geom(), "date", 2).length).toBe(2);
  });

  it("anchored VWAP from the anchor bar with bands", () => {
    const v = vwapOf(SAMPLE.anchoredVwap(), geom());
    expect(v.points[0].time).toBe(A(10, 0).time);
    expect(v.points.length).toBe(50);
    expect(v.bands.length).toBe(1);
    expect(v.points[10].bands[0][1]).toBeGreaterThan(v.points[10].vwap);
  });
});
