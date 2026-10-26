import { describe, expect, it } from "vitest";
import type { BacktestMetrics, Trade } from "../src/types";
import { barsToCsv, csvField, metricsToCsv, tradesToCsv } from "../src/export/csv";

describe("csv", () => {
  it("quotes per RFC 4180", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField("cr\r")).toBe('"cr\r"');
    expect(csvField(null)).toBe("");
    expect(csvField(NaN)).toBe("");
    expect(csvField(1.5)).toBe("1.5");
  });

  it("bars with ISO times and extra series", () => {
    const csv = barsToCsv(
      [
        { time: 1704153600, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
        { time: 1704240000, open: 1.5, high: 2.5, low: 1, close: 2, volume: 20 },
      ],
      { "sma, 2": [null, 1.75] },
    );
    expect(csv).toBe(
      'time,open,high,low,close,volume,"sma, 2"\r\n' +
        "2024-01-02T00:00:00.000Z,1,2,0.5,1.5,10,\r\n" +
        "2024-01-03T00:00:00.000Z,1.5,2.5,1,2,20,1.75\r\n",
    );
  });

  it("trades and metrics", () => {
    const t: Trade = {
      side: "long",
      entryIndex: 1,
      entryTime: 0,
      entryPrice: 10,
      exitIndex: 3,
      exitTime: 86400,
      exitPrice: 11,
      qty: 2,
      pnl: 2,
      pnlPct: 10,
      fees: 0,
      barsHeld: 2,
      exitReason: "target",
    };
    const lines = tradesToCsv([t]).split("\r\n");
    expect(lines[0]).toBe("side,entryIndex,entryTime,entryPrice,exitIndex,exitTime,exitPrice,qty,pnl,pnlPct,fees,barsHeld,exitReason");
    expect(lines[1]).toBe("long,1,1970-01-01T00:00:00.000Z,10,3,1970-01-02T00:00:00.000Z,11,2,2,10,0,2,target");
    const m = { totalReturnPct: 12.5, sharpe: 1.2 } as unknown as BacktestMetrics;
    expect(metricsToCsv(m)).toBe("metric,value\r\ntotalReturnPct,12.5\r\nsharpe,1.2\r\n");
  });
});
