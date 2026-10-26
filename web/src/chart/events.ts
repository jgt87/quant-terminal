// Corporate event markers (dividends, splits, earnings) on the time axis: each event goes to
// the bar that contains its time (bars cover [time, next bar's time)); an event in a gap
// (weekend, overnight) goes to the next bar. Several events on one bar share a marker. Pure.

import type { CorporateEvent } from "@qt/core";

export interface EventMarker {
  index: number;
  /** "D", "S", "E" or a combination such as "DS". */
  label: string;
  kinds: CorporateEvent["kind"][];
  events: CorporateEvent[];
}

const LETTER: Record<CorporateEvent["kind"], string> = { dividend: "D", split: "S", earnings: "E" };
const ORDER: CorporateEvent["kind"][] = ["dividend", "split", "earnings"];

/** Bar index for an event time, or -1 when it lies outside the series. */
export function eventIndex(times: readonly number[], intervalSec: number, t: number): number {
  const n = times.length;
  if (n === 0 || t < times[0] || t >= times[n - 1] + intervalSec) return -1;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  // Inside bar lo when t < its end; otherwise in the gap after it → the next bar.
  const end = Math.min(times[lo] + intervalSec, lo + 1 < n ? times[lo + 1] : Infinity);
  if (t < end) return lo;
  return lo + 1 < n ? lo + 1 : -1;
}

export function placeEventMarkers(events: readonly CorporateEvent[], times: readonly number[], intervalSec: number): EventMarker[] {
  const by = new Map<number, CorporateEvent[]>();
  for (const ev of events) {
    const i = eventIndex(times, intervalSec, ev.time);
    if (i < 0) continue;
    const list = by.get(i) ?? [];
    list.push(ev);
    by.set(i, list);
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, evs]) => {
      const kinds = ORDER.filter((k) => evs.some((e) => e.kind === k));
      return { index, label: kinds.map((k) => LETTER[k]).join(""), kinds, events: evs };
    });
}

/** Tooltip lines for a marker, e.g. "Dividend 0.24 · 2024-05-10". */
export function eventText(ev: CorporateEvent): string {
  const date = new Date(ev.time * 1000).toISOString().slice(0, 10);
  if (ev.kind === "dividend") return `Dividend ${typeof ev.value === "number" ? Number(ev.value.toPrecision(6)) : ev.value} · ${date}`;
  if (ev.kind === "split") return `Split ${ev.value} · ${date}`;
  return `Earnings · ${date}`;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Extended-hours test for US-listed instruments: outside 09:30–16:00 New York time on the bar's
 * open (regular trading hours). `tz` can name another exchange time zone.
 */
export function isExtendedHours(time: number, tz = "America/New_York", open = 570, close = 960): boolean {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    formatters.set(tz, f);
  }
  const parts = f.formatToParts(new Date(time * 1000));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const mins = h * 60 + m;
  return mins < open || mins >= close;
}
