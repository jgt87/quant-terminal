// Range bars: every completed bar spans exactly `range` from low to high.
//
// - Intrabar path assumption (OHLC only, no ticks): an up bar (close >= open) travels
//   open → low → high → close, a down bar open → high → low → close. The gap from one
//   bar's close to the next bar's open is travelled as a straight move too.
// - A range bar completes when price moves beyond low + range (closes at low + range,
//   dir 1) or below high − range (closes at high − range, dir -1). The next range bar
//   opens at that close, so one source move can complete several range bars.
// - The last, still-forming bar is included when it has moved (its high − low may be
//   < range); its dir is 1 when close >= open.

import type { Bar } from "../types";
import type { TransformedBar } from "../types-ext";
import { GRID_EPS, VolumePot, element } from "./common";

export interface RangeBarOptions {
  range: number;
}

export function rangeBars(bars: Bar[], opts: RangeBarOptions): TransformedBar[] {
  const out: TransformedBar[] = [];
  const R = opts.range;
  if (bars.length === 0 || !(R > 0) || !Number.isFinite(R)) return out;
  const eps = R * GRID_EPS;
  const pot = new VolumePot();

  let p = bars[0].open;
  let open = p;
  let hi = p;
  let lo = p;

  const moveTo = (q: number, i: number): void => {
    if (q > p) {
      while (q > lo + R + eps) {
        const c = lo + R;
        out.push(element(bars[i].time, open, c, c, lo, pot.take(), 1, i));
        open = hi = lo = c;
      }
      hi = Math.max(hi, q);
    } else if (q < p) {
      while (q < hi - R - eps) {
        const c = hi - R;
        out.push(element(bars[i].time, open, c, hi, c, pot.take(), -1, i));
        open = hi = lo = c;
      }
      lo = Math.min(lo, q);
    }
    p = q;
  };

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    pot.add(b.volume);
    const path = b.close >= b.open ? [b.open, b.low, b.high, b.close] : [b.open, b.high, b.low, b.close];
    for (const q of path) moveTo(q, i);
  }
  const last = bars.length - 1;
  if (hi > lo || out.length === 0) out.push(element(bars[last].time, open, p, hi, lo, pot.take(), p >= open ? 1 : -1, last));
  return out;
}
