import { describe, expect, it } from "vitest";
import type { Bar } from "../src/types";
import { anchoredVwap, vwapSourcePrice } from "../src/drawings/volume";

const b = (time: number, h: number, l: number, c: number, volume: number, o = c): Bar => ({ time, open: o, high: h, low: l, close: c, volume });

describe("anchored VWAP", () => {
  it("source prices", () => {
    const x = b(0, 12, 6, 9, 1, 7);
    expect(vwapSourcePrice(x)).toBe(9);
    expect(vwapSourcePrice(x, "hl2")).toBe(9);
    expect(vwapSourcePrice(x, "ohlc4")).toBe(8.5);
    expect(vwapSourcePrice(x, "hlcc4")).toBe(9);
    expect(vwapSourcePrice(x, "open")).toBe(7);
  });

  it("starts at the anchor bar and weights by volume", () => {
    const bars = [b(0, 50, 50, 50, 1000), b(10, 10, 10, 10, 100), b(20, 20, 20, 20, 300)];
    const v = anchoredVwap(bars, 5, "hlc3", [1, 2]);
    expect(v.map((p) => p.time)).toEqual([10, 20]);
    expect(v[0].vwap).toBe(10);
    expect(v[0].stdev).toBe(0);
    // (10·100 + 20·300) / 400 = 17.5; σ² = (100·100 + 400·300)/400 − 17.5² = 325 − 306.25 = 18.75
    expect(v[1].vwap).toBeCloseTo(17.5);
    expect(v[1].stdev).toBeCloseTo(Math.sqrt(18.75));
    expect(v[1].bands[0][0]).toBeCloseTo(17.5 - Math.sqrt(18.75));
    expect(v[1].bands[1][1]).toBeCloseTo(17.5 + 2 * Math.sqrt(18.75));
  });

  it("anchored exactly on a bar includes it; no-volume symbols weight bars equally", () => {
    const bars = [b(0, 10, 10, 10, 0), b(1, 20, 20, 20, 0)];
    const v = anchoredVwap(bars, 0);
    expect(v[0].vwap).toBe(10);
    expect(v[1].vwap).toBe(15);
    expect(anchoredVwap(bars, 99)).toEqual([]);
  });
});
