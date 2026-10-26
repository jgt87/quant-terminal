// Compare overlays: other symbols drawn on the price pane as percent change from the first
// visible bar. Values are aligned to the main series by time and expressed in the main series'
// price units (main close at the base bar × compare ratio), so they share its price scale. Pure.

import type { Bar, Series } from "@qt/core";

export interface CompareSeries {
  symbol: string;
  color: string;
  bars: readonly Bar[];
  /** Closes aligned 1:1 with the main series (filled by the engine). */
  aligned: Series;
  error?: string;
}

/**
 * Close of the compare series at each main bar time: the compare bar at or before that time
 * (carried forward over gaps), null before its first bar.
 */
export function alignCloses(mainTimes: readonly number[], cmp: readonly Bar[]): Series {
  const out: Series = new Array(mainTimes.length).fill(null);
  let j = -1;
  for (let i = 0; i < mainTimes.length; i++) {
    const t = mainTimes[i];
    while (j + 1 < cmp.length && cmp[j + 1].time <= t) j++;
    out[i] = j >= 0 ? cmp[j].close : null;
  }
  return out;
}

/** First index >= from with a value (the rebasing bar), or -1. */
export function baseIndex(aligned: Series, from: number): number {
  for (let i = Math.max(0, from); i < aligned.length; i++) {
    const v = aligned[i];
    if (v != null && isFinite(v) && v !== 0) return i;
  }
  return -1;
}

/** Percent change of the compare series relative to its value at `base` (null where unknown). */
export function percentSeries(aligned: Series, base: number): Series {
  const b = base >= 0 ? aligned[base] : null;
  return aligned.map((v) => (v == null || b == null || !b ? null : (v / b - 1) * 100));
}

/** The compare series in main-price units: mainBase × (1 + pct / 100). */
export function rebaseToMain(aligned: Series, base: number, mainBase: number): Series {
  return percentSeries(aligned, base).map((p) => (p == null ? null : mainBase * (1 + p / 100)));
}
