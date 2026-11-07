// Go to date: the date and time typed in the dialog are wall-clock time in the chart's time zone.

import { offsetAt, toZone } from "./timeZone";

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC seconds of a wall-clock date ("YYYY-MM-DD") and time ("HH:MM", empty = 00:00) in `zone`; null if invalid. */
export function wallToUtc(date: string, time: string, zone: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const t = time.trim() ? /^(\d{1,2}):(\d{2})$/.exec(time.trim()) : ["", "0", "0"];
  if (!d || !t) return null;
  const [y, m, day, h, min] = [+d[1], +d[2], +d[3], +t[1], +t[2]];
  if (m < 1 || m > 12 || day < 1 || day > 31 || h > 23 || min > 59) return null;
  const ms = Date.UTC(y, m - 1, day, h, min);
  const check = new Date(ms);
  if (check.getUTCDate() !== day || check.getUTCMonth() !== m - 1) return null;
  const wall = ms / 1000;
  // The zone's offset at the wall time itself can differ from the offset at the instant (around a
  // clock change): one correction step settles it.
  let utc = wall - offsetAt(zone, wall);
  utc = wall - offsetAt(zone, utc);
  return utc;
}

/** Date and time fields showing `utcSec` in `zone`. */
export function utcToFields(utcSec: number, zone: string): { date: string; time: string } {
  const w = new Date(toZone(utcSec, zone) * 1000);
  return {
    date: `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`,
    time: `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`,
  };
}
