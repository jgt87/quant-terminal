// Options panel model: rows around the money, bar sizes by strike, axis ticks and labels.

import type { OptionRow } from "@qt/core";

export type OptionMeasure = "openInterest" | "volume";

/** The `n` strikes on each side of the at-the-money row (all rows when there are fewer). */
export function rowsAroundMoney(rows: readonly OptionRow[], atm: number | null, n: number): OptionRow[] {
  if (atm === null) return rows.slice();
  const i = rows.findIndex((r) => r.strike === atm);
  if (i < 0) return rows.slice();
  return rows.slice(Math.max(0, i - n), i + n + 1);
}

/** Largest call or put value of a measure over the rows (for bar widths). */
export function measureMax(rows: readonly OptionRow[], m: OptionMeasure): number {
  let max = 0;
  for (const r of rows) max = Math.max(max, r.call?.[m] ?? 0, r.put?.[m] ?? 0);
  return max;
}

/** A call is in the money below the index, a put above it. */
export const inTheMoney = (side: "call" | "put", strike: number, index: number | null): boolean =>
  index !== null && (side === "call" ? strike < index : strike > index);

/** Days (fractional) until an expiry. */
export const daysTo = (expiry: number, now: number): number => (expiry - now) / 86_400_000;

/** Expiry label: "26 Dec 2026 (49 d)" ("< 1 d" on the last day). */
export function expiryLabel(expiry: number, now: number): string {
  const d = new Date(expiry);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const days = daysTo(expiry, now);
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} (${days < 1 ? "< 1" : Math.round(days)} d)`;
}

/** About `count` round tick values across [lo, hi] (1 / 2 / 5 steps). */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** Linear map of [d0, d1] onto [r0, r1]. */
export const linear = (d0: number, d1: number, r0: number, r1: number) => (v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));

/** Compact strike / size text: 85000 → 85K, 1250000 → 1.25M. */
export function shortNumber(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${Number((v / 1e6).toPrecision(3))}M`;
  if (a >= 1e4) return `${Number((v / 1e3).toPrecision(3))}K`;
  return String(Number(v.toPrecision(4)));
}
