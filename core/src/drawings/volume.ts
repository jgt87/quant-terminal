// Volume-based drawing tools: anchored VWAP from an anchor bar with standard-deviation bands.

import type { Bar } from "../types";
import { barIndexAtOrAfter } from "./projection";

export type VwapSource = "open" | "high" | "low" | "close" | "hl2" | "hlc3" | "ohlc4" | "hlcc4";

export const VWAP_SOURCES: VwapSource[] = ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4", "hlcc4"];

/** Price of a bar for a VWAP source (default hlc3). */
export function vwapSourcePrice(b: Bar, src: VwapSource = "hlc3"): number {
  switch (src) {
    case "open":
      return b.open;
    case "high":
      return b.high;
    case "low":
      return b.low;
    case "close":
      return b.close;
    case "hl2":
      return (b.high + b.low) / 2;
    case "ohlc4":
      return (b.open + b.high + b.low + b.close) / 4;
    case "hlcc4":
      return (b.high + b.low + 2 * b.close) / 4;
    default:
      return (b.high + b.low + b.close) / 3;
  }
}

export interface VwapPoint {
  time: number;
  vwap: number;
  /** Volume-weighted standard deviation of the source around the VWAP so far. */
  stdev: number;
  /** [lower, upper] per band multiplier, in the order given. */
  bands: [number, number][];
}

/**
 * Anchored VWAP from the first bar at or after `anchorTime` to the last bar:
 * VWAP = Σ(p·v) / Σv, σ = √(Σ(v·p²)/Σv − VWAP²), bands = VWAP ± k·σ. Bars without volume count
 * with weight 1 until volume appears (so symbols without volume still get a line).
 */
export function anchoredVwap(bars: readonly Bar[], anchorTime: number, src: VwapSource = "hlc3", multipliers: readonly number[] = []): VwapPoint[] {
  const out: VwapPoint[] = [];
  const start = barIndexAtOrAfter(bars, anchorTime);
  let sv = 0;
  let spv = 0;
  let sp2v = 0;
  const noVolume = bars.slice(start).every((b) => !(b.volume > 0));
  for (let i = start; i < bars.length; i++) {
    const b = bars[i];
    const v = noVolume ? 1 : Math.max(0, b.volume || 0);
    const p = vwapSourcePrice(b, src);
    sv += v;
    spv += p * v;
    sp2v += p * p * v;
    if (sv <= 0) continue;
    const vwap = spv / sv;
    const stdev = Math.sqrt(Math.max(0, sp2v / sv - vwap * vwap));
    out.push({ time: b.time, vwap, stdev, bands: multipliers.map((k) => [vwap - k * stdev, vwap + k * stdev]) });
  }
  return out;
}
