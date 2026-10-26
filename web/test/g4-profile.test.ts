import { describe, expect, it } from "vitest";
import type { VolumeProfile } from "@qt/core";
import { profileRowRects } from "../src/chart/renderers/profileGeometry";
import { filterCandlePatterns, niceStep, sessionRanges } from "../src/chart/studies/compute";

// Linear price scale: price 100 at y = 200, 110 at y = 0 (20 px per price unit).
const toY = (p: number) => 200 - (p - 100) * 20;

const profile: VolumeProfile = {
  rows: [
    { priceLow: 100, priceHigh: 102, volume: 10, upVolume: 4, downVolume: 6 },
    { priceLow: 102, priceHigh: 104, volume: 40, upVolume: 30, downVolume: 10 },
    { priceLow: 104, priceHigh: 106, volume: 20, upVolume: 10, downVolume: 10 },
    { priceLow: 106, priceHigh: 108, volume: 0, upVolume: 0, downVolume: 0 },
  ],
  poc: 103,
  vah: 106,
  val: 102,
  startIndex: 0,
  endIndex: 9,
};

describe("profile row → pixel mapping", () => {
  const rects = profileRowRects(profile, toY, 200);

  it("spans each row's price band vertically", () => {
    expect(rects.map((r) => [r.y, r.h])).toEqual([
      [160, 40],
      [120, 40],
      [80, 40],
      [40, 40],
    ]);
  });

  it("scales widths to the largest row and splits up/down volume", () => {
    expect(rects.map((r) => r.w)).toEqual([50, 200, 100, 0]);
    expect(rects[1].upW).toBe(150);
    expect(rects[1].downW).toBe(50);
    for (const r of rects) expect(r.upW + r.downW).toBeCloseTo(r.w, 9);
  });

  it("flags the POC row and the value-area rows", () => {
    expect(rects.map((r) => r.poc)).toEqual([false, true, false, false]);
    expect(rects.map((r) => r.inValueArea)).toEqual([false, true, true, false]);
  });

  it("keeps rows at least 1 px tall and handles an empty profile", () => {
    const thin = profileRowRects(profile, (p) => p * 0.001, 100);
    expect(thin.every((r) => r.h >= 1)).toBe(true);
    expect(profileRowRects({ ...profile, rows: [] }, toY, 100)).toEqual([]);
  });
});

describe("study helpers", () => {
  it("picks nice TPO row steps", () => {
    expect(niceStep(0.37)).toBe(0.5);
    expect(niceStep(2.1)).toBe(2.5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(0.01)).toBeCloseTo(0.01, 12);
  });

  it("splits sessions by UTC day with an optional start hour", () => {
    const H = 3600;
    const D = 86400;
    const bars = [0, 10 * H, 23 * H, D + H, D + 14 * H].map((t) => ({ time: t, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
    expect(sessionRanges(bars, 0)).toEqual([
      [0, 2],
      [3, 4],
    ]);
    expect(sessionRanges(bars, 13 * H)).toEqual([
      [0, 1],
      [2, 3],
      [4, 4],
    ]);
  });

  it("filters candle patterns by group and bias", () => {
    const list = [
      { index: 1, time: 1, name: "doji", bias: "neutral" as const, bars: 1 },
      { index: 2, time: 2, name: "hammer", bias: "bullish" as const, bars: 1 },
      { index: 3, time: 3, name: "bearish-engulfing", bias: "bearish" as const, bars: 2 },
      { index: 4, time: 4, name: "morning-star", bias: "bullish" as const, bars: 3 },
    ];
    expect(filterCandlePatterns(list, {}).map((p) => p.name)).toEqual(["hammer", "bearish-engulfing", "morning-star"]);
    expect(filterCandlePatterns(list, { bearish: false, threeBar: false, neutral: true }).map((p) => p.name)).toEqual(["doji", "hammer"]);
  });
});
