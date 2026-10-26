import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { MarketData } from "../src/providers";
import { Store } from "../src/store";
import { binanceKlinesStub, fakeFetch, fixture, type FakeReply } from "./helpers";

let server: Server;
let base: string;
let dir: string;

const notFoundChart = { chart: { result: null, error: { code: "Not Found", description: "No data found, symbol may be delisted" } } };

function upstream(url: URL): FakeReply | undefined {
  if (url.hostname.endsWith("finance.yahoo.com")) {
    if (url.pathname.startsWith("/v1/finance/search")) return { body: fixture("yahoo-search-apple.json") };
    const ticker = decodeURIComponent(url.pathname.split("/").pop()!);
    if (ticker === "AAPL") return { body: fixture("yahoo-chart-aapl-1d.json") };
    if (ticker === "^NDX") return { body: fixture("yahoo-chart-ndx-60m.json") };
    if (ticker === "BOOM") return { status: 500, body: { chart: { result: null, error: { code: "Internal", description: "boom" } } } };
    return { status: 404, body: notFoundChart };
  }
  if (url.hostname === "api.binance.com") {
    if (url.pathname.endsWith("/exchangeInfo")) return { body: fixture("binance-exchangeinfo.json") };
    if (url.pathname.endsWith("/ticker/24hr")) {
      const syms = JSON.parse(url.searchParams.get("symbols") ?? "[]") as string[];
      const rows = fixture<Record<string, unknown>[]>("binance-ticker-24hr.json");
      if (syms.some((s) => !rows.find((r) => r.symbol === s))) return { status: 400, body: { code: -1121, msg: "Invalid symbol." } };
      return { body: rows.filter((r) => syms.includes(r.symbol as string)) };
    }
    if (url.pathname.endsWith("/klines")) {
      if (url.searchParams.get("symbol") !== "BTCUSDT") return { status: 400, body: { code: -1121, msg: "Invalid symbol." } };
      return binanceKlinesStub(Date.UTC(2024, 0, 1) / 1000, 300)(url);
    }
  }
  return undefined;
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "qt-server-"));
  const market = new MarketData({ fetchFn: fakeFetch(upstream), cacheDir: path.join(dir, "cache"), now: () => Date.UTC(2026, 9, 12, 21) / 1000 });
  server = createServer(createApp({ market, store: new Store(path.join(dir, "store")) }));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

async function call(p: string, init?: RequestInit) {
  const res = await fetch(base + p, init);
  return { status: res.status, body: (await res.json()) as any, headers: res.headers };
}

describe("router", () => {
  it("GET /api/health", async () => {
    expect(await call("/api/health")).toMatchObject({ status: 200, body: { ok: true } });
  });

  it("404 for unknown routes, 405 for wrong methods", async () => {
    const r = await call("/api/nope");
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("not_found");
    expect((await call("/api/health", { method: "POST" })).status).toBe(405);
    expect((await call("/not-api")).status).toBe(404);
  });

  it("400 for bad input", async () => {
    for (const p of ["/api/bars", "/api/bars?symbol=AAPL&interval=7h", "/api/bars?symbol=AAPL&limit=0", "/api/bars?symbol=AAPL&limit=5001", "/api/bars?symbol=AAPL&to=abc", "/api/bars?symbol=A%20B"]) {
      const r = await call(p);
      expect(r.status, p).toBe(400);
      expect(r.body.error.code).toBe("bad_request");
    }
  });

  it("CORS: allows localhost origins only", async () => {
    const ok = await fetch(base + "/api/health", { headers: { Origin: "http://localhost:5180" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:5180");
    const other = await fetch(base + "/api/health", { headers: { Origin: "https://example.com" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
    const pre = await fetch(base + "/api/layouts/x", { method: "OPTIONS", headers: { Origin: "http://127.0.0.1:5180" } });
    expect(pre.status).toBe(204);
  });
});

describe("market endpoints (stubbed upstream)", () => {
  it("bars for a Yahoo stock", async () => {
    const r = await call("/api/bars?symbol=NASDAQ:AAPL&interval=1D&limit=3");
    expect(r.status).toBe(200);
    expect(r.body.symbol).toMatchObject({ symbol: "AAPL", provider: "yahoo", currency: "USD", type: "stock" });
    expect(r.body.bars).toHaveLength(3);
    expect(r.body.interval).toBe("1D");
  });

  it("bars for a Binance pair with paging", async () => {
    const r = await call("/api/bars?symbol=BTCUSDT&interval=1d&limit=100");
    expect(r.body.symbol.symbol).toBe("BINANCE:BTCUSDT");
    expect(r.body.bars).toHaveLength(100);
    const to = r.body.bars[0].time;
    const older = await call(`/api/bars?symbol=BINANCE:BTCUSDT&interval=1D&limit=500&to=${to}`);
    expect(older.body.bars).toHaveLength(200);
    expect(older.body.bars.at(-1).time).toBeLessThan(to);
    expect(older.body.hasMore).toBe(false);
  });

  it("404 for unknown symbols, 502 for provider failures", async () => {
    expect((await call("/api/bars?symbol=ZZZZQ&interval=1D")).status).toBe(404);
    expect((await call("/api/bars?symbol=BINANCE:NOPEUSDT&interval=1D")).status).toBe(404);
    const r = await call("/api/bars?symbol=BOOM&interval=1D");
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe("provider_error");
  });

  it("quotes: per-symbol failures do not fail the batch", async () => {
    const r = await call("/api/quotes?symbols=AAPL,ZZZZQ,BINANCE:BTCUSDT,BINANCE:NOPEUSDT");
    expect(r.status).toBe(200);
    expect(r.body.map((q: { symbol: string }) => q.symbol)).toEqual(["AAPL", "BINANCE:BTCUSDT"]);
  });

  it("search merges providers (max 20)", async () => {
    const r = await call("/api/search?q=apple");
    expect(r.status).toBe(200);
    expect(r.body[0].symbol).toBe("AAPL");
    expect(r.body.length).toBeLessThanOrEqual(20);
    const btc = await call("/api/search?q=btc");
    expect(btc.body[0].symbol).toBe("BINANCE:BTCUSDT");
  });
});

describe("store endpoints", () => {
  it("watchlists GET default / PUT / GET", async () => {
    const first = await call("/api/watchlists");
    expect(first.body[0].name).toBe("Main");
    const lists = [{ id: "w1", name: "Tech", symbols: ["AAPL", "MSFT"] }];
    const put = await call("/api/watchlists", { method: "PUT", body: JSON.stringify(lists) });
    expect(put.status).toBe(200);
    expect((await call("/api/watchlists")).body).toEqual(lists);
    expect((await call("/api/watchlists", { method: "PUT", body: "{" })).status).toBe(400);
  });

  it("layouts PUT / GET / list / DELETE and id validation", async () => {
    const body = { name: "My chart", symbol: "AAPL", interval: "1h", chartType: "candles", logScale: false, indicators: [], drawings: { AAPL: [] } };
    const put = await call("/api/layouts/main-1", { method: "PUT", body: JSON.stringify(body) });
    expect(put.status).toBe(200);
    expect(put.body.id).toBe("main-1");
    expect((await call("/api/layouts/main-1")).body.name).toBe("My chart");
    expect((await call("/api/layouts")).body).toEqual([{ id: "main-1", name: "My chart", updatedAt: put.body.updatedAt }]);
    expect((await call("/api/layouts/main-1", { method: "DELETE" })).status).toBe(200);
    expect((await call("/api/layouts/main-1")).status).toBe(404);
    expect((await call("/api/layouts/..%2F..%2Fstore", { method: "PUT", body: JSON.stringify(body) })).status).toBe(400);
    expect((await call("/api/layouts/a.b")).status).toBe(400);
  });

  it("layout PUT with a stale baseUpdatedAt answers 409 with the stored layout", async () => {
    const body = { name: "Shared", symbol: "AAPL", interval: "1D", chartType: "candles", logScale: false, indicators: [], drawings: {} };
    const first = await call("/api/layouts/shared", { method: "PUT", body: JSON.stringify(body) });
    expect(first.status).toBe(200);
    const base = first.body.updatedAt as number;
    // Tab A saves on top of what it loaded.
    const a = await call("/api/layouts/shared", { method: "PUT", body: JSON.stringify({ ...body, symbol: "MSFT", baseUpdatedAt: base }) });
    expect(a.status).toBe(200);
    expect(a.body.updatedAt).toBeGreaterThan(base);
    expect(a.body).not.toHaveProperty("baseUpdatedAt");
    // Tab B still holds the old base: refused, gets the newer layout back, nothing overwritten.
    const b = await call("/api/layouts/shared", { method: "PUT", body: JSON.stringify({ ...body, symbol: "NVDA", baseUpdatedAt: base }) });
    expect(b.status).toBe(409);
    expect(b.body.error.code).toBe("conflict");
    expect(b.body.layout.symbol).toBe("MSFT");
    expect(b.body.layout.updatedAt).toBe(a.body.updatedAt);
    expect((await call("/api/layouts/shared")).body.symbol).toBe("MSFT");
    // Retrying on the new base succeeds; PUTs without a base stay last-writer-wins.
    const retry = await call("/api/layouts/shared", { method: "PUT", body: JSON.stringify({ ...body, symbol: "NVDA", baseUpdatedAt: b.body.layout.updatedAt }) });
    expect(retry.status).toBe(200);
    expect((await call("/api/layouts/shared", { method: "PUT", body: JSON.stringify({ ...body, symbol: "AMD" }) })).status).toBe(200);
    expect((await call("/api/layouts/shared", { method: "PUT", body: JSON.stringify({ ...body, baseUpdatedAt: "x" }) })).status).toBe(400);
  });
});
