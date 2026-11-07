import { describe, expect, it } from "vitest";
import { atmIv, atmStrike, chainRows, expiryCode, parseOptionSymbol, putCallRatio, smile, type OptionQuote } from "../src/options";

const q = (symbol: string, o: Partial<OptionQuote> = {}): OptionQuote => ({ symbol, bid: 1, ask: 2, last: null, volume: 0, openInterest: 0, mark: 1.5, iv: 0.5, delta: null, gamma: null, theta: null, vega: null, ...o });

describe("option chain helpers", () => {
  it("parses exchange symbols", () => {
    expect(parseOptionSymbol("BTC-261225-85000-C")).toEqual({ base: "BTC", code: "261225", strike: 85000, side: "call" });
    expect(parseOptionSymbol("DOGE-261225-0.25-P")).toEqual({ base: "DOGE", code: "261225", strike: 0.25, side: "put" });
    expect(parseOptionSymbol("BTCUSDT")).toBeNull();
    expect(expiryCode(Date.UTC(2026, 11, 25, 8))).toBe("261225");
  });

  it("builds rows by strike and finds the money", () => {
    const rows = chainRows([q("BTC-261225-90000-C", { iv: 0.4 }), q("BTC-261225-80000-P", { iv: 0.6 }), q("BTC-261225-80000-C", { iv: 0.5 }), q("bad")]);
    expect(rows.map((r) => [r.strike, Boolean(r.call), Boolean(r.put)])).toEqual([
      [80000, true, true],
      [90000, true, false],
    ]);
    expect(atmStrike(rows, 84000)).toBe(80000);
    expect(atmStrike([], 1)).toBeNull();
    expect(atmIv(rows, 81000)).toBeCloseTo(0.55, 9);
    // Smile: puts below the price, calls above.
    expect(smile(rows, 85000)).toEqual([
      { strike: 80000, iv: 0.6 },
      { strike: 90000, iv: 0.4 },
    ]);
  });

  it("computes put / call ratios", () => {
    const rows = chainRows([q("X-261225-1-C", { openInterest: 10, volume: 4 }), q("X-261225-1-P", { openInterest: 5, volume: 8 })]);
    expect(putCallRatio(rows, "openInterest")).toBe(0.5);
    expect(putCallRatio(rows, "volume")).toBe(2);
    expect(putCallRatio(chainRows([q("X-261225-1-P")]), "volume")).toBeNull();
  });
});
