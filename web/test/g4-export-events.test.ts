import { describe, expect, it } from "vitest";
import type { Bar, CorporateEvent } from "@qt/core";
import { eventIndex, eventText, isExtendedHours, placeEventMarkers } from "../src/chart/events";
import { chartCsv, exportFileName, indicatorColumns } from "../src/chart/export/csvExport";
import { HEADER_LINE, HEADER_PAD, pngHeaderLines, pngLayout } from "../src/chart/export/pngExport";

const DAY = 86400;
const T0 = 1_704_067_200; // 2024-01-01 UTC (Monday)

describe("CSV export helpers", () => {
  const bars: Bar[] = [0, 1, 2].map((i) => ({ time: T0 + i * DAY, open: 1 + i, high: 2 + i, low: i, close: 1.5 + i, volume: 100 * i }));

  it("names indicator columns uniquely and per output", () => {
    const cols = indicatorColumns([
      { label: "EMA 20", outputs: [{ label: "EMA", series: [1, 2, 3] }] },
      { label: "EMA 20", outputs: [{ label: "EMA", series: [4, 5, 6] }] },
      { label: "MACD 12 26 9", outputs: [{ label: "MACD", series: [null, 1, 2] }, { label: "Signal", series: undefined }] },
    ]);
    expect(Object.keys(cols)).toEqual(["EMA 20", "EMA 20 (2)", "MACD 12 26 9 MACD"]);
  });

  it("writes one row per bar with the indicator values aligned", () => {
    const csv = chartCsv(bars, [{ label: "SMA 2", outputs: [{ label: "SMA", series: [null, 1.5, 2.5] }] }]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("time,open,high,low,close,volume,SMA 2");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe("2024-01-01T00:00:00.000Z,1,2,0,1.5,0,");
    expect(lines[3].endsWith(",2.5")).toBe(true);
  });

  it("pads short series and builds safe file names", () => {
    const csv = chartCsv(bars, [{ label: "X", outputs: [{ label: "X", series: [7] }] }]);
    expect(csv.trim().split("\r\n").map((l) => l.split(",").at(-1))).toEqual(["X", "7", "", ""]);
    expect(exportFileName("BINANCE:BTCUSDT", "1h", "csv", new Date("2026-10-13T08:00:00Z"))).toBe("BINANCE_BTCUSDT_1h_2026-10-13.csv");
    expect(exportFileName("AAPL/MSFT", "2h", "png", new Date("2026-10-13T08:00:00Z"))).toBe("AAPL_MSFT_2h_2026-10-13.png");
  });
});

describe("PNG export helpers", () => {
  it("adds a header band above the chart and scales by the pixel ratio", () => {
    const header = HEADER_PAD * 2 + 3 * HEADER_LINE;
    expect(pngLayout(800, 600, 2, 3)).toEqual({ width: 1600, height: (600 + header) * 2, header, scale: 2 });
    expect(pngLayout(800, 600, 0.5, 0)).toEqual({ width: 800, height: 600, header: 0, scale: 1 });
  });

  it("caps the header lines", () => {
    expect(pngHeaderLines("AAPL · 1D", ["a", "b", "c"], 2)).toEqual(["AAPL · 1D", "a", "b", "+1 more"]);
  });
});

describe("event marker placement", () => {
  const daily = [0, 1, 2, 3, 4, 7, 8].map((d) => T0 + d * DAY); // Mon..Fri, next Mon, Tue

  it("puts an event on the bar that contains its time", () => {
    expect(eventIndex(daily, DAY, T0 + 2 * DAY)).toBe(2);
    expect(eventIndex(daily, DAY, T0 + 2 * DAY + 3600)).toBe(2);
  });

  it("moves an event in a gap (weekend) to the next bar and drops events outside the data", () => {
    expect(eventIndex(daily, DAY, T0 + 5 * DAY)).toBe(5); // Saturday → Monday
    expect(eventIndex(daily, DAY, T0 - 1)).toBe(-1);
    expect(eventIndex(daily, DAY, T0 + 9 * DAY)).toBe(-1);
    expect(eventIndex(daily, DAY, T0 + 8 * DAY + 100)).toBe(6);
  });

  it("maps intraday events (UTC midnight) to the first bar of that day", () => {
    const H = 3600;
    const intraday = [T0 + 14 * H, T0 + 15 * H, T0 + DAY + 14 * H, T0 + DAY + 15 * H];
    expect(eventIndex(intraday, H, T0 + DAY)).toBe(2);
  });

  it("groups events of one bar into a single marker", () => {
    const ev: CorporateEvent[] = [
      { time: T0 + 3 * DAY, kind: "split", value: "4:1" },
      { time: T0 + 3 * DAY, kind: "dividend", value: 0.24 },
      { time: T0 + 7 * DAY, kind: "earnings", value: "" },
      { time: T0 - DAY, kind: "dividend", value: 0.2 },
    ];
    const m = placeEventMarkers(ev, daily, DAY);
    expect(m.map((x) => [x.index, x.label])).toEqual([
      [3, "DS"],
      [5, "E"],
    ]);
    expect(eventText(ev[1])).toBe("Dividend 0.24 · 2024-01-04");
    expect(eventText(ev[0])).toBe("Split 4:1 · 2024-01-04");
  });

  it("classifies US extended hours in New York time across DST", () => {
    expect(isExtendedHours(Date.UTC(2024, 0, 2, 14, 30) / 1000)).toBe(false); // 09:30 EST
    expect(isExtendedHours(Date.UTC(2024, 0, 2, 14, 0) / 1000)).toBe(true); // 09:00 EST
    expect(isExtendedHours(Date.UTC(2024, 6, 2, 13, 30) / 1000)).toBe(false); // 09:30 EDT
    expect(isExtendedHours(Date.UTC(2024, 6, 2, 20, 0) / 1000)).toBe(true); // 16:00 EDT
  });
});
