import { describe, expect, it } from "vitest";
import type { Bar } from "@qt/core";
import { alignCloses, baseIndex, percentSeries, rebaseToMain } from "../src/chart/compare";

const bar = (time: number, close: number): Bar => ({ time, open: close, high: close, low: close, close, volume: 0 });

describe("compare rebasing", () => {
  it("aligns closes by time, carrying the last value over gaps", () => {
    const main = [10, 20, 30, 40, 50];
    const cmp = [bar(20, 2), bar(35, 3), bar(50, 5)];
    expect(alignCloses(main, cmp)).toEqual([null, 2, 2, 3, 5]);
  });

  it("rebases to the first visible bar that has a value", () => {
    const aligned = [null, 2, 2, 3, 4];
    expect(baseIndex(aligned, 0)).toBe(1);
    expect(baseIndex(aligned, 3)).toBe(3);
    expect(baseIndex([null, null], 0)).toBe(-1);
    expect(percentSeries(aligned, 1)).toEqual([null, 0, 0, 50, 100]);
    expect(percentSeries(aligned, 3).map((v) => (v == null ? v : Math.round(v * 1000) / 1000))).toEqual([null, -33.333, -33.333, 0, 33.333]);
  });

  it("expresses the overlay in main-price units so both lines start at the same point", () => {
    const aligned = [null, 2, 3, 1];
    const s = rebaseToMain(aligned, 1, 150);
    expect(s).toEqual([null, 150, 225, 75]);
  });
});
