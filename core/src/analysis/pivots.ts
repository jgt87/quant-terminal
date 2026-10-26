// Swing structure: fractal pivots and a percent zig-zag.

import type { Bar } from "../types";
import type { Pivot } from "../types-ext";

/**
 * Fractal pivots. Bar i is a pivot high when its high is strictly greater than the
 * highs of the `left` bars before it and greater than or equal to the highs of the
 * `right` bars after it (so the first bar of an equal-high plateau wins); pivot lows
 * mirror this. Bars without a full window on both sides are never pivots.
 * Result is ordered by index; a bar can be both a high and a low pivot (high first).
 */
export function pivots(bars: Bar[], left: number, right: number): Pivot[] {
  const out: Pivot[] = [];
  const L = Math.max(0, Math.floor(left));
  const R = Math.max(0, Math.floor(right));
  for (let i = L; i < bars.length - R; i++) {
    let isHigh = true;
    let isLow = true;
    for (let k = i - L; k < i && (isHigh || isLow); k++) {
      if (bars[k].high >= bars[i].high) isHigh = false;
      if (bars[k].low <= bars[i].low) isLow = false;
    }
    for (let k = i + 1; k <= i + R && (isHigh || isLow); k++) {
      if (bars[k].high > bars[i].high) isHigh = false;
      if (bars[k].low < bars[i].low) isLow = false;
    }
    if (isHigh) out.push({ index: i, time: bars[i].time, price: bars[i].high, kind: "high" });
    if (isLow) out.push({ index: i, time: bars[i].time, price: bars[i].low, kind: "low" });
  }
  return out;
}

/**
 * Percent zig-zag over highs and lows.
 * - A swing reverses when price retraces at least `deviationPct` percent from the
 *   current swing extreme (from a high: low <= high × (1 − d); from a low:
 *   high >= low × (1 + d)), and the extreme is at least `depth` bars after the
 *   previous pivot (depth 0 or 1 = no spacing rule).
 * - Within one bar a new extreme in the current direction is checked before a reversal.
 * - Until the first reversal, the running highest high and lowest low compete; the one
 *   that is retraced first becomes the first pivot.
 * - If price breaks beyond the last confirmed pivot against the current swing (e.g. a
 *   lower low while swinging up from a low), that pivot moves to the new extreme.
 * - The final pivot is the current, unconfirmed swing extreme (provisional), so the
 *   last leg is always available; it is omitted only when it coincides with the last
 *   confirmed pivot. Pivots strictly alternate high/low.
 */
export function zigzag(bars: Bar[], deviationPct = 5, depth = 1): Pivot[] {
  const out: Pivot[] = [];
  const n = bars.length;
  if (n === 0) return out;
  const d = Math.max(0, deviationPct) / 100;
  const minGap = Math.max(1, Math.floor(depth));
  const hp = (i: number): Pivot => ({ index: i, time: bars[i].time, price: bars[i].high, kind: "high" });
  const lp = (i: number): Pivot => ({ index: i, time: bars[i].time, price: bars[i].low, kind: "low" });

  let trend: 0 | 1 | -1 = 0; // 1 = swinging up from a low pivot (tracking a high)
  let hiIdx = 0;
  let loIdx = 0;
  let ext = 0;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (trend === 0) {
      if (b.high > bars[hiIdx].high) hiIdx = i;
      if (b.low < bars[loIdx].low) loIdx = i;
      // Whichever extreme came first and is retraced by this bar starts the zig-zag.
      const upFromLow = b.high >= bars[loIdx].low * (1 + d) && i > loIdx;
      const downFromHigh = b.low <= bars[hiIdx].high * (1 - d) && i > hiIdx;
      if (upFromLow && (!downFromHigh || loIdx <= hiIdx)) {
        out.push(lp(loIdx));
        trend = 1;
        ext = i;
      } else if (downFromHigh) {
        out.push(hp(hiIdx));
        trend = -1;
        ext = i;
      }
      continue;
    }
    const last = out[out.length - 1];
    if (trend === 1) {
      if (b.high > bars[ext].high) ext = i;
      else if (b.low <= bars[ext].high * (1 - d) && ext - last.index >= minGap) {
        out.push(hp(ext));
        trend = -1;
        ext = i;
      } else if (b.low < last.price) {
        // Broke below the low pivot without a full reversal: move the pivot.
        out[out.length - 1] = lp(i);
        ext = i;
      }
    } else {
      if (b.low < bars[ext].low) ext = i;
      else if (b.high >= bars[ext].low * (1 + d) && ext - last.index >= minGap) {
        out.push(lp(ext));
        trend = 1;
        ext = i;
      } else if (b.high > last.price) {
        out[out.length - 1] = hp(i);
        ext = i;
      }
    }
  }
  if (trend !== 0) {
    const last = out[out.length - 1];
    if (ext !== last.index) out.push(trend === 1 ? hp(ext) : lp(ext));
  }
  return out;
}
