// Renko bricks (textbook "traditional" Renko).
//
// - Box size: a fixed price amount, or "atr" = the LAST non-null ATR(atrLength) value
//   of the input (Wilder ATR, default length 14), used for the whole series.
// - The first reference price is bars[0].close. Before any brick exists one box in
//   either direction starts the series.
// - Continuation: a new up brick [top, top + box] forms when price >= top + box of the
//   last brick (mirror for down).
// - Reversal: the first brick in the opposite direction starts at the far edge of the
//   last brick, so price must travel 2 boxes from the last brick's close
//   (up brick [lo, hi] → down brick [lo − box, lo] needs price <= hi − 2·box).
// - source "close": only closes are used. source "hl": highs drive up bricks and lows
//   drive down bricks; the current direction is checked first, and the opposite side is
//   checked only when the bar made no brick in the current direction.
// - Only completed bricks are emitted; time/sourceIndex = the bar that completed them.
//   Volume: each brick takes the source volume accumulated since the previous brick.

import type { Bar } from "../types";
import type { TransformedBar } from "../types-ext";
import { VolumePot, element, gridFloor, lastAtr } from "./common";

export interface RenkoOptions {
  boxSize: number | "atr";
  atrLength?: number;
  source?: "close" | "hl";
}

export function renko(bars: Bar[], opts: RenkoOptions): TransformedBar[] {
  const out: TransformedBar[] = [];
  if (bars.length === 0) return out;
  const box = opts.boxSize === "atr" ? lastAtr(bars, opts.atrLength ?? 14) : opts.boxSize;
  if (box === null || !(box > 0) || !Number.isFinite(box)) return out;
  const hl = opts.source === "hl";

  let hi = bars[0].close; // top of the last brick (or the reference price)
  let lo = bars[0].close; // bottom of the last brick
  let dir: 0 | 1 | -1 = 0;
  const pot = new VolumePot();

  const up = (price: number, i: number): boolean => {
    const k = gridFloor(price - hi, box);
    if (k < 1) return false;
    const base = hi;
    for (let j = 0; j < k; j++) {
      const o = base + j * box;
      const c = base + (j + 1) * box;
      out.push(element(bars[i].time, o, c, c, o, pot.take(), 1, i));
    }
    lo = base + (k - 1) * box;
    hi = base + k * box;
    dir = 1;
    return true;
  };
  const down = (price: number, i: number): boolean => {
    const k = gridFloor(lo - price, box);
    if (k < 1) return false;
    const base = lo;
    for (let j = 0; j < k; j++) {
      const o = base - j * box;
      const c = base - (j + 1) * box;
      out.push(element(bars[i].time, o, c, o, c, pot.take(), -1, i));
    }
    hi = base - (k - 1) * box;
    lo = base - k * box;
    dir = -1;
    return true;
  };

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    pot.add(b.volume);
    const upPx = hl ? b.high : b.close;
    const dnPx = hl ? b.low : b.close;
    if (dir >= 0) {
      if (!up(upPx, i)) down(dnPx, i);
    } else if (!down(dnPx, i)) up(upPx, i);
  }
  return out;
}
