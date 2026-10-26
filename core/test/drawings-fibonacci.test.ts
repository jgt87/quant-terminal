import { describe, expect, it } from "vitest";
import {
  FIB_PHI,
  fibArcLevels,
  fibAspectScales,
  fibBarOffsets,
  fibChannelLevels,
  fibChannelOffset,
  fibCircleLevels,
  fibCoeffLabel,
  fibDistanceToEllipse,
  fibDistanceToPolyline,
  fibDistanceToRay,
  fibEllipsePoint,
  fibExtensionLevels,
  fibFanBox,
  fibLevelEllipse,
  fibLevelPrice,
  fibonacciOffsets,
  fibPitchfanRays,
  fibRaySlope,
  fibReverseCoeff,
  fibSpeedFanRays,
  fibSpiralRadius,
  fibTimeZoneXs,
  fibTrendTimeXs,
  fibWedgeLevels,
  goldenSpiral,
} from "../src/drawings/fibonacci";

const P = (x: number, y: number) => ({ x, y });
/** An affine projection (data → px) with different x and y scales, y flipped. */
const proj = (p: { x: number; y: number }) => ({ x: 40 + p.x * 7, y: 500 - p.y * 0.25 });

describe("fib extension", () => {
  it("projects the A→B move from C", () => {
    const lv = fibExtensionLevels({ time: 0, price: 100 }, { time: 10, price: 200 }, { time: 20, price: 150 }, [0, 0.618, 1, 1.618]);
    expect(lv.map((l) => l.price)).toEqual([150, 150 + 61.8, 250, 150 + 161.8]);
  });
  it("downward move projects downwards; reverse swaps the 0 and 1 ends", () => {
    const a = { time: 0, price: 200 };
    const b = { time: 1, price: 100 };
    const c = { time: 2, price: 150 };
    expect(fibExtensionLevels(a, b, c, [1]).map((l) => l.price)).toEqual([50]);
    expect(fibExtensionLevels(a, b, c, [0, 1], { reverse: true }).map((l) => l.price)).toEqual([50, 150]);
  });
  it("log scale extends multiplicatively", () => {
    const lv = fibExtensionLevels({ time: 0, price: 10 }, { time: 1, price: 20 }, { time: 2, price: 15 }, [1, 2], { log: true });
    expect(lv[0].price).toBeCloseTo(30, 9);
    expect(lv[1].price).toBeCloseTo(60, 9);
    expect(fibLevelPrice(15, 10, 20, 0.5, true)).toBeCloseTo(15 * Math.SQRT2, 9);
    // non-positive prices fall back to linear
    expect(fibLevelPrice(-1, 10, 20, 1, true)).toBe(9);
  });
  it("reverseCoeff", () => {
    expect(fibReverseCoeff(0.236, false)).toBe(0.236);
    expect(fibReverseCoeff(0.25, true)).toBe(0.75);
  });
});

describe("fib channel", () => {
  it("parallel levels offset towards the third anchor", () => {
    const a = P(0, 100);
    const b = P(100, 50);
    const c = P(50, 175);
    expect(fibChannelOffset(a, b, c)).toBe(100);
    const lv = fibChannelLevels(a, b, c, [0, 0.5, 1]);
    expect(lv[0].p0).toEqual(a);
    expect(lv[1].p0).toEqual(P(0, 150));
    expect(lv[2].p1).toEqual(P(100, 150));
    // slopes all equal the base slope
    for (const l of lv) expect((l.p1.y - l.p0.y) / (l.p1.x - l.p0.x)).toBe(-0.5);
    expect(fibChannelLevels(a, b, c, [0], true)[0].p0).toEqual(P(0, 200));
  });
  it("vertical base line uses no slope", () => {
    expect(fibChannelOffset(P(0, 0), P(0, 10), P(5, 30))).toBe(30);
  });
});

describe("time-based levels", () => {
  it("Fibonacci sequence offsets", () => {
    expect(fibonacciOffsets(11)).toEqual([0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]);
    expect(fibonacciOffsets(0)).toEqual([]);
    expect(fibonacciOffsets(1)).toEqual([0]);
  });
  it("time zones at fib-numbered bar offsets", () => {
    expect(fibTimeZoneXs(100, 110, [0, 1, 2, 3, 5, 8])).toEqual([100, 110, 120, 130, 150, 180]);
    expect(fibBarOffsets(4, fibonacciOffsets(6))).toEqual([0, 4, 8, 12, 20, 32]);
    expect(fibBarOffsets(10, [0.382, 0.618])).toEqual([4, 6]);
  });
  it("trend-based time projects the A→B span from C", () => {
    expect(fibTrendTimeXs(0, 10, 30, [0, 0.382, 1, 1.618])).toEqual([30, 33.82, 40, 46.18]);
    expect(fibTrendTimeXs(10, 0, 30, [1])).toEqual([20]);
  });
});

describe("speed resistance fan", () => {
  it("rays to the far edges at level fractions, slopes scale with the level", () => {
    const rays = fibSpeedFanRays(P(0, 0), P(100, -50), [0.5, 1], [0.5]);
    expect(rays[0]).toMatchObject({ kind: "price", coeff: 0.5, to: P(100, -25) });
    expect(fibRaySlope(rays[0])).toBe(-0.25);
    expect(fibRaySlope(rays[1])).toBe(-0.5);
    expect(rays[2]).toMatchObject({ kind: "time", to: P(50, -50) });
    expect(fibRaySlope(rays[2])).toBe(-1);
    expect(fibRaySlope({ from: P(0, 0), to: P(0, 5) })).toBe(Infinity);
  });
  it("reverse mirrors the box vertically", () => {
    expect(fibFanBox(P(0, 0), P(10, 20), true)).toEqual({ o: P(0, 20), q: P(10, 0) });
    const r = fibSpeedFanRays(P(0, 0), P(10, 20), [1], [], true)[0];
    expect(r.from).toEqual(P(0, 20));
    expect(r.to).toEqual(P(10, 0));
  });
  it("ray distance", () => {
    expect(fibDistanceToRay(5, 3, P(0, 0), P(10, 0))).toBe(3);
    expect(fibDistanceToRay(-4, 3, P(0, 0), P(10, 0))).toBe(5);
    expect(fibDistanceToRay(3, 4, P(0, 0), P(0, 0))).toBe(5);
  });
});

describe("round shapes keep the anchors' aspect", () => {
  it("aspect scales", () => {
    expect(fibAspectScales(10, -4)).toEqual({ sx: 10, sy: 4 });
    expect(fibAspectScales(0, 5)).toEqual({ sx: 5, sy: 5 });
    expect(fibAspectScales(0, 0)).toEqual({ sx: 1, sy: 1 });
  });
  it("level ellipse passes through the anchor and scales with the coefficient", () => {
    const e = fibLevelEllipse(P(0, 0), P(30, 4), 1);
    // point (30, 4) lies on the ellipse
    expect((30 / e.rx) ** 2 + (4 / e.ry) ** 2).toBeCloseTo(1, 12);
    expect(e.rx / e.ry).toBeCloseTo(30 / 4, 12);
    const h = fibLevelEllipse(P(0, 0), P(30, 4), 0.5);
    expect(h.rx).toBeCloseTo(e.rx / 2, 12);
    // the 0.5 ellipse passes through the midpoint of the anchor vector
    expect((15 / h.rx) ** 2 + (2 / h.ry) ** 2).toBeCloseTo(1, 12);
  });
  it("circles in data space re-project exactly through the current scales", () => {
    const a = P(10, 2000);
    const b = P(25, 2100);
    const data = fibCircleLevels(a, b, [0.618, 1]);
    const px = fibCircleLevels(proj(a), proj(b), [0.618, 1]);
    for (let i = 0; i < data.length; i++) {
      for (const t of [0, 0.7, 2, 4]) {
        const q = proj(fibEllipsePoint(data[i], t));
        // the projected data-space point lies on the pixel-space ellipse
        const e = px[i];
        expect(((q.x - e.cx) / e.rx) ** 2 + ((q.y - e.cy) / e.ry) ** 2).toBeCloseTo(1, 9);
      }
    }
    // level-1 circle passes through the second anchor in both spaces
    const e1 = px[1];
    const pb = proj(b);
    expect(((pb.x - e1.cx) / e1.rx) ** 2 + ((pb.y - e1.cy) / e1.ry) ** 2).toBeCloseTo(1, 9);
  });
  it("arcs: centered at the second anchor, level 1 through the first, half towards it", () => {
    const arcs = fibArcLevels(P(0, 100), P(50, 0), [0.5, 1]);
    expect(arcs[1].cx).toBe(50);
    expect(arcs[1].cy).toBe(0);
    expect(((0 - 50) / arcs[1].rx) ** 2 + (100 / arcs[1].ry) ** 2).toBeCloseTo(1, 12);
    // first anchor lies below (y down) → lower half, t in [0, π]
    expect([arcs[0].t0, arcs[0].t1]).toEqual([0, Math.PI]);
    expect(fibArcLevels(P(0, -100), P(50, 0), [1])[0].t0).toBe(Math.PI);
    expect(fibArcLevels(P(0, -100), P(50, 0), [1], true)[0].t1).toBeCloseTo(2 * Math.PI, 12);
  });
  it("ellipse distance (hit-test)", () => {
    const e = { cx: 0, cy: 0, rx: 100, ry: 50 };
    expect(fibDistanceToEllipse(100, 0, e)).toBeLessThan(0.5);
    expect(fibDistanceToEllipse(0, 60, e)).toBeCloseTo(10, 0);
    expect(fibDistanceToEllipse(0, 0, e)).toBeGreaterThan(49);
    // half arc t∈[0, π] (y down): the top point is far from it
    expect(fibDistanceToEllipse(0, -50, e, 0, Math.PI)).toBeGreaterThan(40);
    expect(fibDistanceToPolyline(5, 5, [P(0, 0), P(10, 0)])).toBe(5);
  });
});

describe("golden spiral", () => {
  it("passes through the second anchor and grows by φ per quarter turn", () => {
    const a = P(0, 0);
    const b = P(100, 0);
    const pts = goldenSpiral(a, b, false, { minR: 1, maxR: 1000, perQuarter: 64 });
    expect(pts.length).toBeGreaterThan(100);
    expect(Math.min(...pts.map((p) => Math.hypot(p.x - 100, p.y)))).toBeLessThan(1);
    // after one quarter turn clockwise on screen (y down) the radius is φ × r0 at (0, +φr0)
    const target = P(0, 100 * FIB_PHI);
    expect(Math.min(...pts.map((p) => Math.hypot(p.x - target.x, p.y - target.y)))).toBeLessThan(2);
    const ccw = goldenSpiral(a, b, true, { minR: 1, maxR: 1000, perQuarter: 64 });
    const tccw = P(0, -100 * FIB_PHI);
    expect(Math.min(...ccw.map((p) => Math.hypot(p.x - tccw.x, p.y - tccw.y)))).toBeLessThan(2);
    expect(fibSpiralRadius(10, 2)).toBeCloseTo(10 * FIB_PHI * FIB_PHI, 12);
  });
  it("is affine-covariant (re-projects through the scales)", () => {
    const a = P(5, 1000);
    const b = P(15, 1040);
    const data = goldenSpiral(a, b, false, { minR: 0.01, maxR: 1e6, perQuarter: 8 });
    const pa = proj(a);
    const pb = proj(b);
    const px = goldenSpiral(pa, pb, false, { minR: 0.01, maxR: 1e6, perQuarter: 8 });
    // the projected second anchor is on the pixel spiral; a projected data sample near b too
    expect(Math.min(...px.map((p) => Math.hypot(p.x - pb.x, p.y - pb.y)))).toBeLessThan(1);
    const near = data.reduce((m, p) => (Math.hypot(p.x - b.x, (p.y - b.y) / 4) < Math.hypot(m.x - b.x, (m.y - b.y) / 4) ? p : m));
    const q = proj(near);
    expect(Math.hypot(q.x - pb.x, q.y - pb.y)).toBeLessThan(1);
    expect(goldenSpiral(a, a)).toEqual([]);
  });
});

describe("fib wedge", () => {
  it("arcs between the two rays at k × |AB|", () => {
    const lv = fibWedgeLevels(P(0, 0), P(100, 0), P(0, 100), [0.5, 1]);
    expect(lv[1].rx).toBeCloseTo(100, 12);
    expect(lv[0].rx).toBeCloseTo(50, 12);
    expect(lv[0].t0).toBeCloseTo(0, 12);
    expect(lv[0].t1).toBeCloseTo(Math.PI / 2, 12);
  });
  it("takes the shorter way round", () => {
    const lv = fibWedgeLevels(P(0, 0), P(-100, 0), P(-100, -3), [1]);
    expect(Math.abs(lv[0].t1 - lv[0].t0)).toBeLessThan(0.1);
  });
});

describe("pitchfan", () => {
  it("median through the B–C midpoint; level 1 rays through B and C", () => {
    const { median, rays } = fibPitchfanRays(P(0, 50), P(100, 0), P(100, 100), [0.5, 1]);
    expect(median[1]).toEqual(P(100, 50));
    expect(rays.find((r) => r.coeff === 1 && r.side === 1)!.through).toEqual(P(100, 100));
    expect(rays.find((r) => r.coeff === 1 && r.side === -1)!.through).toEqual(P(100, 0));
    expect(rays.find((r) => r.coeff === 0.5 && r.side === 1)!.through).toEqual(P(100, 75));
  });
});

describe("labels", () => {
  it("values and percents", () => {
    expect(fibCoeffLabel(0.618)).toBe("0.618");
    expect(fibCoeffLabel(0.618, true)).toBe("61.8%");
    expect(fibCoeffLabel(1.6180001)).toBe("1.618");
  });
});
