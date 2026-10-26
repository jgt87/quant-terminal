// N-line break chart (three-line break by default) from closing prices.
//
// - The first line is drawn from bars[0].close to the first close that differs from it.
// - A new line in the same direction as the last line forms when the close exceeds the
//   last line's extreme (above its top for up, below its bottom for down).
// - A reversal line forms only when the close breaks the extreme of the last N lines
//   (all of them if fewer than N exist): above the highest top for an up reversal,
//   below the lowest bottom for a down reversal.
// - Up lines open at the top of the previous line, down lines at its bottom; the close
//   is the bar's close. Lines are always complete, so all of them are emitted.

import type { Bar } from "../types";
import type { TransformedBar } from "../types-ext";
import { VolumePot, element } from "./common";

export interface LineBreakOptions {
  lines: number;
}

export function lineBreak(bars: Bar[], opts: LineBreakOptions = { lines: 3 }): TransformedBar[] {
  const out: TransformedBar[] = [];
  const n = Math.max(1, Math.floor(opts.lines || 3));
  if (bars.length === 0) return out;
  const pot = new VolumePot();
  const top = (b: TransformedBar) => Math.max(b.open, b.close);
  const bottom = (b: TransformedBar) => Math.min(b.open, b.close);
  const ref = bars[0].close;
  pot.add(bars[0].volume);

  for (let i = 1; i < bars.length; i++) {
    const c = bars[i].close;
    pot.add(bars[i].volume);
    const last = out[out.length - 1];
    if (!last) {
      if (c !== ref) out.push(element(bars[i].time, ref, c, Math.max(ref, c), Math.min(ref, c), pot.take(), c > ref ? 1 : -1, i));
      continue;
    }
    const recent = out.slice(-n);
    const hiN = Math.max(...recent.map(top));
    const loN = Math.min(...recent.map(bottom));
    const upNeeded = last.dir === 1 ? top(last) : hiN;
    const downNeeded = last.dir === -1 ? bottom(last) : loN;
    if (c > upNeeded) {
      const o = top(last);
      out.push(element(bars[i].time, o, c, c, o, pot.take(), 1, i));
    } else if (c < downNeeded) {
      const o = bottom(last);
      out.push(element(bars[i].time, o, c, o, c, pot.take(), -1, i));
    }
  }
  return out;
}
