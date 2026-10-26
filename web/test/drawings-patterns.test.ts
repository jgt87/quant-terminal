import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Anchor, Drawing } from "@qt/core";
import { getTool } from "../src/chart/drawings/registry";
import { getField, setField } from "../src/chart/drawings/schema";
import { PATTERNS } from "../src/chart/drawings/tools/patterns";
import type { DrawCtx, DrawingToolDef, ValueField } from "../src/chart/drawings/types";
import { THEME } from "../src/chart/theme";

const catalog = JSON.parse(readFileSync(fileURLToPath(new URL("../../docs/reference/drawing-tools-catalog.json", import.meta.url)), "utf8")) as {
  type: string;
  label: string;
  anchors: number;
  floatingToolbar: string[];
  contextMenuExtras: unknown[];
  settingsTabs: { tab: string; fields: { key: string; type: string; default: unknown }[] }[];
}[];

// Projection: time = x, price = 1000 - y.
const toPx = (a: Anchor) => ({ x: a.time, y: 1000 - a.price });
const toData = (p: { x: number; y: number }): Anchor => ({ time: Math.round(p.x), price: 1000 - p.y });
const A = (x: number, y: number): Anchor => toData({ x, y });
const geom = { toPx, toData, viewport: { width: 800, height: 600 }, bars: [], intervalSec: 60 };

/** Recording 2D context: every call and property write is logged. */
function recorder(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, k: string) {
      if (k === "measureText") return (s: string) => ({ width: s.length * 6 });
      if (k in target) return target[k];
      return (...args: unknown[]) => {
        log.push(`${k}(${args.map((a) => (typeof a === "number" ? a.toFixed(1) : String(a))).join(",")})`);
      };
    },
    set(_t, k: string, v) {
      target[k] = v;
      log.push(`${k}=${String(v)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

function render(def: DrawingToolDef, d: Drawing): string[] {
  const { ctx, log } = recorder();
  const c = {
    ctx,
    theme: THEME,
    dpr: 1,
    width: 800,
    height: 600,
    from: 0,
    to: 0,
    ts: undefined,
    ps: undefined,
    ...geom,
    color: d.style?.color ?? THEME.drawing,
    selected: false,
    hovered: false,
    formatPrice: (p: number) => p.toFixed(2),
    priceDecimals: 2,
  } as unknown as DrawCtx;
  def.render(c, d);
  return log;
}

// Seven zig-zag points inside the viewport (tools take the first n).
const ZIG = [A(100, 450), A(170, 200), A(240, 380), A(320, 120), A(400, 360), A(470, 220), A(540, 470)];
const make = (def: DrawingToolDef, n = def.anchors as number): Drawing => ({
  id: def.type,
  type: def.type,
  anchors: ZIG.slice(0, n),
  style: { ...def.defaults },
  props: { ...def.defaultProps },
});

const expected: [string, string, number][] = [
  ["xabcdPattern", "LineTool5PointsPattern", 5],
  ["cypherPattern", "LineToolCypherPattern", 5],
  ["headAndShoulders", "LineToolHeadAndShoulders", 7],
  ["abcdPattern", "LineToolABCD", 4],
  ["trianglePattern", "LineToolTrianglePattern", 4],
  ["threeDrives", "LineToolThreeDrivers", 7],
];

describe("chart patterns family", () => {
  it("registers the catalog tools in flyout order", () => {
    expect(PATTERNS.map((t) => [t.type, t.catalogType, t.anchors])).toEqual(expected);
    for (const t of PATTERNS) {
      expect(getTool(t.type)).toBe(t);
      expect(t.family).toBe("patterns");
      const cat = catalog.find((c) => c.type === t.catalogType)!;
      expect(t.label).toBe(cat.label);
      expect(t.anchors).toBe(cat.anchors);
      expect(t.floatingToolbar).toEqual(cat.floatingToolbar.map((b) => b.split(" ")[0]));
      expect(cat.contextMenuExtras).toEqual([]);
      expect(t.alert).toBeUndefined();
      expect(t.menuSection).toBeUndefined();
      expect(t.menuTop).toBeUndefined();
      expect(t.contextMenu).toBeUndefined();
      expect(t.iconPath).toBeTruthy();
      expect(t.settings.coordinates).toBe("time-price");
    }
  });

  it("every catalog Style field exists with its factory default", () => {
    for (const t of PATTERNS) {
      const cat = catalog.find((c) => c.type === t.catalogType)!;
      const catFields = cat.settingsTabs.find((x) => x.tab === "Style")!.fields;
      const ours = t.settings.style.filter((f): f is ValueField => f.kind !== "section");
      expect(ours.map((f) => f.catalog)).toEqual(catFields.map((f) => f.key));
      for (const f of catFields) {
        const field = ours.find((o) => o.catalog === f.key)!;
        const factory = getField(make(t), field.key);
        expect(factory, `${t.type} ${f.key} factory`).toEqual(field.default);
        if (f.key === "transparency") expect(String(factory).slice(7)).toBe("26");
        else if (f.type === "color") expect(String(factory).slice(0, 7)).toBe(String(f.default).toLowerCase().slice(0, 7));
        else expect(factory).toEqual(f.default);
      }
    }
  });

  it("every Style field changes the rendering", () => {
    for (const t of PATTERNS) {
      for (const f of t.settings.style) {
        if (f.kind === "section") continue;
        const base = f.testWith ? f.testWith(make(t)) : make(t);
        const cur = getField(base, f.key);
        const next =
          f.kind === "checkbox" ? !cur : f.kind === "color" ? "#123456" : f.kind === "width" ? 4 : f.kind === "fontSize" ? 20 : undefined;
        expect(next, `${t.type} ${f.key}`).not.toBeUndefined();
        expect(render(t, setField(base, f.key, next)), `${t.type} ${f.key} wired`).not.toEqual(render(t, base));
      }
    }
  });

  it("renders every partial anchor count (live preview of the next leg)", () => {
    for (const t of PATTERNS) {
      for (let n = 1; n <= (t.anchors as number); n++) {
        const log = render(t, make(t, n));
        if (n >= 2) expect(log.some((l) => l.startsWith("lineTo")), `${t.type} n=${n}`).toBe(true);
      }
    }
  });

  it("hits legs and filled areas, misses far away", () => {
    for (const t of PATTERNS) {
      const d = make(t);
      const mid = { x: (ZIG[0].time + ZIG[1].time) / 2, y: 1000 - (ZIG[0].price + ZIG[1].price) / 2 };
      expect(t.hitTest(d, geom, mid.x, mid.y, 6), `${t.type} hit`).toBe(true);
      expect(t.hitTest(d, geom, mid.x + 20, mid.y + 20, 6) === false || t.settings.style.some((f) => f.kind !== "section" && f.key === "props.fillBackground"), `${t.type} miss 20px`).toBe(true);
      expect(t.hitTest(d, geom, 760, 580, 6), `${t.type} miss`).toBe(false);
      expect(t.handles(d, geom).length).toBe(d.anchors.length);
    }
  });

  it("filled triangle is hit inside and not when the background is off", () => {
    const t = getTool("xabcdPattern")!;
    const d = make(t);
    // Centroid of triangle XAB.
    const cx = (100 + 170 + 240) / 3;
    const cy = (450 + 200 + 380) / 3;
    expect(t.hitTest(d, geom, cx, cy, 3)).toBe(true);
    expect(t.hitTest(setField(d, "props.fillBackground", false), geom, cx, cy, 3)).toBe(false);
  });

  it("labels: XABCD letters, ratios as 3-decimal boxes", () => {
    const log = render(getTool("xabcdPattern")!, make(getTool("xabcdPattern")!)).join("\n");
    for (const s of ["fillText(X", "fillText(A", "fillText(B", "fillText(C", "fillText(D"]) expect(log).toContain(s);
    expect(log).toMatch(/fillText\(\d\.\d{3}/);
    const hs = render(getTool("headAndShoulders")!, make(getTool("headAndShoulders")!)).join("\n");
    expect(hs).toContain("fillText(Head");
  });

  it("survives a JSON round trip", () => {
    for (const t of PATTERNS) {
      const d = make(t);
      expect(JSON.parse(JSON.stringify(d))).toEqual(d);
    }
  });
});
