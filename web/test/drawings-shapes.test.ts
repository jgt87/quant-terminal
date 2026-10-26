// Shapes family: hit / miss on outlines and filled interiors, handles, curve control points,
// placing previews and icons.

import { describe, expect, it } from "vitest";
import type { Anchor, Drawing } from "@qt/core";
import { getTool } from "../src/chart/drawings/registry";
import { SHAPES } from "../src/chart/drawings/tools/shapes";
import { factoryDrawing, geom, renderLog } from "./drawings/harness";

const A = (x: number, y: number): Anchor => geom.toData({ x, y });
const d = (type: string, anchors: Anchor[], extra: Partial<Drawing> = {}): Drawing => {
  const base = factoryDrawing(getTool(type)!);
  return { ...base, anchors, ...extra, text: "" };
};
const hit = (dr: Drawing, x: number, y: number) => getTool(dr.type)!.hitTest(dr, geom, x, y, 6);
const noFill = (dr: Drawing): Drawing => ({ ...dr, props: { ...dr.props, fillBackground: false } });

describe("shapes registry", () => {
  it("registers every shape with its own icon in flyout order", () => {
    expect(SHAPES[0].type).toBe("rectangle");
    expect(SHAPES.slice(1).map((t) => t.catalogType)).toEqual([
      "LineToolRotatedRectangle",
      "LineToolPath",
      "LineToolCircle",
      "LineToolEllipse",
      "LineToolPolyline",
      "LineToolTriangle",
      "LineToolArc",
      "LineToolBezierQuadro",
      "LineToolBezierCubic",
    ]);
    for (const t of SHAPES.slice(1)) expect(t.iconPath, t.type).toMatch(/^M/);
  });
});

describe("shape hit-tests", () => {
  it("rotated rectangle: border, inside only when filled", () => {
    const r = d("rotatedRectangle", [A(100, 300), A(300, 300), A(200, 200)]);
    expect(hit(r, 200, 300)).toBe(true);
    expect(hit(r, 200, 250)).toBe(true);
    expect(hit(noFill(r), 200, 250)).toBe(false);
    expect(hit(r, 200, 150)).toBe(false);
    // Width handle sits on the far side's middle.
    expect(getTool("rotatedRectangle")!.handles(r, geom)[2]).toEqual({ x: 200, y: 200 });
  });
  it("circle and ellipse", () => {
    const c = d("circle", [A(200, 200), A(250, 200)]);
    expect(hit(c, 200, 150)).toBe(true);
    expect(hit(c, 200, 200)).toBe(true);
    expect(hit(noFill(c), 200, 200)).toBe(false);
    expect(hit(c, 300, 300)).toBe(false);
    const e = d("ellipse", [A(100, 200), A(300, 200), A(200, 160)]);
    expect(hit(e, 200, 160)).toBe(true);
    expect(hit(e, 200, 200)).toBe(true);
    expect(hit(e, 200, 140)).toBe(false);
    expect(getTool("ellipse")!.handles(e, geom)[2].y).toBeCloseTo(240, 6);
  });
  it("triangle, polyline (filled) and path (open)", () => {
    const t = d("triangle", [A(100, 300), A(300, 300), A(200, 100)]);
    expect(hit(t, 200, 250)).toBe(true);
    expect(hit(noFill(t), 200, 250)).toBe(false);
    expect(hit(t, 50, 50)).toBe(false);
    const pts = [A(100, 300), A(300, 300), A(200, 100)];
    const pl = d("polyline", [], { points: pts });
    expect(hit(pl, 150, 200)).toBe(true); // closing edge
    expect(hit(pl, 200, 250)).toBe(true);
    const p = d("path", [], { points: pts });
    expect(hit(p, 200, 300)).toBe(true);
    expect(hit(p, 150, 200)).toBe(false); // no closing edge on an open path
    expect(hit(p, 200, 250)).toBe(false);
  });
  it("arc through three points", () => {
    const a = d("arc", [A(100, 300), A(300, 300), A(200, 200)]);
    expect(hit(a, 200, 200)).toBe(true);
    expect(hit(a, 200, 260)).toBe(true);
    expect(hit(noFill(a), 200, 260)).toBe(false);
    expect(hit(a, 200, 400)).toBe(false);
  });
});

describe("curves", () => {
  it("derived control bulge, hit on the curve, stored on handle drag", () => {
    const def = getTool("curve")!;
    const c = d("curve", [A(100, 300), A(300, 300)]);
    const hs = def.handles(c, geom);
    expect(hs).toHaveLength(3);
    expect(hs[2]).toEqual({ x: 200, y: 250 });
    expect(hit(c, 200, 275)).toBe(true);
    expect(hit(c, 200, 300)).toBe(false);
    const moved = def.onAnchorDrag!(c, 2, A(200, 100), geom, {});
    expect(moved.anchors).toHaveLength(3);
    expect(hit(moved, 200, 200)).toBe(true);
  });
  it("double curve keeps the untouched control when one is dragged", () => {
    const def = getTool("doubleCurve")!;
    const c = d("doubleCurve", [A(100, 300), A(400, 300)]);
    const before = def.handles(c, geom);
    const moved = def.onAnchorDrag!(c, 3, A(330, 400), geom, {});
    expect(moved.anchors).toHaveLength(4);
    const after = def.handles(moved, geom);
    expect(after[2].x).toBeCloseTo(before[2].x, 6);
    expect(after[2].y).toBeCloseTo(before[2].y, 6);
    expect(after[3]).toEqual({ x: 330, y: 400 });
  });
  it("extensions extend the hit area", () => {
    const c = d("curve", [A(100, 300), A(300, 300)]);
    const ext = { ...c, props: { ...c.props, extendRight: true } };
    expect(hit(c, 400, 400)).toBe(false);
    const end = getTool("curve")!.handles(c, geom)[1];
    // Tangent at the end continues away from the control (200,250) -> (300,300).
    expect(hit(ext, end.x + 100, end.y + 50)).toBe(true);
  });
});

describe("placing previews render without throwing", () => {
  it("two anchors of three-anchor shapes", () => {
    for (const type of ["rotatedRectangle", "ellipse", "triangle", "arc"]) {
      const dr = d(type, [A(100, 300), A(300, 300)]);
      expect(renderLog(dr).length, type).toBeGreaterThan(0);
    }
  });
});
