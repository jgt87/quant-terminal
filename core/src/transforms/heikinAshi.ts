// Heikin-Ashi candles (textbook definition). Behaviorally identical to the web chart's copy.
//   haClose = (O + H + L + C) / 4
//   haOpen  = (previous haOpen + previous haClose) / 2; first bar (O + C) / 2
//   haHigh  = max(H, haOpen, haClose), haLow = min(L, haOpen, haClose)
// time and volume are taken from the source bar.

import type { Bar } from "../types";

export function heikinAshi(bars: readonly Bar[]): Bar[] {
  const out: Bar[] = new Array(bars.length);
  let po = 0;
  let pc = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const c = (b.open + b.high + b.low + b.close) / 4;
    const o = i === 0 ? (b.open + b.close) / 2 : (po + pc) / 2;
    out[i] = { time: b.time, open: o, high: Math.max(b.high, o, c), low: Math.min(b.low, o, c), close: c, volume: b.volume };
    po = o;
    pc = c;
  }
  return out;
}
