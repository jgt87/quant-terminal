// Pure screener math: per-symbol fields from daily bars, filters and sorting.
import type { Bar, IndicatorDef, ScreenerField, ScreenerFilter, ScreenerRow, Series } from "@qt/core";

export const SCREENER_FIELDS: readonly ScreenerField[] = [
  "close", "changePct", "volume", "rsi14", "sma50", "sma200", "ema20", "atr14Pct",
  "perf1W", "perf1M", "perf3M", "perfYTD", "high52wPct", "low52wPct", "relVolume",
];

const DAY = 86400;

/** Indicator access (the core registry, injected so this module stays I/O and import free). */
export interface Calc {
  sma(bars: Bar[], n: number): Series;
  ema(bars: Bar[], n: number): Series;
  rsi(bars: Bar[], n: number): Series;
  atr(bars: Bar[], n: number): Series;
}

/** Calc backed by the core indicator registry (same math as the chart). */
export function coreCalc(getIndicator: (id: string) => IndicatorDef | undefined): Calc {
  const run = (id: string, out: string) => (bars: Bar[], n: number): Series => {
    const def = getIndicator(id);
    if (!def) throw new Error(`Indicator ${id} is not available`);
    return def.compute(bars, { length: n, source: "close" })[out] ?? [];
  };
  return { sma: run("sma", "sma"), ema: run("ema", "ema"), rsi: run("rsi", "rsi"), atr: run("atr", "atr") };
}

const last = (s: Series): number | null => {
  const v = s[s.length - 1];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

const pct = (a: number, b: number | null | undefined): number | null => (b === null || b === undefined || b === 0 ? null : (a / b - 1) * 100);

/** Close of the last bar at or before `t`, or null when history does not reach back that far. */
export function closeAtOrBefore(bars: Bar[], t: number): number | null {
  if (bars.length === 0 || bars[0].time > t) return null;
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  return bars[lo].close;
}

/** Same day-of-month `months` back (clamped to the month's last day), UTC. */
function monthsBack(t: number, months: number): number {
  const d = new Date(t * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)) / 1000;
}

/**
 * Screener fields from daily bars (oldest first). Periods are calendar based (1W = 7 days,
 * 1M/3M = same date 1/3 months back, YTD = last close of the previous year), so they work for
 * 5-day and 7-day weeks alike. 52-week high/low use the bars of the last 365 days; relVolume
 * divides the last volume by the average of the 20 bars before it.
 */
export function computeFields(bars: Bar[], calc: Calc): Record<ScreenerField, number | null> {
  const out = Object.fromEntries(SCREENER_FIELDS.map((f) => [f, null])) as Record<ScreenerField, number | null>;
  const n = bars.length;
  if (n === 0) return out;
  const b = bars[n - 1];
  const t = b.time;
  out.close = b.close;
  out.volume = b.volume;
  out.changePct = n > 1 ? pct(b.close, bars[n - 2].close) : null;
  out.rsi14 = last(calc.rsi(bars, 14));
  out.sma50 = last(calc.sma(bars, 50));
  out.sma200 = last(calc.sma(bars, 200));
  out.ema20 = last(calc.ema(bars, 20));
  const atr = last(calc.atr(bars, 14));
  out.atr14Pct = atr === null || b.close === 0 ? null : (atr / b.close) * 100;
  out.perf1W = pct(b.close, closeAtOrBefore(bars, t - 7 * DAY));
  out.perf1M = pct(b.close, closeAtOrBefore(bars, monthsBack(t, 1)));
  out.perf3M = pct(b.close, closeAtOrBefore(bars, monthsBack(t, 3)));
  const yearStart = Date.UTC(new Date(t * 1000).getUTCFullYear(), 0, 1) / 1000;
  out.perfYTD = pct(b.close, closeAtOrBefore(bars, yearStart - 1));
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = n - 1; i >= 0 && bars[i].time > t - 365 * DAY; i--) {
    hi = Math.max(hi, bars[i].high);
    lo = Math.min(lo, bars[i].low);
  }
  out.high52wPct = pct(b.close, hi);
  out.low52wPct = pct(b.close, lo);
  if (n > 20) {
    let sum = 0;
    for (let i = n - 21; i < n - 1; i++) sum += bars[i].volume;
    out.relVolume = sum > 0 ? b.volume / (sum / 20) : null;
  }
  return out;
}

const num = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** Does a row pass one filter? Missing values never pass. */
export function passes(values: ScreenerRow["values"], f: ScreenerFilter): boolean {
  const v = values[f.field];
  if (!num(v)) return false;
  switch (f.op) {
    case ">": return num(f.value) && v > f.value;
    case "<": return num(f.value) && v < f.value;
    case ">=": return num(f.value) && v >= f.value;
    case "<=": return num(f.value) && v <= f.value;
    case "between": {
      if (!num(f.value) || !num(f.value2)) return false;
      return v >= Math.min(f.value, f.value2) && v <= Math.max(f.value, f.value2);
    }
    case "above-field":
    case "below-field": {
      const o = f.otherField ? values[f.otherField] : undefined;
      if (!num(o)) return false;
      return f.op === "above-field" ? v > o : v < o;
    }
  }
}

export function applyFilters(rows: ScreenerRow[], filters: ScreenerFilter[]): ScreenerRow[] {
  return rows.filter((r) => filters.every((f) => passes(r.values, f)));
}

/** Sort by a field; rows without a value go last in either direction, ties by symbol. */
export function sortRows(rows: ScreenerRow[], sort: { field: ScreenerField; dir: "asc" | "desc" } | undefined): ScreenerRow[] {
  if (!sort) return rows;
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a.values[sort.field];
    const y = b.values[sort.field];
    if (!num(x) && !num(y)) return a.symbol.localeCompare(b.symbol);
    if (!num(x)) return 1;
    if (!num(y)) return -1;
    return (x - y) * sign || a.symbol.localeCompare(b.symbol);
  });
}
