import { describe, expect, it } from "vitest";
import { parseYahooChart } from "../src/providers/yahoo";

// Shape of a real response captured on 2026-10-12 after the close: the newest daily row has close=null.
const chart = (close: number | null, marketTime: number) => ({
  chart: {
    result: [
      {
        meta: { gmtoffset: -14400, regularMarketPrice: 340.97, regularMarketTime: marketTime, regularMarketDayHigh: 342.63, regularMarketDayLow: 337.6 },
        timestamp: [1791329400, 1791589800],
        indicators: {
          quote: [{ open: [331.7, 338.16], high: [338.61, 342.63], low: [330.7, 337.6], close: [336.64, close], volume: [37855000, 25796997] }],
        },
      },
    ],
    error: null,
  },
});

describe("Yahoo live last row", () => {
  it("keeps the current session when Yahoo has not finalized its close", () => {
    const { bars } = parseYahooChart(chart(null, 1791612000), "AAPL", "1D");
    expect(bars).toHaveLength(2);
    expect(bars[1]).toMatchObject({ open: 338.16, high: 342.63, low: 337.6, close: 340.97 });
  });
  it("does not invent a close when the quote time is outside the last bar", () => {
    const { bars } = parseYahooChart(chart(null, 1791329400 + 3600), "AAPL", "1D");
    expect(bars).toHaveLength(1);
  });
  it("leaves complete rows untouched", () => {
    const { bars } = parseYahooChart(chart(339.5, 1791612000), "AAPL", "1D");
    expect(bars[1].close).toBe(339.5);
  });
});
