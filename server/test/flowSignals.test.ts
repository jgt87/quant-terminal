import { describe, expect, it } from "vitest";
import { getIndicator, type Alert, type AlertCondition, type Bar } from "@qt/core";
import { evaluateAlert } from "../src/alerts/evaluate";
import { usesOrderFlow } from "../src/alerts/engine";
import { validateAlert } from "../src/alerts/validate";
import { BookFeed, parseStreamTrade, type SocketLike } from "../src/depth/feed";
import { MarketData } from "../src/providers";
import { OrderFlowService } from "../src/routes/orderflow";
import { fakeFetch } from "./helpers";

const DAY = 86400;
const T0 = Date.UTC(2026, 0, 5) / 1000;
const bars = (n: number): Bar[] => Array.from({ length: n }, (_, i) => ({ time: T0 + i * DAY, open: 10, high: 11, low: 9, close: 10, volume: 1 }));
const flowCond: AlertCondition = { left: { kind: "orderflow", event: "absorption-bid" }, op: "greater", right: { kind: "value", value: 0 } };
const alert = (extra: Partial<Alert> = {}): Alert => ({ id: "a", name: "x", symbol: "BINANCE:BTCUSDT", interval: "1D", conditions: [flowCond], trigger: "every-time", active: true, message: "", notify: { browser: false }, createdAt: 0, ...extra });

describe("order flow alert operand", () => {
  it("counts the signals of the evaluated bar", () => {
    const b = bars(3);
    const now = (b[2].time + 2 * DAY) * 1000;
    const ev = (time: number) => ({ kind: "absorption-bid" as const, time, price: 9, size: 5 });
    expect(evaluateAlert(alert(), { bars: b, interval: "1D", now, flowEvents: [ev(b[2].time + 100)] }).fired).toBe(true);
    expect(evaluateAlert(alert(), { bars: b, interval: "1D", now, flowEvents: [ev(b[1].time)] }).fired).toBe(false);
    expect(evaluateAlert(alert(), { bars: b, interval: "1D", now, flowEvents: [{ ...ev(b[2].time), kind: "stop-run-up" }] }).fired).toBe(false);
    const missing = evaluateAlert(alert(), { bars: b, interval: "1D", now });
    expect(missing.fired).toBe(false);
    expect(missing.error).toMatch(/not available/);
    expect(usesOrderFlow(alert())).toBe(true);
  });

  it("validates the signal kind", () => {
    const body = { name: "x", symbol: "BINANCE:BTCUSDT", interval: "1D", conditions: [flowCond], trigger: "once", active: true, message: "", notify: { browser: true } };
    expect(validateAlert(body, { id: "a", now: 0, getIndicator }).conditions[0].left).toEqual({ kind: "orderflow", event: "absorption-bid" });
    expect(() => validateAlert({ ...body, conditions: [{ ...flowCond, left: { kind: "orderflow", event: "nope" } }] }, { id: "a", now: 0, getIndicator })).toThrow(/event must be one of/);
  });
});

describe("order flow signals service", () => {
  it("detects absorption from footprints and rejects other providers", async () => {
    // 1m bars; the last bar has heavy selling at its low and closes high.
    const t0 = Date.UTC(2026, 9, 1, 0, 0);
    const trades: { a: number; p: string; q: string; T: number; m: boolean }[] = [];
    let id = 1;
    for (let b = 0; b < 6; b++) {
      for (let k = 0; k < 10; k++) trades.push({ a: id++, p: String(100 + (k % 5)), q: "1", T: t0 + b * 60_000 + k * 1000, m: k % 2 === 0 });
    }
    for (let k = 0; k < 30; k++) trades.push({ a: id++, p: "100", q: "1", T: t0 + 6 * 60_000 + k * 100, m: true });
    const fetchFn = fakeFetch((url) => {
      if (!url.pathname.endsWith("/aggTrades")) return undefined;
      const fromId = url.searchParams.get("fromId");
      const start = Number(url.searchParams.get("startTime"));
      const end = Number(url.searchParams.get("endTime"));
      const rows = fromId ? trades.filter((t) => t.a >= Number(fromId)) : trades.filter((t) => t.T >= start && t.T <= end);
      return { body: rows.slice(0, 1000) };
    });
    const svc = new OrderFlowService(new MarketData({ fetchFn }), () => t0 + 3_600_000);
    const b: Bar[] = Array.from({ length: 7 }, (_, i) => ({ time: t0 / 1000 + i * 60, open: 102, high: 104.9, low: 100, close: i === 6 ? 104 : 102, volume: 10 }));
    const r = await svc.signals("BINANCE:BTCUSDT", "1m", b);
    expect(r.events.filter((e) => e.kind === "absorption-bid").map((e) => e.time)).toEqual([t0 / 1000 + 360]);
    await expect(svc.signals("AAPL", "1m", b)).rejects.toThrow(/Binance symbol/);
  });
});

describe("book feed icebergs", () => {
  it("parses combined-stream trades and reports a refilled level", async () => {
    expect(parseStreamTrade(JSON.stringify({ stream: "x", data: { e: "aggTrade", a: 5, p: "100", q: "2", T: 9000, m: true } }))).toEqual({ id: 5, time: 9000, price: 100, qty: 2, buy: false });
    expect(parseStreamTrade("{}")).toBeNull();
    const sock: SocketLike = { onopen: null, onmessage: null, onclose: null, onerror: null, close() {} };
    const feed = new BookFeed("BTCUSDT", { socket: () => sock, snapshot: async () => ({ lastUpdateId: 1, bids: [[99, 1]], asks: [[101, 1]] }), timers: false });
    feed.start();
    sock.onopen!();
    await new Promise((r) => setTimeout(r, 0));
    const send = (d: unknown) => sock.onmessage!({ data: JSON.stringify({ stream: "s", data: d }) });
    // Three trades of 1 at the 1-lot ask while it keeps showing 1.
    for (let i = 0; i < 3; i++) {
      send({ e: "aggTrade", a: i, p: "101", q: "1", T: 10_000 + i, m: false });
      send({ e: "depthUpdate", U: 2 + i, u: 2 + i, b: [], a: [["101", "1"]] });
    }
    expect(feed.flowEvents(0, 100)).toEqual([{ kind: "iceberg-ask", time: 10, price: 101, size: 3 }]);
    feed.stop();
  });
});
