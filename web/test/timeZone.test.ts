import { describe, expect, it } from "vitest";
import { chartCsv } from "../src/chart/export/csvExport";
import { formatDateTime, formatTimeFull, tickLabel } from "../src/chart/format";
import { sessionBreakIndexes } from "../src/chart/renderers/marks";
import { TimeScale } from "../src/chart/TimeScale";
import { offsetAt, resolveZone, toZone, ZONE_CHOICES, zoneLabel } from "../src/chart/timeZone";
import { chartMenu, type ChartMenuActions } from "../src/state/menus";

const JAN = Date.UTC(2026, 0, 15, 14, 30) / 1000; // winter
const JUL = Date.UTC(2026, 6, 15, 14, 30) / 1000; // summer

describe("chart time zones", () => {
  it("resolves settings to IANA zones", () => {
    expect(resolveZone(undefined)).toBe("UTC");
    expect(resolveZone("UTC")).toBe("UTC");
    expect(resolveZone("exchange", "America/New_York")).toBe("America/New_York");
    expect(resolveZone("exchange")).toBe("UTC");
    expect(resolveZone("Europe/Amsterdam")).toBe("Europe/Amsterdam");
    expect(resolveZone("Not/AZone")).toBe("UTC");
    expect(resolveZone("local")).toMatch(/\//.test(resolveZone("local")) ? /\// : /UTC/);
    expect(ZONE_CHOICES.slice(0, 3).map((z) => z.id)).toEqual(["UTC", "local", "exchange"]);
  });

  it("knows offsets across daylight saving and labels them", () => {
    expect(offsetAt("America/New_York", JAN)).toBe(-5 * 3600);
    expect(offsetAt("America/New_York", JUL)).toBe(-4 * 3600);
    expect(offsetAt("Asia/Kolkata", JAN)).toBe(5.5 * 3600);
    expect(zoneLabel("UTC", JAN)).toBe("UTC");
    expect(zoneLabel("Europe/Amsterdam", JAN)).toBe("UTC+1");
    expect(zoneLabel("America/New_York", JUL)).toBe("UTC−4");
    expect(zoneLabel("Asia/Kolkata", JAN)).toBe("UTC+5:30");
    // The hour of a change (New York, 8 Mar 2026, 07:00 UTC) is resolved per instant.
    const change = Date.UTC(2026, 2, 8, 7, 0) / 1000;
    expect(offsetAt("America/New_York", change - 1)).toBe(-5 * 3600);
    expect(offsetAt("America/New_York", change)).toBe(-4 * 3600);
  });

  it("formats intraday times in the zone and keeps daily bars as dates", () => {
    expect(formatTimeFull(JAN, true)).toContain("14:30");
    expect(formatTimeFull(JAN, true, "America/New_York")).toContain("09:30");
    expect(formatTimeFull(Date.UTC(2026, 0, 15) / 1000, false, "America/New_York")).toContain("15 Jan");
    expect(formatDateTime(Date.UTC(2026, 0, 15, 2, 0) / 1000, true, "America/New_York")).toBe("2026-01-14 21:00");
    expect(tickLabel(toZone(JAN, "UTC"), null, 3600, "Asia/Tokyo").text).toBe("23:30");
  });

  it("places time axis ticks on the zone's calendar for intraday charts", () => {
    const ts = new TimeScale();
    const start = Date.UTC(2026, 0, 15, 0, 0) / 1000;
    const times = Array.from({ length: 48 }, (_, i) => start + i * 3600);
    ts.setTimes(times, 3600);
    ts.setWidth(960);
    ts.barSpacing = 20;
    ts.zone = "America/New_York";
    const dayTicks = ts.ticks(60).filter((t) => t.major && t.index < times.length);
    // New York midnight is 05:00 UTC.
    expect(dayTicks.length).toBeGreaterThan(0);
    for (const t of dayTicks) expect(new Date(times[t.index] * 1000).getUTCHours()).toBe(5);
  });

  it("finds session breaks at the zone's day change", () => {
    const start = Date.UTC(2026, 0, 15, 20, 0) / 1000;
    const times = Array.from({ length: 12 }, (_, i) => start + i * 3600);
    expect(sessionBreakIndexes(times, 0, 11, "UTC")).toEqual([4]);
    expect(sessionBreakIndexes(times, 0, 11, "America/New_York")).toEqual([9]);
  });

  it("adds a zone time column to the CSV export", () => {
    const bars = [{ time: JAN, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }];
    const csv = chartCsv(bars, [], "America/New_York").split("\r\n");
    expect(csv[0]).toBe("time,time (America/New_York),open,high,low,close,volume");
    expect(csv[1]).toMatch(/^2026-01-15T14:30:00(\.000)?Z,2026-01-15 09:30,1,/);
    expect(chartCsv(bars, []).split("\r\n")[0]).toBe("time,open,high,low,close,volume");
  });

  it("offers a time zone submenu", () => {
    const set: string[] = [];
    const actions = { resetView() {}, copy() {}, setChartType() {}, setLog() {}, removeDrawings() {}, showHiddenDrawings() {}, removeIndicators() {}, openChartSettings() {}, setTimeZone: (z: string) => set.push(z) } as ChartMenuActions;
    const menu = chartMenu({ chartType: "candles", logScale: false, drawingCount: 0, hiddenDrawings: 0, indicatorCount: 0, priceText: "1", timeZone: "exchange" }, actions);
    const tz = menu.find((m) => "label" in m && m.label === "Time zone") as { submenu: { label?: string; checked?: boolean; onSelect?(): void }[] };
    expect(tz.submenu.find((m) => m.checked)?.label).toBe("Exchange");
    tz.submenu.find((m) => m.label === "Tokyo")!.onSelect!();
    expect(set).toEqual(["Asia/Tokyo"]);
  });
});
