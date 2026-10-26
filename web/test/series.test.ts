import { describe, expect, it } from "vitest";
import type { Bar } from "@qt/core";
import { heikinAshi, SeriesData } from "../src/chart/SeriesData";

const bar = (time: number, close: number, extra: Partial<Bar> = {}): Bar => ({
  time,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 100,
  ...extra,
});

describe("SeriesData.upsert", () => {
  it("replaces the bar with the same time, appends newer bars", () => {
    const s = new SeriesData();
    s.set([bar(60, 1), bar(120, 2)]);
    expect(s.upsert(bar(120, 2.5))).toBe("replaced");
    expect(s.length).toBe(2);
    expect(s.last()!.close).toBe(2.5);
    expect(s.upsert(bar(180, 3))).toBe("appended");
    expect(s.length).toBe(3);
    expect(s.times).toEqual([60, 120, 180]);
  });

  it("replaces an older existing bar and inserts a missing older bar in order", () => {
    const s = new SeriesData();
    s.set([bar(60, 1), bar(180, 3)]);
    expect(s.upsert(bar(60, 9))).toBe("replaced");
    expect(s.bars[0].close).toBe(9);
    expect(s.upsert(bar(120, 2))).toBe("inserted");
    expect(s.times).toEqual([60, 120, 180]);
  });

  it("set() sorts and de-duplicates", () => {
    const s = new SeriesData();
    s.set([bar(120, 2), bar(60, 1), bar(120, 5)]);
    expect(s.times).toEqual([60, 120]);
    expect(s.bars[1].close).toBe(5);
  });

  it("prepend only adds strictly older bars", () => {
    const s = new SeriesData();
    s.set([bar(300, 3), bar(360, 4)]);
    expect(s.prepend([bar(180, 1), bar(240, 2), bar(300, 99)])).toBe(2);
    expect(s.times).toEqual([180, 240, 300, 360]);
    expect(s.bars[2].close).toBe(3);
    expect(s.prepend([])).toBe(0);
  });
});

describe("heikinAshi", () => {
  it("computes HA candles from the definition", () => {
    const bars: Bar[] = [
      { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 5 },
      { time: 2, open: 11, high: 13, low: 10, close: 12, volume: 6 },
      { time: 3, open: 12, high: 12.5, low: 8, close: 9, volume: 7 },
    ];
    const ha = heikinAshi(bars);
    // bar 0
    expect(ha[0].close).toBeCloseTo((10 + 12 + 9 + 11) / 4, 12);
    expect(ha[0].open).toBeCloseTo((10 + 11) / 2, 12);
    // bar 1
    const o1 = (ha[0].open + ha[0].close) / 2;
    const c1 = (11 + 13 + 10 + 12) / 4;
    expect(ha[1].open).toBeCloseTo(o1, 12);
    expect(ha[1].close).toBeCloseTo(c1, 12);
    expect(ha[1].high).toBe(Math.max(13, o1, c1));
    expect(ha[1].low).toBe(Math.min(10, o1, c1));
    // bar 2
    const o2 = (o1 + c1) / 2;
    expect(ha[2].open).toBeCloseTo(o2, 12);
    expect(ha[2].close).toBeCloseTo((12 + 12.5 + 8 + 9) / 4, 12);
    expect(ha[2].volume).toBe(7);
    for (const h of ha) {
      expect(h.high).toBeGreaterThanOrEqual(Math.max(h.open, h.close));
      expect(h.low).toBeLessThanOrEqual(Math.min(h.open, h.close));
    }
  });
});
