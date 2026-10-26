import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { MarketData, barOptionsKey } from "../src/providers";
import { parseYahooChart, parseYahooEvents } from "../src/providers/yahoo";
import { Store } from "../src/store";
import { fakeFetch, fixture } from "./helpers";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const FIX = "yahoo-chart-events-test.json";
const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000;

describe("parseYahooEvents", () => {
  it("dividends and splits, stamped at UTC midnight of the exchange date, sorted", () => {
    expect(parseYahooEvents(fixture(FIX), "TEST")).toEqual([
      { time: day(2020, 8, 31), kind: "split", value: "4:1" },
      { time: day(2026, 5, 11), kind: "dividend", value: 0.25 },
      { time: day(2026, 8, 11), kind: "dividend", value: 0.26 },
    ]);
  });

  it("split ratio from splitRatio when numerator/denominator are missing; earnings when present", () => {
    const json = fixture<any>(FIX);
    const r = json.chart.result[0];
    r.events = {
      splits: { a: { date: 1_600_000_000, splitRatio: "3/2" } },
      earnings: { b: { date: 1_700_000_000, epsActual: 1.5 } },
    };
    const ev = parseYahooEvents(json, "TEST");
    expect(ev.map((e) => [e.kind, e.value])).toEqual([["split", "3:2"], ["earnings", 1.5]]);
  });

  it("no events block gives an empty list", () => {
    const json = fixture<any>(FIX);
    delete json.chart.result[0].events;
    expect(parseYahooEvents(json, "TEST")).toEqual([]);
  });
});

describe("dividend-adjusted bars", () => {
  it("scales OHLC by adjclose/close", () => {
    const { bars } = parseYahooChart(fixture(FIX), "TEST", "1D", { adjust: "dividends" });
    const f = 199 / 200;
    expect(bars[0]).toMatchObject({ time: day(2026, 8, 10), close: 199, volume: 1000 });
    expect(bars[0].open).toBeCloseTo(199 * f, 10);
    expect(bars[0].high).toBeCloseTo(201 * f, 10);
    expect(bars[0].low).toBeCloseTo(198 * f, 10);
    expect(bars[2]).toMatchObject({ open: 203, high: 205, low: 202, close: 204 }); // factor 1
  });

  it("unadjusted by default", () => {
    const { bars } = parseYahooChart(fixture(FIX), "TEST", "1D");
    expect(bars.map((b) => b.close)).toEqual([200, 202, 204]);
  });

  it("cache key suffixes only where the option changes the data", () => {
    expect(barOptionsKey({}, "1D")).toBe("");
    expect(barOptionsKey({ adjust: "dividends" }, "1D")).toBe(":adj");
    expect(barOptionsKey({ adjust: "dividends" }, "5m")).toBe("");
    expect(barOptionsKey({ session: "extended" }, "5m")).toBe(":ext");
    expect(barOptionsKey({ session: "extended" }, "1D")).toBe("");
    expect(barOptionsKey({ adjust: "dividends", session: "extended" }, "1W")).toBe(":adj");
  });
});

describe("/api/events and bar options over HTTP (stubbed upstream)", () => {
  let server: Server;
  let base: string;
  let dir: string;
  const fetchFn = fakeFetch((url) => {
    if (url.hostname.endsWith("finance.yahoo.com")) {
      const ticker = decodeURIComponent(url.pathname.split("/").pop()!);
      if (ticker === "TEST") return { body: fixture(FIX) };
      return { status: 404, body: { chart: { result: null, error: { code: "Not Found", description: "No data found, symbol may be delisted" } } } };
    }
    if (url.hostname === "api.binance.com" && url.pathname.endsWith("/exchangeInfo")) return { body: fixture("binance-exchangeinfo.json") };
    return undefined;
  });

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "qt-events-"));
    const market = new MarketData({ fetchFn, cacheDir: path.join(dir, "cache"), now: () => day(2026, 8, 13) });
    server = createServer(createApp({ market, store: new Store(path.join(dir, "store")) }));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  });

  const call = async (p: string) => {
    const res = await fetch(base + p);
    return { status: res.status, body: (await res.json()) as any };
  };

  it("GET /api/events requests div/splits/earnings and caches the result", async () => {
    const r = await call("/api/events?symbol=TEST");
    expect(r.status).toBe(200);
    expect(r.body.map((e: any) => e.kind)).toEqual(["split", "dividend", "dividend"]);
    const url = new URL(fetchFn.calls.find((c) => c.includes("/TEST?") && c.includes("events=div"))!);
    expect(url.searchParams.get("events")).toBe("div,splits,earn");
    const before = fetchFn.calls.length;
    await call("/api/events?symbol=TEST");
    expect(fetchFn.calls.length).toBe(before);
    expect((await call("/api/events")).status).toBe(400);
    expect((await call("/api/events?symbol=BINANCE:BTCUSDT")).body).toEqual([]);
  });

  it("adjust=dividends asks for adjclose, gets its own cache entry", async () => {
    const plain = await call("/api/bars?symbol=TEST&interval=1D&limit=3");
    const adj = await call("/api/bars?symbol=TEST&interval=1D&limit=3&adjust=dividends");
    expect(plain.body.bars[0].close).toBe(200);
    expect(adj.body.bars[0].close).toBe(199);
    expect(fetchFn.calls.some((c) => c.includes("includeAdjustedClose=true"))).toBe(true);
    expect((await call("/api/bars?symbol=TEST&interval=1D&limit=3")).body.bars[0].close).toBe(200);
  });

  it("session=extended sets includePrePost for intraday", async () => {
    await call("/api/bars?symbol=TEST&interval=5m&limit=3&session=extended");
    expect(fetchFn.calls.some((c) => c.includes("interval=5m") && c.includes("includePrePost=true"))).toBe(true);
    await call("/api/bars?symbol=TEST&interval=15m&limit=3");
    expect(fetchFn.calls.some((c) => c.includes("interval=15m") && c.includes("includePrePost=false"))).toBe(true);
  });

  it("rejects unknown option values", async () => {
    expect((await call("/api/bars?symbol=TEST&adjust=splits")).status).toBe(400);
    expect((await call("/api/bars?symbol=TEST&session=overnight")).status).toBe(400);
    expect((await call("/api/bars?symbol=TEST&adjust=none&session=regular&limit=3")).status).toBe(200);
  });
});
