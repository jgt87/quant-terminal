// Turns the provider bars of one or more legs into the chart series: optional resampling to a
// custom interval, then (for formula charts) the expression evaluated over the legs. Pure.

import { evaluateExpression, isExpression, parseExpression, type Bar, type ExprNode } from "@qt/core";
import { resampleAnchored, type BucketAnchor } from "./sessions";

export interface SeriesPlan {
  /** Symbols fetched from the provider (one for a plain symbol, every leg of a formula). */
  legs: string[];
  /** Expression tree for formula charts, null for a plain symbol. */
  expr: ExprNode | null;
  /** Provider interval seconds and the target seconds (equal = no resampling). */
  fromSec: number;
  toSec: number;
  /** Bucket alignment of resampled series (UTC grid when absent). */
  anchor?: BucketAnchor;
}

/** Plan for a symbol (plain or expression) shown at `toSec`, fetched at `fromSec`. */
export function planSeries(symbol: string, fromSec: number, toSec: number): SeriesPlan {
  if (isExpression(symbol)) {
    const p = parseExpression(symbol);
    return { legs: p.symbols, expr: p.ast, fromSec, toSec };
  }
  return { legs: [symbol], expr: null, fromSec, toSec };
}

/**
 * The chart series from the legs' provider bars. Each leg is resampled first (so formula legs
 * join on the same custom buckets), then the expression joins them by time (inner join).
 * A plain, non-resampled series is returned as is (same array).
 */
export function composeSeries(plan: SeriesPlan, legBars: Record<string, Bar[]>): Bar[] {
  const resample = plan.toSec !== plan.fromSec;
  const per: Record<string, Bar[]> = {};
  for (const leg of plan.legs) {
    const raw = legBars[leg] ?? [];
    per[leg] = resample ? resampleAnchored(raw, plan.fromSec, plan.toSec, plan.anchor) : raw;
  }
  if (!plan.expr) return per[plan.legs[0]] ?? [];
  return evaluateExpression(plan.expr, per);
}

/** Merge newer provider bars into a sorted leg (replace equal times, append newer, insert gaps). */
export function mergeBars(into: Bar[], fresh: readonly Bar[]): Bar[] {
  if (fresh.length === 0) return into;
  const out = into.slice();
  for (const b of fresh) {
    const n = out.length;
    if (n === 0 || b.time > out[n - 1].time) out.push(b);
    else if (b.time === out[n - 1].time) out[n - 1] = b;
    else {
      let lo = 0;
      let hi = n;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (out[mid].time < b.time) lo = mid + 1;
        else hi = mid;
      }
      if (out[lo]?.time === b.time) out[lo] = b;
      else out.splice(lo, 0, b);
    }
  }
  return out;
}

/** Older bars (strictly before the leg's first bar) prepended. */
export function prependBars(into: Bar[], older: readonly Bar[]): Bar[] {
  const first = into.length ? into[0].time : Infinity;
  const add = older.filter((b) => b.time < first);
  return add.length ? add.concat(into) : into;
}
