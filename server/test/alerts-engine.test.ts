import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Bar, Layout, Quote } from "@qt/core";
import { createApp } from "../src/app";
import { AlertEngine, MAX_EVENTS, barsNeeded, overlayQuote } from "../src/alerts/engine";
import type { MarketData } from "../src/providers";
import { Store } from "../src/store";

const DAY = 86400;
const T0 = Date.UTC(2026, 0, 5) / 1000;

/** Stubbed market data: daily bars per symbol, quotes optional; counts calls. */
function stubMarket() {
  const series = new Map<string, Bar[]>();
  const quotes = new Map<string, Quote>();
  const calls = { bars: 0, quotes: 0 };
  const market = {
    async bars(symbol: string) {
      calls.bars++;
      const b = series.get(symbol.toUpperCase());
      if (!b) throw new Error(`Unknown symbol: ${symbol}`);
      return { symbol: { symbol, name: symbol, exchange: "", type: "stock", currency: "USD", provider: "yahoo" }, interval: "1D", bars: b, hasMore: false };
    },
    async quotes(symbols: string[]) {
      calls.quotes++;
      return symbols.map((s) => quotes.get(s.toUpperCase())).filter(Boolean);
    },
  };
  return { market: market as unknown as MarketData, series, quotes, calls };
}

const mkBars = (closes: number[]) => closes.map((c, i) => ({ time: T0 + i * DAY, open: c, high: c + 1, low: c - 1, close: c, volume: 1000 }));

let dir: string;
let store: Store;
let stub: ReturnType<typeof stubMarket>;
let engine: AlertEngine;
let now: number;
let hooks: { url: string; payload: any }[];

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "qt-alerts-"));
  store = new Store(dir);
  stub = stubMarket();
  stub.series.set("AAPL", mkBars([100, 105, 110]));
  stub.series.set("MSFT", mkBars([50, 40]));
  now = (T0 + 2 * DAY + 3600) * 1000; // inside the last (forming) bar
  hooks = [];
  engine = new AlertEngine({
    store,
    market: stub.market,
    now: () => now,
    webhook: async (url, payload) => {
      hooks.push({ url, payload });
      return { ok: true, attempts: 1, status: 200 };
    },
  });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const priceAbove = (v: number) => ({ left: { kind: "price" }, op: "greater", right: { kind: "value", value: v } });

describe("alert validation", () => {
  it("accepts a minimal alert and fills defaults", async () => {
    const a = await engine.create({ symbol: "AAPL", conditions: [priceAbove(1)] });
    expect(a).toMatchObject({ symbol: "AAPL", interval: "1D", trigger: "once", active: true, message: "", notify: { browser: true }, createdAt: now });
    expect(a.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(await engine.list()).toHaveLength(1);
  });

  it("rejects bad shapes", async () => {
    const bad: unknown[] = [
      null,
      { conditions: [priceAbove(1)] },
      { symbol: "AAPL", conditions: [] },
      { symbol: "AAPL", interval: "7h", conditions: [priceAbove(1)] },
      { symbol: "AAPL", trigger: "sometimes", conditions: [priceAbove(1)] },
      { symbol: "AAPL", conditions: [{ left: { kind: "price" }, op: "bigger", right: { kind: "value", value: 1 } }] },
      { symbol: "AAPL", conditions: [{ left: { kind: "price", field: "open" }, op: "greater", right: { kind: "value", value: 1 } }] },
      { symbol: "AAPL", conditions: [{ left: { kind: "price" }, op: "greater", right: { kind: "value", value: "1" } }] },
      { symbol: "AAPL", conditions: [{ left: { kind: "indicator", indicatorId: "nope", inputs: {}, output: "x" }, op: "greater", right: { kind: "value", value: 1 } }] },
      { symbol: "AAPL", conditions: [{ left: { kind: "indicator", indicatorId: "rsi", inputs: { length: 14 }, output: "nope" }, op: "greater", right: { kind: "value", value: 1 } }] },
      { symbol: "AAPL", conditions: [{ left: { kind: "indicator", indicatorId: "rsi", inputs: { foo: 1 } }, op: "greater", right: { kind: "value", value: 1 } }] },
      { symbol: "AAPL", conditions: [{ left: { kind: "indicator", indicatorId: "rsi", inputs: { length: 1.5 } }, op: "greater", right: { kind: "value", value: 1 } }] },
      { symbol: "AAPL", conditions: [{ left: { kind: "indicator", indicatorId: "rsi", inputs: { source: "volume" } }, op: "greater", right: { kind: "value", value: 1 } }] },
      { symbol: "AAPL", conditions: [{ left: { kind: "price" }, op: "enters-channel", right: { kind: "value", value: 1 } }] },
      { symbol: "AAPL", conditions: [{ left: { kind: "price" }, op: "moving-up-pct", pct: 0 }] },
      { symbol: "AAPL", conditions: [{ left: { kind: "price" }, op: "greater", right: { kind: "drawing", drawingId: "d1" } }] }, // no layoutId
      { symbol: "AAPL", conditions: [priceAbove(1)], notify: { browser: true, webhookUrl: "ftp://example.com/x" } },
      { symbol: "AAPL", conditions: [priceAbove(1)], notify: { browser: true, webhookUrl: "http://192.168.1.10/hook" } },
      { symbol: "AAPL", conditions: [priceAbove(1)], expiresAt: "tomorrow" },
    ];
    for (const b of bad) await expect(engine.create(b), JSON.stringify(b)).rejects.toMatchObject({ status: 400 });
  });

  it("indicator operands: registry ids, inputs and single-output default", async () => {
    const a = await engine.create({
      symbol: "AAPL",
      conditions: [{ left: { kind: "indicator", indicatorId: "rsi", inputs: { length: 14, source: "close" } }, op: "less", right: { kind: "value", value: 30 } }],
    });
    expect(a.conditions[0].left).toEqual({ kind: "indicator", indicatorId: "rsi", inputs: { length: 14, source: "close" }, output: "rsi" });
    await expect(
      engine.create({ symbol: "AAPL", conditions: [{ left: { kind: "indicator", indicatorId: "macd", inputs: {} }, op: "greater", right: { kind: "value", value: 0 } }] }),
    ).rejects.toMatchObject({ status: 400 }); // macd has several outputs: output is required
  });

  it("drawing operands must exist in the referenced layout", async () => {
    const layout: Layout = {
      id: "chart1", name: "c", symbol: "AAPL", interval: "1D", chartType: "candles", logScale: false, indicators: [],
      drawings: { AAPL: [{ id: "line1", type: "hline", anchors: [{ time: T0, price: 107 }] }] }, updatedAt: 1,
    };
    await store.putLayout(layout);
    const cond = { left: { kind: "price" }, op: "crosses-up", right: { kind: "drawing", drawingId: "line1" } };
    await expect(engine.create({ symbol: "AAPL", conditions: [cond] })).rejects.toMatchObject({ status: 400 });
    await expect(engine.create({ symbol: "AAPL", layoutId: "nope", conditions: [cond] })).rejects.toMatchObject({ status: 400 });
    await expect(engine.create({ symbol: "AAPL", layoutId: "chart1", conditions: [{ ...cond, right: { kind: "drawing", drawingId: "zzz" } }] })).rejects.toMatchObject({ status: 400 });
    const a = await engine.create({ symbol: "AAPL", layoutId: "chart1", trigger: "every-time", conditions: [cond] });
    expect(a.layoutId).toBe("chart1");
    // previous bar 105 (below 107), now 110 (above): crosses
    const events = await engine.tick();
    expect(events).toHaveLength(1);
    // the layout file is only read, never written
    expect((await store.getLayout("chart1"))?.updatedAt).toBe(1);
  });

  it("update merges partial bodies and keeps id/createdAt", async () => {
    const a = await engine.create({ symbol: "AAPL", name: "x", conditions: [priceAbove(1)] });
    now += 5000;
    const b = await engine.update(a.id, { active: false, name: "y" });
    expect(b).toMatchObject({ id: a.id, createdAt: a.createdAt, active: false, name: "y", symbol: "AAPL" });
    await expect(engine.update("missing", { active: true })).rejects.toMatchObject({ status: 404 });
    await engine.remove(a.id);
    expect(await engine.list()).toEqual([]);
    await expect(engine.remove(a.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("evaluation loop", () => {
  it("fires once, deactivates, logs the event and calls the webhook", async () => {
    const a = await engine.create({ symbol: "AAPL", conditions: [priceAbove(1)], notify: { browser: true, webhookUrl: "https://example.com/hook" } });
    const fired: any[] = [];
    engine.on("fired", (p) => fired.push(p));
    const events = await engine.tick();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ alertId: a.id, symbol: "AAPL", price: 110, time: now, barTime: T0 + 2 * DAY, seen: false });
    expect(fired).toHaveLength(1);
    expect(fired[0].alert).toMatchObject({ id: a.id, active: false, lastFiredAt: now });
    await new Promise((r) => setTimeout(r, 10));
    expect(hooks).toHaveLength(1);
    expect(hooks[0].payload.event.id).toBe(events[0].id);
    expect((await engine.get(a.id)).active).toBe(false);
    expect(await engine.tick()).toEqual([]); // inactive now
    expect(await engine.events()).toHaveLength(1);
  });

  it("one bars fetch per symbol+interval group", async () => {
    await engine.create({ symbol: "AAPL", trigger: "every-time", conditions: [priceAbove(1)] });
    await engine.create({ symbol: "aapl", trigger: "every-time", conditions: [priceAbove(500)] });
    await engine.create({ symbol: "MSFT", trigger: "every-time", conditions: [priceAbove(1)] });
    await engine.create({ symbol: "MSFT", interval: "1W", trigger: "every-time", conditions: [priceAbove(1)] });
    const events = await engine.tick();
    expect(stub.calls.bars).toBe(3);
    expect(events.map((e) => e.symbol).sort()).toEqual(["AAPL", "MSFT", "MSFT"]);
  });

  it("live quotes update the forming bar", async () => {
    await engine.create({ symbol: "AAPL", trigger: "every-time", conditions: [priceAbove(120)] });
    expect(await engine.tick()).toHaveLength(0);
    stub.quotes.set("AAPL", { symbol: "AAPL", last: 125, change: 15, changePct: 13.6, time: T0 + 2 * DAY + 1800 });
    const ev = await engine.tick();
    expect(ev).toHaveLength(1);
    expect(ev[0].price).toBe(125);
  });

  it("expired alerts are switched off without fetching data", async () => {
    const a = await engine.create({ symbol: "AAPL", expiresAt: now - 1, conditions: [priceAbove(1)] });
    expect(await engine.tick()).toEqual([]);
    expect(stub.calls.bars).toBe(0);
    expect((await engine.get(a.id)).active).toBe(false);
  });

  it("market data errors are isolated per group and reported in status", async () => {
    const bad = await engine.create({ symbol: "NOPE", trigger: "every-time", conditions: [priceAbove(1)] });
    await engine.create({ symbol: "AAPL", trigger: "every-time", conditions: [priceAbove(1)] });
    const events = await engine.tick();
    expect(events).toHaveLength(1);
    expect(engine.status().errors[bad.id]).toMatch(/Unknown symbol/);
  });

  it("events: since filter, seen marking and the 1000 cap", async () => {
    const a = await engine.create({ symbol: "AAPL", trigger: "every-time", conditions: [priceAbove(1)] });
    const first = await engine.tick();
    stub.series.set("AAPL", mkBars([100, 105, 111]));
    now += 1000;
    const second = await engine.tick();
    expect((await engine.events(first[0].time)).map((e) => e.id)).toEqual([second[0].id]);
    expect(await engine.markSeen({ ids: [first[0].id] })).toBe(1);
    expect(await engine.markSeen({ ids: [first[0].id] })).toBe(0);
    expect(await engine.markSeen({ all: true })).toBe(1);
    expect((await engine.events()).every((e) => e.seen)).toBe(true);

    const many = Array.from({ length: MAX_EVENTS + 20 }, (_, i) => ({ id: `e${i}`, alertId: a.id, symbol: "AAPL", time: i, price: 1, message: "", seen: true }));
    await store.updateDoc("alert-events.json", () => ({ value: many, result: undefined }));
    stub.series.set("AAPL", mkBars([100, 105, 112]));
    await engine.tick();
    const all = await engine.events();
    expect(all).toHaveLength(MAX_EVENTS);
    expect(all[all.length - 1].price).toBe(112);
  });
});

describe("helpers", () => {
  it("barsNeeded covers indicator warm-up", () => {
    expect(barsNeeded([])).toBe(300);
    const a: any = { conditions: [{ left: { kind: "indicator", indicatorId: "sma", inputs: { length: 200 }, output: "sma" }, op: "greater", right: { kind: "value", value: 1 } }] };
    expect(barsNeeded([a])).toBe(650);
  });

  it("overlayQuote only touches a quote inside the last bar", () => {
    const b = mkBars([10, 11]);
    const inside = overlayQuote(b, "1D", { last: 15, time: b[1].time + 100 });
    expect(inside[1]).toMatchObject({ close: 15, high: 15, low: 10 });
    expect(b[1].close).toBe(11); // input untouched
    expect(overlayQuote(b, "1D", { last: 15, time: b[1].time + DAY })).toBe(b);
    expect(overlayQuote(b, "1D", undefined)).toBe(b);
  });
});

describe("alert routes and SSE stream", () => {
  let server: Server;
  let base: string;
  let routeEngine: AlertEngine;
  let rdir: string;

  beforeAll(async () => {
    rdir = await mkdtemp(path.join(tmpdir(), "qt-alerts-http-"));
    const s = stubMarket();
    s.series.set("AAPL", mkBars([100, 105, 110]));
    const rstore = new Store(rdir);
    routeEngine = new AlertEngine({ store: rstore, market: s.market, webhook: async () => ({ ok: true, attempts: 1 }) });
    server = createServer(createApp({ market: s.market, store: rstore, alerts: routeEngine }));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(rdir, { recursive: true, force: true });
  });

  const call = async (p: string, init?: RequestInit) => {
    const res = await fetch(base + p, init);
    return { status: res.status, body: (await res.json()) as any };
  };
  const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("CRUD over HTTP", async () => {
    const created = await call("/api/alerts", json("POST", { symbol: "AAPL", conditions: [priceAbove(1)] }));
    expect(created.status).toBe(200);
    expect((await call("/api/alerts")).body).toHaveLength(1);
    expect((await call(`/api/alerts/${created.body.id}`)).body.id).toBe(created.body.id);
    expect((await call(`/api/alerts/${created.body.id}`, json("PUT", { name: "renamed" }))).body.name).toBe("renamed");
    expect((await call("/api/alerts", json("POST", { symbol: "AAPL", conditions: "x" }))).status).toBe(400);
    expect((await call(`/api/alerts/${created.body.id}`, { method: "DELETE" })).body).toEqual({ ok: true });
    expect((await call(`/api/alerts/${created.body.id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("streams fired alerts, lists events since a time, marks them seen", async () => {
    const res = await fetch(base + "/api/alerts/stream");
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.getReader();
    const t = Date.now() - 1;
    await call("/api/alerts", json("POST", { symbol: "AAPL", conditions: [priceAbove(1)] }));
    await routeEngine.tick();
    let text = "";
    while (!text.includes("event: alert")) text += new TextDecoder().decode((await reader.read()).value);
    await reader.cancel();
    const data = JSON.parse(text.split("event: alert\ndata: ")[1].split("\n")[0]);
    expect(data.event).toMatchObject({ symbol: "AAPL", price: 110 });
    expect(data.alert.active).toBe(false);

    const events = await call(`/api/alerts/events?since=${t}`);
    expect(events.body).toHaveLength(1);
    expect((await call(`/api/alerts/events?since=${events.body[0].time}`)).body).toHaveLength(0);
    expect((await call("/api/alerts/events?since=abc")).status).toBe(400);
    expect((await call("/api/alerts/events/seen", json("PUT", { ids: [events.body[0].id] }))).body).toEqual({ updated: 1 });
    expect((await call("/api/alerts/events/seen", json("PUT", {}))).status).toBe(400);
    expect((await call("/api/alerts/status")).body).toHaveProperty("errors");
  });
});
