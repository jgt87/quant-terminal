import { describe, expect, it } from "vitest";
import { BinanceProvider, parseAggTrades, parseKlineFlow } from "../src/providers/binance";
import { MarketData } from "../src/providers";
import { OrderFlowService } from "../src/routes/orderflow";
import { fakeFetch, type FakeReply } from "./helpers";

const T0 = Date.UTC(2026, 9, 1, 0, 0); // ms, a minute boundary

/** Synthetic aggTrades: one trade every `stepMs` from T0, ids from 1; alternating buy / sell. */
function tradesStub(count: number, stepMs = 1000) {
  const all = Array.from({ length: count }, (_, i) => ({ a: i + 1, p: String(100 + (i % 10) * 0.5), q: "2", T: T0 + i * stepMs, m: i % 2 === 1 }));
  return (url: URL): FakeReply | undefined => {
    if (!url.pathname.endsWith("/aggTrades")) return undefined;
    const limit = Number(url.searchParams.get("limit") ?? 500);
    const fromId = url.searchParams.get("fromId");
    const start = url.searchParams.get("startTime");
    const end = url.searchParams.get("endTime");
    let rows = all;
    if (fromId) rows = all.filter((t) => t.a >= Number(fromId));
    else if (start) rows = all.filter((t) => t.T >= Number(start) && t.T <= Number(end));
    else rows = all.slice(Math.max(0, all.length - limit));
    return { body: rows.slice(0, limit) };
  };
}

describe("Binance order flow parsing", () => {
  it("maps buyer-is-maker to an aggressive sell", () => {
    const t = parseAggTrades([{ a: 7, p: "10.5", q: "0.3", T: 1000, m: true }, { a: 8, p: "10.6", q: "1", T: 1001, m: false }]);
    expect(t).toEqual([
      { id: 7, time: 1000, price: 10.5, qty: 0.3, buy: false },
      { id: 8, time: 1001, price: 10.6, qty: 1, buy: true },
    ]);
  });

  it("splits kline volume into taker buy and sell", () => {
    const f = parseKlineFlow([[60000, "1", "2", "0.5", "1.5", "10", 119999, "0", 5, "6.5", "0", "0"]]);
    expect(f).toEqual([{ time: 60, buy: 6.5, sell: 3.5 }]);
  });
});

describe("aggTrades paging", () => {
  it("walks pages by id until the end time and reports completeness", async () => {
    const fetchFn = fakeFetch(tradesStub(3500));
    const p = new BinanceProvider(fetchFn);
    const all = await p.aggTrades("BTCUSDT", T0, T0 + 3_000_000);
    expect(all.complete).toBe(true);
    expect(all.trades).toHaveLength(3000);
    expect(all.trades[0].id).toBe(1);
    expect(all.trades.every((t, i, a) => i === 0 || t.id === a[i - 1].id + 1)).toBe(true);
    const capped = await new BinanceProvider(fakeFetch(tradesStub(3500))).aggTrades("BTCUSDT", T0, T0 + 3_400_000, 2);
    expect(capped.complete).toBe(false);
    expect(capped.trades).toHaveLength(2000);
  });

  it("finds the first trade after an empty hour and ends at the newest trade", async () => {
    const p = new BinanceProvider(fakeFetch(tradesStub(1500)));
    const r = await p.aggTrades("BTCUSDT", T0 - 2 * 3_600_000, T0 + 10 * 3_600_000);
    expect(r.complete).toBe(true);
    expect(r.trades).toHaveLength(1500);
  });
});

describe("footprint service", () => {
  it("builds footprints and caches closed bars", async () => {
    const fetchFn = fakeFetch(tradesStub(600));
    const market = new MarketData({ fetchFn });
    const svc = new OrderFlowService(market, () => T0 + 3_600_000);
    const from = T0 / 1000;
    const r = await svc.footprint("BINANCE:BTCUSDT", "1m", from, from + 600, 0.5);
    expect(r.bars).toHaveLength(10);
    expect(r.bars[0].buy + r.bars[0].sell).toBe(120);
    expect(r.bars[0].delta).toBe(0);
    const calls = fetchFn.calls.filter((u) => u.includes("aggTrades")).length;
    const again = await svc.footprint("BINANCE:BTCUSDT", "1m", from, from + 600, 0.5);
    expect(again.bars).toEqual(r.bars);
    expect(fetchFn.calls.filter((u) => u.includes("aggTrades")).length).toBe(calls);
  });

  it("returns only fully covered bars and where to continue when the trade cap is hit", async () => {
    // 60 trades per minute; a 3-page cap reads 3000 trades = 50 minutes.
    const market = new MarketData({ fetchFn: fakeFetch(tradesStub(6000)) });
    const svc = new OrderFlowService(market, () => T0 + 7_200_000);
    const from = T0 / 1000;
    const r = await svc.footprint("BINANCE:BTCUSDT", "1m", from, from + 90 * 60, 0.5, 3);
    expect(r.complete).toBe(false);
    // The last trade read is at 49:59, so minute 49 may still have more trades: it is left for the next call.
    expect(r.next).toBe(from + 49 * 60);
    expect(r.bars).toHaveLength(49);
    expect(r.bars.every((b) => b.buy + b.sell === 120)).toBe(true);
    const rest = await svc.footprint("BINANCE:BTCUSDT", "1m", r.next!, from + 90 * 60, 0.5, 3);
    expect(rest.complete).toBe(true);
    expect(rest.bars).toHaveLength(41);
  });

  it("rejects non-Binance symbols and long intervals", async () => {
    const svc = new OrderFlowService(new MarketData({ fetchFn: fakeFetch(() => undefined) }));
    await expect(svc.footprint("AAPL", "1m", 1, 61, 1)).rejects.toThrow(/Binance/);
    await expect(svc.footprint("BINANCE:BTCUSDT", "1W", 1, 61, 1)).rejects.toThrow(/interval/);
  });
});

describe("tick replay data", () => {
  it("serves Binance trades as ticks and MT5 ticks from the bridge", async () => {
    const svc = new OrderFlowService(new MarketData({ fetchFn: fakeFetch(tradesStub(300)) }));
    const from = T0 / 1000;
    const r = await svc.ticks("BINANCE:BTCUSDT", from, from + 60);
    expect(r.complete).toBe(true);
    expect(r.ticks).toHaveLength(60);
    expect(r.ticks[0]).toEqual({ time: T0, price: 100, qty: 2 });

    const bridge = fakeFetch((url) => {
      if (url.pathname === "/symbols") return { body: [{ symbol: "EURUSD", description: "Euro", path: "Forex", digits: 5, currency: "USD" }] };
      if (url.pathname === "/ticks") {
        expect(url.searchParams.get("from")).toBe(String(from));
        return { body: { ticks: [{ time: T0, price: 1.1, qty: 0 }, { time: T0 + 5, price: 0, qty: 0 }], complete: true } };
      }
      return undefined;
    });
    const mt5 = new OrderFlowService(new MarketData({ fetchFn: bridge, mt5BridgeUrl: "http://bridge.test" }));
    const m = await mt5.ticks("MT5:EURUSD", from, from + 60);
    expect(m.ticks).toEqual([{ time: T0, price: 1.1, qty: 0 }]);
    await expect(svc.ticks("AAPL", from, from + 60)).rejects.toThrow(/Binance and MT5/);
    await expect(svc.ticks("BINANCE:BTCUSDT", from, from + 2 * 86400)).rejects.toThrow(/hours/);
  });
});
