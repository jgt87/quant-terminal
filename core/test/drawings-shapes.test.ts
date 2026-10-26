import { describe, expect, it } from "vitest";
import {
  shapeArc3,
  shapeArcPoints,
  shapeBezierPoints,
  shapeCircle,
  shapeCircleThrough,
  shapeCubicPoint,
  shapeDefaultControls,
  shapeDistanceToArc,
  shapeDistanceToPolyline,
  shapeEllipse3,
  shapeEllipsePoint,
  shapeHitArc,
  shapeHitBezier,
  shapeHitEllipse,
  shapeHitPolygon,
  shapePointInPolygon,
  shapeQuadPoint,
  shapeRotatedRect,
  shapeRotatedRectWidthHandle,
} from "../src/drawings/shapes";

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe("polygons", () => {
  const sq = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  it("point in polygon and outline distance", () => {
    expect(shapePointInPolygon(5, 5, sq)).toBe(true);
    expect(shapePointInPolygon(15, 5, sq)).toBe(false);
    expect(shapeDistanceToPolyline(5, -3, sq, true)).toBe(3);
    expect(shapeDistanceToPolyline(-3, 5, sq, true)).toBe(3);
    // Open: the closing edge 3→0 does not exist.
    expect(shapeDistanceToPolyline(-3, 5, sq, false)).toBeCloseTo(Math.hypot(3, 5), 6);
  });
  it("filled interiors hit only when filled", () => {
    expect(shapeHitPolygon(5, 5, sq, 2, { closed: true, filled: true })).toBe(true);
    expect(shapeHitPolygon(5, 5, sq, 2, { closed: true, filled: false })).toBe(false);
    expect(shapeHitPolygon(10, 5, sq, 2, { closed: true, filled: false })).toBe(true);
    expect(shapeHitPolygon(30, 30, sq, 2, { closed: true, filled: true })).toBe(false);
  });
});

describe("rotated rectangle", () => {
  it("builds corners from a side and a width point", () => {
    const r = shapeRotatedRect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 3, y: 5 });
    close(r[2], { x: 10, y: 5 });
    close(r[3], { x: 0, y: 5 });
    const tilted = shapeRotatedRect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 });
    expect(Math.hypot(tilted[3].x, tilted[3].y)).toBeCloseTo(10 / Math.SQRT2, 6);
    close(shapeRotatedRectWidthHandle({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 3, y: 5 }), { x: 5, y: 5 });
  });
  it("degenerate side keeps the points", () => {
    expect(shapeRotatedRect({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 5, y: 5 })[0]).toEqual({ x: 1, y: 1 });
  });
});

describe("circle and ellipse", () => {
  it("circle hit on outline, inside only when filled", () => {
    const c = shapeCircle({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(c.rx).toBe(10);
    expect(shapeHitEllipse(0, 10.5, c, 1, false)).toBe(true);
    expect(shapeHitEllipse(0, 0, c, 1, false)).toBe(false);
    expect(shapeHitEllipse(0, 0, c, 1, true)).toBe(true);
    expect(shapeHitEllipse(20, 0, c, 1, true)).toBe(false);
  });
  it("ellipse from three points and rotation", () => {
    const e = shapeEllipse3({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 4 });
    expect(e).toMatchObject({ cx: 0, cy: 0, rx: 10, ry: 4 });
    close(shapeEllipsePoint(e, Math.PI / 2), { x: 0, y: 4 });
    expect(shapeHitEllipse(0, 4, e, 1, false)).toBe(true);
    expect(shapeHitEllipse(0, 0, e, 1, false)).toBe(false);
    expect(shapeHitEllipse(0, 0, e, 1, true)).toBe(true);
    expect(shapeHitEllipse(9, 3.9, e, 1, true)).toBe(false);
    const r = shapeEllipse3({ x: 0, y: -10 }, { x: 0, y: 10 }, { x: 4, y: 0 });
    expect(r.rotation).toBeCloseTo(Math.PI / 2, 6);
    expect(shapeHitEllipse(0, 10, r, 1, false)).toBe(true);
    expect(shapeHitEllipse(10, 0, r, 1, false)).toBe(false);
  });
});

describe("arc through three points", () => {
  it("circumcircle", () => {
    const c = shapeCircleThrough({ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 })!;
    expect(c.cx).toBeCloseTo(0, 9);
    expect(c.cy).toBeCloseTo(0, 9);
    expect(c.r).toBeCloseTo(1, 9);
    expect(shapeCircleThrough({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull();
  });
  it("arc passes through the middle point and not the other half", () => {
    const arc = shapeArc3({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: -10 })!;
    const pts = shapeArcPoints(arc, 40);
    expect(pts.some((p) => Math.abs(p.x) < 1 && Math.abs(p.y + 10) < 0.5)).toBe(true);
    expect(pts.every((p) => p.y <= 1e-6)).toBe(true);
    expect(shapeDistanceToArc(0, -10, arc)).toBeCloseTo(0, 6);
    expect(shapeDistanceToArc(0, 10, arc)).toBeGreaterThan(5);
    const lower = shapeArc3({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 })!;
    expect(shapeArcPoints(lower, 40).every((p) => p.y >= -1e-6)).toBe(true);
  });
  it("arc hit: curve, filled segment, collinear chord", () => {
    const a = { x: -10, y: 0 };
    const b = { x: 10, y: 0 };
    const t = { x: 0, y: -10 };
    expect(shapeHitArc(0, -10, a, b, t, 2, false)).toBe(true);
    expect(shapeHitArc(0, -5, a, b, t, 2, false)).toBe(false);
    expect(shapeHitArc(0, -5, a, b, t, 2, true)).toBe(true);
    expect(shapeHitArc(0, 5, a, b, t, 2, true)).toBe(false);
    expect(shapeHitArc(0, 0, a, b, { x: 5, y: 0 }, 2, false)).toBe(true);
  });
});

describe("Bézier curves", () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 10, y: 0 };
  it("evaluates quadratic and cubic", () => {
    close(shapeQuadPoint(p0, { x: 5, y: 10 }, p1, 0.5), { x: 5, y: 5 });
    close(shapeQuadPoint(p0, { x: 5, y: 10 }, p1, 0), p0);
    close(shapeCubicPoint(p0, { x: 0, y: 10 }, { x: 10, y: 10 }, p1, 0.5), { x: 5, y: 7.5 });
    close(shapeCubicPoint(p0, { x: 0, y: 10 }, { x: 10, y: 10 }, p1, 1), p1);
    expect(shapeBezierPoints(p0, [{ x: 5, y: 10 }], p1, 10)).toHaveLength(11);
  });
  it("hit by sampling", () => {
    expect(shapeHitBezier(5, 5, p0, [{ x: 5, y: 10 }], p1, 1)).toBe(true);
    expect(shapeHitBezier(5, 2, p0, [{ x: 5, y: 10 }], p1, 1)).toBe(false);
    expect(shapeHitBezier(5, 2, p0, [{ x: 5, y: 10 }], p1, 1, true)).toBe(true);
    expect(shapeHitBezier(5, 7.5, p0, [{ x: 0, y: 10 }, { x: 10, y: 10 }], p1, 1)).toBe(true);
  });
  it("default controls bulge up (screen) / form an S", () => {
    const [q] = shapeDefaultControls(p0, p1, false);
    expect(q.x).toBeCloseTo(5, 9);
    expect(q.y).toBeCloseTo(-2.5, 9);
    const [c1, c2] = shapeDefaultControls(p0, p1, true);
    expect(c1.y).toBeLessThan(0);
    expect(c2.y).toBeGreaterThan(0);
  });
});
