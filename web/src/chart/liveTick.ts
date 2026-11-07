// Pure helpers that fold a live tick into the bar series.
// Intraday: the tick extends the last bar while it falls inside [last.time, last.time + interval);
// later ticks open a new bar on the same grid (offset-safe for providers whose sessions do not
// start on a UTC multiple). 1D buckets by the tick's UTC date. 1W/1M only extend the last bar;
// polling stays the source of truth for new weekly/monthly bars.

import { INTERVAL_SECONDS, type Bar, type Interval } from "@qt/core";

export interface TickApply {
  bar: Bar;
  /** True when the tick opened a new bar. */
  isNew: boolean;
}

/** Start (UTC seconds) of the bar a tick at `timeSec` belongs to, given the last known bar. */
export function tickBucket(lastTime: number, timeSec: number, interval: Interval): number {
  if (interval === "1W" || interval === "1M") return lastTime;
  if (interval === "1D") return Math.floor(timeSec / 86400) * 86400;
  const sec = INTERVAL_SECONDS[interval];
  if (timeSec < lastTime + sec) return lastTime;
  return lastTime + Math.floor((timeSec - lastTime) / sec) * sec;
}

/** Apply one tick price to the last bar. Returns null when the tick is unusable or stale. */
export function applyTick(last: Bar | undefined, price: number, timeSec: number, interval: Interval): TickApply | null {
  if (!last || !Number.isFinite(price) || price <= 0 || !Number.isFinite(timeSec)) return null;
  if (timeSec < last.time) return null;
  const start = tickBucket(last.time, timeSec, interval);
  if (start <= last.time) {
    return { bar: { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price }, isNew: false };
  }
  return { bar: { time: start, open: price, high: price, low: price, close: price, volume: 0 }, isNew: true };
}

export interface LiveTick {
  symbol: string;
  bid?: number;
  ask?: number;
  last?: number;
  time: number;
  timeMs?: number;
}

/** Charted price of a tick: last trade, else bid (MT5 charts are bid based). */
export function tickPrice(t: LiveTick): number {
  return t.last && t.last > 0 ? t.last : (t.bid ?? NaN);
}

/** Whether a symbol is served by the MT5 bridge or Deriv (and can stream). */
export function isLiveSymbol(symbol: string, provider?: string): boolean {
  const s = symbol.toUpperCase();
  return provider === "mt5" || provider === "deriv" || s.startsWith("MT5:") || s.startsWith("DERIV:");
}
