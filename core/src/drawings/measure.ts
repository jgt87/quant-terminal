// Measurer drawing tools (price range, date range, date and price range): pure range statistics.

import type { Anchor, Bar } from "../types";
import { barIndexAtOrAfter, barIndexAtOrBefore } from "./projection";

export interface RangeStats {
  /** b.price − a.price, and in percent of a.price. */
  priceChange: number;
  percent: number;
  /** Price change in ticks (signed). */
  ticks: number;
  /** Bars from a to b (signed): bar-index difference when bars cover both ends, else time ÷ interval. */
  bars: number;
  /** b.time − a.time in seconds (signed). */
  seconds: number;
  /** Total volume of the bars between the two times (inclusive). */
  volume: number;
}

/** Statistics of the range between two anchors. */
export function rangeStats(a: Anchor, b: Anchor, bars: readonly Bar[], intervalSec: number, tick: number): RangeStats {
  const priceChange = b.price - a.price;
  const seconds = b.time - a.time;
  const lo = Math.min(a.time, b.time);
  const hi = Math.max(a.time, b.time);
  let barCount = intervalSec > 0 ? Math.round(seconds / intervalSec) : 0;
  const last = bars.length ? bars[bars.length - 1].time : -Infinity;
  if (bars.length && lo >= bars[0].time && hi <= last) {
    const i0 = barIndexAtOrBefore(bars, lo);
    const i1 = barIndexAtOrBefore(bars, hi);
    barCount = (i1 - i0) * Math.sign(seconds || 1);
  }
  let volume = 0;
  for (let i = barIndexAtOrAfter(bars, lo); i < bars.length && bars[i].time <= hi; i++) volume += bars[i].volume || 0;
  return {
    priceChange,
    percent: a.price !== 0 ? (priceChange / Math.abs(a.price)) * 100 : 0,
    ticks: tick > 0 ? Math.round(priceChange / tick) : 0,
    bars: barCount,
    seconds,
    volume,
  };
}

/** Compact time span: "45m", "3h 20m", "2d 4h", "12d" (absolute). */
export function rangeSpanText(seconds: number): string {
  const s = Math.abs(Math.round(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d >= 10) return `${d}d`;
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
