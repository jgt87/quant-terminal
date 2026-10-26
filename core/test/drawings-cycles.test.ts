import { describe, expect, it } from "vitest";
import { cycleArcPoints, cyclePositions, cyclicLineXs, distanceToCycleArc, distanceToSine, sinePoints, sineY, timeCycleArcs } from "../src/drawings/cycles";

describe("cycle spacing", () => {
  it("repeats from x0 by step inside the range", () => {
    expect(cyclePositions(100, 50, 0, 300)).toEqual([100, 150, 200, 250, 300]);
    expect(cyclePositions(100, -40, 0, 300)).toEqual([100, 60, 20]);
    expect(cyclePositions(-100, 50, 0, 120)).toEqual([0, 50, 100]);
    expect(cyclePositions(500, -100, 0, 250)).toEqual([200, 100, 0]);
    expect(cyclePositions(10, 0, 0, 100)).toEqual([10]);
    expect(cyclePositions(10, 1, 0, 1e9, 5)).toHaveLength(5);
  });

  it("cyclic lines start at a and repeat toward b", () => {
    expect(cyclicLineXs({ x: 100, y: 0 }, { x: 160, y: 50 }, 400)).toEqual([100, 160, 220, 280, 340, 400]);
    expect(cyclicLineXs({ x: 300, y: 0 }, { x: 200, y: 0 }, 400)).toEqual([300, 200, 100, 0]);
  });
});

describe("time cycles", () => {
  it("half circles when b is level with a", () => {
    const arcs = timeCycleArcs({ x: 100, y: 200 }, { x: 140, y: 200 }, 300);
    expect(arcs[0]).toEqual({ cx: 120, cy: 200, rx: 20, ry: 20, up: true });
    expect(arcs.map((a) => a.cx)).toEqual([120, 160, 200, 240, 280, 320]);
    expect(arcs.every((a) => a.cy === 200)).toBe(true);
  });

  it("height and direction from b", () => {
    const [up] = timeCycleArcs({ x: 0, y: 200 }, { x: 100, y: 150 }, 300);
    expect(up.ry).toBe(50);
    expect(up.up).toBe(true);
    const [down] = timeCycleArcs({ x: 0, y: 200 }, { x: 100, y: 230 }, 300);
    expect(down.up).toBe(false);
    expect(timeCycleArcs({ x: 0, y: 0 }, { x: 0, y: 10 }, 300)).toEqual([]);
  });

  it("arc points and distance", () => {
    const arc = { cx: 50, cy: 100, rx: 50, ry: 30, up: true };
    const pts = cycleArcPoints(arc, 4);
    expect(pts[0].x).toBeCloseTo(0);
    expect(pts[2]).toEqual({ x: expect.closeTo(50), y: expect.closeTo(70) });
    expect(pts[4].x).toBeCloseTo(100);
    expect(distanceToCycleArc(arc, 50, 70)).toBeLessThan(0.5);
    expect(distanceToCycleArc(arc, 50, 100)).toBeGreaterThan(25);
  });
});

describe("sine line", () => {
  const a = { x: 100, y: 50 };
  const b = { x: 200, y: 150 };
  it("passes through both anchors and repeats every 2 half-periods", () => {
    expect(sineY(a, b, 100)).toBeCloseTo(50);
    expect(sineY(a, b, 200)).toBeCloseTo(150);
    expect(sineY(a, b, 150)).toBeCloseTo(100);
    expect(sineY(a, b, 300)).toBeCloseTo(50);
    expect(sineY(a, b, 0)).toBeCloseTo(150);
    expect(sineY(a, a, 10)).toBeNull();
  });
  it("samples and hit distance", () => {
    const pts = sinePoints(a, b, 0, 400, 2);
    expect(pts[0].x).toBe(0);
    expect(pts[pts.length - 1].x).toBeGreaterThanOrEqual(400);
    expect(distanceToSine(a, b, 150, 100)).toBeLessThan(1);
    expect(distanceToSine(a, b, 150, 20)).toBeGreaterThan(20);
  });
});
