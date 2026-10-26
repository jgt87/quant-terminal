import { describe, expect, it } from "vitest";
import { parseYahooChart, parseYahooQuote, parseYahooSearch, YahooProvider } from "../src/providers/yahoo";
import { BinanceProvider, parseExchangeInfo, parseKlines, parseTicker, splitPair } from "../src/providers/binance";
import { HttpError } from "../src/errors";
import { binanceKlinesStub, fakeFetch, fixture } from "./helpers";

const DAY = 86400;

describe("Yahoo parsing (recorded fixtures)", () => {
  it("parses daily bars and stamps them at UTC midnight of the exchange date", () => {
    const { meta, bars } = parseYahooChart(fixture("yahoo-chart-aapl-1d.json"), "AAPL", "1D");
    expect(meta.currency).toBe("USD");
    expect(bars).toHaveLength(5);
    for (const b of bars) {
      expect(b.time % DAY).toBe(0);
      expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close));
      expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close));
    }
    expect(new Date(bars[0].time * 1000).toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(bars[4].close).toBeCloseTo(340.97, 2);
  });

  it("merges the closing-tick stub into the last hourly bar", () => {
    const raw = fixture<any>("yahoo-chart-ndx-60m.json");
    expect(raw.chart.result[0].timestamp).toHaveLength(15);
    const { bars } = parseYahooChart(raw, "^NDX", "1h");
    expect(bars).toHaveLength(14);
    const last = bars[bars.length - 1];
    expect(new Date(last.time * 1000).toISOString()).toBe("2026-10-12T19:30:00.000Z");
    expect(last.close).toBeCloseTo(30664.697, 2);
  });

  it("aggregates 60m into session-anchored 4h bars", () => {
    const { bars } = parseYahooChart(fixture("yahoo-chart-ndx-60m.json"), "^NDX", "4h");
    expect(bars.map((b) => new Date(b.time * 1000).toISOString().slice(5, 16))).toEqual([
      "10-09T13:30", "10-09T17:30", "10-12T13:30", "10-12T17:30",
    ]);
    const hourly = parseYahooChart(fixture("yahoo-chart-ndx-60m.json"), "^NDX", "1h").bars;
    expect(bars[0].open).toBe(hourly[0].open);
    expect(bars[0].close).toBe(hourly[3].close);
    expect(bars[0].volume).toBe(hourly.slice(0, 4).reduce((s, b) => s + b.volume, 0));
  });

  it("maps an unknown-symbol response to 404", () => {
    const body = { chart: { result: null, error: { code: "Not Found", description: "No data found, symbol may be delisted" } } };
    expect(() => parseYahooChart(body, "ZZZZ", "1D")).toThrow(expect.objectContaining({ status: 404, code: "not_found" }));
  });

  it("parses search results into SymbolInfo", () => {
    const out = parseYahooSearch(fixture("yahoo-search-apple.json"));
    expect(out[0]).toEqual({ symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", type: "stock", currency: "", provider: "yahoo" });
    expect(out.some((s) => s.type === "future")).toBe(true);
  });

  it("derives a quote from chart meta", () => {
    const q = parseYahooQuote(fixture("yahoo-chart-aapl-1d.json"), "AAPL");
    expect(q.symbol).toBe("AAPL");
    expect(q.last).toBeCloseTo(340.97, 2);
    expect(q.change).toBeCloseTo(340.97 - 332.89, 6);
    expect(q.changePct).toBeCloseTo(((340.97 - 332.89) / 332.89) * 100, 6);
  });
});

describe("Binance parsing (recorded fixtures)", () => {
  it("parses klines (ms → s, strings → numbers)", () => {
    const bars = parseKlines(fixture("binance-klines-btcusdt-4h.json"));
    expect(bars).toHaveLength(6);
    expect(bars[1].time - bars[0].time).toBe(4 * 3600);
    expect(typeof bars[0].open).toBe("number");
    expect(bars[0].time % 14400).toBe(0);
  });

  it("parses the 24h ticker into quotes", () => {
    const rows = fixture<Record<string, unknown>[]>("binance-ticker-24hr.json");
    const q = parseTicker(rows[0]);
    expect(q.symbol).toBe("BINANCE:BTCUSDT");
    expect(q.last).toBe(Number(rows[0].lastPrice));
    expect(q.changePct).toBe(Number(rows[0].priceChangePercent));
    expect(q.time).toBe(Math.floor(Number(rows[0].closeTime) / 1000));
  });

  it("parses exchangeInfo and splits bare pairs", () => {
    const pairs = parseExchangeInfo(fixture("binance-exchangeinfo.json"));
    expect(pairs.find((p) => p.symbol === "ETHBTC")).toEqual({ symbol: "ETHBTC", base: "ETH", quote: "BTC" });
    expect(splitPair("SOLUSDT")).toEqual({ symbol: "SOLUSDT", base: "SOL", quote: "USDT" });
  });
});

describe("Binance paging", () => {
  const start = Date.UTC(2020, 0, 1) / 1000;

  it("pages backwards with endTime and reports exhaustion", async () => {
    const fetchFn = fakeFetch(binanceKlinesStub(start, 2500));
    const p = new BinanceProvider(fetchFn);
    const res = await p.bars("BTCUSDT", "1D", undefined, 3000);
    expect(res.bars).toHaveLength(2500);
    expect(res.hasMore).toBe(false);
    expect(fetchFn.calls).toHaveLength(3);
    expect(res.bars[0].time).toBe(start);
    // Strictly increasing, no duplicates across page seams.
    for (let i = 1; i < res.bars.length; i++) expect(res.bars[i].time - res.bars[i - 1].time).toBe(DAY);
  });

  it("returns bars strictly before `to`", async () => {
    const p = new BinanceProvider(fakeFetch(binanceKlinesStub(start, 2500)));
    const to = start + 100 * DAY;
    const res = await p.bars("BTCUSDT", "1D", to, 10);
    expect(res.bars.map((b) => (b.time - start) / DAY)).toEqual([90, 91, 92, 93, 94, 95, 96, 97, 98, 99]);
    expect(res.hasMore).toBe(true);
    const first = await p.bars("BTCUSDT", "1D", start + 5 * DAY, 10);
    expect(first.bars).toHaveLength(5);
    expect(first.hasMore).toBe(false);
  });

  it("maps -1121 to 404 and HTTP 429 to 502", async () => {
    const p404 = new BinanceProvider(fakeFetch(() => ({ status: 400, body: { code: -1121, msg: "Invalid symbol." } })));
    await expect(p404.bars("NOPEUSDT", "1D", undefined, 5)).rejects.toMatchObject({ status: 404 });
    const p429 = new BinanceProvider(fakeFetch(() => ({ status: 429, body: { code: -1003, msg: "Too many requests" } })));
    await expect(p429.bars("BTCUSDT", "1D", undefined, 5)).rejects.toMatchObject({ status: 502, code: "provider_error" });
  });

  it("falls back to per-symbol tickers when one symbol breaks the batch", async () => {
    const rows = fixture<Record<string, unknown>[]>("binance-ticker-24hr.json");
    const p = new BinanceProvider(
      fakeFetch((url) => {
        const syms = JSON.parse(url.searchParams.get("symbols") ?? "[]") as string[];
        if (syms.includes("NOPEUSDT")) return { status: 400, body: { code: -1121, msg: "Invalid symbol." } };
        return { body: rows.filter((r) => syms.includes(r.symbol as string)) };
      }),
    );
    const qs = await p.quotes(["BTCUSDT", "NOPEUSDT", "ETHUSDT"]);
    expect(qs.map((q) => q.symbol).sort()).toEqual(["BINANCE:BTCUSDT", "BINANCE:ETHUSDT"]);
  });
});

describe("Yahoo windows", () => {
  const now = Date.UTC(2026, 9, 12, 21) / 1000;

  it("filters bars to strictly before `to` and requests period2 = to", async () => {
    const fetchFn = fakeFetch(() => ({ body: fixture("yahoo-chart-aapl-1d.json") }));
    const p = new YahooProvider(fetchFn, () => now);
    const to = Date.UTC(2026, 9, 8) / 1000;
    const res = await p.bars("AAPL", "1D", to, 2);
    expect(res.bars.map((b) => new Date(b.time * 1000).toISOString().slice(0, 10))).toEqual(["2026-10-06", "2026-10-07"]);
    expect(new URL(fetchFn.calls[0]).searchParams.get("period2")).toBe(String(to));
  });

  it("does not request intraday data outside the provider window", async () => {
    const fetchFn = fakeFetch((url) => (url.searchParams.get("range") ? { body: fixture("yahoo-chart-aapl-1d.json") } : undefined));
    const p = new YahooProvider(fetchFn, () => now);
    const res = await p.bars("AAPL", "1m", now - 30 * DAY, 100);
    expect(res.bars).toEqual([]);
    expect(res.hasMore).toBe(false);
    expect(res.info.name).toBe("Apple Inc.");
    expect(fetchFn.calls.every((c) => new URL(c).searchParams.get("period1") === null)).toBe(true);
  });

  it("clamps intraday requests to the window and then reports hasMore=false", async () => {
    const fetchFn = fakeFetch(() => ({ body: fixture("yahoo-chart-ndx-60m.json") }));
    const p = new YahooProvider(fetchFn, () => now);
    const res = await p.bars("^NDX", "1h", undefined, 5000);
    expect(res.hasMore).toBe(false);
    const p1 = Number(new URL(fetchFn.calls[fetchFn.calls.length - 1]).searchParams.get("period1"));
    expect(p1).toBeGreaterThanOrEqual(now - 730 * DAY);
  });

  it("maps HTTP 404 to not_found and 5xx to provider_error", async () => {
    const nf = new YahooProvider(fakeFetch(() => ({ status: 404, body: { chart: { result: null, error: { code: "Not Found", description: "No data found, symbol may be delisted" } } } })), () => now);
    await expect(nf.bars("ZZZZ", "1D", undefined, 5)).rejects.toMatchObject({ status: 404 });
    const down = new YahooProvider(fakeFetch(() => ({ status: 503, body: { chart: { result: null, error: { code: "Unavailable", description: "busy" } } } })), () => now);
    const err = await down.bars("AAPL", "1D", undefined, 5).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(502);
  });
});
