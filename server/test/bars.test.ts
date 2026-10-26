import { describe, expect, it } from "vitest";
import type { Bar } from "@qt/core";
import { aggregateBars, mergeStubs, parseInterval, sliceBefore, validateBars } from "../src/bars";

const bar = (time: number, o: number, h: number, l: number, c: number, v = 1): Bar => ({ time, open: o, high: h, low: l, close: c, volume: v });

describe("validateBars", () => {
  it("sorts, dedupes (last wins) and drops invalid rows", () => {
    const out = validateBars([
      bar(300, 3, 4, 2, 3),
      bar(100, 1, 2, 0.5, 1.5),
      { time: 200, open: null as unknown as number, high: 2, low: 1, close: 1 },
      { time: 250, open: NaN, high: 2, low: 1, close: 1 },
      bar(100, 9, 10, 8, 9), // duplicate of 100: replaces it
      { time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 },
    ]);
    expect(out.map((b) => b.time)).toEqual([100, 300]);
    expect(out[0].open).toBe(9);
  });

  it("clamps high/low around open and close", () => {
    const [b] = validateBars([bar(100, 10, 9, 11, 12)]);
    expect(b.high).toBe(12);
    expect(b.low).toBe(9);
    expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close));
    expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close));
  });

  it("defaults missing or negative volume to 0", () => {
    const [b] = validateBars([{ time: 5, open: 1, high: 1, low: 1, close: 1, volume: -3 }]);
    expect(b.volume).toBe(0);
  });
});

describe("aggregateBars (4h)", () => {
  const H = 3600;
  // Two US sessions of 60m bars starting 13:30 UTC (7 bars each).
  const day1 = Date.UTC(2026, 9, 9, 13, 30) / 1000;
  const day2 = Date.UTC(2026, 9, 12, 13, 30) / 1000;
  const hourly = [day1, day2].flatMap((d, di) =>
    Array.from({ length: 7 }, (_, i) => bar(d + i * H, 100 + di * 10 + i, 101 + di * 10 + i, 99 + di * 10 + i, 100.5 + di * 10 + i, 10)),
  );

  it("anchors buckets to the session open", () => {
    const out = aggregateBars(hourly, 4 * H, "session", -4 * H);
    expect(out.map((b) => b.time)).toEqual([day1, day1 + 4 * H, day2, day2 + 4 * H]);
    expect(out[0]).toEqual({ time: day1, open: 100, high: 104, low: 99, close: 103.5, volume: 40 });
    expect(out[1]).toEqual({ time: day1 + 4 * H, open: 104, high: 107, low: 103, close: 106.5, volume: 30 });
  });

  it("supports plain UTC-aligned buckets", () => {
    const out = aggregateBars(hourly.slice(0, 7), 4 * H, "utc");
    expect(out.map((b) => b.time % (4 * H))).toEqual([0, 0]);
    expect(out[0].time).toBe(Date.UTC(2026, 9, 9, 12) / 1000);
    expect(out[0].volume + out[1].volume).toBe(70);
  });
});

describe("mergeStubs", () => {
  it("folds a short closing tick into the previous bar", () => {
    const out = mergeStubs([bar(0, 1, 2, 0.5, 1.5, 10), bar(1800, 1.5, 3, 1.4, 2.5, 0)], 3600);
    expect(out).toEqual([{ time: 0, open: 1, high: 3, low: 0.5, close: 2.5, volume: 10 }]);
  });
});

describe("sliceBefore (paging `to`)", () => {
  const bars = [100, 200, 300, 400, 500].map((t) => bar(t, 1, 1, 1, 1));
  it("returns bars strictly before `to`, newest `limit`", () => {
    expect(sliceBefore(bars, 400, 2).map((b) => b.time)).toEqual([200, 300]);
    expect(sliceBefore(bars, 401, 10).map((b) => b.time)).toEqual([100, 200, 300, 400]);
    expect(sliceBefore(bars, 100, 10)).toEqual([]);
    expect(sliceBefore(bars, undefined, 3).map((b) => b.time)).toEqual([300, 400, 500]);
  });
});

describe("parseInterval", () => {
  it("accepts canonical names and common aliases", () => {
    expect(parseInterval("1D")).toBe("1D");
    expect(parseInterval("1d")).toBe("1D");
    expect(parseInterval("1m")).toBe("1m");
    expect(parseInterval("1M")).toBe("1M");
    expect(parseInterval("60")).toBe("1h");
    expect(parseInterval("240")).toBe("4h");
    expect(parseInterval("7h")).toBeUndefined();
    expect(parseInterval(null)).toBeUndefined();
  });
});
