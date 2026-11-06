// Crypto order flow (Binance only): taker buy/sell volume per bar from klines, footprint bars
// built from aggregated trades, and the latest trades for the time-and-sales tape. Closed
// footprint bars are cached in memory; the open bar is always rebuilt.

import { buildFootprint, type FootprintBar, type Interval } from "@qt/core";
import type { Router } from "../http";
import type { MarketData } from "../providers";
import { badRequest } from "../errors";
import { INTERVAL_SEC, parseInterval } from "../bars";
import { intParam } from "./market";

/** Most bars one footprint request may cover. */
export const MAX_FOOTPRINT_BARS = 300;
/** Most aggTrades pages (1000 trades each) one footprint request may read. */
export const MAX_TRADE_PAGES = 40;
/** Most bars one flow request may cover. */
export const MAX_FLOW_BARS = 5000;
const CACHE_MAX = 20000;
/** Tick replay: most ticks and longest range per request. */
export const MAX_REPLAY_TICKS = 20000;
export const MAX_REPLAY_SPAN = 86400;

/** Footprints only for intervals up to one day (bar time = trade time floored to the interval). */
const FOOTPRINT_INTERVALS = new Set<Interval>(["1m", "5m", "15m", "30m", "1h", "4h", "1D"]);

export class OrderFlowService {
  private readonly cache = new Map<string, FootprintBar | null>();

  constructor(
    private readonly market: MarketData,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Binance pair for an app symbol; other providers have no trade data. */
  async ticker(raw: string): Promise<string> {
    const route = await this.market.resolve(raw);
    if (route.provider !== "binance") throw badRequest("Order flow needs a Binance symbol (BINANCE:…)");
    return route.ticker;
  }

  async flow(raw: string, interval: Interval, from: number, to: number) {
    const ticker = await this.ticker(raw);
    const sec = INTERVAL_SEC[interval];
    if ((to - from) / sec > MAX_FLOW_BARS) throw badRequest(`At most ${MAX_FLOW_BARS} bars per request`);
    return { symbol: `BINANCE:${ticker}`, interval, flow: await this.market.binance.barFlow(ticker, interval, from, to, MAX_FLOW_BARS) };
  }

  async footprint(raw: string, interval: Interval, from: number, to: number, tick: number, maxPages = MAX_TRADE_PAGES) {
    if (!FOOTPRINT_INTERVALS.has(interval)) throw badRequest("Footprints need an interval from 1m to 1D");
    const ticker = await this.ticker(raw);
    const sec = INTERVAL_SEC[interval];
    const start = Math.floor(from / sec) * sec;
    const times: number[] = [];
    for (let t = start; t < to; t += sec) times.push(t);
    if (times.length > MAX_FOOTPRINT_BARS) throw badRequest(`At most ${MAX_FOOTPRINT_BARS} footprint bars per request`);
    const key = (t: number) => `${ticker}|${sec}|${tick}|${t}`;
    const fresh = new Map<number, FootprintBar>();
    let complete = true;
    /** With an incomplete read: bars from this time on were not fully covered (continue here). */
    let next: number | undefined;
    const firstMissing = times.findIndex((t) => !this.cache.has(key(t)));
    if (firstMissing >= 0) {
      const t0 = times[firstMissing];
      const res = await this.market.binance.aggTrades(ticker, t0 * 1000, to * 1000, maxPages);
      complete = res.complete;
      for (const b of buildFootprint(res.trades, sec, tick)) fresh.set(b.time, b);
      // Bars are final once they closed and the trades read cover them entirely.
      const covered = res.complete ? to * 1000 : (res.trades[res.trades.length - 1]?.time ?? t0 * 1000);
      if (!res.complete) {
        next = Math.floor(covered / 1000 / sec) * sec;
        for (const t of [...fresh.keys()]) if ((t + sec) * 1000 > covered) fresh.delete(t);
      }
      const closedBy = this.now() - 2000;
      for (const t of times.slice(firstMissing)) {
        const end = (t + sec) * 1000;
        if (end <= covered && end <= closedBy) this.remember(key(t), fresh.get(t) ?? null);
      }
    }
    const bars = times.flatMap((t) => {
      if (next !== undefined && t >= next) return [];
      const b = fresh.get(t) ?? this.cache.get(key(t));
      return b ? [b] : [];
    });
    return { symbol: `BINANCE:${ticker}`, interval, tick, complete, ...(next !== undefined ? { next } : {}), bars };
  }

  /**
   * Recorded ticks in [from, to) (UTC seconds) for tick replay: Binance trades or MT5 ticks, at
   * most `MAX_REPLAY_TICKS`; `complete` is false when the cap cut the range short.
   */
  async ticks(raw: string, from: number, to: number) {
    if (to - from > MAX_REPLAY_SPAN) throw badRequest(`At most ${MAX_REPLAY_SPAN / 3600} hours of ticks per request`);
    const route = await this.market.resolve(raw);
    if (route.provider === "binance") {
      const r = await this.market.binance.aggTrades(route.ticker, from * 1000, to * 1000, MAX_REPLAY_TICKS / 1000);
      return { symbol: route.canonical, complete: r.complete, ticks: r.trades.map((t) => ({ time: t.time, price: t.price, qty: t.qty })) };
    }
    if (route.provider === "mt5") {
      const r = await this.market.mt5.ticks(route.ticker, from, to, MAX_REPLAY_TICKS);
      return { symbol: route.canonical, complete: r.complete, ticks: r.ticks };
    }
    throw badRequest("Tick data is available for Binance and MT5 symbols only");
  }

  async trades(raw: string, limit: number) {
    const ticker = await this.ticker(raw);
    return { symbol: `BINANCE:${ticker}`, trades: await this.market.binance.recentTrades(ticker, limit) };
  }

  private remember(key: string, bar: FootprintBar | null): void {
    this.cache.delete(key);
    this.cache.set(key, bar);
    while (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value as string);
  }
}

function params(url: URL): { symbol: string; interval: Interval; from: number; to: number } {
  const symbol = (url.searchParams.get("symbol") ?? "").trim();
  if (!symbol) throw badRequest("symbol is required");
  const raw = url.searchParams.get("interval") ?? "1m";
  const interval = parseInterval(raw);
  if (!interval) throw badRequest(`Unknown interval: ${raw}`);
  const from = intParam(url, "from");
  const to = intParam(url, "to");
  if (from === undefined || to === undefined) throw badRequest("from and to (UTC seconds) are required");
  if (!(from > 0) || !(to > from)) throw badRequest("from must be positive and before to");
  return { symbol, interval, from, to };
}

export function registerOrderFlowRoutes(router: Router, service: OrderFlowService): void {
  router.get("/api/orderflow/flow", async ({ url }) => {
    const p = params(url);
    return service.flow(p.symbol, p.interval, p.from, p.to);
  });

  router.get("/api/orderflow/footprint", async ({ url }) => {
    const p = params(url);
    const tick = Number(url.searchParams.get("tick"));
    if (!(tick > 0) || !Number.isFinite(tick)) throw badRequest("tick must be a positive number");
    return service.footprint(p.symbol, p.interval, p.from, p.to, tick);
  });

  router.get("/api/ticks", async ({ url }) => {
    const symbol = (url.searchParams.get("symbol") ?? "").trim();
    if (!symbol) throw badRequest("symbol is required");
    const from = intParam(url, "from");
    const to = intParam(url, "to");
    if (from === undefined || to === undefined || !(from > 0) || !(to > from)) throw badRequest("from and to (UTC seconds, from < to) are required");
    return service.ticks(symbol, from, to);
  });

  router.get("/api/orderflow/trades", async ({ url }) => {
    const symbol = (url.searchParams.get("symbol") ?? "").trim();
    if (!symbol) throw badRequest("symbol is required");
    const limit = intParam(url, "limit") ?? 100;
    if (limit < 1 || limit > 1000) throw badRequest("limit must be between 1 and 1000");
    return service.trades(symbol, limit);
  });
}
