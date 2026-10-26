import { describe, expect, it } from "vitest";
import { routeSymbol } from "../src/providers";
import { Mt5Provider, mt5Type } from "../src/providers/mt5";

const bridge = (routes: Record<string, unknown>) =>
  (async (input: string) => {
    const url = new URL(input);
    const key = Object.keys(routes).find((k) => url.pathname === k);
    if (!key) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  }) as never;

describe("MT5 routing", () => {
  it("routes MT5: prefix to the bridge with a canonical id", () => {
    expect(routeSymbol("MT5:eurusd", null)).toEqual({ provider: "mt5", ticker: "EURUSD", canonical: "MT5:EURUSD" });
    expect(routeSymbol("MT5:AAPL.NAS", null)).toEqual({ provider: "mt5", ticker: "AAPL.NAS", canonical: "MT5:AAPL.NAS" });
  });
  it("keeps FX on Yahoo by default and moves it to MT5 when configured", () => {
    expect(routeSymbol("EURUSD=X", null).provider).toBe("yahoo");
    expect(routeSymbol("FX:EURUSD", null)).toMatchObject({ provider: "yahoo", ticker: "EURUSD=X" });
    expect(routeSymbol("EURUSD=X", null, "mt5")).toEqual({ provider: "mt5", ticker: "EURUSD", canonical: "MT5:EURUSD" });
    expect(routeSymbol("OANDA:GBPJPY", null, "mt5").canonical).toBe("MT5:GBPJPY");
    expect(routeSymbol("AAPL", null, "mt5").provider).toBe("yahoo");
  });
  it("classifies broker symbol paths", () => {
    expect(mt5Type("Forex\Majors\EURUSD")).toBe("fx");
    expect(mt5Type("Indices\Indices Spot\US500")).toBe("index");
    expect(mt5Type("Stock CFD's\Nasdaq\AAPL.NAS")).toBe("stock");
    expect(mt5Type("Crypto\BTCUSD")).toBe("crypto");
    expect(mt5Type("Metals\XAUUSD")).toBe("other");
  });
});

describe("Mt5Provider", () => {
  const symbols = [{ symbol: "AAPL.NAS", description: "Apple Inc CFD", path: "Stock CFD's\Nasdaq\AAPL.NAS", digits: 3, currency: "USD" }];
  const p = new Mt5Provider(
    bridge({
      "/health": { ok: true },
      "/symbols": symbols,
      "/bars": { bars: [{ time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }, { time: 50, open: 1, high: 1, low: 1, close: 1, volume: 1 }], hasMore: true },
      "/quotes": [{ symbol: "AAPL.NAS", last: 10, change: 1, changePct: 11.1, time: 5 }],
    }),
    "http://bridge.test",
  );

  it("returns validated, sorted bars with symbol info", async () => {
    const page = await p.bars("AAPL.NAS", "1h", undefined, 10);
    expect(page.info).toMatchObject({ symbol: "MT5:AAPL.NAS", type: "stock", provider: "mt5", exchange: "MT5" });
    expect(page.bars.map((b) => b.time)).toEqual([50, 100]);
    expect(page.hasMore).toBe(true);
  });
  it("maps quotes to canonical ids", async () => {
    expect(await p.quotes(["AAPL.NAS"])).toEqual([{ symbol: "MT5:AAPL.NAS", last: 10, change: 1, changePct: 11.1, time: 5 }]);
  });
  it("unknown symbols are 404", async () => {
    await expect(p.bars("NOPE", "1h", undefined, 10)).rejects.toMatchObject({ status: 404 });
  });
  it("search is empty when the bridge is down", async () => {
    const down = new Mt5Provider((async () => { throw new Error("ECONNREFUSED"); }) as never, "http://bridge.test");
    expect(await down.search("eur")).toEqual([]);
  });
});
