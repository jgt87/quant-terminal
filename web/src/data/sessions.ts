// Session-aligned buckets for intraday custom intervals. Exchange-traded symbols bucket from the
// session open in the exchange time zone (US 2h: 09:30, 11:30, 13:30, 15:30 New York time, so
// 13:30 UTC in summer and 14:30 UTC in winter); 24h markets keep UTC alignment. Pure.

import { resampleBars, type Bar, type SymbolInfo } from "@qt/core";

/** How buckets are anchored: UTC grid, the session open in a time zone, or the first bar after a gap. */
export type BucketAnchor =
  | { kind: "utc" }
  | { kind: "session"; timezone: string; openMin: number }
  | { kind: "gap"; gapSec: number };

export const UTC_ANCHOR: BucketAnchor = { kind: "utc" };

const SESSION_TYPES = new Set(["stock", "index", "etf", "future"]);

/** "0930-1600" → minutes after local midnight of the open and the close; null when malformed. */
export function parseSession(s: string | undefined): { open: number; close: number } | null {
  const m = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const open = Number(m[1]) * 60 + Number(m[2]);
  const close = Number(m[3]) * 60 + Number(m[4]);
  if (open >= 1440 || close > 1440) return null;
  return { open, close };
}

/** Valid IANA zone name for Intl. */
export function isTimeZone(tz: string | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Anchor for a custom interval of `toSec` built from `fromSec` bars of a symbol. Only intraday
 * targets of exchange-traded instruments are session-aligned; anything 24h stays on UTC.
 */
export function bucketAnchorFor(info: SymbolInfo | null | undefined, fromSec: number, toSec: number): BucketAnchor {
  if (!info || toSec >= 86400 || toSec <= fromSec || !SESSION_TYPES.has(info.type)) return UTC_ANCHOR;
  const sess = parseSession(info.session);
  if (sess && isTimeZone(info.timezone)) {
    const len = (sess.close - sess.open + 1440) % 1440;
    // A session of (nearly) a whole day is a 24h market.
    if (len > 0 && len < 1380) return { kind: "session", timezone: info.timezone, openMin: sess.open };
    return UTC_ANCHOR;
  }
  // No session from the provider (MT5 CFDs): a new session starts after a break in the bars.
  if (info.provider === "mt5") return { kind: "gap", gapSec: Math.max(2 * fromSec, 3600) };
  return UTC_ANCHOR;
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** UTC offset (seconds, local minus UTC) of a time zone at a UTC instant. */
export function zoneOffset(tz: string, utcSec: number): number {
  let f = offsetFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    offsetFormatters.set(tz, f);
  }
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(utcSec * 1000))) if (part.type !== "literal") p[part.type] = Number(part.value);
  const local = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) / 1000;
  return local - Math.floor(utcSec);
}

/** UTC time of `minutes` after local midnight of local day `day` (days since 1970-01-01 local). */
export function localToUtc(tz: string, day: number, minutes: number): number {
  const wall = day * 86400 + minutes * 60;
  // Two passes settle the offset on either side of a DST change.
  let utc = wall - zoneOffset(tz, wall);
  utc = wall - zoneOffset(tz, utc);
  return utc;
}

/** Bucket start function for a session anchor (memoized per local day). */
function sessionBucketer(tz: string, openMin: number, toSec: number): (t: number) => number {
  const opens = new Map<number, number>();
  let lastHour = NaN;
  let lastOff = 0;
  return (t: number) => {
    const hour = Math.floor(t / 3600);
    if (hour !== lastHour) {
      lastHour = hour;
      lastOff = zoneOffset(tz, t);
    }
    const day = Math.floor((t + lastOff) / 86400);
    let open = opens.get(day);
    if (open === undefined) {
      open = localToUtc(tz, day, openMin);
      opens.set(day, open);
    }
    return open + Math.floor((t - open) / toSec) * toSec;
  };
}

/** Aggregates bars into `toSec` buckets per the anchor (same OHLCV rules as resampleBars). */
export function resampleAnchored(bars: Bar[], fromSec: number, toSec: number, anchor: BucketAnchor = UTC_ANCHOR): Bar[] {
  if (anchor.kind === "utc" || toSec <= fromSec) return resampleBars(bars, fromSec, toSec);
  let bucketOf: (t: number, prev: number | null) => number;
  if (anchor.kind === "session") {
    const f = sessionBucketer(anchor.timezone, anchor.openMin, toSec);
    bucketOf = (t) => f(t);
  } else {
    let start = NaN;
    bucketOf = (t, prev) => {
      if (prev === null || t - prev >= anchor.gapSec || !(t >= start)) start = t;
      return start + Math.floor((t - start) / toSec) * toSec;
    };
  }
  const out: Bar[] = [];
  let key = NaN;
  let prev: number | null = null;
  for (const b of bars) {
    const start = bucketOf(b.time, prev);
    prev = b.time;
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
