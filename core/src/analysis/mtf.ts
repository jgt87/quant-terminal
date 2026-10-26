// Multi-timeframe alignment without look-ahead.
//
// Each lower bar receives the value of the last higher-timeframe bar that had COMPLETED
// by the lower bar's close time. A higher bar that is still forming is never used.
//
// Close times: bar i closes at min(time_i + intervalSec, time_{i+1}). intervalSec is
// given in opts or inferred as the smallest positive gap between consecutive bars.
// Using the next bar's open as an upper bound handles gaps (weekends, sessions).
// For calendar months pass opts.higherSec explicitly (e.g. 31 days) so the last,
// unfinished month is never treated as closed too early.

import type { Bar, Series } from "../types";

export interface AlignOptions {
  lowerSec?: number;
  higherSec?: number;
}

function inferInterval(bars: Bar[]): number {
  let best = Infinity;
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i].time - bars[i - 1].time;
    if (d > 0 && d < best) best = d;
  }
  return Number.isFinite(best) ? best : 0;
}

function closeTimes(bars: Bar[], sec: number): number[] {
  return bars.map((b, i) => {
    const nominal = b.time + sec;
    return i + 1 < bars.length ? Math.min(nominal, bars[i + 1].time) : nominal;
  });
}

export function alignHigherTimeframe(
  lowerBars: Bar[],
  higherBars: Bar[],
  higherValues: Series,
  mode: "no-lookahead" = "no-lookahead",
  opts: AlignOptions = {},
): Series {
  void mode; // the only supported mode; kept explicit in the signature
  const out: Series = new Array(lowerBars.length).fill(null);
  if (lowerBars.length === 0 || higherBars.length === 0) return out;
  const lowerSec = opts.lowerSec ?? inferInterval(lowerBars);
  const higherSec = opts.higherSec ?? inferInterval(higherBars);
  if (!(higherSec > 0)) return out; // a single higher bar with unknown length is never known to be closed
  const lc = closeTimes(lowerBars, lowerSec);
  const hc = closeTimes(higherBars, higherSec);
  let j = -1; // last completed higher bar
  for (let i = 0; i < lowerBars.length; i++) {
    while (j + 1 < higherBars.length && hc[j + 1] <= lc[i]) j++;
    out[i] = j >= 0 ? (higherValues[j] ?? null) : null;
  }
  return out;
}
