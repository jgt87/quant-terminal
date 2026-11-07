// Chart time zone: the setting ("UTC", "local", "exchange" or an IANA zone name), its resolved
// IANA zone for a symbol, cached UTC offsets (Intl is slow per call; offsets are cached per hour)
// and the short label shown in the axis corner.

import { isTimeZone, zoneOffset } from "../data/sessions";
import zones from "../config/timeZones.json";

export type TimeZoneSetting = string;

export interface ZoneChoice {
  id: string;
  label: string;
}

/** The choices offered in menus: UTC, local, exchange, then named zones. */
export const ZONE_CHOICES: ZoneChoice[] = zones as ZoneChoice[];

/** The browser's own zone. */
export function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** IANA zone for a setting; "exchange" uses the symbol's zone (UTC when it has none). */
export function resolveZone(setting: TimeZoneSetting | undefined, exchangeZone?: string): string {
  if (!setting || setting === "UTC") return "UTC";
  if (setting === "local") return localZone();
  if (setting === "exchange") return isTimeZone(exchangeZone) ? exchangeZone : "UTC";
  return isTimeZone(setting) ? setting : "UTC";
}

const cache = new Map<string, Map<number, number>>();

/** Offset (seconds, zone minus UTC) at a UTC instant, cached per zone and hour. */
export function offsetAt(zone: string, utcSec: number): number {
  if (zone === "UTC") return 0;
  let m = cache.get(zone);
  if (!m) cache.set(zone, (m = new Map()));
  const hour = Math.floor(utcSec / 3600);
  let off = m.get(hour);
  if (off === undefined) {
    // Offsets change on whole or half hours: the hour's start and end agree except across a change.
    const a = zoneOffset(zone, hour * 3600);
    const b = zoneOffset(zone, hour * 3600 + 3599);
    if (a !== b) return zoneOffset(zone, utcSec);
    off = a;
    if (m.size > 100_000) m.clear();
    m.set(hour, off);
  }
  return off;
}

/** Wall-clock time of `utcSec` in `zone`, as seconds read with UTC getters. */
export const toZone = (utcSec: number, zone: string): number => utcSec + offsetAt(zone, utcSec);

/** Short label: "UTC", "UTC+1", "UTC−4:30". */
export function zoneLabel(zone: string, atSec: number): string {
  if (zone === "UTC") return "UTC";
  const off = offsetAt(zone, atSec);
  if (off === 0) return "UTC";
  const sign = off > 0 ? "+" : "−";
  const a = Math.abs(off);
  const h = Math.floor(a / 3600);
  const m = Math.round((a % 3600) / 60);
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}
