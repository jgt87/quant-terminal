import { describe, expect, it } from "vitest";
import { heikinAshi, smoothedHeikinAshi } from "../src/transforms";
import type { Bar } from "../src/types";

/** A noisy up-trend: alternating up and down bars around a rising line. */
const bars: Bar[] = Array.from({ length: 60 }, (_, i) => {
  const mid = 100 + i * 0.5 + (i % 2 ? 2 : -2);
  const up = i % 2 === 1;
  return { time: i * 60, open: up ? mid - 1 : mid + 1, high: mid + 2, low: mid - 2, close: up ? mid + 1 : mid - 1, volume: i };
});

const flips = (b: Bar[]) => b.slice(1).filter((x, i) => Math.sign(x.close - x.open) !== Math.sign(b[i].close - b[i].open)).length;

describe("smoothed Heikin-Ashi", () => {
  it("keeps time and volume and builds valid candles", () => {
    const s = smoothedHeikinAshi(bars);
    expect(s).toHaveLength(bars.length);
    s.forEach((b, i) => {
      expect(b.time).toBe(bars[i].time);
      expect(b.volume).toBe(bars[i].volume);
      expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close));
      expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close));
    });
    expect(smoothedHeikinAshi([])).toEqual([]);
  });

  it("changes colour less often than plain Heikin-Ashi on a noisy trend", () => {
    expect(flips(smoothedHeikinAshi(bars).slice(10))).toBeLessThan(flips(heikinAshi(bars).slice(10)));
    expect(smoothedHeikinAshi(bars).slice(10).every((b) => b.close > b.open)).toBe(true);
  });

  it("with length 1 and no second pass equals plain Heikin-Ashi", () => {
    expect(smoothedHeikinAshi(bars, 1, 1)).toEqual(heikinAshi(bars));
  });
});
