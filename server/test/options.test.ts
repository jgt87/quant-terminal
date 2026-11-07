import { describe, expect, it } from "vitest";
import { BinanceOptions, parseOptionInfo } from "../src/providers/binanceOptions";
import { optionsUnderlying } from "../src/routes/options";
import { MarketData } from "../src/providers";
import { fakeFetch } from "./helpers";

const DEC = Date.UTC(2026, 11, 25, 8);
const JAN = Date.UTC(2027, 0, 29, 8);
const sym = (strike: number, side: "C" | "P", exp = DEC) => ({ symbol: `BTC-${exp === DEC ? "261225" : "270129"}-${strike}-${side}`, underlying: "BTCUSDT", expiryDate: exp, side: side === "C" ? "CALL" : "PUT", strikePrice: String(strike) });
const symbols = [sym(70000, "C"), sym(70000, "P"), sym(80000, "C"), sym(80000, "P"), sym(80000, "C", JAN), sym(80000, "P", JAN), { symbol: "ETH-261225-3000-C", underlying: "ETHUSDT", expiryDate: DEC }];

function stub() {
  return fakeFetch((url) => {
    const p = url.pathname;
    if (p.endsWith("/exchangeInfo")) return { body: { optionSymbols: symbols } };
    if (p.endsWith("/ticker")) return { body: symbols.map((s) => ({ symbol: s.symbol, bidPrice: "10", askPrice: "12", lastPrice: "11", volume: "3" })) };
    if (p.endsWith("/mark")) return { body: symbols.map((s) => ({ symbol: s.symbol, markPrice: "11", markIV: s.symbol.includes("270129") ? "0.6" : "0.5", delta: "0.4", gamma: "0", theta: "-1", vega: "2" })) };
    if (p.endsWith("/openInterest")) {
      expect(url.searchParams.get("underlyingAsset")).toBe("BTC");
      return { body: [{ symbol: `BTC-${url.searchParams.get("expiration")}-80000-P`, sumOpenInterest: "7.5" }] };
    }
    if (p.endsWith("/index")) return { body: { indexPrice: "76000" } };
    return undefined;
  });
}

describe("Binance options", () => {
  it("parses exchange info", () => {
    const info = parseOptionInfo({ optionSymbols: symbols });
    expect(info[0]).toEqual({ symbol: "BTC-261225-70000-C", underlying: "BTCUSDT", expiry: DEC, strike: 70000, side: "call" });
    expect(() => parseOptionInfo({})).toThrow(/unexpected/);
  });

  it("assembles the nearest expiry's chain with open interest and the term structure", async () => {
    const fetchFn = stub();
    const o = new BinanceOptions(fetchFn, () => DEC - 86_400_000);
    expect(await o.underlyings()).toEqual(["BTCUSDT", "ETHUSDT"]);
    const c = await o.chain("BTCUSDT");
    expect(c.expiries.map((e) => e.code)).toEqual(["261225", "270129"]);
    expect(c.expiry?.code).toBe("261225");
    expect(c.index).toBe(76000);
    expect(c.rows.map((r) => r.strike)).toEqual([70000, 80000]);
    expect(c.rows[1].put).toMatchObject({ bid: 10, ask: 12, iv: 0.5, openInterest: 7.5, volume: 3 });
    expect(c.rows[0].call?.openInterest).toBe(0);
    expect(c.term).toEqual([
      { time: DEC, iv: 0.5 },
      { time: JAN, iv: 0.6 },
    ]);
    const jan = await o.chain("BTCUSDT", JAN);
    expect(jan.rows).toHaveLength(1);
    await expect(o.chain("BTCUSDT", 123)).rejects.toThrow(/Unknown expiry/);
    await expect(o.chain("XRPUSDT")).rejects.toThrow(/No listed options/);
    // Tickers and marks are cached between calls.
    expect(fetchFn.calls.filter((u) => u.includes("/ticker")).length).toBe(1);
  });

  it("maps app symbols to underlyings", async () => {
    const market = new MarketData({ fetchFn: stub() });
    expect(await optionsUnderlying(market, "BINANCE:BTCUSDT")).toBe("BTCUSDT");
    expect(await optionsUnderlying(market, "eth")).toBe("ETHUSDT");
    await expect(optionsUnderlying(market, "AAPL")).rejects.toThrow(/No listed options for AAPL \(options: BTC, ETH\)/);
  });
});
