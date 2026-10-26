// Small helpers shared by the price-only chart transforms.

import type { TransformedBar } from "../types-ext";
import type { Bar } from "../types";
import { atr } from "../indicators/volatility";

/** Tolerance for float comparisons against box/brick grids (relative to one box). */
export const GRID_EPS = 1e-9;

/** floor(x / step) robust against tiny float errors (0.3 / 0.1 → 3, not 2). */
export function gridFloor(x: number, step: number): number {
  return Math.floor(x / step + GRID_EPS);
}

/** ceil(x / step) robust against tiny float errors. */
export function gridCeil(x: number, step: number): number {
  return Math.ceil(x / step - GRID_EPS);
}

/** Last non-null ATR(n) value, or null when there is not enough data. */
export function lastAtr(bars: Bar[], n: number): number | null {
  const s = atr(bars, n);
  for (let i = s.length - 1; i >= 0; i--) {
    const v = s[i];
    if (v !== null && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

/**
 * Volume bookkeeping: source volume accumulates in a pending pot; every emitted
 * element takes the whole pot (so later elements completed by the same source bar
 * get 0). Total volume is conserved for completed elements.
 */
export class VolumePot {
  private pot = 0;
  add(v: number): void {
    if (Number.isFinite(v)) this.pot += v;
  }
  take(): number {
    const v = this.pot;
    this.pot = 0;
    return v;
  }
}

export function element(
  time: number,
  open: number,
  close: number,
  high: number,
  low: number,
  volume: number,
  dir: 1 | -1,
  sourceIndex: number,
): TransformedBar {
  return { time, open, high, low, close, volume, dir, sourceIndex };
}

