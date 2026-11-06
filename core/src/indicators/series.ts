// Element-wise and rolling helpers used by the extended indicator set. Same null rules as ma.ts:
// a missing input (null / non-finite) makes the output null at that bar.

import type { Series } from "../types";
import { emptySeries, valid, validPeriod, type Values } from "./ma";

/** f(a[i], b[i]) where both are valid, else null. A non-finite result is stored as null. */
export function zip(a: Values, b: Values, f: (x: number, y: number) => number): Series {
  const out = emptySeries(a.length);
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!valid(x) || !valid(y)) continue;
    const r = f(x, y);
    out[i] = Number.isFinite(r) ? r : null;
  }
  return out;
}

/** f(a[i]) where valid, else null. */
export function mapValid(a: Values, f: (x: number, i: number) => number | null): Series {
  const out = emptySeries(a.length);
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (!valid(x)) continue;
    const r = f(x, i);
    out[i] = r !== null && Number.isFinite(r) ? r : null;
  }
  return out;
}

/** Value n bars ago (null for the first n bars). */
export function lag(values: Values, n: number): Series {
  const out = emptySeries(values.length);
  for (let i = n; i < values.length; i++) {
    const v = values[i - n];
    out[i] = valid(v) ? v : null;
  }
  return out;
}

/** Shifts a series `n` bars forward (n > 0) or back (n < 0) inside the bar range; the rest is null. */
export function shift(values: Values, n: number): Series {
  const out = emptySeries(values.length);
  for (let i = 0; i < values.length; i++) {
    const j = i - n;
    if (j < 0 || j >= values.length) continue;
    const v = values[j];
    out[i] = valid(v) ? v : null;
  }
  return out;
}

/** Sum of the last n values; null for windows that contain a missing value. O(len). */
export function rollingSum(values: Values, n: number): Series {
  const out = emptySeries(values.length);
  if (!validPeriod(n)) return out;
  let run = 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!valid(v)) {
      run = 0;
      sum = 0;
      continue;
    }
    run++;
    sum += v;
    if (run > n) sum -= values[i - n] as number;
    // Recompute exactly now and then so long runs do not accumulate rounding drift.
    if (run >= n && run % 1024 === 0) {
      sum = 0;
      for (let k = i - n + 1; k <= i; k++) sum += values[k] as number;
    }
    if (run >= n) out[i] = sum;
  }
  return out;
}

/** Bars since the highest (hi = true) or lowest value inside a window of n + 1 values ending at i. */
export function barsSinceExtreme(values: Values, n: number, hi: boolean): Series {
  const out = emptySeries(values.length);
  if (!validPeriod(n)) return out;
  for (let i = n; i < values.length; i++) {
    let best = Number.NaN;
    let at = -1;
    let ok = true;
    for (let k = i - n; k <= i; k++) {
      const v = values[k];
      if (!valid(v)) {
        ok = false;
        break;
      }
      // Ties go to the most recent bar.
      if (at < 0 || (hi ? v >= best : v <= best)) {
        best = v;
        at = k;
      }
    }
    if (ok) out[i] = i - at;
  }
  return out;
}

/** Least-squares line over the last n values, evaluated at the newest bar (+ offset bars ahead). */
export function linreg(values: Values, n: number, offset = 0): Series {
  const out = emptySeries(values.length);
  if (!validPeriod(n)) return out;
  const sx = ((n - 1) * n) / 2;
  const sxx = ((n - 1) * n * (2 * n - 1)) / 6;
  const den = n * sxx - sx * sx;
  let run = 0;
  for (let i = 0; i < values.length; i++) {
    run = valid(values[i]) ? run + 1 : 0;
    if (run < n) continue;
    let sy = 0;
    let sxy = 0;
    for (let k = 0; k < n; k++) {
      const y = values[i - n + 1 + k] as number;
      sy += y;
      sxy += k * y;
    }
    const slope = den === 0 ? 0 : (n * sxy - sx * sy) / den;
    const intercept = (sy - slope * sx) / n;
    out[i] = intercept + slope * (n - 1 + offset);
  }
  return out;
}
