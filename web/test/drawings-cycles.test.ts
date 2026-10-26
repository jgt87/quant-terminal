import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Anchor, Drawing } from "@qt/core";
import { getTool, toolsOfFamily } from "../src/chart/drawings/registry";
import { setField } from "../src/chart/drawings/schema";
import { CATALOG_LINESTYLE, catalogColor } from "../src/chart/drawings/builders";
import type { DrawCtx, DrawingToolDef, ValueField } from "../src/chart/drawings/types";
import { THEME } from "../src/chart/theme";

// Projection: time = x, price = 1000 - y.
const toPx = (a: Anchor) => ({ x: a.time, y: 1000 - a.price });
const toData = (p: { x: number; y: number }): Anchor => ({ time: Math.round(p.x), price: 1000 - p.y });
const A = (x: number, y: number): Anchor => toData({ x, y });
const g = { toPx, toData, viewport: { width: 800, height: 600 }, bars: [], intervalSec: 60 };

/** 2D context that records every call and property write. */
function recorder(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(t, k: string) {
      if (k === "measureText") return (s: string) => ({ width: s.length * 7 });
      if (k in t) return t[k];
      return (...args: unknown[]) => {
        log.push(`${k}(${JSON.stringify(args)})`);
      };
    },
    set(t, k: string, v) {
      t[k] = v;
      log.push(`${k}=${JSON.stringify(v)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

function draw(def: DrawingToolDef, d: Drawing): string[] {
  const { ctx, log } = recorder();
  const c = {
    ctx,
    ts: null,
    ps: null,
    width: 800,
    height: 600,
    from: 0,
    to: 0,
    dpr: 1,
    theme: THEME,
    ...g,
    color: d.style?.color ?? THEME.drawing,
    selected: false,
    hovered: false,
    formatPrice: (p: number) => p.toFixed(2),
    priceDecimals: 2,
  } as unknown as DrawCtx;
  def.render(c, d);
  return log;
}

const fresh = (def: DrawingToolDef, anchors: Anchor[]): Drawing => ({
  id: def.type,
  type: def.type,
  anchors,
  style: { ...def.defaults },
  props: { ...def.defaultProps },
});

const catalog = JSON.parse(readFileSync(new URL("../../docs/reference/drawing-tools-catalog.json", import.meta.url), "utf8")) as {
  type: string;
  label: string;
  anchors: number;
  floatingToolbar: string[];
  settingsTabs: { tab: string; fields: { key: string; type: string; default: unknown }[] }[];
}[];

const valueFields = (def: DrawingToolDef) => def.settings.style.filter((f): f is ValueField => f.kind !== "section");

const SPEC: Record<string, { catalog: string; anchors: Anchor[]; hit: [number, number] }> = {
  // Lines at x = 100, 160, 220, …
  cyclicLines: { catalog: "LineToolCircleLines", anchors: [A(100, 300), A(160, 300)], hit: [220, 50] },
  // Arcs of period 100 on y = 400, height 60: top of the second arc at (250, 340).
  timeCycles: { catalog: "LineToolTimeCycles", anchors: [A(100, 400), A(200, 340)], hit: [250, 340] },
  // Peak at (200, 200), trough at (300, 300): next peak at (400, 200).
  sineLine: { catalog: "LineToolSineLine", anchors: [A(200, 200), A(300, 300)], hit: [400, 200] },
};

describe("cycles family", () => {
  it("registers the three tools in flyout order", () => {
    expect(toolsOfFamily("cycles").map((t) => t.type)).toEqual(["cyclicLines", "timeCycles", "sineLine"]);
  });

  for (const [type, s] of Object.entries(SPEC)) {
    describe(type, () => {
      const def = getTool(type)!;
      const cat = catalog.find((c) => c.type === s.catalog)!;

      it("matches the catalog entry (label, anchors, toolbar, style fields and defaults)", () => {
        expect(def.catalogType).toBe(s.catalog);
        expect(def.label).toBe(cat.label);
        expect(def.anchors).toBe(cat.anchors);
        expect(def.floatingToolbar).toEqual(cat.floatingToolbar.map((b) => b.split(" ")[0]));
        expect(def.settings.coordinates).toBe("time-price");
        const fields = valueFields(def);
        const style = cat.settingsTabs.find((t) => t.tab === "Style")!.fields;
        expect(fields.map((f) => f.catalog)).toEqual(style.map((f) => f.key));
        for (const cf of style) {
          const f = fields.find((x) => x.catalog === cf.key)!;
          const want = cf.type === "linestyle" ? CATALOG_LINESTYLE[cf.default as number] : cf.type === "color" ? catalogColor(String(cf.default)) : cf.default;
          expect(f.default, cf.key).toEqual(want);
          // Factory value of new drawings equals the field default.
          const bag = f.key.startsWith("style.") ? def.defaults : def.defaultProps;
          expect((bag as Record<string, unknown>)[f.key.slice(6)], cf.key).toEqual(want);
        }
      });

      it("every style field changes the rendering", () => {
        const base = fresh(def, s.anchors);
        for (const f of valueFields(def)) {
          const d0 = f.testWith ? f.testWith(base) : base;
          const changed = f.kind === "color" ? "#123456" : f.kind === "checkbox" ? !(f.default as boolean) : f.kind === "width" ? 4 : f.kind === "lineStyle" ? "dashed" : undefined;
          expect(draw(def, setField(d0, f.key, changed)), `${type} ${f.key}`).not.toEqual(draw(def, d0));
        }
      });

      it("moving an anchor moves the geometry", () => {
        const d = fresh(def, s.anchors);
        const moved = { ...d, anchors: [d.anchors[0], { ...d.anchors[1], time: d.anchors[1].time + 15, price: d.anchors[1].price + 7 }] };
        expect(draw(def, moved)).not.toEqual(draw(def, d));
      });

      it("hits its body and misses far away", () => {
        const d = fresh(def, s.anchors);
        expect(def.hitTest(d, g, ...s.hit, 4)).toBe(true);
        expect(def.hitTest(d, g, 130, 590, 4)).toBe(false);
      });

      it("renders a one-anchor preview without failing and handles are the anchors", () => {
        const d = fresh(def, s.anchors);
        expect(() => draw(def, fresh(def, s.anchors.slice(0, 1)))).not.toThrow();
        expect(def.handles(d, g)).toEqual(d.anchors.map(toPx));
        expect(JSON.parse(JSON.stringify(d))).toEqual(d);
      });
    });
  }

  it("cyclic lines draw one vertical line per period from a toward b", () => {
    const def = getTool("cyclicLines")!;
    const log = draw(def, fresh(def, [A(100, 300), A(300, 300)]));
    const xs = log.filter((l) => l.startsWith("moveTo")).map((l) => (JSON.parse(l.slice(7, -1)) as number[])[0]);
    expect(xs).toEqual([100.5, 300.5, 500.5, 700.5]);
  });

  it("time cycles fill only with the background on", () => {
    const def = getTool("timeCycles")!;
    const d = fresh(def, SPEC.timeCycles.anchors);
    expect(draw(def, d).some((l) => l.startsWith("fill("))).toBe(true);
    expect(draw(def, { ...d, props: { fillBackground: false } }).some((l) => l.startsWith("fill("))).toBe(false);
  });
});
