import { describe, expect, it } from "vitest";
import type { Bar } from "@qt/core";
import { utcToFields, wallToUtc } from "../src/chart/goToDate";
import { visibleHighLow } from "../src/chart/renderers/highLow";

describe("go to date", () => {
  it("reads a date and time as wall-clock time in the chart's zone", () => {
    expect(wallToUtc("2026-03-02", "", "UTC")).toBe(Date.UTC(2026, 2, 2) / 1000);
    expect(wallToUtc("2026-03-02", "14:30", "UTC")).toBe(Date.UTC(2026, 2, 2, 14, 30) / 1000);
    // New York is UTC-5 in winter and UTC-4 in summer.
    expect(wallToUtc("2026-01-15", "09:30", "America/New_York")).toBe(Date.UTC(2026, 0, 15, 14, 30) / 1000);
    expect(wallToUtc("2026-07-15", "09:30", "America/New_York")).toBe(Date.UTC(2026, 6, 15, 13, 30) / 1000);
  });

  it("rejects dates and times that do not exist", () => {
    expect(wallToUtc("2026-02-30", "", "UTC")).toBeNull();
    expect(wallToUtc("2026-13-01", "", "UTC")).toBeNull();
    expect(wallToUtc("2026-01-01", "24:00", "UTC")).toBeNull();
    expect(wallToUtc("yesterday", "", "UTC")).toBeNull();
  });

  it("fills the fields from a time in the zone and reads them back unchanged", () => {
    const t = Date.UTC(2026, 6, 15, 13, 30) / 1000;
    const f = utcToFields(t, "America/New_York");
    expect(f).toEqual({ date: "2026-07-15", time: "09:30" });
    expect(wallToUtc(f.date, f.time, "America/New_York")).toBe(t);
  });
});

describe("high and low labels", () => {
  const b = (high: number, low: number): Bar => ({ time: 0, open: low, high, low, close: high, volume: 0 });
  it("finds the highest high and lowest low of the visible bars, the first on ties", () => {
    const bars = [b(5, 1), b(9, 3), b(9, 0.5), b(7, 2)];
    expect(visibleHighLow(bars, 0, 3)).toEqual({ high: { index: 1, price: 9 }, low: { index: 2, price: 0.5 } });
    expect(visibleHighLow(bars, 3, 10)).toEqual({ high: { index: 3, price: 7 }, low: { index: 3, price: 2 } });
    expect(visibleHighLow(bars, -5, 0)).toEqual({ high: { index: 0, price: 5 }, low: { index: 0, price: 1 } });
    expect(visibleHighLow([], 0, 5)).toBeNull();
  });
});
