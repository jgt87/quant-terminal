import { describe, expect, it } from "vitest";
import type { Bar } from "../src/types";
import { rangeSpanText, rangeStats } from "../src/drawings/measure";

const bars: Bar[] = [0, 60, 120, 180, 240].map((t, i) => ({ time: t, open: 10, high: 11, low: 9, close: 10, volume: (i + 1) * 100 }));

describe("range stats", () => {
  it("price change, percent, ticks, bars, time span and volume", () => {
    const s = rangeStats({ time: 60, price: 100 }, { time: 180, price: 105 }, bars, 60, 0.01);
    expect(s.priceChange).toBe(5);
    expect(s.percent).toBeCloseTo(5);
    expect(s.ticks).toBe(500);
    expect(s.bars).toBe(2);
    expect(s.seconds).toBe(120);
    expect(s.volume).toBe(200 + 300 + 400);
  });
  it("signed when drawn right-to-left / downwards", () => {
    const s = rangeStats({ time: 180, price: 105 }, { time: 60, price: 100 }, bars, 60, 0.01);
    expect(s.priceChange).toBe(-5);
    expect(s.ticks).toBe(-500);
    expect(s.bars).toBe(-2);
    expect(s.volume).toBe(900);
  });
  it("outside the loaded bars: bars from time ÷ interval, volume of what is loaded", () => {
    const s = rangeStats({ time: 180, price: 1 }, { time: 600, price: 1 }, bars, 60, 0.01);
    expect(s.bars).toBe(7);
    expect(s.volume).toBe(400 + 500);
    expect(rangeStats({ time: 0, price: 0 }, { time: 60, price: 1 }, [], 60, 0.01).percent).toBe(0);
  });
});

describe("span text", () => {
  it("formats compactly", () => {
    expect(rangeSpanText(45)).toBe("45s");
    expect(rangeSpanText(-2700)).toBe("45m");
    expect(rangeSpanText(3 * 3600 + 20 * 60)).toBe("3h 20m");
    expect(rangeSpanText(2 * 86400 + 4 * 3600)).toBe("2d 4h");
    expect(rangeSpanText(12 * 86400 + 5)).toBe("12d");
  });
});
