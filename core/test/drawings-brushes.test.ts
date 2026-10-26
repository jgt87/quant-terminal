import { describe, expect, it } from "vitest";
import { simplifyPath } from "../src/drawings/edit";
import { brushChaikin, brushDistance, brushHit, brushInsideArea, brushSimplify, brushSmooth, brushSmoothPasses } from "../src/drawings/brushes";

describe("RDP simplification", () => {
  it("drops points close to the line and keeps corners", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0.2 },
      { x: 2, y: -0.1 },
      { x: 3, y: 0 },
      { x: 3, y: 5 },
    ];
    expect(simplifyPath(pts, 1)).toEqual([pts[0], pts[3], pts[4]]);
    expect(simplifyPath(pts.slice(0, 2), 1)).toHaveLength(2);
  });
  it("epsilon grows with smoothing", () => {
    const zig = Array.from({ length: 20 }, (_, i) => ({ x: i * 2, y: i % 2 ? 1.5 : 0 }));
    expect(brushSimplify(zig, 0).length).toBeGreaterThan(brushSimplify(zig, 5).length);
    expect(brushSimplify(zig, 5)).toHaveLength(2);
  });
});

describe("smoothing", () => {
  it("chaikin keeps ends and cuts corners", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const s = brushChaikin(pts);
    expect(s[0]).toEqual(pts[0]);
    expect(s[s.length - 1]).toEqual(pts[2]);
    expect(s.some((p) => p.x === 10 && p.y === 0)).toBe(false);
    expect(brushSmoothPasses(5)).toBe(2);
    expect(brushSmoothPasses(0)).toBe(0);
    expect(brushSmooth(pts, 0)).toEqual(pts);
    expect(brushSmooth(pts, 5).length).toBeGreaterThan(brushSmooth(pts, 2).length);
  });
});

describe("stroke hit", () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];
  it("half width plus tolerance", () => {
    expect(brushDistance(50, 3, pts)).toBe(3);
    expect(brushHit(50, 12, pts, 20, 3)).toBe(true);
    expect(brushHit(50, 14, pts, 20, 3)).toBe(false);
    expect(brushHit(50, 14, pts, 2, 3)).toBe(false);
  });
  it("filled area", () => {
    expect(brushInsideArea(70, 30, pts)).toBe(true);
    expect(brushHit(70, 30, pts, 2, 3, true)).toBe(true);
    expect(brushHit(70, 30, pts, 2, 3, false)).toBe(false);
    expect(brushHit(20, 80, pts, 2, 3, true)).toBe(false);
  });
});
