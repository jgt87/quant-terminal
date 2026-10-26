import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as core from "@qt/core";
import type { Bar, ScreenerRow } from "@qt/core";
import { applyFilters, closeAtOrBefore, computeFields, coreCalc, passes, sortRows } from "../src/screener/fields";
import { Screener, validateScreenerRequest } from "../src/screener/screener";
import type { MarketData } from "../src/providers";
import { Store } from "../src/store";

const DAY = 86400;
const calc = coreCalc(core.getIndicator);

/** `n` consecutive daily bars from `start` (UTC seconds): close = 100 + i, high/low = close ± 1. */
function ramp(start: number, n: number, lastVolume = 3000): Bar[] {
  return Array.from({ length: n }, (_, i) => ({
    time: start + i * DAY, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: i === n - 1 ? lastVolume : 1000,
  }));
}

const START = Date.UTC(2025, 0, 1) / 1000;
const idx = (y: number, m: number, d: number) => (Date.UTC(y, m, d) / 1000 - START) / DAY;

describe("computeFields", () => {
  const bars = ramp(START, 300); // last bar: 2025-10-27, close 399
  const f = computeFields(bars, calc);

  it("price, change, volume", () => {
    expect(f.close).toBe(399);
    expect(f.changePct).toBeCloseTo((399 / 398 - 1) * 100, 10);
    expect(f.volume).toBe(3000);
  });

  it("moving averages, RSI and ATR from the core indicators", () => {
    expect(f.sma50).toBeCloseTo(374.5, 10); // mean of 350..399
    expect(f.sma200).toBeCloseTo(299.5, 10); // mean of 200..399
    expect(f.ema20).toBeCloseTo(389.5, 6); // EMA lag on a unit ramp = (n - 1) / 2
    expect(f.rsi14).toBe(100); // only gains
    expect(f.atr14Pct).toBeCloseTo((2 / 399) * 100, 10); // true range is always 2
  });

  it("calendar-based performance", () => {
    expect(idx(2025, 9, 27)).toBe(299);
    expect(f.perf1W).toBeCloseTo((399 / (100 + 292) - 1) * 100, 10);
    expect(f.perf1M).toBeCloseTo((399 / (100 + idx(2025, 8, 27)) - 1) * 100, 10);
    expect(f.perf3M).toBeCloseTo((399 / (100 + idx(2025, 6, 27)) - 1) * 100, 10);
    expect(f.perfYTD).toBeNull(); // no bar before 2025-01-01
  });

  it("52-week range and relative volume", () => {
    expect(f.high52wPct).toBeCloseTo((399 / 400 - 1) * 100, 10);
    expect(f.low52wPct).toBeCloseTo((399 / 99 - 1) * 100, 10);
    expect(f.relVolume).toBeCloseTo(3, 10);
  });

  it("YTD uses the last close of the previous year; 52 weeks only look back 365 days", () => {
    const b = ramp(Date.UTC(2024, 0, 1) / 1000, 500, 1000); // 2024-01-01 .. 2025-05-14
    const g = computeFields(b, calc);
    const dec31 = (Date.UTC(2024, 11, 31) - Date.UTC(2024, 0, 1)) / 1000 / DAY;
    expect(g.perfYTD).toBeCloseTo((599 / (100 + dec31) - 1) * 100, 10);
    // 365 days back from the last bar (index 499): bars 135..499 -> lowest low 99 + 135
    expect(g.low52wPct).toBeCloseTo((599 / (99 + 135) - 1) * 100, 10);
    expect(g.relVolume).toBe(1);
  });

  it("short histories give nulls instead of wrong numbers", () => {
    const g = computeFields(ramp(START, 10), calc);
    expect(g.sma50).toBeNull();
    expect(g.sma200).toBeNull();
    expect(g.rsi14).toBeNull();
    expect(g.perf1M).toBeNull();
    expect(g.relVolume).toBeNull();
    expect(g.close).toBe(109);
    expect(computeFields([], calc).close).toBeNull();
  });

  it("closeAtOrBefore", () => {
    const b = ramp(START, 5);
    expect(closeAtOrBefore(b, START - 1)).toBeNull();
    expect(closeAtOrBefore(b, START)).toBe(100);
    expect(closeAtOrBefore(b, START + 2 * DAY + 5)).toBe(102);
    expect(closeAtOrBefore(b, START + 99 * DAY)).toBe(104);
  });
});

describe("filters and sorting", () => {
  const rows: ScreenerRow[] = [
    { symbol: "A", name: "A", values: { close: 10, sma200: 8, rsi14: 75, perf1M: 5 } },
    { symbol: "B", name: "B", values: { close: 20, sma200: 25, rsi14: 50, perf1M: -2 } },
    { symbol: "C", name: "C", values: { close: 30, sma200: null, rsi14: 30, perf1M: 12 } },
    { symbol: "D", name: "D", values: { close: 40, sma200: 30, rsi14: 70 } },
  ];
  const syms = (r: ScreenerRow[]) => r.map((x) => x.symbol);

  it("comparison ops (missing values never pass)", () => {
    expect(syms(applyFilters(rows, [{ field: "rsi14", op: "<", value: 70 }]))).toEqual(["B", "C"]);
    expect(syms(applyFilters(rows, [{ field: "rsi14", op: "<=", value: 70 }]))).toEqual(["B", "C", "D"]);
    expect(syms(applyFilters(rows, [{ field: "rsi14", op: ">", value: 70 }]))).toEqual(["A"]);
    expect(syms(applyFilters(rows, [{ field: "rsi14", op: ">=", value: 70 }]))).toEqual(["A", "D"]);
    expect(syms(applyFilters(rows, [{ field: "perf1M", op: ">", value: -100 }]))).toEqual(["A", "B", "C"]);
  });

  it("between is inclusive and order-insensitive", () => {
    expect(syms(applyFilters(rows, [{ field: "close", op: "between", value: 20, value2: 30 }]))).toEqual(["B", "C"]);
    expect(syms(applyFilters(rows, [{ field: "close", op: "between", value: 30, value2: 20 }]))).toEqual(["B", "C"]);
    expect(passes(rows[0].values, { field: "close", op: "between", value: 1 })).toBe(false);
  });

  it("above-field / below-field", () => {
    expect(syms(applyFilters(rows, [{ field: "close", op: "above-field", otherField: "sma200" }]))).toEqual(["A", "D"]);
    expect(syms(applyFilters(rows, [{ field: "close", op: "below-field", otherField: "sma200" }]))).toEqual(["B"]);
  });

  it("filters combine with AND", () => {
    expect(syms(applyFilters(rows, [{ field: "close", op: "above-field", otherField: "sma200" }, { field: "rsi14", op: "<", value: 72 }]))).toEqual(["D"]);
  });

  it("sort asc/desc with missing values last", () => {
    expect(syms(sortRows(rows, { field: "perf1M", dir: "desc" }))).toEqual(["C", "A", "B", "D"]);
    expect(syms(sortRows(rows, { field: "perf1M", dir: "asc" }))).toEqual(["B", "A", "C", "D"]);
    expect(syms(sortRows(rows, { field: "sma200", dir: "asc" }))).toEqual(["A", "B", "D", "C"]);
    expect(sortRows(rows, undefined)).toBe(rows);
  });

  it("request validation", () => {
    expect(validateScreenerRequest({ universe: "us-mega", filters: [{ field: "rsi14", op: "<", value: 70 }], sort: { field: "perf1M", dir: "desc" } })).toMatchObject({ universe: "us-mega" });
    for (const bad of [
      null,
      { universe: "x", filters: [{ field: "pe", op: "<", value: 1 }] },
      { universe: "x", filters: [{ field: "close", op: "~", value: 1 }] },
      { universe: "x", filters: [{ field: "close", op: "<" }] },
      { universe: "x", filters: [{ field: "close", op: "between", value: 1 }] },
      { universe: "x", filters: [{ field: "close", op: "above-field" }] },
      { universe: "x", sort: { field: "close", dir: "up" } },
      { universe: "x", columns: ["nope"] },
    ]) {
      expect(() => validateScreenerRequest(bad), JSON.stringify(bad)).toThrow();
    }
  });
});

describe("Screener service", () => {
  let dir: string;
  let store: Store;
  const calls: string[] = [];
  const market = {
    async bars(symbol: string) {
      calls.push(symbol);
      if (symbol === "BAD") throw new Error("Unknown symbol: BAD");
      const offset = symbol === "MSFT" ? 50 : 0;
      const bars = ramp(START, 300).map((b) => ({ ...b, close: b.close + offset, high: b.high + offset, low: b.low + offset }));
      return { symbol: { symbol, name: `${symbol} Inc.` }, interval: "1D", bars, hasMore: false };
    },
  } as unknown as MarketData;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "qt-screener-"));
    store = new Store(dir);
    await store.putWatchlists([{ id: "mine", name: "Mine", symbols: ["AAPL", "BAD"] }]);
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("lists built-in universes and watchlists", async () => {
    const s = new Screener(market, store, async () => core);
    const u = await s.universes();
    const ids = u.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["us-mega", "nasdaq100", "crypto-top", "fx-majors", "watchlist:mine"]));
    const ndx = u.find((x) => x.id === "nasdaq100")!;
    expect(ndx.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ndx.count).toBeGreaterThanOrEqual(100);
    expect(u.find((x) => x.id === "us-mega")!.count).toBeGreaterThanOrEqual(45);
    expect(u.find((x) => x.id === "crypto-top")!.symbols.every((x) => x.startsWith("BINANCE:") && x.endsWith("USDT"))).toBe(true);
  });

  it("runs on a watchlist with per-symbol error isolation and a 10-minute row cache", async () => {
    let now = 1_000_000;
    calls.length = 0;
    const s = new Screener(market, store, async () => core, () => now);
    const r = await s.run({ universe: "watchlist:mine", filters: [] });
    expect(r.rows.map((x) => x.symbol)).toEqual(["AAPL"]);
    expect(r.rows[0].name).toBe("AAPL Inc.");
    expect(r.errors).toEqual([{ symbol: "BAD", message: "Unknown symbol: BAD" }]);
    expect(r.computedAt).toBe(now);
    now += 60_000;
    const again = await s.run({ universe: "watchlist:mine", filters: [] });
    expect(calls.filter((c) => c === "AAPL")).toHaveLength(1); // cached
    expect(again.computedAt).toBe(now - 60_000);
    now += 10 * 60_000;
    await s.run({ universe: "watchlist:mine", filters: [] });
    expect(calls.filter((c) => c === "AAPL")).toHaveLength(2); // expired
  });

  it("explicit symbols, filters, sort and columns", async () => {
    const s = new Screener(market, store, async () => core);
    const r = await s.run({ universe: "custom", symbols: ["AAPL", "MSFT"], filters: [{ field: "close", op: ">", value: 400 }], sort: { field: "close", dir: "desc" }, columns: ["close", "perf1M"] });
    expect(r.rows.map((x) => x.symbol)).toEqual(["MSFT"]);
    expect(Object.keys(r.rows[0].values).sort()).toEqual(["close", "perf1M"]);
    await expect(s.run({ universe: "nope", filters: [] })).rejects.toMatchObject({ status: 404 });
    await expect(s.run({ universe: "watchlist:nope", filters: [] })).rejects.toMatchObject({ status: 404 });
  });

  it("bounded concurrency of 4", async () => {
    let inFlight = 0;
    let peak = 0;
    const slow = {
      async bars(symbol: string) {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { symbol: { symbol, name: symbol }, interval: "1D", bars: ramp(START, 30), hasMore: false };
      },
    } as unknown as MarketData;
    const s = new Screener(slow, store, async () => core);
    const r = await s.run({ universe: "custom", symbols: Array.from({ length: 12 }, (_, i) => `S${i}`), filters: [] });
    expect(r.rows).toHaveLength(12);
    expect(peak).toBe(4);
  });
});
