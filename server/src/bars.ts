import type { Bar, Interval } from "@qt/core";

/** Server-side copy of the interval list (core values are not imported statically). */
export const INTERVAL_LIST: readonly Interval[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W", "1M"];

export const INTERVAL_SEC: Record<Interval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
  "1D": 86400,
  "1W": 604800,
  "1M": 2592000,
};

export const isIntraday = (i: Interval) => INTERVAL_SEC[i] < 86400;

const ALIASES: Record<string, Interval> = {
  "1": "1m", "5": "5m", "15": "15m", "30": "30m", "60": "1h", "240": "4h",
  "60m": "1h", "1H": "1h", "4H": "4h", "240m": "4h",
  "1d": "1D", "D": "1D", "d": "1D", "1w": "1W", "W": "1W", "w": "1W", "1wk": "1W",
  "M": "1M", "1mo": "1M", "1mth": "1M",
};

/** Parse an interval parameter; exact (case-sensitive) names first, then a few aliases. */
export function parseInterval(raw: string | null | undefined): Interval | undefined {
  if (!raw) return undefined;
  if ((INTERVAL_LIST as readonly string[]).includes(raw)) return raw as Interval;
  return ALIASES[raw];
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Sort by time, drop invalid rows (null/NaN prices, non-positive times), dedupe (last
 * occurrence of a timestamp wins) and clamp high/low so high >= max(o,c) and low <= min(o,c).
 */
export function validateBars(input: readonly Partial<Bar>[]): Bar[] {
  const byTime = new Map<number, Bar>();
  for (const b of input) {
    if (!b || !finite(b.time) || b.time <= 0) continue;
    if (!finite(b.open) || !finite(b.high) || !finite(b.low) || !finite(b.close)) continue;
    const time = Math.floor(b.time);
    const volume = finite(b.volume) && b.volume >= 0 ? b.volume : 0;
    const high = Math.max(b.high, b.open, b.close, b.low);
    const low = Math.min(b.low, b.open, b.close, b.high);
    byTime.set(time, { time, open: b.open, high, low, close: b.close, volume });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/**
 * Merge bars whose time is less than `step` after the previous bar into that bar
 * (Yahoo appends a short closing-tick stub such as 20:00 after the 19:30 hourly bar, and
 * sometimes stamps the running week/month with the last trade time).
 */
export function mergeStubs(bars: Bar[], step: number): Bar[] {
  const out: Bar[] = [];
  for (const b of bars) {
    const prev = out[out.length - 1];
    if (prev && b.time - prev.time < step) {
      prev.high = Math.max(prev.high, b.high);
      prev.low = Math.min(prev.low, b.low);
      prev.close = b.close;
      prev.volume += b.volume;
    } else {
      out.push({ ...b });
    }
  }
  return out;
}

/**
 * Aggregate sorted bars into buckets of `seconds`. Buckets are anchored to the first bar of
 * each local day (local = UTC + gmtOffset), so a session starting at 09:30 gives 09:30, 13:30, ...
 * With anchor "utc", buckets are plain multiples of `seconds` since the epoch.
 */
export function aggregateBars(bars: readonly Bar[], seconds: number, anchor: "utc" | "session" = "session", gmtOffset = 0): Bar[] {
  const out: Bar[] = [];
  let dayKey = NaN;
  let dayStart = 0;
  for (const b of bars) {
    let bucket: number;
    if (anchor === "utc") {
      bucket = Math.floor(b.time / seconds) * seconds;
    } else {
      const key = Math.floor((b.time + gmtOffset) / 86400);
      if (key !== dayKey) {
        dayKey = key;
        dayStart = b.time;
      }
      bucket = dayStart + Math.floor((b.time - dayStart) / seconds) * seconds;
    }
    const cur = out[out.length - 1];
    if (cur && cur.time === bucket) {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    } else {
      out.push({ ...b, time: bucket });
    }
  }
  return out;
}

/** Bars strictly before `to` (if given), keeping only the newest `limit`. */
export function sliceBefore(bars: readonly Bar[], to: number | undefined, limit: number): Bar[] {
  const before = to === undefined ? bars : bars.filter((b) => b.time < to);
  return before.slice(Math.max(0, before.length - limit));
}
