// Volume profile (fixed range and per session) and TPO / market profile.
//
// Volume profile
// - Rows: `rows` equal slices of [lowest low, highest high] of the range, or rows of a
//   fixed `rowSize` on a grid of multiples of rowSize.
// - Each bar's volume is spread uniformly over its own high–low span: a row receives
//   volume × (overlap of the row with [low, high]) / (high − low). A bar with
//   high == low puts all its volume into the row containing that price.
// - Up/down split by bar direction: close >= open counts as up volume, else down.
// - POC = the row with the most volume (ties: the row nearest the middle of the profile,
//   then the lower row); `poc` is that row's midpoint.
// - Value area (standard two-row expansion): start at the POC row; compare the combined
//   volume of the next two rows above with the next two rows below and add the larger
//   pair (ties go up; a missing side always loses), until the included volume reaches
//   valueAreaPct of the total. VAH = top edge of the highest included row, VAL = bottom
//   edge of the lowest included row.
//
// TPO profile
// - Periods of periodMinutes from the first bar's time; period p gets letter A–Z for
//   p = 0..25, a–z for 26..51, then the sequence repeats.
// - Rows are price buckets [k·tick, (k+1)·tick), labelled by their low price k·tick.
//   A period marks every bucket from its lowest low to its highest high (inclusive).
// - POC = the row with the most letters (same tie rule as above); value area = the same
//   two-row expansion over letter counts until 70% (valueAreaPct) of all TPOs; VAH/VAL
//   are the prices of the highest/lowest included rows.
// - Initial balance = high/low of the first two periods.

import type { Bar } from "../types";
import type { ProfileRow, TpoProfile, VolumeProfile } from "../types-ext";

export type RowSpec = number | { rows: number } | { rowSize: number };

const EPS = 1e-9;

/** Index of the max value; ties → nearest to the middle, then lower index. */
function pocIndex(values: number[]): number {
  const mid = (values.length - 1) / 2;
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    const b = values[best];
    if (v > b || (v === b && Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return best;
}

/** Two-row value-area expansion; returns inclusive [low row, high row]. */
export function valueAreaRange(values: number[], poc: number, pct: number): [number, number] {
  const total = values.reduce((a, b) => a + b, 0);
  const target = (total * pct) / 100;
  let lo = poc;
  let hi = poc;
  let acc = values[poc] ?? 0;
  while (acc < target - EPS && (lo > 0 || hi < values.length - 1)) {
    const upRows = [hi + 1, hi + 2].filter((r) => r < values.length);
    const dnRows = [lo - 1, lo - 2].filter((r) => r >= 0);
    const up = upRows.reduce((s, r) => s + values[r], 0);
    const dn = dnRows.reduce((s, r) => s + values[r], 0);
    const takeUp = upRows.length > 0 && (dnRows.length === 0 || up >= dn);
    if (takeUp) {
      hi = upRows[upRows.length - 1];
      acc += up;
    } else {
      lo = dnRows[dnRows.length - 1];
      acc += dn;
    }
  }
  return [lo, hi];
}

export function volumeProfile(
  bars: Bar[],
  startIndex: number,
  endIndex: number,
  rows: RowSpec = 24,
  valueAreaPct = 70,
): VolumeProfile {
  const s = Math.max(0, Math.floor(startIndex));
  const e = Math.min(bars.length - 1, Math.floor(endIndex));
  const slice = bars.slice(s, e + 1);
  if (slice.length === 0) return { rows: [], poc: NaN, vah: NaN, val: NaN, startIndex: s, endIndex: e };
  const lo = Math.min(...slice.map((b) => b.low));
  const hi = Math.max(...slice.map((b) => b.high));

  let base: number;
  let size: number;
  let count: number;
  if (typeof rows === "object" && "rowSize" in rows) {
    size = rows.rowSize;
    if (!(size > 0)) throw new RangeError("rowSize must be > 0");
    base = Math.floor(lo / size + EPS) * size;
    count = Math.max(1, Math.ceil((hi - base) / size - EPS));
  } else {
    count = Math.max(1, Math.floor(typeof rows === "number" ? rows : rows.rows));
    base = lo;
    size = hi > lo ? (hi - lo) / count : 0;
    if (size === 0) count = 1;
  }
  const out: ProfileRow[] = [];
  for (let r = 0; r < count; r++) {
    const pl = base + r * size;
    const ph = size === 0 ? hi : r === count - 1 && !(typeof rows === "object" && "rowSize" in rows) ? hi : base + (r + 1) * size;
    out.push({ priceLow: pl, priceHigh: ph, volume: 0, upVolume: 0, downVolume: 0 });
  }
  const rowOf = (price: number) => (size === 0 ? 0 : Math.min(count - 1, Math.max(0, Math.floor((price - base) / size + EPS))));
  for (const b of slice) {
    const v = Number.isFinite(b.volume) ? b.volume : 0;
    if (v === 0) continue;
    const up = b.close >= b.open;
    const put = (r: number, x: number) => {
      out[r].volume += x;
      if (up) out[r].upVolume += x;
      else out[r].downVolume += x;
    };
    const span = b.high - b.low;
    if (span <= 0 || size === 0) {
      put(rowOf(b.low), v);
      continue;
    }
    const r0 = rowOf(b.low);
    const r1 = rowOf(b.high);
    for (let r = r0; r <= r1; r++) {
      const overlap = Math.min(b.high, out[r].priceHigh) - Math.max(b.low, out[r].priceLow);
      if (overlap > 0) put(r, (v * overlap) / span);
    }
  }
  const vols = out.map((r) => r.volume);
  const p = pocIndex(vols);
  const [a, z] = valueAreaRange(vols, p, valueAreaPct);
  return {
    rows: out,
    poc: (out[p].priceLow + out[p].priceHigh) / 2,
    vah: out[z].priceHigh,
    val: out[a].priceLow,
    startIndex: s,
    endIndex: e,
  };
}

/**
 * One volume profile per session. A session is a UTC day shifted by `sessionBoundary`
 * seconds (0 = sessions roll at 00:00 UTC; 13.5·3600 = sessions start 13:30 UTC).
 */
export function sessionVolumeProfiles(
  bars: Bar[],
  sessionBoundary = 0,
  rows: RowSpec = 24,
  valueAreaPct = 70,
): VolumeProfile[] {
  const out: VolumeProfile[] = [];
  let start = 0;
  const day = (t: number) => Math.floor((t - sessionBoundary) / 86400);
  for (let i = 1; i <= bars.length; i++) {
    if (i === bars.length || day(bars[i].time) !== day(bars[start].time)) {
      out.push(volumeProfile(bars, start, i - 1, rows, valueAreaPct));
      start = i;
    }
  }
  return bars.length ? out : [];
}

/** TPO letter for period p: A–Z, then a–z, repeating after 52 periods. */
export function tpoLetter(p: number): string {
  const k = ((p % 52) + 52) % 52;
  return k < 26 ? String.fromCharCode(65 + k) : String.fromCharCode(97 + k - 26);
}

export function tpoProfile(bars: Bar[], periodMinutes = 30, tickSize = 1, valueAreaPct = 70): TpoProfile {
  if (bars.length === 0 || !(tickSize > 0)) {
    return { rows: [], poc: NaN, vah: NaN, val: NaN, initialBalance: { high: NaN, low: NaN }, sessionStart: bars[0]?.time ?? NaN };
  }
  const start = bars[0].time;
  const len = periodMinutes * 60;
  // Period extremes.
  const periods = new Map<number, { high: number; low: number }>();
  for (const b of bars) {
    const p = Math.floor((b.time - start) / len);
    const cur = periods.get(p);
    if (cur) {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
    } else periods.set(p, { high: b.high, low: b.low });
  }
  const bucket = (x: number) => Math.floor(x / tickSize + EPS);
  const kLo = bucket(Math.min(...bars.map((b) => b.low)));
  const kHi = bucket(Math.max(...bars.map((b) => b.high)));
  const letters: string[] = new Array(kHi - kLo + 1).fill("");
  const order = [...periods.keys()].sort((a, b) => a - b);
  for (const p of order) {
    const { high, low } = periods.get(p)!;
    for (let k = bucket(low); k <= bucket(high); k++) letters[k - kLo] += tpoLetter(p);
  }
  const rows = letters.map((l, i) => ({ price: (kLo + i) * tickSize, letters: l }));
  const counts = letters.map((l) => l.length);
  const pIdx = pocIndex(counts);
  const [a, z] = valueAreaRange(counts, pIdx, valueAreaPct);
  const ib = order.filter((p) => p < 2).map((p) => periods.get(p)!);
  return {
    rows,
    poc: rows[pIdx].price,
    vah: rows[z].price,
    val: rows[a].price,
    initialBalance: {
      high: ib.length ? Math.max(...ib.map((x) => x.high)) : NaN,
      low: ib.length ? Math.min(...ib.map((x) => x.low)) : NaN,
    },
    sessionStart: start,
  };
}
