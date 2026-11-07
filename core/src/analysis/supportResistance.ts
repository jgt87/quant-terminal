// Auto support and resistance: swing highs and lows (fractal pivots) that sit at about the same
// price are grouped into one level. A level touched more often is stronger. Levels below the last
// close are support, levels above it resistance.

import type { Bar } from "../types";
import { pivots } from "./pivots";

export interface SrLevel {
  price: number;
  kind: "support" | "resistance";
  /** Swing points in the group. */
  touches: number;
  /** First and last swing point of the group (bar indexes). */
  firstIndex: number;
  lastIndex: number;
}

export interface SrOptions {
  /** Bars on each side a swing point must stand out from. */
  strength?: number;
  /** Swing points within this percent of a level's price join it. */
  tolerance?: number;
  /** Fewest swing points a level needs. */
  minTouches?: number;
  /** Strongest levels kept. */
  maxLevels?: number;
  /** Only the last this many bars are searched (0 = all). */
  lookback?: number;
}

export function supportResistance(bars: readonly Bar[], opts: SrOptions = {}): SrLevel[] {
  const n = bars.length;
  if (n === 0) return [];
  const strength = Math.max(1, Math.floor(opts.strength ?? 5));
  const tol = Math.max(0, opts.tolerance ?? 0.5) / 100;
  const minTouches = Math.max(1, Math.floor(opts.minTouches ?? 2));
  const maxLevels = Math.max(1, Math.floor(opts.maxLevels ?? 8));
  const lookback = Math.max(0, Math.floor(opts.lookback ?? 0));
  const start = lookback > 0 ? Math.max(0, n - lookback) : 0;
  const pts = pivots(bars.slice(start) as Bar[], strength, strength)
    .map((p) => ({ index: p.index + start, price: p.price }))
    .sort((a, b) => a.price - b.price);

  // Greedy grouping over the sorted prices: a point joins the open group while it is within the
  // tolerance of the group's running mean.
  const groups: { sum: number; count: number; first: number; last: number }[] = [];
  for (const p of pts) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(p.price - g.sum / g.count) <= (g.sum / g.count) * tol) {
      g.sum += p.price;
      g.count++;
      g.first = Math.min(g.first, p.index);
      g.last = Math.max(g.last, p.index);
    } else groups.push({ sum: p.price, count: 1, first: p.index, last: p.index });
  }

  const close = bars[n - 1].close;
  return groups
    .filter((g) => g.count >= minTouches)
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .slice(0, maxLevels)
    .map((g): SrLevel => {
      const price = g.sum / g.count;
      return { price, kind: price < close ? "support" : "resistance", touches: g.count, firstIndex: g.first, lastIndex: g.last };
    })
    .sort((a, b) => b.price - a.price);
}
