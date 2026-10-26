// Shared live data for every chart and panel on screen:
// - one EventSource on /api/stream for the union of all MT5 symbols subscribed anywhere;
// - one polling loop for the latest bars of every (symbol, interval) on screen, each key fetched
//   once per period however many charts show it.

import { INTERVAL_SECONDS, type Bar, type Interval } from "@qt/core";
import type { LiveTick } from "../chart/liveTick";
import settings from "../config/settings.json";
import { getBars } from "./client";

export type StreamState = "off" | "connecting" | "open" | "error";

/** Comparable name of a streamed symbol: "MT5:EURUSD", "EURUSD=X" and "FX:EURUSD" all match. */
export function tickKey(symbol: string): string {
  return symbol.toUpperCase().replace(/^[A-Z0-9_]+:/, "").replace(/=X$/, "");
}

const norm = (s: string) => s.trim().toUpperCase();

/** A tick as the stream sends it: `ids` are the requested symbols it belongs to. */
export type StreamTick = LiveTick & { ids?: string[] };

/**
 * The subscribed symbol a tick belongs to, or null. Matching is by the requested ids the server
 * echoes with each tick (exact, so broker suffixes such as "AAPL.NAS" or "EURUSDm" and aliases
 * such as "EURUSD=X" match exactly what was asked for); servers without `ids` fall back to the
 * canonical id, then to the base name.
 */
export function matchTick(t: StreamTick, symbols: readonly string[]): string | null {
  if (Array.isArray(t.ids)) {
    const ids = new Set(t.ids.map(norm));
    return symbols.find((s) => ids.has(norm(s))) ?? null;
  }
  const sym = norm(t.symbol ?? "");
  const exact = symbols.find((s) => norm(s) === sym);
  if (exact) return exact;
  const k = tickKey(sym);
  return symbols.find((s) => tickKey(s) === k) ?? null;
}

/** Requested symbols the server reported as not streamable (merged over all error frames). */
export function mergeStreamErrors(into: Map<string, string>, data: unknown): Map<string, string> {
  const list = (data as { errors?: { symbol?: unknown; error?: unknown }[] } | null)?.errors;
  if (!Array.isArray(list)) return into;
  for (const e of list) if (typeof e?.symbol === "string") into.set(norm(e.symbol), typeof e.error === "string" ? e.error : "Not streamable");
  return into;
}

interface TickSub {
  symbols: string[];
  onTick(t: LiveTick): void;
  onState(s: StreamState): void;
}

const MAX_STREAM_SYMBOLS = 50;
const RETRY_MS = 5000;

class TickFeed {
  private subs = new Set<TickSub>();
  private es: EventSource | null = null;
  private esKey = "";
  private pending = false;
  private retry: ReturnType<typeof setTimeout> | undefined;
  /** Symbols of the current connection that cannot stream (normalized → reason). */
  errors = new Map<string, string>();
  state: StreamState = "off";

  subscribe(symbols: string[], onTick: (t: LiveTick) => void, onState: (s: StreamState) => void): () => void {
    const sub: TickSub = { symbols, onTick, onState };
    this.subs.add(sub);
    this.schedule();
    onState(this.esKey ? this.subState(sub) : "connecting");
    return () => {
      this.subs.delete(sub);
      this.schedule();
    };
  }

  /** Coalesce subscription changes of one render into a single reconnect. */
  private schedule(): void {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      this.reconcile();
    });
  }

  /** A subscriber whose every symbol was rejected sees "error"; the others the shared state. */
  private subState(sub: TickSub): StreamState {
    if (this.state === "open" && sub.symbols.length && sub.symbols.every((s) => this.errors.has(norm(s)))) return "error";
    return this.state;
  }

  private setState(s: StreamState): void {
    this.state = s;
    for (const sub of this.subs) sub.onState(this.subState(sub));
  }

  private reconcile(force = false): void {
    const all = [...new Set([...this.subs].flatMap((s) => s.symbols))].sort().slice(0, MAX_STREAM_SYMBOLS);
    const key = all.join(",");
    if (key === this.esKey && !force) return;
    clearTimeout(this.retry);
    this.retry = undefined;
    this.es?.close();
    this.es = null;
    this.esKey = key;
    this.errors = new Map();
    if (!key || typeof EventSource === "undefined") {
      this.setState("off");
      return;
    }
    this.setState("connecting");
    const es = new EventSource(`/api/stream?symbols=${all.map(encodeURIComponent).join(",")}`);
    this.es = es;
    es.onopen = () => this.es === es && this.setState("open");
    es.onerror = () => {
      if (this.es !== es) return;
      if (es.readyState !== EventSource.CLOSED) return this.setState("connecting");
      // The server refused the stream (e.g. the bridge is down): try again later.
      this.setState("error");
      this.retry = setTimeout(() => this.es === es && this.reconcile(true), RETRY_MS);
    };
    es.addEventListener("errors", (ev) => {
      if (this.es !== es) return;
      try {
        mergeStreamErrors(this.errors, JSON.parse((ev as MessageEvent<string>).data));
      } catch {
        return;
      }
      this.setState(this.state);
    });
    es.addEventListener("tick", (ev) => {
      if (this.es !== es) return;
      let t: StreamTick;
      try {
        t = JSON.parse((ev as MessageEvent<string>).data) as StreamTick;
      } catch {
        return; // ignore malformed events
      }
      for (const sub of this.subs) {
        const sym = matchTick(t, sub.symbols);
        // Each subscriber receives the tick under the id it asked for.
        if (sym) sub.onTick(sym === t.symbol ? t : { ...t, symbol: sym });
      }
    });
  }
}

export const tickFeed = new TickFeed();

/** Optional bar options of a polled series (part of its key). */
export interface PollOptions {
  adjust?: "dividends";
  session?: "extended";
}

interface PollEntry {
  symbol: string;
  interval: Interval;
  opts: PollOptions;
  listeners: Set<(bars: Bar[]) => void>;
  last: number;
  busy: boolean;
}

class BarPoller {
  private entries = new Map<string, PollEntry>();
  private timer: number | undefined;

  subscribe(symbol: string, interval: Interval, cb: (bars: Bar[]) => void, opts: PollOptions = {}): () => void {
    const key = `${symbol}|${interval}|${opts.adjust ?? ""}|${opts.session ?? ""}`;
    let e = this.entries.get(key);
    if (!e) {
      // The subscriber just loaded the series: the first poll is one period away.
      e = { symbol, interval, opts, listeners: new Set(), last: Date.now(), busy: false };
      this.entries.set(key, e);
    }
    e.listeners.add(cb);
    this.ensure();
    const entry = e;
    return () => {
      entry.listeners.delete(cb);
      if (entry.listeners.size === 0 && this.entries.get(key) === entry) this.entries.delete(key);
      if (this.entries.size === 0) {
        window.clearTimeout(this.timer);
        this.timer = undefined;
      }
    };
  }

  private ensure(): void {
    if (this.timer !== undefined) return;
    const step = Math.min(settings.pollIntradayMs, settings.pollDailyMs);
    const loop = () => {
      this.timer = window.setTimeout(() => {
        this.tick();
        if (this.entries.size > 0) loop();
        else this.timer = undefined;
      }, step);
    };
    loop();
  }

  private tick(): void {
    const now = Date.now();
    for (const e of this.entries.values()) {
      const period = INTERVAL_SECONDS[e.interval] < 86400 ? settings.pollIntradayMs : settings.pollDailyMs;
      if (e.busy || now - e.last < period - 50) continue;
      e.last = now;
      e.busy = true;
      getBars({ symbol: e.symbol, interval: e.interval, limit: 2, ...e.opts })
        .then((res) => {
          for (const cb of e.listeners) cb(res.bars);
        })
        .catch(() => {
          /* transient: the next round retries */
        })
        .finally(() => {
          e.busy = false;
        });
    }
  }
}

export const barPoller = new BarPoller();
