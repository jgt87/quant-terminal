// Period levels (public formula definitions): Pivot Points Standard (Traditional, Fibonacci,
// Woodie, Classic, DeMark, Camarilla) and the previous period's high / low / close. Each level is
// computed from the previous calendar period (UTC day, Monday week, month or year) and holds for
// every bar of the current one, so outputs use the "steps" style.

import type { Bar, IndicatorDef, IndicatorInputDef, Series } from "../types";
import { emptySeries } from "./ma";
import { intInput } from "./source";

export type PivotPeriod = "day" | "week" | "month" | "year";
export type PivotType = "traditional" | "fibonacci" | "woodie" | "classic" | "demark" | "camarilla";

const DAY = 86400;
/** Monday 1970-01-05 00:00 UTC: weeks start on Monday. */
const MONDAY = 345600;

/** The calendar period a bar time (seconds) falls in, as a number that grows with time. */
export function periodKey(time: number, period: PivotPeriod): number {
  if (period === "day") return Math.floor(time / DAY);
  if (period === "week") return Math.floor((time - MONDAY) / (7 * DAY));
  const d = new Date(time * 1000);
  return period === "month" ? d.getUTCFullYear() * 12 + d.getUTCMonth() : d.getUTCFullYear();
}

/**
 * "Auto": the period that suits the chart interval, from the typical bar spacing. Up to 15 minutes:
 * day; other intraday: week; daily: month; weekly and longer: year.
 */
export function autoPeriod(bars: Bar[]): PivotPeriod {
  const gaps: number[] = [];
  for (let i = Math.max(1, bars.length - 200); i < bars.length; i++) gaps.push(bars[i].time - bars[i - 1].time);
  if (!gaps.length) return "day";
  gaps.sort((a, b) => a - b);
  const s = gaps[Math.floor(gaps.length / 2)];
  if (s <= 900) return "day";
  if (s < DAY) return "week";
  if (s < 7 * DAY) return "month";
  return "year";
}

interface Period {
  key: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Bars grouped into consecutive periods, and the period index of every bar. */
export function groupPeriods(bars: Bar[], period: PivotPeriod): { periods: Period[]; index: number[] } {
  const periods: Period[] = [];
  const index: number[] = [];
  for (const b of bars) {
    const key = periodKey(b.time, period);
    const cur = periods[periods.length - 1];
    if (cur && cur.key === key) {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
    } else {
      periods.push({ key, open: b.open, high: b.high, low: b.low, close: b.close });
    }
    index.push(periods.length - 1);
  }
  return { periods, index };
}

export const PIVOT_LEVELS = ["p", "r1", "s1", "r2", "s2", "r3", "s3", "r4", "s4", "r5", "s5"] as const;
export type PivotLevels = Partial<Record<(typeof PIVOT_LEVELS)[number], number>>;

/** The levels for a period from the previous period's prices (`open` = the current period's open, for Woodie). */
export function pivotLevels(type: PivotType, prev: { open: number; high: number; low: number; close: number }, open: number): PivotLevels {
  const { high: h, low: l, close: c } = prev;
  const r = h - l;
  switch (type) {
    case "fibonacci": {
      const p = (h + l + c) / 3;
      return { p, r1: p + 0.382 * r, s1: p - 0.382 * r, r2: p + 0.618 * r, s2: p - 0.618 * r, r3: p + r, s3: p - r };
    }
    case "woodie": {
      const p = (h + l + 2 * open) / 4;
      const r3 = h + 2 * (p - l);
      const s3 = l - 2 * (h - p);
      return { p, r1: 2 * p - l, s1: 2 * p - h, r2: p + r, s2: p - r, r3, s3, r4: r3 + r, s4: s3 - r };
    }
    case "classic": {
      const p = (h + l + c) / 3;
      return { p, r1: 2 * p - l, s1: 2 * p - h, r2: p + r, s2: p - r, r3: p + 2 * r, s3: p - 2 * r, r4: p + 3 * r, s4: p - 3 * r };
    }
    case "demark": {
      const x = c < prev.open ? h + 2 * l + c : c > prev.open ? 2 * h + l + c : h + l + 2 * c;
      return { p: x / 4, r1: x / 2 - l, s1: x / 2 - h };
    }
    case "camarilla": {
      const p = (h + l + c) / 3;
      const k = 1.1 * r;
      const r5 = l === 0 ? undefined : (h / l) * c;
      return {
        p,
        r1: c + k / 12,
        s1: c - k / 12,
        r2: c + k / 6,
        s2: c - k / 6,
        r3: c + k / 4,
        s3: c - k / 4,
        r4: c + k / 2,
        s4: c - k / 2,
        ...(r5 === undefined ? {} : { r5, s5: c - (r5 - c) }),
      };
    }
    case "traditional":
    default: {
      const p = (h + l + c) / 3;
      return {
        p,
        r1: 2 * p - l,
        s1: 2 * p - h,
        r2: p + r,
        s2: p - r,
        r3: h + 2 * (p - l),
        s3: l - 2 * (h - p),
        r4: p * 3 + (h - 3 * l),
        s4: p * 3 - (3 * h - l),
        r5: p * 4 + (h - 4 * l),
        s5: p * 4 - (4 * h - l),
      };
    }
  }
}

/** Pivot levels for every bar; bars of the first period (no previous period) are null. */
export function pivotPoints(bars: Bar[], type: PivotType, period: PivotPeriod): Record<string, Series> {
  const out: Record<string, Series> = Object.fromEntries(PIVOT_LEVELS.map((k) => [k, emptySeries(bars.length)]));
  const { periods, index } = groupPeriods(bars, period);
  const cache = new Map<number, PivotLevels>();
  for (let i = 0; i < bars.length; i++) {
    const j = index[i];
    if (j === 0) continue;
    let lv = cache.get(j);
    if (!lv) {
      lv = pivotLevels(type, periods[j - 1], periods[j].open);
      cache.set(j, lv);
    }
    for (const k of PIVOT_LEVELS) {
      const v = lv[k];
      if (v !== undefined && Number.isFinite(v)) out[k][i] = v;
    }
  }
  return out;
}

/** The previous period's high, low and close on every bar of the current period. */
export function previousPeriod(bars: Bar[], period: PivotPeriod): { high: Series; low: Series; close: Series } {
  const high = emptySeries(bars.length);
  const low = emptySeries(bars.length);
  const close = emptySeries(bars.length);
  const { periods, index } = groupPeriods(bars, period);
  for (let i = 0; i < bars.length; i++) {
    const prev = periods[index[i] - 1];
    if (!prev) continue;
    high[i] = prev.high;
    low[i] = prev.low;
    close[i] = prev.close;
  }
  return { high, low, close };
}

// ---------- definitions ----------

const TYPES: PivotType[] = ["traditional", "fibonacci", "woodie", "classic", "demark", "camarilla"];
const TYPE_INPUT: IndicatorInputDef = {
  key: "type",
  label: "Type",
  type: "int",
  default: 0,
  min: 0,
  max: TYPES.length - 1,
  options: ["Traditional", "Fibonacci", "Woodie", "Classic", "DeMark", "Camarilla"].map((label, value) => ({ value, label })),
};
const PERIODS: (PivotPeriod | "auto")[] = ["auto", "day", "week", "month", "year"];
const periodInput = (def: number): IndicatorInputDef => ({
  key: "period",
  label: "Period",
  type: "int",
  default: def,
  min: 0,
  max: PERIODS.length - 1,
  options: ["Auto", "Day", "Week", "Month", "Year"].map((label, value) => ({ value, label })),
});
const PIVOT_PERIOD = periodInput(0);
const PREV_PERIOD = periodInput(1);

function readPeriod(bars: Bar[], inputs: Record<string, unknown>, def: IndicatorInputDef): PivotPeriod {
  const p = PERIODS[intInput(inputs as never, def)];
  return p === "auto" ? autoPeriod(bars) : p;
}

export const PIVOTS_DEF: IndicatorDef = {
  id: "pivots",
  name: "Pivot Points Standard",
  shortName: "Pivots",
  pane: "overlay",
  inputs: [TYPE_INPUT, PIVOT_PERIOD],
  outputs: PIVOT_LEVELS.map((key) => ({ key, label: key.toUpperCase(), style: "steps" as const })),
  compute: (bars, inputs) => pivotPoints(bars, TYPES[intInput(inputs, TYPE_INPUT)], readPeriod(bars, inputs, PIVOT_PERIOD)),
};

export const PREV_HL_DEF: IndicatorDef = {
  id: "prevhl",
  name: "Previous Period High / Low",
  shortName: "Prev H/L",
  pane: "overlay",
  inputs: [PREV_PERIOD],
  outputs: [
    { key: "high", label: "Previous high", style: "steps" },
    { key: "low", label: "Previous low", style: "steps" },
    { key: "close", label: "Previous close", style: "steps" },
  ],
  compute: (bars, inputs) => previousPeriod(bars, readPeriod(bars, inputs, PREV_PERIOD)),
};
