// Deriv public market data over its unauthenticated WebSocket (no account, token or app id):
// forex (majors, minors, many exotics), metals, stock indices (OTC_*), BTC/ETH and Deriv's
// synthetic indices. One shared connection serves every request and live tick subscription;
// requests are spaced out to stay under Deriv's rate limit, and subscriptions are restored
// after a reconnect.
//
// Known limits of the feed, reported to the user as bar notices:
// - history reaches back 365 days (older requests silently return the latest bars instead,
//   so they are detected and answered with "no more history");
// - no volume;
// - no weekly or monthly candles (built here from daily bars);
// - quotes are Deriv's own prices, not exchange data; forex is closed at the weekend.

import type { Bar, Interval, Quote, SymbolInfo, SymbolType } from "@qt/core";
import { badRequest } from "../errors";
import { HttpError, notFound, nowSec, providerError, type BarsPage } from "./types";

export const DERIV_WS_URL = "wss://api.derivws.com/trading/v1/options/ws/public";
export const DERIV_PREFIX = "DERIV:";
/** How far back Deriv serves candles (all granularities). */
export const DERIV_HISTORY_SEC = 365 * 86400;
/** Most candles Deriv returns per request. */
export const DERIV_MAX_COUNT = 999;

/** Candle granularity per app interval; weekly and monthly bars are built from daily ones. */
const GRANULARITY: Record<Interval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
  "1D": 86400,
  "1W": 86400,
  "1M": 86400,
};

export const NO_VOLUME_NOTICE = "Deriv data has no volume, so volume and volume-based indicators show 0.";

/** The part of a WebSocket the client uses (the global WebSocket in Node 22+, a fake in tests). */
export interface DerivSocket {
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export type DerivSocketFactory = (url: string) => DerivSocket;

export const defaultDerivSocket: DerivSocketFactory = (url) => {
  if (typeof WebSocket === "undefined") {
    throw providerError(`The Deriv feed needs Node.js 22 or newer (Node.js ${process.versions.node} has no built-in WebSocket)`);
  }
  return new WebSocket(url) as unknown as DerivSocket;
};

/** One entry of Deriv's symbol list. */
export interface DerivSymbol {
  /** Deriv's id, e.g. "frxEURUSD", "R_100", "OTC_NDX". */
  symbol: string;
  /** App name (the part after DERIV:), e.g. "EURUSD", "R_100". */
  name: string;
  title: string;
  market: string;
  submarket: string;
  open: boolean;
  /** False for symbols Deriv serves history for without listing them (exotic forex pairs). */
  listed: boolean;
}

export interface DerivTick {
  symbol: string;
  bid?: number;
  ask?: number;
  quote: number;
  epoch: number;
}

interface RawCandle {
  epoch: number;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
}

interface DerivMessage {
  msg_type?: string;
  req_id?: number;
  error?: { code?: string; message?: string };
  echo_req?: Record<string, unknown>;
  subscription?: { id?: string };
  candles?: RawCandle[];
  history?: { prices?: number[]; times?: number[] };
  tick?: { symbol?: string; quote?: number; bid?: number; ask?: number; epoch?: number };
  active_symbols?: {
    underlying_symbol?: string;
    symbol?: string;
    underlying_symbol_name?: string;
    display_name?: string;
    market?: string;
    submarket?: string;
    exchange_is_open?: number;
  }[];
}

/** An error Deriv answered with (its code is kept so callers can react to it). */
export class DerivError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Deriv error → the app's HTTP error. */
function httpError(e: unknown, what: string): HttpError {
  if (e instanceof HttpError) return e;
  if (e instanceof DerivError) {
    if (e.code === "InvalidSymbol") return notFound(`Deriv does not offer ${what}`);
    if (e.code === "RateLimit") return providerError("Deriv's rate limit was reached; try again in a few seconds");
    return providerError(`Deriv: ${e.message}`);
  }
  return providerError(`Deriv: ${(e as Error)?.message ?? String(e)}`);
}

/** App name of a Deriv symbol: forex/metals drop "frx", crypto drops "cry", the rest is upper-cased. */
export function derivAppName(symbol: string): string {
  if (/^frx[A-Z]{6}$/.test(symbol)) return symbol.slice(3);
  if (/^cry[A-Z]{6}$/.test(symbol)) return symbol.slice(3);
  return symbol.toUpperCase();
}

const INDEX_CURRENCY: Record<string, string> = {
  OTC_AEX: "EUR", OTC_AS51: "AUD", OTC_DJI: "USD", OTC_FCHI: "EUR", OTC_FTSE: "GBP", OTC_GDAXI: "EUR",
  OTC_HSI: "HKD", OTC_N225: "JPY", OTC_NDX: "USD", OTC_SPC: "USD", OTC_SSMI: "CHF", OTC_SX5E: "EUR",
};

function symbolType(market: string): SymbolType {
  if (market === "forex") return "fx";
  if (market === "cryptocurrency") return "crypto";
  if (market === "indices") return "index";
  return "other";
}

export function derivSymbolInfo(s: DerivSymbol): SymbolInfo {
  const pair = /^[A-Z]{6}$/.test(s.name);
  return {
    symbol: `${DERIV_PREFIX}${s.name}`,
    name: s.title || s.name,
    exchange: "Deriv",
    type: symbolType(s.market),
    currency: pair ? s.name.slice(3) : (INDEX_CURRENCY[s.name] ?? "USD"),
    provider: "deriv",
  };
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

/**
 * Candles → bars: drops non-finite values and the partial first candle Deriv returns when the
 * requested range starts inside a bucket (its time is not on the granularity grid).
 */
export function parseCandles(raw: readonly RawCandle[] | undefined, granularity: number): Bar[] {
  const out: Bar[] = [];
  for (const c of raw ?? []) {
    const time = num(c.epoch);
    const open = num(c.open), high = num(c.high), low = num(c.low), close = num(c.close);
    if (!Number.isInteger(time) || time % granularity !== 0) continue;
    if (![open, high, low, close].every((v) => Number.isFinite(v) && v > 0)) continue;
    out.push({ time, open, high: Math.max(high, open, close), low: Math.min(low, open, close), close, volume: 0 });
  }
  out.sort((a, b) => a.time - b.time);
  return out.filter((b, i) => i === 0 || b.time !== out[i - 1].time);
}

/** Monday 00:00 UTC of the week of `t` (1970-01-01 was a Thursday). */
const weekStart = (t: number) => {
  const day = Math.floor(t / 86400);
  return (day - ((day + 3) % 7)) * 86400;
};
const monthStart = (t: number) => {
  const d = new Date(t * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
};

/** Daily bars → weekly (Monday-based) or monthly bars. */
export function aggregateDaily(daily: readonly Bar[], interval: "1W" | "1M"): Bar[] {
  const key = interval === "1W" ? weekStart : monthStart;
  const out: Bar[] = [];
  for (const b of daily) {
    const t = key(b.time);
    const cur = out[out.length - 1];
    if (cur && cur.time === t) {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
    } else {
      out.push({ ...b, time: t });
    }
  }
  return out;
}

interface Pending {
  resolve(m: DerivMessage): void;
  reject(e: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

interface TickSub {
  listeners: Set<(t: DerivTick) => void>;
  /** Deriv's subscription id (to forget it), once confirmed. */
  id?: string;
  /** Error of the last subscribe attempt (e.g. market closed), null once ticking. */
  error: string | null;
  /** Resolves with the error of the first attempt (null when it ticks). */
  ready: Promise<string | null>;
  settle: (error: string | null) => void;
  retry?: ReturnType<typeof setTimeout>;
  /** req_id whose messages carry this subscription's ticks. */
  reqId?: number;
}

export interface DerivClientOptions {
  socket?: DerivSocketFactory;
  url?: string;
  /** Minimum time between two requests (rate limit). */
  spacingMs?: number;
  /** How long a request may take. */
  timeoutMs?: number;
  /** How often a subscription refused because the market is closed is tried again. */
  resubscribeMs?: number;
  /** Close the connection after this long without requests or subscriptions. */
  idleMs?: number;
}

/** Shared Deriv WebSocket: request/response by req_id, tick subscriptions, rate limiting, reconnects. */
export class DerivClient {
  private readonly factory: DerivSocketFactory;
  private readonly url: string;
  private readonly spacingMs: number;
  private readonly timeoutMs: number;
  private readonly resubscribeMs: number;
  private readonly idleMs: number;
  private sock: DerivSocket | null = null;
  private opened: Promise<void> | null = null;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly queue: (() => void)[] = [];
  private lastSend = -Infinity;
  private pump: ReturnType<typeof setTimeout> | undefined;
  private readonly subs = new Map<string, TickSub>();
  private reconnect: ReturnType<typeof setTimeout> | undefined;
  private backoff = 1000;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private ping: ReturnType<typeof setInterval> | undefined;

  constructor(opts: DerivClientOptions = {}) {
    this.factory = opts.socket ?? defaultDerivSocket;
    this.url = opts.url ?? DERIV_WS_URL;
    this.spacingMs = opts.spacingMs ?? 250;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.resubscribeMs = opts.resubscribeMs ?? 60_000;
    this.idleMs = opts.idleMs ?? 60_000;
  }

  /** Send one request and wait for its answer; a rate-limited request is tried once more. */
  async request(msg: Record<string, unknown>): Promise<DerivMessage> {
    try {
      return await this.send(msg);
    } catch (e) {
      if (!(e instanceof DerivError) || e.code !== "RateLimit") throw e;
      await new Promise((r) => setTimeout(r, 2000).unref?.());
      return this.send(msg);
    }
  }

  /**
   * Live ticks of one Deriv symbol. `ready` resolves with null once it ticks, or with the reason
   * it does not (unknown symbol, market closed). A closed market is tried again periodically.
   */
  subscribe(symbol: string, onTick: (t: DerivTick) => void): { ready: Promise<string | null>; stop: () => void } {
    let sub = this.subs.get(symbol);
    if (!sub) {
      let settle!: (e: string | null) => void;
      const ready = new Promise<string | null>((r) => (settle = r));
      const s: TickSub = { listeners: new Set(), error: null, ready, settle };
      let first = true;
      s.settle = (e) => {
        if (first) settle(e);
        first = false;
      };
      sub = s;
      this.subs.set(symbol, sub);
      this.startSub(symbol, sub);
    }
    sub.listeners.add(onTick);
    this.touch();
    const own = sub;
    return {
      ready: own.error !== null ? Promise.resolve(own.error) : own.ready,
      stop: () => {
        own.listeners.delete(onTick);
        if (own.listeners.size || this.subs.get(symbol) !== own) return;
        this.subs.delete(symbol);
        clearTimeout(own.retry);
        if (own.reqId !== undefined) this.streams.delete(own.reqId);
        if (own.id && this.sock) this.send({ forget: own.id }).catch(() => {});
        this.touch();
      },
    };
  }

  /** Symbols with an active subscription (for tests and status). */
  subscribed(): string[] {
    return [...this.subs.keys()];
  }

  close(): void {
    clearTimeout(this.reconnect);
    clearTimeout(this.idle);
    clearInterval(this.ping);
    clearTimeout(this.pump);
    for (const s of this.subs.values()) clearTimeout(s.retry);
    this.subs.clear();
    const sock = this.sock;
    this.sock = null;
    this.opened = null;
    sock?.close();
    this.failAll(providerError("Deriv connection closed"));
  }

  private startSub(symbol: string, sub: TickSub): void {
    clearTimeout(sub.retry);
    if (sub.reqId !== undefined) this.streams.delete(sub.reqId);
    this.send({ ticks: symbol, subscribe: 1 }, (m) => this.subs.get(symbol) === sub && this.onTickMessage(symbol, m), (id) => (sub.reqId = id))
      .then((m) => {
        if (this.subs.get(symbol) !== sub) {
          if (m.subscription?.id) this.send({ forget: m.subscription.id }).catch(() => {});
          return;
        }
        sub.id = m.subscription?.id;
        sub.error = null;
        sub.settle(null);
      })
      .catch((e: Error) => {
        if (this.subs.get(symbol) !== sub) return;
        const closed = e instanceof DerivError && e.code === "MarketIsClosed";
        sub.error = closed ? `Deriv: ${e.message}` : httpError(e, symbol).message;
        sub.settle(sub.error);
        // A closed market opens again; other failures retry with the connection.
        if (closed || !(e instanceof DerivError)) {
          sub.retry = setTimeout(() => this.subs.get(symbol) === sub && this.startSub(symbol, sub), this.resubscribeMs);
          sub.retry.unref?.();
        }
      });
  }

  private onTickMessage(symbol: string, m: DerivMessage): void {
    const t = m.tick;
    const quote = num(t?.quote);
    const epoch = num(t?.epoch);
    if (!t || !(quote > 0) || !Number.isFinite(epoch)) return;
    const tick: DerivTick = { symbol, quote, epoch, bid: num(t.bid) > 0 ? num(t.bid) : undefined, ask: num(t.ask) > 0 ? num(t.ask) : undefined };
    const sub = this.subs.get(symbol);
    if (!sub) return;
    sub.error = null;
    for (const l of sub.listeners) l(tick);
  }

  /** Streams by req_id: every message with that id goes to `stream` after the first answer. */
  private readonly streams = new Map<number, (m: DerivMessage) => unknown>();

  private send(msg: Record<string, unknown>, stream?: (m: DerivMessage) => unknown, onId?: (id: number) => void): Promise<DerivMessage> {
    return new Promise<DerivMessage>((resolve, reject) => {
      this.queue.push(() => {
        this.connect()
          .then(() => {
            const id = ++this.seq;
            const timer = setTimeout(() => {
              this.pending.delete(id);
              reject(providerError("Deriv did not answer in time"));
            }, this.timeoutMs);
            timer.unref?.();
            this.pending.set(id, { resolve, reject, timer });
            if (stream) this.streams.set(id, stream);
            onId?.(id);
            try {
              this.sock!.send(JSON.stringify({ ...msg, req_id: id }));
            } catch (e) {
              clearTimeout(timer);
              this.pending.delete(id);
              this.streams.delete(id);
              reject(providerError(`Deriv: ${(e as Error).message}`));
            }
          })
          .catch(reject);
      });
      this.drain();
    });
  }

  private drain(): void {
    if (this.pump !== undefined) return;
    const step = () => {
      this.pump = undefined;
      const job = this.queue.shift();
      if (!job) return;
      this.lastSend = Date.now();
      job();
      this.touch();
      if (this.queue.length) this.schedulePump();
    };
    const wait = this.lastSend + this.spacingMs - Date.now();
    if (wait <= 0) step();
    else this.schedulePump(wait, step);
  }

  private schedulePump(wait = this.spacingMs, step?: () => void): void {
    this.pump = setTimeout(step ?? (() => {
      this.pump = undefined;
      this.drain();
    }), wait);
    this.pump.unref?.();
  }

  private connect(): Promise<void> {
    if (this.opened) return this.opened;
    this.opened = new Promise<void>((resolve, reject) => {
      let sock: DerivSocket;
      try {
        sock = this.factory(this.url);
      } catch (e) {
        this.opened = null;
        reject(e instanceof HttpError ? e : providerError(`Deriv: ${(e as Error).message}`));
        return;
      }
      this.sock = sock;
      let isOpen = false;
      sock.onopen = () => {
        isOpen = true;
        this.backoff = 1000;
        clearInterval(this.ping);
        // Deriv drops connections that stay silent for two minutes.
        this.ping = setInterval(() => this.sock === sock && this.send({ ping: 1 }).catch(() => {}), 30_000);
        this.ping.unref?.();
        resolve();
      };
      sock.onmessage = (ev) => this.onMessage(ev.data);
      sock.onerror = () => {};
      sock.onclose = () => {
        if (this.sock !== sock) return;
        this.sock = null;
        this.opened = null;
        clearInterval(this.ping);
        if (!isOpen) reject(providerError("Cannot connect to Deriv"));
        this.failAll(providerError("Deriv connection closed"));
        this.scheduleReconnect();
      };
    });
    return this.opened;
  }

  /** After a drop, reconnect (with backoff) while subscriptions are active, and restore them. */
  private scheduleReconnect(): void {
    if (this.subs.size === 0 || this.reconnect !== undefined) return;
    this.reconnect = setTimeout(() => {
      this.reconnect = undefined;
      if (this.subs.size === 0) return;
      this.backoff = Math.min(this.backoff * 2, 30_000);
      for (const [symbol, sub] of this.subs) {
        sub.id = undefined;
        this.startSub(symbol, sub);
      }
    }, this.backoff);
    this.reconnect.unref?.();
  }

  private failAll(err: Error): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
    this.streams.clear();
  }

  private onMessage(data: unknown): void {
    let m: DerivMessage;
    try {
      m = JSON.parse(String(data)) as DerivMessage;
    } catch {
      return;
    }
    const id = m.req_id;
    if (id === undefined) return;
    const p = this.pending.get(id);
    if (p) {
      this.pending.delete(id);
      clearTimeout(p.timer);
      if (m.error) {
        this.streams.delete(id);
        p.reject(new DerivError(m.error.code ?? "Error", m.error.message ?? "request failed"));
        return;
      }
      p.resolve(m);
    }
    const stream = this.streams.get(id);
    if (stream && !m.error) stream(m);
  }

  /** Close the connection once nothing has used it for `idleMs`. */
  private touch(): void {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => {
      if (this.subs.size || this.pending.size || this.queue.length) return this.touch();
      const sock = this.sock;
      this.sock = null;
      this.opened = null;
      clearInterval(this.ping);
      sock?.close();
    }, this.idleMs);
    this.idle.unref?.();
  }
}

/** Deriv as a market data provider (`DERIV:<name>` symbols). */
export class DerivProvider {
  private table: { at: number; map: Map<string, DerivSymbol>; load?: Promise<Map<string, DerivSymbol>> } = { at: 0, map: new Map() };
  private prevClose = new Map<string, { at: number; value: number }>();

  /** `client` null: the feed is off (tests; the server always enables it). */
  constructor(
    readonly client: DerivClient | null,
    private readonly now: () => number = nowSec,
  ) {}

  private need(): DerivClient {
    if (!this.client) throw badRequest("The Deriv feed is off");
    return this.client;
  }

  /** Deriv's symbol list by app name, refreshed every 10 minutes (the open flags matter). */
  async symbols(): Promise<Map<string, DerivSymbol>> {
    const fresh = Date.now() - this.table.at < 600_000;
    if (fresh && this.table.map.size) return this.table.map;
    if (!this.table.load) {
      const client = this.need();
      this.table.load = client
        .request({ active_symbols: "brief" })
        .then((m) => {
          const map = new Map<string, DerivSymbol>();
          for (const s of m.active_symbols ?? []) {
            const symbol = s.underlying_symbol ?? s.symbol;
            if (!symbol) continue;
            const name = derivAppName(symbol);
            map.set(name, {
              symbol,
              name,
              title: s.underlying_symbol_name ?? s.display_name ?? name,
              market: s.market ?? "",
              submarket: s.submarket ?? "",
              open: s.exchange_is_open === 1,
              listed: true,
            });
          }
          this.table = { at: Date.now(), map };
          return map;
        })
        .finally(() => {
          this.table.load = undefined;
        });
    }
    try {
      return await this.table.load;
    } catch (e) {
      // A stale list beats none.
      if (this.table.map.size) return this.table.map;
      throw httpError(e, "its symbol list");
    }
  }

  /** App name (EURUSD, R_100, ...) → Deriv symbol; six-letter pairs Deriv does not list are tried as forex. */
  async lookup(name: string): Promise<DerivSymbol> {
    const n = name.toUpperCase().replace(/^(FRX|CRY)(?=[A-Z]{6}$)/, "");
    const hit = (await this.symbols()).get(n);
    if (hit) return hit;
    if (/^[A-Z]{6}$/.test(n)) {
      return { symbol: `frx${n}`, name: n, title: `${n.slice(0, 3)}/${n.slice(3)}`, market: "forex", submarket: "", open: true, listed: false };
    }
    throw notFound(`Deriv does not offer ${name}`);
  }

  async symbolInfo(name: string): Promise<SymbolInfo> {
    return derivSymbolInfo(await this.lookup(name));
  }

  async bars(name: string, interval: Interval, to: number | undefined, limit: number): Promise<BarsPage> {
    const s = await this.lookup(name);
    const info = derivSymbolInfo(s);
    const g = GRANULARITY[interval];
    const now = this.now();
    const floor = now - DERIV_HISTORY_SEC;
    const notices: string[] = [];
    const label = s.listed ? info.name : s.name;
    const historyNotice =
      `Deriv only keeps about one year of history; older ${label} bars are not available.` +
      (info.type === "fx" && /^[A-Z]{6}$/.test(s.name) ? ` For longer history use YAHOO:${s.name}=X.` : "");
    if (to === undefined) {
      notices.push(NO_VOLUME_NOTICE);
      if (!s.listed) notices.push(`${s.name} is not in Deriv's list of offered symbols: its history loads, but live prices may not arrive.`);
      else if (!s.open) notices.push(`The ${label} market is closed on Deriv right now; the chart updates when it reopens.`);
      if (interval === "1W" || interval === "1M") notices.push(`Deriv has no ${interval === "1W" ? "weekly" : "monthly"} candles; they are built from its daily bars, which go back about one year.`);
    }
    // Before the window Deriv would silently answer with the latest bars.
    if (to !== undefined && to - 1 <= floor) return { info, bars: [], hasMore: false, notices: [historyNotice] };

    const client = this.need();
    const count = Math.min(DERIV_MAX_COUNT, interval === "1W" || interval === "1M" ? DERIV_MAX_COUNT : Math.max(1, limit));
    let end = to === undefined ? undefined : to - 1;
    let bars: Bar[] = [];
    // Deriv returns the candles of the calendar range [end - count * g, end]: a range inside a
    // weekend or holiday is empty, so step back past it (a few times at most).
    for (let attempt = 0; attempt < 4 && bars.length === 0; attempt++) {
      if (end !== undefined && end <= floor) break;
      let m: DerivMessage;
      try {
        m = await client.request({ ticks_history: s.symbol, style: "candles", granularity: g, count, end: end ?? "latest", adjust_start_time: 1 });
      } catch (e) {
        throw httpError(e, s.name);
      }
      const got = parseCandles(m.candles, g);
      // Bars at or after `to` mean Deriv ignored an end before its window.
      if (to !== undefined && got.some((b) => b.time >= to)) return { info, bars: [], hasMore: false, notices: [historyNotice] };
      bars = got;
      if (bars.length === 0) end = (end ?? now) - count * g;
    }
    if (interval === "1W" || interval === "1M") {
      bars = aggregateDaily(bars, interval);
      if (to !== undefined) bars = bars.filter((b) => b.time < to);
      bars = bars.slice(Math.max(0, bars.length - limit));
      return { info, bars, hasMore: false, notices: [...notices, historyNotice] };
    }
    bars = bars.slice(Math.max(0, bars.length - limit));
    const oldest = bars[0]?.time ?? end ?? floor;
    const hasMore = oldest - g > floor;
    if (!hasMore) notices.push(historyNotice);
    return { info, bars, hasMore, ...(notices.length ? { notices } : {}) };
  }

  async search(q: string): Promise<SymbolInfo[]> {
    if (!this.client) return [];
    const needle = q.trim().toUpperCase().replace(/^DERIV:/, "");
    const flat = needle.replace(/[^A-Z0-9]/g, "");
    if (!flat) return [];
    const map = await this.symbols();
    const title = (s: DerivSymbol) => s.title.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const hits = [...map.values()].filter((s) => s.name.replace(/[^A-Z0-9]/g, "").includes(flat) || title(s).includes(flat));
    // Exact names, then titles starting with the query, then real markets before synthetic indices.
    const rank = (s: DerivSymbol) => (s.name === flat ? 0 : title(s).startsWith(flat) ? 1 : s.market === "synthetic_index" ? 3 : 2);
    hits.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    return hits.slice(0, 10).map(derivSymbolInfo);
  }

  /** Last price (latest tick) and change against the previous daily close. */
  async quotes(names: string[]): Promise<Quote[]> {
    if (!this.client || names.length === 0) return [];
    const out = await Promise.all(
      names.map(async (name): Promise<Quote | null> => {
        try {
          const s = await this.lookup(name);
          const client = this.need();
          const m = await client.request({ ticks_history: s.symbol, style: "ticks", count: 1, end: "latest" });
          const last = num(m.history?.prices?.[0]);
          const time = num(m.history?.times?.[0]);
          if (!(last > 0)) return null;
          const prev = await this.previousClose(s, time);
          const change = prev ? last - prev : 0;
          return { symbol: `${DERIV_PREFIX}${s.name}`, last, change, changePct: prev ? (change / prev) * 100 : 0, time: Number.isFinite(time) ? time : this.now() };
        } catch {
          return null;
        }
      }),
    );
    return out.filter((q): q is Quote => q !== null);
  }

  /** Close of the last daily bar before the day of `time` (cached for 10 minutes). */
  private async previousClose(s: DerivSymbol, time: number): Promise<number | null> {
    const hit = this.prevClose.get(s.symbol);
    if (hit && Date.now() - hit.at < 600_000) return hit.value;
    const m = await this.need().request({ ticks_history: s.symbol, style: "candles", granularity: 86400, count: 7, end: "latest" });
    const day = Math.floor((Number.isFinite(time) ? time : this.now()) / 86400) * 86400;
    const before = parseCandles(m.candles, 86400).filter((b) => b.time < day);
    const value = before.at(-1)?.close ?? null;
    if (value) this.prevClose.set(s.symbol, { at: Date.now(), value });
    return value;
  }

  /** Live ticks of an app name; see DerivClient.subscribe. */
  async subscribe(name: string, onTick: (t: DerivTick) => void): Promise<{ symbol: DerivSymbol; ready: Promise<string | null>; stop: () => void }> {
    const s = await this.lookup(name);
    const sub = this.need().subscribe(s.symbol, onTick);
    return { symbol: s, ...sub };
  }
}
