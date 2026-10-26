// Bar storage with live-update and history-paging semantics. Pure (no DOM).

import type { Bar } from "@qt/core";

export type UpsertResult = "replaced" | "appended" | "inserted";

export class SeriesData {
  private _bars: Bar[] = [];
  private _times: number[] = [];

  get bars(): readonly Bar[] {
    return this._bars;
  }
  get times(): readonly number[] {
    return this._times;
  }
  get length(): number {
    return this._bars.length;
  }
  last(): Bar | undefined {
    return this._bars[this._bars.length - 1];
  }

  set(bars: readonly Bar[]): void {
    this._bars = sanitize(bars);
    this._times = this._bars.map((b) => b.time);
  }

  /** Replace the bar with the same time, append if newer, insert if an older gap. */
  upsert(bar: Bar): UpsertResult {
    const bars = this._bars;
    const n = bars.length;
    if (n === 0 || bar.time > bars[n - 1].time) {
      bars.push(bar);
      this._times.push(bar.time);
      return "appended";
    }
    if (bar.time === bars[n - 1].time) {
      bars[n - 1] = bar;
      return "replaced";
    }
    const i = lowerBound(this._times, bar.time);
    if (this._times[i] === bar.time) {
      bars[i] = bar;
      return "replaced";
    }
    bars.splice(i, 0, bar);
    this._times.splice(i, 0, bar.time);
    return "inserted";
  }

  /** Prepend older bars; bars not strictly older than the first bar are ignored. Returns count added. */
  prepend(older: readonly Bar[]): number {
    const first = this._bars.length ? this._bars[0].time : Infinity;
    const add = sanitize(older).filter((b) => b.time < first);
    if (add.length === 0) return 0;
    this._bars = add.concat(this._bars);
    this._times = this._bars.map((b) => b.time);
    return add.length;
  }

  /** Index of the bar with time <= t (nearest at or before), or -1. */
  indexAtOrBefore(t: number): number {
    const i = lowerBound(this._times, t);
    if (this._times[i] === t) return i;
    return i - 1;
  }
}

/** Sorted, de-duplicated copy (last occurrence wins). */
export function sanitize(bars: readonly Bar[]): Bar[] {
  const out: Bar[] = [];
  let sorted = true;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].time <= bars[i - 1].time) {
      sorted = false;
      break;
    }
  }
  const src = sorted ? bars : [...bars].sort((a, b) => a.time - b.time);
  for (const b of src) {
    if (!isFinite(b.open) || !isFinite(b.close)) continue;
    if (out.length && out[out.length - 1].time === b.time) out[out.length - 1] = b;
    else out.push(b);
  }
  return out;
}

export function lowerBound(arr: readonly number[], t: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Heikin-Ashi candles:
 *   haClose = (O+H+L+C)/4
 *   haOpen  = (prev haOpen + prev haClose)/2, first bar (O+C)/2
 *   haHigh  = max(H, haOpen, haClose), haLow = min(L, haOpen, haClose)
 */
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
