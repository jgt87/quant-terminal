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

export const SMOOTHED_HA_LENGTH = 10;
export const SMOOTHED_HA_SMOOTHING = 10;

/** Exponential average seeded with the first value, so every bar has a value. */
function emaFill(values: readonly number[], n: number): number[] {
  const out = new Array<number>(values.length);
  const k = 2 / (Math.max(1, n) + 1);
  for (let i = 0; i < values.length; i++) out[i] = i === 0 ? values[0] : values[i] * k + out[i - 1] * (1 - k);
  return out;
}

/**
 * Smoothed Heikin-Ashi: open, high, low and close are each smoothed with an exponential average
 * of `length` bars, Heikin-Ashi candles are built from those, and their open and close are
 * smoothed again over `smoothing` bars (1 = no second pass). High and low are widened to hold
 * the smoothed open and close, so every candle stays valid. Time and volume come from the source.
 */
export function smoothedHeikinAshi(bars: readonly Bar[], length = SMOOTHED_HA_LENGTH, smoothing = SMOOTHED_HA_SMOOTHING): Bar[] {
  if (bars.length === 0) return [];
  const f = (k: "open" | "high" | "low" | "close") => emaFill(bars.map((b) => b[k]), length);
  const [o, h, l, c] = [f("open"), f("high"), f("low"), f("close")];
  const ha = heikinAshi(bars.map((b, i) => ({ time: b.time, open: o[i], high: Math.max(h[i], o[i], c[i]), low: Math.min(l[i], o[i], c[i]), close: c[i], volume: b.volume })));
  if (smoothing <= 1) return ha;
  const so = emaFill(ha.map((b) => b.open), smoothing);
  const sc = emaFill(ha.map((b) => b.close), smoothing);
  const sh = emaFill(ha.map((b) => b.high), smoothing);
  const sl = emaFill(ha.map((b) => b.low), smoothing);
  return ha.map((b, i) => ({ time: b.time, open: so[i], high: Math.max(sh[i], so[i], sc[i]), low: Math.min(sl[i], so[i], sc[i]), close: sc[i], volume: b.volume }));
}
