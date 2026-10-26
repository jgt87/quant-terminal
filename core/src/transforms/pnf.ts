// Point & Figure columns (high/low method).
//
// - Prices are mapped onto a box grid of multiples of `boxSize` ("atr" = the last
//   ATR(atrLength) value, default 14). A high fills boxes up to floor(high / box);
//   a low fills boxes down to ceil(low / box).
// - The first column starts at the box containing bars[0].close and appears once price
//   has filled one box beyond it: X column if the high did, else O column if the low did.
// - In an X column the high is checked first: a new higher box extends the column.
//   Only if it does not, a low that is `reversal` boxes below the column top starts an
//   O column one box below the top. O columns mirror this (low first, then reversal up,
//   new X column starting one box above the bottom).
// - Each column becomes one bar: high/low = the column's top/bottom box price, dir 1 = X,
//   -1 = O; open/close run bottom→top for X and top→bottom for O. The current column is
//   included. time/sourceIndex = the bar that last extended the column.

import type { Bar } from "../types";
import type { TransformedBar } from "../types-ext";
import { VolumePot, element, gridCeil, gridFloor, lastAtr } from "./common";

export interface PnfOptions {
  boxSize: number | "atr";
  reversal: number;
  atrLength?: number;
}

export function pointAndFigure(bars: Bar[], opts: PnfOptions): TransformedBar[] {
  const out: TransformedBar[] = [];
  if (bars.length === 0) return out;
  const box = opts.boxSize === "atr" ? lastAtr(bars, opts.atrLength ?? 14) : opts.boxSize;
  if (box === null || !(box > 0) || !Number.isFinite(box)) return out;
  const rev = Math.max(1, Math.floor(opts.reversal || 3));

  // Column state in box units.
  let dir: 0 | 1 | -1 = 0;
  let lo = gridFloor(bars[0].close, box);
  let hi = lo;
  let idx = 0;
  const pot = new VolumePot();

  const emit = (): void => {
    const low = lo * box;
    const high = hi * box;
    const [o, c] = dir === 1 ? [low, high] : [high, low];
    out.push(element(bars[idx].time, o, c, high, low, pot.take(), dir === 1 ? 1 : -1, idx));
  };

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    pot.add(b.volume);
    const upIdx = gridFloor(b.high, box);
    const dnIdx = gridCeil(b.low, box);
    if (dir === 0) {
      if (upIdx >= hi + 1) {
        dir = 1;
        hi = upIdx;
        idx = i;
      } else if (dnIdx <= lo - 1) {
        dir = -1;
        lo = dnIdx;
        idx = i;
      }
    } else if (dir === 1) {
      if (upIdx > hi) {
        hi = upIdx;
        idx = i;
      } else if (dnIdx <= hi - rev) {
        emit();
        dir = -1;
        hi = hi - 1;
        lo = dnIdx;
        idx = i;
      }
    } else if (dnIdx < lo) {
      lo = dnIdx;
      idx = i;
    } else if (upIdx >= lo + rev) {
      emit();
      dir = 1;
      lo = lo + 1;
      hi = upIdx;
      idx = i;
    }
  }
  if (dir !== 0) emit();
  return out;
}
