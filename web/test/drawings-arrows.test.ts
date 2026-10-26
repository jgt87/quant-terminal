// Arrows family: hit / miss, arrow ends, stats, marks pointing at their anchor, registration
// of the left / right marks.

import { describe, expect, it } from "vitest";
import type { Anchor, Drawing } from "@qt/core";
import { floatButtons } from "../src/chart/drawings/floatbar";
import { getTool } from "../src/chart/drawings/registry";
import { ARROWS } from "../src/chart/drawings/tools/arrows";
import { factoryDrawing, geom, renderLog } from "./drawings/harness";

const A = (x: number, y: number): Anchor => geom.toData({ x, y });
const make = (type: string, anchors: Anchor[], extra: Partial<Drawing> = {}): Drawing => ({ ...factoryDrawing(getTool(type)!), anchors, text: "", ...extra });
const hit = (d: Drawing, x: number, y: number) => getTool(d.type)!.hitTest(d, geom, x, y, 6);

describe("arrows registry", () => {
  it("flyout order and the extra left / right marks", () => {
    expect(ARROWS.map((t) => t.type)).toEqual(["arrowMarker", "arrow", "arrowMarkUp", "arrowMarkDown", "arrowMarkLeft", "arrowMarkRight"]);
    expect(getTool("arrow")!.alert).toBe("line");
    expect(floatButtons(getTool("arrow")!)).toContain("add-alert");
  });
});

describe("arrow", () => {
  it("segment hit, extension, arrow head by default", () => {
    const d = make("arrow", [A(100, 300), A(300, 300)]);
    expect(hit(d, 200, 302)).toBe(true);
    expect(hit(d, 400, 300)).toBe(false);
    expect(hit({ ...d, props: { ...d.props, extendRight: true } }, 400, 300)).toBe(true);
    const fills = renderLog(d).filter((c) => JSON.stringify(c).includes("fill"));
    expect(fills.length).toBeGreaterThan(0);
  });
  it("stats readout", () => {
    const d = make("arrow", [A(100, 300), A(300, 200)], { props: { ...getTool("arrow")!.defaultProps, showPriceRange: true, showBarsRange: true } });
    const lines = getTool("arrow")!.stats!(d, geom);
    expect(lines[0]).toContain("100");
    expect(lines[1]).toContain("200 bars");
  });
});

describe("arrow marker and marks", () => {
  it("marker hits its body only", () => {
    const d = make("arrowMarker", [A(100, 300), A(300, 300)]);
    expect(hit(d, 200, 300)).toBe(true);
    expect(hit(d, 200, 360)).toBe(false);
  });
  it("marks sit on the expected side of the anchor", () => {
    const p = { x: 300, y: 300 };
    expect(hit(make("arrowMarkUp", [A(p.x, p.y)]), 300, 315)).toBe(true);
    expect(hit(make("arrowMarkUp", [A(p.x, p.y)]), 300, 285)).toBe(false);
    expect(hit(make("arrowMarkDown", [A(p.x, p.y)]), 300, 285)).toBe(true);
    expect(hit(make("arrowMarkLeft", [A(p.x, p.y)]), 315, 300)).toBe(true);
    expect(hit(make("arrowMarkRight", [A(p.x, p.y)]), 285, 300)).toBe(true);
    expect(hit(make("arrowMarkRight", [A(p.x, p.y)]), 315, 300)).toBe(false);
  });
});
