import { describe, expect, it } from "vitest";
import {
  GANN_FAN_RATIOS,
  GANN_SQUARE_UNITS,
  gannArcRadius,
  gannAt,
  gannBoxLevels,
  gannConstrainRatio,
  gannFanPoint,
  gannFanSlope,
  gannFixedCorner,
  gannInsideBox,
  gannPolylineDistance,
  gannPriceBarRatio,
  gannQuarterArc,
  gannRatioLabel,
  gannSquareFanEnd,
  gannSquareFrame,
} from "../src/drawings/gann";

const a = { time: 0, price: 100 };
const b = { time: 600, price: 160 }; // 10 bars of 60 s, +60 price

describe("Gann fan", () => {
  it("1x1 runs through the second anchor; slopes scale with the ratio", () => {
    expect(gannFanPoint(a, b, 1)).toEqual(b);
    const base = gannFanSlope(a, b, 1);
    expect(base).toBeCloseTo(0.1);
    for (const r of GANN_FAN_RATIOS) expect(gannFanSlope(a, b, r)).toBeCloseTo(base * r);
  });

  it("shallow lines end on the far time edge, steep lines on the far price edge", () => {
    expect(gannFanPoint(a, b, 0.5)).toEqual({ time: 600, price: 130 });
    expect(gannFanPoint(a, b, 2)).toEqual({ time: 300, price: 160 });
    expect(gannFanPoint(a, b, 8)).toEqual({ time: 75, price: 160 });
    // Every end point lies on the ray of its slope.
    for (const r of GANN_FAN_RATIOS) {
      const p = gannFanPoint(a, b, r);
      expect((p.price - a.price) / (p.time - a.time)).toBeCloseTo(gannFanSlope(a, b, r));
    }
  });

  it("works for falling fans", () => {
    const down = { time: 600, price: 40 };
    expect(gannFanPoint(a, down, 1 / 4)).toEqual({ time: 600, price: 85 });
    expect(gannFanSlope(a, down, 2)).toBeCloseTo(-0.2);
  });

  it("labels ratios as P/T", () => {
    expect(GANN_FAN_RATIOS.map((r) => gannRatioLabel(r))).toEqual(["1/8", "1/4", "1/3", "1/2", "1/1", "2/1", "3/1", "4/1", "8/1"]);
    expect(gannRatioLabel(0.5, "x")).toBe("1x2");
  });
});

describe("price/bar ratio", () => {
  it("measures price per bar", () => {
    expect(gannPriceBarRatio(a, b, 60)).toBeCloseTo(6);
    expect(gannPriceBarRatio(a, { time: 0, price: 120 }, 60)).toBe(0);
  });

  it("constrains the second corner to a fixed ratio, keeping direction", () => {
    expect(gannConstrainRatio(a, b, 2, 60)).toEqual({ time: 600, price: 120 });
    expect(gannConstrainRatio(a, { time: 600, price: 50 }, 2, 60)).toEqual({ time: 600, price: 80 });
    expect(gannConstrainRatio(a, b, null, 60)).toBe(b);
    expect(gannConstrainRatio(a, b, 0, 60)).toBe(b);
  });
});

describe("Gann square grid", () => {
  it("divides the box into 5 x 5 units from the origin", () => {
    const f = gannSquareFrame(a, b);
    expect(GANN_SQUARE_UNITS).toBe(5);
    expect(f.unitTime).toBe(120);
    expect(f.unitPrice).toBe(12);
    expect(gannAt(f, 5, 5)).toEqual(b);
    expect(gannAt(f, 2, 3)).toEqual({ time: 240, price: 136 });
  });

  it("reverse moves the origin to the opposite price edge", () => {
    const f = gannSquareFrame(a, b, true);
    expect(f.origin).toEqual({ time: 0, price: 160 });
    expect(f.unitPrice).toBe(-12);
    expect(gannAt(f, 5, 5)).toEqual({ time: 600, price: 100 });
  });

  it("fan lines end on the box edge", () => {
    expect(gannSquareFanEnd(1, 1)).toEqual({ u: 5, v: 5 });
    expect(gannSquareFanEnd(2, 1)).toEqual({ u: 2.5, v: 5 });
    expect(gannSquareFanEnd(1, 8)).toEqual({ u: 5, v: 0.625 });
  });

  it("arc radii follow the grid points", () => {
    expect(gannArcRadius(1, 0)).toBe(1);
    expect(gannArcRadius(1, 1)).toBeCloseTo(Math.SQRT2);
    expect(gannArcRadius(2, 1)).toBeCloseTo(Math.sqrt(5));
  });

  it("quarter arcs stay inside the box and split when clipped", () => {
    const runs = gannQuarterArc({ x: 0, y: 0 }, 100, 100, 1, -1, 100, 100);
    expect(runs).toHaveLength(1);
    for (const p of runs[0]) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(100);
      expect(p.y).toBeLessThanOrEqual(0);
    }
    // Radius beyond the box: the middle of the arc is cut off by both edges.
    const clipped = gannQuarterArc({ x: 0, y: 0 }, 130, 130, 1, 1, 100, 100);
    for (const run of clipped) for (const p of run) expect(Math.max(p.x, p.y)).toBeLessThanOrEqual(100.5);
    expect(clipped.flat().length).toBeLessThan(49);
  });

  it("the fixed square stays square on screen", () => {
    expect(gannFixedCorner({ x: 100, y: 300 }, { x: 250, y: 200 })).toEqual({ x: 250, y: 150 });
    expect(gannFixedCorner({ x: 100, y: 300 }, { x: 40, y: 320 })).toEqual({ x: 40, y: 360 });
  });
});

describe("Gann box", () => {
  it("places price and time levels at coefficients (reverse flips)", () => {
    const lv = gannBoxLevels(a, b, [0, 0.25, 1], [0, 0.5, 1]);
    expect(lv.prices).toEqual([100, 115, 160]);
    expect(lv.times).toEqual([0, 300, 600]);
    const rv = gannBoxLevels(a, b, [0, 0.25], [0.25], true);
    expect(rv.prices).toEqual([160, 145]);
    expect(rv.times).toEqual([450]);
  });
});

describe("pixel helpers", () => {
  it("distance to a polyline and box containment", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(gannPolylineDistance(50, 5, pts)).toBeCloseTo(5);
    expect(gannPolylineDistance(110, 50, pts)).toBeCloseTo(10);
    expect(gannInsideBox(50, 50, { x: 0, y: 100 }, { x: 100, y: 0 })).toBe(true);
    expect(gannInsideBox(105, 50, { x: 0, y: 100 }, { x: 100, y: 0 }, 4)).toBe(false);
    expect(gannInsideBox(103, 50, { x: 0, y: 100 }, { x: 100, y: 0 }, 4)).toBe(true);
  });
});
