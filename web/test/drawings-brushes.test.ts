// Brushes family: freehand creation, smoothing, stroke hit by width, highlighter look.

import { describe, expect, it } from "vitest";
import type { Anchor, Drawing } from "@qt/core";
import { creationDown, creationMove, creationUp, IDLE } from "../src/chart/drawings/creation";
import { getTool } from "../src/chart/drawings/registry";
import { BRUSHES } from "../src/chart/drawings/tools/brushes";
import { factoryDrawing, geom, renderLog } from "./drawings/harness";

const A = (x: number, y: number): Anchor => geom.toData({ x, y });
const stroke = (type: string, pts: Anchor[]): Drawing => ({ ...factoryDrawing(getTool(type)!), points: pts, anchors: [] });
const hit = (d: Drawing, x: number, y: number) => getTool(d.type)!.hitTest(d, geom, x, y, 3);
const line = [A(100, 300), A(200, 300), A(300, 300), A(400, 300)];

describe("brushes", () => {
  it("are freehand tools", () => {
    expect(BRUSHES.map((t) => [t.type, t.anchors])).toEqual([
      ["brush", "freehand"],
      ["highlighter", "freehand"],
    ]);
  });
  it("freehand creation simplifies the pointer path", () => {
    const tool = getTool("brush")!;
    let s = creationDown(IDLE, tool, A(100, 300), { x: 100, y: 300 }).state;
    for (let x = 105; x <= 300; x += 5) s = creationMove(s, A(x, 300), { x, y: 300 }).state;
    const r = creationUp(s, A(300, 300), { x: 300, y: 300 });
    expect(r.done?.points?.length).toBe(2);
  });
  it("brush hit within its width, highlighter within its wide stroke", () => {
    const b = stroke("brush", line);
    expect(hit(b, 250, 303)).toBe(true);
    expect(hit(b, 250, 310)).toBe(false);
    const h = stroke("highlighter", line);
    expect(hit(h, 250, 310)).toBe(true);
    expect(hit(h, 250, 320)).toBe(false);
    expect(hit({ ...b, props: { ...b.props, fillBackground: true }, points: [A(100, 300), A(300, 300), A(200, 100)] }, 200, 250)).toBe(true);
  });
  it("highlighter is wide and translucent by default", () => {
    const def = getTool("highlighter")!;
    expect(def.defaults.width).toBe(20);
    expect(def.defaults.color).toMatch(/^#[0-9a-f]{8}$/);
    const log = JSON.stringify(renderLog(stroke("highlighter", line)));
    expect(log).toContain("lineWidth");
  });
  it("handles are the stroke ends and drag them", () => {
    const def = getTool("brush")!;
    const b = stroke("brush", line);
    expect(def.handles(b, geom)).toEqual([
      { x: 100, y: 300 },
      { x: 400, y: 300 },
    ]);
    const moved = def.onAnchorDrag!(b, 1, A(400, 200), geom, {});
    expect(moved.points![3]).toEqual(A(400, 200));
  });
});
