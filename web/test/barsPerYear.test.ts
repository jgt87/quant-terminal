import { describe, expect, it } from "vitest";
import { barsPerYear } from "../src/backtest/barsPerYear";

describe("barsPerYear", () => {
  it("daily: 252 for stocks/index/fx, 365 for crypto", () => {
    expect(barsPerYear("1D", "stock")).toBe(252);
    expect(barsPerYear("1D", "index")).toBe(252);
    expect(barsPerYear("1D", "fx")).toBe(252);
    expect(barsPerYear("1D", "crypto")).toBe(365);
  });

  it("weekly and monthly", () => {
    expect(barsPerYear("1W", "stock")).toBe(52);
    expect(barsPerYear("1M", "crypto")).toBe(12);
  });

  it("intraday scales by session length", () => {
    // 6.5h session: 7 hourly bars (partial last bar), 78 five-minute bars.
    expect(barsPerYear("1h", "stock")).toBe(252 * 7);
    expect(barsPerYear("5m", "stock")).toBe(252 * 78);
    expect(barsPerYear("1m", "index")).toBe(252 * 390);
    // 24h markets.
    expect(barsPerYear("1h", "crypto")).toBe(365 * 24);
    expect(barsPerYear("4h", "crypto")).toBe(365 * 6);
    expect(barsPerYear("15m", "fx")).toBe(252 * 96);
  });

  it("falls back to exchange-session assumptions for unknown types", () => {
    expect(barsPerYear("1D", undefined)).toBe(252);
    expect(barsPerYear("30m", "other")).toBe(252 * 13);
  });
});
