import { describe, expect, it } from "vitest";
import type { Bar } from "../src/types";
import { barSourceValue, disjointLines, flatLines, linearRegression, pointInPolygon, priceAtTime, regressionChannel } from "../src/drawings/channels";

const bar = (time: number, close: number, o: Partial<Bar> = {}): Bar => ({ time, open: close, high: close, low: close, close, volume: 0, ...o });

describe("channels: two-line geometry", () => {
  const a = { time: 0, price: 100 };
  const b = { time: 100, price: 120 };
  it("disjoint channel mirrors the slope from the third anchor's price at a's time", () => {
    const [l1, l2] = disjointLines(a, b, { time: 55, price: 90 });
    expect(l1).toEqual([a, b]);
    expect(l2).toEqual([
      { time: 0, price: 90 },
      { time: 100, price: 70 },
    ]);
    const slope1 = (l1[1].price - l1[0].price) / (l1[1].time - l1[0].time);
    const slope2 = (l2[1].price - l2[0].price) / (l2[1].time - l2[0].time);
    expect(slope2).toBeCloseTo(-slope1);
  });
  it("flat top/bottom is horizontal at the third anchor's price over the same span", () => {
    const [, l2] = flatLines(a, b, { time: 70, price: 95 });
    expect(l2).toEqual([
      { time: 0, price: 95 },
      { time: 100, price: 95 },
    ]);
  });
  it("price on a line and point in polygon", () => {
    expect(priceAtTime(a, b, 50)).toBeCloseTo(110);
    expect(priceAtTime(a, { time: 0, price: 5 }, 50)).toBe(100);
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon(5, 5, sq)).toBe(true);
    expect(pointInPolygon(15, 5, sq)).toBe(false);
    expect(pointInPolygon(-1, -1, sq)).toBe(false);
  });
});

describe("channels: regression trend", () => {
  it("least squares recovers an exact line with R = 1 and zero deviation", () => {
    const f = linearRegression([0, 1, 2, 3, 4], [3, 5, 7, 9, 11]);
    expect(f.slope).toBeCloseTo(2);
    expect(f.intercept).toBeCloseTo(3);
    expect(f.stdDev).toBeCloseTo(0);
    expect(f.pearsonR).toBeCloseTo(1);
  });
  it("matches the textbook values on noisy data", () => {
    // x = 1..5, y = 2, 4, 5, 4, 5: slope 0.6, intercept 2.2, r = 0.7746.
    const f = linearRegression([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
    expect(f.slope).toBeCloseTo(0.6, 10);
    expect(f.intercept).toBeCloseTo(2.2, 10);
    expect(f.pearsonR).toBeCloseTo(0.7746, 4);
    // Residuals −0.8, 0.6, 1, −0.6, −0.2 → SSE 2.4, population sd sqrt(0.48).
    expect(f.stdDev).toBeCloseTo(Math.sqrt(0.48), 10);
  });
  it("negative correlation and flat data", () => {
    expect(linearRegression([0, 1, 2], [5, 3, 1]).pearsonR).toBeCloseTo(-1);
    const flat = linearRegression([0, 1, 2], [4, 4, 4]);
    expect(flat.pearsonR).toBe(0);
    expect(flat.slope).toBe(0);
    expect(linearRegression([], []).n).toBe(0);
  });
  it("uses the bars between the anchors (either order), by bar index, with deviation bands", () => {
    const bars = [bar(0, 50), bar(60, 1), bar(120, 2), bar(180, 4), bar(240, 3), bar(300, 99)];
    const r = regressionChannel(bars, 240, 60, "close", 2, -1)!;
    expect(r.n).toBe(4);
    expect(r.t0).toBe(60);
    expect(r.t1).toBe(240);
    const f = linearRegression([0, 1, 2, 3], [1, 2, 4, 3]);
    expect(r.slope).toBeCloseTo(f.slope);
    expect(r.base[0]).toBeCloseTo(f.intercept);
    expect(r.base[1]).toBeCloseTo(f.intercept + 3 * f.slope);
    expect(r.upper[0] - r.base[0]).toBeCloseTo(2 * f.stdDev);
    expect(r.lower[1] - r.base[1]).toBeCloseTo(-f.stdDev);
    expect(r.pearsonR).toBeCloseTo(f.pearsonR);
  });
  it("gaps in time do not bend the fit (x is the bar index)", () => {
    const bars = [bar(0, 1), bar(60, 2), bar(10_000, 3), bar(10_060, 4)];
    const r = regressionChannel(bars, 0, 10_060, "close", 2, -2)!;
    expect(r.pearsonR).toBeCloseTo(1);
    expect(r.stdDev).toBeCloseTo(0);
  });
  it("needs two bars, and reads the chosen source", () => {
    expect(regressionChannel([bar(0, 1)], 0, 100, "close", 2, -2)).toBeNull();
    const b = bar(0, 10, { open: 8, high: 14, low: 6 });
    expect(barSourceValue(b, "open")).toBe(8);
    expect(barSourceValue(b, "high")).toBe(14);
    expect(barSourceValue(b, "low")).toBe(6);
    expect(barSourceValue(b, "close")).toBe(10);
    expect(barSourceValue(b, "hl2")).toBe(10);
    expect(barSourceValue(b, "hlc3")).toBe(10);
    expect(barSourceValue(b, "ohlc4")).toBe(9.5);
    const hi = regressionChannel([bar(0, 1, { high: 5 }), bar(60, 1, { high: 7 })], 0, 60, "high", 2, -2)!;
    expect(hi.base).toEqual([5, 7]);
  });
});
