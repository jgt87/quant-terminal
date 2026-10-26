// "Add alert" on drawings: the tools, the catalog, the alert dialog and the server evaluator use one
// list (core DRAWING_ALERTS), and the value the server evaluates lies on what the chart draws.
import { describe, expect, it } from "vitest";
import { drawingAlertKind, drawingAlertValue, DRAWING_ALERTS, type Anchor, type Drawing } from "@qt/core";
import catalog from "../../docs/reference/drawing-tools-catalog.json";
import { allTools, getTool } from "../src/chart/drawings/registry";
import type { DrawingToolDef, ToolGeom } from "../src/chart/drawings/types";
import { CHANNEL_TYPES, draftFromChart, operatorsFor } from "../src/panels/alerts/alertModel";
import { drawingMenuFor, menuSequence } from "../src/state/drawingMenu";
import { NOOP_ACTIONS } from "./drawings/harness";

const T0 = 1_700_000_000;
const SEC = 60;
const toPx = (a: Anchor) => ({ x: ((a.time - T0) / SEC) * 10 + 200, y: 500 - (a.price - 100) * 10 });
const toData = (p: { x: number; y: number }): Anchor => ({ time: T0 + Math.round((p.x - 200) / 10) * SEC, price: 100 + (500 - p.y) / 10 });
const geom: ToolGeom = { toPx, toData, viewport: { width: 2000, height: 1000 }, bars: [], intervalSec: SEC };
const at = (bar: number, price: number): Anchor => ({ time: T0 + bar * SEC, price });

const factory = (def: DrawingToolDef, anchors: Anchor[]): Drawing => ({
  id: `${def.type}-1`,
  type: def.type,
  anchors,
  ...(def.defaults ? { style: structuredClone(def.defaults) } : {}),
  ...(def.defaultProps ? { props: structuredClone(def.defaultProps) } : {}),
});

/** Sample anchors per alert-capable type. */
const SAMPLE: Record<string, Anchor[]> = {
  trendline: [at(0, 100), at(20, 110)],
  ray: [at(0, 100), at(20, 110)],
  extended: [at(0, 100), at(20, 110)],
  infoline: [at(0, 100), at(20, 110)],
  trendangle: [at(0, 100), at(20, 110)],
  arrow: [at(0, 100), at(20, 110)],
  hline: [at(10, 105)],
  hray: [at(10, 105)],
  vline: [at(10, 105)],
  fib: [at(0, 100), at(20, 120)],
  fibExtension: [at(0, 100), at(10, 120), at(20, 110)],
  channel: [at(0, 100), at(20, 110), at(10, 115)],
  flatBottom: [at(0, 100), at(20, 110), at(10, 95)],
  disjointChannel: [at(0, 100), at(20, 110), at(0, 120)],
  rectangle: [at(0, 100), at(20, 110)],
};

const cat = catalog as { type: string; contextMenuHasAddAlert?: boolean }[];

describe("one list of alert-capable drawings", () => {
  it("every tool's `alert` equals the shared list (and nothing else has one)", () => {
    for (const def of allTools()) expect(def.alert, def.type).toBe(drawingAlertKind(def.type));
    for (const type of Object.keys(DRAWING_ALERTS)) expect(getTool(type), type).toBeDefined();
  });

  it("matches the catalog: Add alert exactly where the reference offers it", () => {
    for (const def of allTools()) {
      const c = cat.find((x) => x.type === def.catalogType);
      if (!c) continue;
      expect(Boolean(def.alert), `${def.type} (${def.catalogType})`).toBe(Boolean(c.contextMenuHasAddAlert));
    }
  });

  it("the menu shows Add alert… only for alert-capable tools", () => {
    for (const def of allTools()) {
      const d = factory(def, [at(0, 100), at(5, 101), at(10, 102), at(15, 103), at(20, 104)].slice(0, typeof def.anchors === "number" ? def.anchors : 2));
      const seq = menuSequence(drawingMenuFor(d, [d.id], { groups: [], templates: {}, unit: { group: "days", n: 1 }, drawings: [d] }, NOOP_ACTIONS));
      expect(seq.some((s) => s.startsWith("Add alert")), def.type).toBe(Boolean(def.alert));
    }
  });

  it("alert dialog: channel types and operators come from the same list", () => {
    expect([...CHANNEL_TYPES].sort()).toEqual(Object.keys(DRAWING_ALERTS).filter((t) => DRAWING_ALERTS[t].kind === "band").sort());
    for (const type of Object.keys(DRAWING_ALERTS)) {
      const draft = draftFromChart("X", "1D", { drawingId: "d", layoutId: "l", type });
      expect(draft.conditions[0].op, type).toBe(DRAWING_ALERTS[type].kind === "band" ? "enters-channel" : "crosses");
    }
    const drawings: Drawing[] = [
      { id: "f", type: "fib", anchors: [] },
      { id: "v", type: "vline", anchors: [] },
      { id: "r", type: "rectangle", anchors: [] },
      { id: "t", type: "trendline", anchors: [] },
    ];
    const ops = (id: string, op = "crosses") => operatorsFor({ op: op as never, right: { kind: "drawing", drawingId: id } as never }, drawings).map((o) => o.id);
    expect(ops("f")).not.toContain("greater");
    expect(ops("f")).not.toContain("enters-channel");
    expect(ops("v").filter((o) => !o.startsWith("moving"))).toEqual(["crosses"]);
    expect(ops("r")).toContain("enters-channel");
    expect(ops("t")).toContain("greater");
    expect(ops("t")).not.toContain("exits-channel");
    // The current operator stays selectable.
    expect(ops("v", "greater")).toContain("greater");
    // Not a drawing on the right: every operator.
    expect(operatorsFor({ op: "crosses", right: { kind: "value" } as never }, drawings)).toHaveLength(9);
  });
});

describe("the evaluated value lies on the drawn geometry", () => {
  const tol = 3;
  for (const type of Object.keys(DRAWING_ALERTS)) {
    it(type, () => {
      const def = getTool(type)!;
      const d = factory(def, SAMPLE[type]);
      const t = T0 + (type === "fibExtension" ? 25 : 10) * SEC; // inside the sample's drawn span
      const v = drawingAlertValue(d, t);
      expect(v, "value inside the span").not.toBeNull();
      const hits = (price: number) => {
        const p = toPx({ time: t, price });
        return def.hitTest(d, geom, p.x, p.y, tol);
      };
      if (typeof v === "number") expect(hits(v)).toBe(true);
      else if (v && "lo" in v) {
        expect(hits(v.lo), "lower bound").toBe(true);
        expect(hits(v.hi), "upper bound").toBe(true);
      } else if (v && "levels" in v) {
        expect(v.levels.length).toBeGreaterThan(0);
        for (const price of v.levels) expect(hits(price), `level ${price}`).toBe(true);
      } else if (v && "time" in v) {
        const p = toPx({ time: v.time, price: 100 });
        expect(def.hitTest(d, geom, p.x, p.y, tol)).toBe(true);
      }
      // Where the drawing is not drawn, there is no value and no body (lines and bands).
      const far = T0 + 400 * SEC;
      if (drawingAlertValue(d, far) === null && DRAWING_ALERTS[type].shape !== "time") {
        const [a, b] = d.anchors;
        const price = b ? a.price + ((b.price - a.price) * (far - a.time)) / (b.time - a.time) : a.price;
        const p = toPx({ time: far, price });
        expect(def.hitTest(d, geom, p.x, p.y, tol), "no body where there is no value").toBe(false);
      }
    });
  }
});
