// Kagi chart from closing prices.
//
// - Reversal amount: absolute price, or percent of the current line's extreme
//   (mode "percent": reversal 4 = 4% of the price where the line turned).
// - The first line starts at bars[0].close and is drawn once the close has moved by
//   at least the reversal amount in either direction.
// - A line keeps extending while closes go further in its direction; when a close moves
//   back by at least the reversal amount from the line's extreme, the line ends there
//   and a new line starts at that extreme, in the opposite direction.
// - Shoulder = the top of an up line that reversed; waist = the bottom of a down line
//   that reversed. Lines become yang (thick, dir 1) when price rises above the previous
//   shoulder and yin (thin, dir -1) when it falls below the previous waist; the first
//   line is yang if it goes up, yin if it goes down. `dir` is the state at the line's end.
// - Each emitted bar is one vertical Kagi line: open = start, close = end (the
//   shoulder/waist points), high/low = its extent. The last, still-open line is included.
//   time/sourceIndex = the bar that set the line's end. Volume as in the other transforms.

import type { Bar } from "../types";
import type { TransformedBar } from "../types-ext";
import { VolumePot, element } from "./common";

export interface KagiOptions {
  reversal: number;
  mode: "absolute" | "percent";
}

export function kagi(bars: Bar[], opts: KagiOptions): TransformedBar[] {
  const out: TransformedBar[] = [];
  if (bars.length === 0 || !(opts.reversal > 0)) return out;
  const amount = (ref: number) => (opts.mode === "percent" ? (Math.abs(ref) * opts.reversal) / 100 : opts.reversal);

  let start = bars[0].close;
  let end = start;
  let endIdx = 0;
  let trend: 0 | 1 | -1 = 0;
  let thick: 1 | -1 = 1;
  let shoulder: number | null = null;
  let waist: number | null = null;
  const pot = new VolumePot();

  const emit = (): void => {
    out.push(element(bars[endIdx].time, start, end, Math.max(start, end), Math.min(start, end), pot.take(), thick, endIdx));
  };
  const updateThickness = (): void => {
    if (trend === 1 && shoulder !== null && end > shoulder) thick = 1;
    if (trend === -1 && waist !== null && end < waist) thick = -1;
  };

  for (let i = 0; i < bars.length; i++) {
    const c = bars[i].close;
    pot.add(bars[i].volume);
    if (trend === 0) {
      if (Math.abs(c - start) >= amount(start) && c !== start) {
        trend = c > start ? 1 : -1;
        thick = trend;
        end = c;
        endIdx = i;
      }
      continue;
    }
    if ((trend === 1 && c > end) || (trend === -1 && c < end)) {
      end = c;
      endIdx = i;
      updateThickness();
      continue;
    }
    if (Math.abs(end - c) >= amount(end) && c !== end) {
      emit();
      if (trend === 1) shoulder = end;
      else waist = end;
      start = end;
      end = c;
      endIdx = i;
      trend = trend === 1 ? -1 : 1;
      updateThickness();
    }
  }
  if (trend !== 0) emit();
  return out;
}
