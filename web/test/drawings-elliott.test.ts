import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Anchor, Drawing } from "@qt/core";
import { getTool, toolsOfFamily } from "../src/chart/drawings/registry";
import { setField } from "../src/chart/drawings/schema";
import { catalogColor } from "../src/chart/drawings/builders";
import type { DrawCtx, DrawingToolDef, ValueField } from "../src/chart/drawings/types";
import { THEME } from "../src/chart/theme";
import { isAction, type MenuAction } from "../src/components/menuTypes";

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

// Up impulse: 0 low, 1 high, 2 low, 3 high, 4 low, 5 high.
const WAVE = [A(100, 500), A(150, 400), A(200, 450), A(300, 250), A(350, 320), A(450, 150)];
const SPEC: Record<string, { catalog: string; n: number }> = {
  elliottImpulse: { catalog: "LineToolElliottImpulse", n: 6 },
  elliottCorrection: { catalog: "LineToolElliottCorrection", n: 4 },
  elliottTriangle: { catalog: "LineToolElliottTriangle", n: 6 },
  elliottDoubleCombo: { catalog: "LineToolElliottDoubleCombo", n: 4 },
  elliottTripleCombo: { catalog: "LineToolElliottTripleCombo", n: 6 },
};

const catalog = JSON.parse(readFileSync(new URL("../../docs/reference/drawing-tools-catalog.json", import.meta.url), "utf8")) as {
  type: string;
  label: string;
  anchors: number;
  factoryDefaults: Record<string, unknown>;
  settingsTabs: { tab: string; fields: { key: string; type: string; default: unknown; choices?: { value: unknown }[] }[] }[];
}[];

const valueFields = (def: DrawingToolDef) => def.settings.style.filter((f): f is ValueField => f.kind !== "section");

describe("elliott family", () => {
  it("registers the five tools in flyout order", () => {
    expect(toolsOfFamily("elliott").map((t) => t.type)).toEqual(Object.keys(SPEC));
  });

  for (const [type, s] of Object.entries(SPEC)) {
    describe(type, () => {
      const def = getTool(type)!;
      const cat = catalog.find((c) => c.type === s.catalog)!;

      it("matches the catalog entry (label, anchors, defaults, style fields)", () => {
        expect(def.catalogType).toBe(s.catalog);
        expect(def.label).toBe(cat.label);
        expect(def.anchors).toBe(cat.anchors);
        expect(def.anchors).toBe(s.n);
        expect(def.defaults.color).toBe(catalogColor(String(cat.factoryDefaults.color)));
        expect(def.defaults.width).toBe(cat.factoryDefaults.linewidth);
        expect(def.defaultProps).toEqual({ showWave: true, degree: 7 });
        const fields = valueFields(def);
        const style = cat.settingsTabs.find((t) => t.tab === "Style")!.fields;
        for (const cf of style) {
          const f = fields.find((x) => x.catalog === cf.key);
          expect(f, cf.key).toBeDefined();
          const def0 = typeof cf.default === "string" ? catalogColor(cf.default) : cf.default;
          expect(f!.default, cf.key).toEqual(def0);
          if (cf.choices && f!.kind === "select") expect(f!.options.map((o) => o.value)).toEqual(cf.choices.map((c) => c.value));
        }
        expect(fields).toHaveLength(style.length);
        expect(def.settings.coordinates).toBe("time-price");
        expect(def.floatingToolbar).toEqual(["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"]);
        expect(def.alert).toBeUndefined();
        expect(def.iconPath).toMatch(/^M/);
      });

      it("every style field changes the rendering", () => {
        const base = fresh(def, WAVE.slice(0, s.n));
        for (const f of valueFields(def)) {
          const d0 = f.testWith ? f.testWith(base) : base;
          const changed =
            f.kind === "color" ? "#123456" : f.kind === "checkbox" ? !(f.default as boolean) : f.kind === "width" ? 4 : f.kind === "select" ? 2 : undefined;
          const d1 = setField(d0, f.key, changed);
          expect(draw(def, d1), `${type} ${f.key}`).not.toEqual(draw(def, d0));
        }
      });

      it("hits the wave and a label, misses far away", () => {
        const d = fresh(def, WAVE.slice(0, s.n));
        expect(def.hitTest(d, g, 125, 450, 4)).toBe(true); // middle of leg 0→1
        expect(def.hitTest(d, g, 700, 580, 4)).toBe(false);
        // Label of point 1 (a high) sits above it.
        const noWave = { ...d, props: { ...d.props, showWave: false } };
        expect(def.hitTest(noWave, g, 125, 450, 4)).toBe(false);
        expect(def.hitTest(noWave, g, 150, 400 - 12, 4)).toBe(true);
        expect(def.hitTest(noWave, g, 150, 400 + 14, 2)).toBe(false);
      });

      it("renders a partial wave while creating (live preview)", () => {
        const two = draw(def, fresh(def, WAVE.slice(0, 2)));
        const three = draw(def, fresh(def, WAVE.slice(0, 3)));
        expect(two.some((l) => l.startsWith("lineTo"))).toBe(true);
        expect(three.filter((l) => l.startsWith("lineTo")).length).toBeGreaterThan(two.filter((l) => l.startsWith("lineTo")).length);
        expect(three.filter((l) => l.startsWith("fillText")).length).toBe(2);
        expect(() => draw(def, fresh(def, WAVE.slice(0, 1)))).not.toThrow();
      });

      it("Degree submenu: 15 degrees, Intermediate checked, selecting sets props.degree", () => {
        let d = fresh(def, WAVE.slice(0, s.n));
        const update = (fn: (x: Drawing) => Drawing) => {
          d = fn(d);
        };
        const items = def.menuSection!(d, { update });
        expect(items).toHaveLength(1);
        const deg = items[0] as MenuAction;
        expect(deg.label).toBe("Degree");
        const sub = deg.submenu!.filter(isAction);
        expect(sub.map((m) => m.label)).toEqual(cat.settingsTabs[0].fields.find((f) => f.key === "degree")!.choices!.map((c) => (c as { label?: string }).label));
        expect(sub.filter((m) => m.checked).map((m) => m.label)).toEqual(["Intermediate"]);
        const before = draw(def, d);
        sub[3].onSelect!();
        expect(d.props?.degree).toBe(3);
        expect(draw(def, d)).not.toEqual(before);
        const again = (def.menuSection!(d, { update })[0] as MenuAction).submenu!.filter(isAction);
        expect(again.filter((m) => m.checked).map((m) => m.label)).toEqual(["Grand supercycle"]);
      });

      it("labels sit above highs and below lows", () => {
        const d = fresh(def, WAVE.slice(0, s.n));
        const log = draw(def, d);
        const ys = log.filter((l) => l.startsWith("fillText")).map((l) => (JSON.parse(l.slice(9, -1)) as [string, number, number])[2]);
        WAVE.slice(1, s.n).forEach((a, i) => {
          const py = toPx(a).y;
          const high = i % 2 === 0; // points 1, 3, 5 are highs in WAVE
          if (high) expect(ys[i]).toBeLessThan(py);
          else expect(ys[i]).toBeGreaterThan(py);
        });
      });

      it("handles are the anchors and the drawing survives a JSON round trip", () => {
        const d = fresh(def, WAVE.slice(0, s.n));
        expect(def.handles(d, g)).toEqual(d.anchors.map(toPx));
        expect(JSON.parse(JSON.stringify(d))).toEqual(d);
      });
    });
  }
});
