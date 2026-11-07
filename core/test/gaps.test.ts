import { describe, expect, it } from "vitest";
import { detectGaps } from "../src/analysis";
import type { Bar } from "../src/types";

const bar = (i: number, low: number, high: number, close = (low + high) / 2): Bar => ({ time: i * 86400, open: close, high, low, close, volume: 1 });

describe("price gaps", () => {
  it("finds a gap up and keeps it open while price stays above it", () => {
    const g = detectGaps([bar(0, 9, 10), bar(1, 11, 12), bar(2, 11.5, 13)]);
    expect(g).toEqual([{ index: 1, up: true, top: 11, bottom: 10, openTop: 11, openBottom: 10, filledIndex: null }]);
  });

  it("shrinks a gap as price trades into it and fills it once price crosses it", () => {
    const bars = [bar(0, 9, 10), bar(1, 11, 12), bar(2, 10.4, 12), bar(3, 9.5, 11)];
    const partly = detectGaps(bars.slice(0, 3));
    expect(partly[0]).toMatchObject({ openTop: 10.4, openBottom: 10, filledIndex: null });
    expect(detectGaps(bars)).toEqual([]);
    expect(detectGaps(bars, { includeFilled: true })[0]).toMatchObject({ filledIndex: 3, openTop: null, top: 11, bottom: 10 });
  });

  it("finds gaps down and applies the minimum size", () => {
    const bars = [bar(0, 100, 101), bar(1, 98, 99.95), bar(2, 95, 97)];
    expect(detectGaps(bars).map((g) => [g.index, g.up])).toEqual([[1, false], [2, false]]);
    // 0.05 / 100.5 ≈ 0.05 %: below a 0.5 % minimum; the second gap (0.98 %) stays.
    expect(detectGaps(bars, { minPercent: 0.5 }).map((g) => g.index)).toEqual([2]);
    expect(detectGaps(bars)[1]).toMatchObject({ top: 98, bottom: 97 });
  });

  it("keeps only the most recent gaps", () => {
    const bars = Array.from({ length: 8 }, (_, i) => bar(i, 10 + i * 2, 11 + i * 2));
    expect(detectGaps(bars)).toHaveLength(7);
    expect(detectGaps(bars, { maxGaps: 3 }).map((g) => g.index)).toEqual([5, 6, 7]);
    expect(detectGaps([])).toEqual([]);
  });
});
