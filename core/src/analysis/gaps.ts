// Price gaps: a bar that opens its range entirely above the previous bar's high (gap up) or below
// its low (gap down) leaves an empty price zone. The zone shrinks as later bars trade into it and
// is filled once price has traded through all of it.

import type { Bar } from "../types";

export interface PriceGap {
  /** Bar that opened the gap. */
  index: number;
  up: boolean;
  /** Zone as it was when the gap opened. */
  top: number;
  bottom: number;
  /** Zone still open after the last bar (equal to top/bottom when untouched); null once filled. */
  openTop: number | null;
  openBottom: number | null;
  /** Bar that filled the gap, or null while it is open. */
  filledIndex: number | null;
}

export interface GapOptions {
  /** Smallest gap kept, as a percent of the previous close. */
  minPercent?: number;
  /** Keep only the most recent this many gaps (open ones first). */
  maxGaps?: number;
  /** Also return filled gaps. */
  includeFilled?: boolean;
}

export function detectGaps(bars: readonly Bar[], opts: GapOptions = {}): PriceGap[] {
  const minPct = Math.max(0, opts.minPercent ?? 0);
  const all: PriceGap[] = [];
  const open: PriceGap[] = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    // Bars after the gap trade into the zones opened before them.
    for (let k = open.length - 1; k >= 0; k--) {
      const g = open[k];
      if (g.up) {
        if (b.low <= (g.openBottom as number)) close(g, i);
        else if (b.low < (g.openTop as number)) g.openTop = b.low;
      } else {
        if (b.high >= (g.openTop as number)) close(g, i);
        else if (b.high > (g.openBottom as number)) g.openBottom = b.high;
      }
      if (g.filledIndex !== null) open.splice(k, 1);
    }
    const p = bars[i - 1];
    const ref = Math.abs(p.close) || 1;
    if (b.low > p.high && ((b.low - p.high) / ref) * 100 >= minPct) {
      const g: PriceGap = { index: i, up: true, top: b.low, bottom: p.high, openTop: b.low, openBottom: p.high, filledIndex: null };
      all.push(g);
      open.push(g);
    } else if (b.high < p.low && ((p.low - b.high) / ref) * 100 >= minPct) {
      const g: PriceGap = { index: i, up: false, top: p.low, bottom: b.high, openTop: p.low, openBottom: b.high, filledIndex: null };
      all.push(g);
      open.push(g);
    }
  }
  let out = opts.includeFilled ? all : all.filter((g) => g.filledIndex === null);
  const max = opts.maxGaps ?? Infinity;
  if (out.length > max) out = out.slice(out.length - max);
  return out;
}

function close(g: PriceGap, i: number): void {
  g.filledIndex = i;
  g.openTop = null;
  g.openBottom = null;
}
