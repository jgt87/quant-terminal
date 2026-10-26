// Custom intervals by aggregating bars into larger time buckets.
//
// - Bucket start = anchor + floor((time − anchor) / toSec) · toSec.
// - anchor "utc" (default): buckets are aligned to the Unix epoch (UTC midnight
//   1970-01-01), so 2h/3h/6h/12h buckets start at UTC hours divisible by their size and
//   2D/3D buckets at UTC midnight. When toSec is a whole number of weeks, "utc" anchors
//   to Monday 1970-01-05 00:00 UTC so weeks start on Monday. A number is used as an
//   explicit anchor time (any time at which a bucket starts).
// - toSec must be a positive multiple of fromSec (fromSec = the source interval).
//   Calendar months have variable length and are not supported here.
// - open = first open, high = max high, low = min low, close = last close,
//   volume = sum, time = bucket start. Input must be sorted by time.

import type { Bar } from "../types";

export const WEEK_SECONDS = 604800;
/** Monday 1970-01-05 00:00 UTC. */
export const MONDAY_ANCHOR = 345600;

export function resampleBars(bars: Bar[], fromSec: number, toSec: number, anchor: "utc" | number = "utc"): Bar[] {
  if (!(fromSec > 0) || !(toSec > 0) || toSec < fromSec || toSec % fromSec !== 0) {
    throw new RangeError(`resampleBars: target ${toSec}s must be a positive multiple of source ${fromSec}s`);
  }
  const a = anchor === "utc" ? (toSec % WEEK_SECONDS === 0 ? MONDAY_ANCHOR : 0) : anchor;
  const out: Bar[] = [];
  let key = NaN;
  for (const b of bars) {
    const start = a + Math.floor((b.time - a) / toSec) * toSec;
    const cur = out[out.length - 1];
    if (cur && start === key) {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    } else {
      key = start;
      out.push({ time: start, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume });
    }
  }
  return out;
}
