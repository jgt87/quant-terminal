// Low-level series helpers. Inputs are plain number arrays (or Series with
// leading nulls, e.g. when chaining one indicator into another). Every helper
// returns a Series aligned 1:1 with its input, with null during warm-up.
//
// Null / non-finite handling: a value that is null, NaN or ±Infinity is treated
// as missing. Window-based helpers (sma, wma, stdev, highest, lowest) output
// null for any window that contains a missing value. Recursive helpers (ema,
// rma) seed on the first run of n valid values and output null (keeping their
// state) where a later value is missing.

import type { Series } from "../types";

export type Values = ReadonlyArray<number | null>;

export function valid(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function emptySeries(len: number): Series {
  return new Array<number | null>(len).fill(null);
}

export function validPeriod(n: number): boolean {
  return Number.isInteger(n) && n >= 1;
}

/** Applies `fn` to every complete window of n valid values ending at i. */
function windowed(values: Values, n: number, fn: (win: number[]) => number): Series {
  const out = emptySeries(values.length);
  if (!validPeriod(n) || n > values.length) return out;
  let run = 0; // consecutive valid values ending at i
  for (let i = 0; i < values.length; i++) {
    run = valid(values[i]) ? run + 1 : 0;
    if (run >= n) {
      const win = new Array<number>(n);
      for (let k = 0; k < n; k++) win[k] = values[i - n + 1 + k] as number;
      out[i] = fn(win);
    }
  }
  return out;
}

function mean(win: number[]): number {
  let s = 0;
  for (const v of win) s += v;
  return s / win.length;
}

/** Simple moving average: arithmetic mean of the last n values. */
export function sma(values: Values, n: number): Series {
  return windowed(values, n, mean);
}

/** Linearly weighted moving average: weights 1..n, newest value weighs n. */
export function wma(values: Values, n: number): Series {
  const denom = (n * (n + 1)) / 2;
  return windowed(values, n, (win) => {
    let s = 0;
    for (let k = 0; k < win.length; k++) s += win[k] * (k + 1);
    return s / denom;
  });
}

/** Population standard deviation (divides by n) of the last n values. */
export function stdev(values: Values, n: number): Series {
  return windowed(values, n, (win) => {
    // A flat window has exactly zero dispersion (avoids rounding noise in the mean).
    if (win.every((v) => v === win[0])) return 0;
    const m = mean(win);
    let ss = 0;
    for (const v of win) ss += (v - m) * (v - m);
    return Math.sqrt(ss / win.length);
  });
}

/** Highest of the last n values. */
export function highest(values: Values, n: number): Series {
  return windowed(values, n, (win) => Math.max(...win));
}

/** Lowest of the last n values. */
export function lowest(values: Values, n: number): Series {
  return windowed(values, n, (win) => Math.min(...win));
}

/**
 * Exponential smoothing with factor alpha, seeded with the simple average of the
 * first n valid values (placed at the n-th valid value).
 */
function smoothed(values: Values, n: number, alpha: number): Series {
  const out = emptySeries(values.length);
  if (!validPeriod(n)) return out;
  let seedSum = 0;
  let seedCount = 0;
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!valid(v)) {
      // Before seeding, a gap restarts the seed window.
      if (prev === null) {
        seedSum = 0;
        seedCount = 0;
      }
      continue;
    }
    if (prev === null) {
      seedSum += v;
      seedCount++;
      if (seedCount === n) {
        prev = seedSum / n;
        out[i] = prev;
      }
    } else {
      prev = prev + alpha * (v - prev);
      out[i] = prev;
    }
  }
  return out;
}

/** Exponential moving average: alpha = 2/(n+1), seeded with SMA(n) at index n-1. */
export function ema(values: Values, n: number): Series {
  return smoothed(values, n, 2 / (n + 1));
}

/** Wilder's running moving average: alpha = 1/n, seeded with SMA(n) at index n-1. */
export function rma(values: Values, n: number): Series {
  return smoothed(values, n, 1 / n);
}

