import { describe, expect, it } from "vitest";
import { arrowHitPolygon, arrowLineDistance, arrowMarkerPolygon, arrowMarkLabelAt, arrowMarkPolygon, arrowPointInPolygon } from "../src/drawings/arrows";

describe("arrow line", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };
  it("segment with optional extensions", () => {
    expect(arrowLineDistance(5, 3, a, b, false, false)).toBe(3);
    expect(arrowLineDistance(20, 0, a, b, false, false)).toBe(10);
    expect(arrowLineDistance(20, 0, a, b, false, true)).toBe(0);
    expect(arrowLineDistance(-20, 0, a, b, true, false)).toBe(0);
    expect(arrowLineDistance(-20, 1, a, b, true, true)).toBe(1);
  });
});

describe("arrow marker", () => {
  it("block arrow from tail to tip", () => {
    const poly = arrowMarkerPolygon({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(poly).toHaveLength(7);
    expect(poly[0]).toEqual({ x: 100, y: 0 });
    expect(arrowPointInPolygon(50, 0, poly)).toBe(true);
    expect(arrowPointInPolygon(50, 40, poly)).toBe(false);
    expect(arrowHitPolygon(101, 0, poly, 2)).toBe(true);
    expect(arrowHitPolygon(130, 0, poly, 2)).toBe(false);
    expect(Math.abs(poly[1].y)).toBeGreaterThan(Math.abs(poly[2].y));
  });
});

describe("arrow marks", () => {
  const p = { x: 100, y: 100 };
  it("point at the anchor from the expected side", () => {
    const up = arrowMarkPolygon(p, "up");
    expect(up[0].y).toBeGreaterThan(p.y);
    expect(Math.max(...up.map((q) => q.y))).toBeGreaterThan(p.y + 20);
    expect(Math.min(...arrowMarkPolygon(p, "down").map((q) => q.y))).toBeLessThan(p.y - 20);
    expect(Math.max(...arrowMarkPolygon(p, "left").map((q) => q.x))).toBeGreaterThan(p.x + 20);
    expect(Math.min(...arrowMarkPolygon(p, "right").map((q) => q.x))).toBeLessThan(p.x - 20);
    expect(arrowHitPolygon(100, 112, up, 1)).toBe(true);
    expect(arrowHitPolygon(100, 88, up, 1)).toBe(false);
  });
  it("labels go beyond the tail", () => {
    expect(arrowMarkLabelAt(p, "up")).toMatchObject({ x: 100, baseline: "top" });
    expect(arrowMarkLabelAt(p, "down").y).toBeLessThan(100);
    expect(arrowMarkLabelAt(p, "left").align).toBe("left");
    expect(arrowMarkLabelAt(p, "right").align).toBe("right");
  });
});
