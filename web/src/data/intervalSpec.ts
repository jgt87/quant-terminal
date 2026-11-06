// Custom intervals ("2h", "3D", "45m", ...): parsing, the provider interval they are fetched in,
// and how many provider bars one page needs. Pure.

import { INTERVAL_SECONDS, type Interval } from "@qt/core";

/** Provider intervals bars can be fetched in (calendar months cannot be resampled evenly). */
export const PROVIDER_INTERVALS: Interval[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W"];

const UNIT_SECONDS: Record<string, number> = { m: 60, h: 3600, D: 86400, W: 604800 };
const MAX_SECONDS = 52 * 604800;

export interface IntervalSpec {
  /** Canonical text, e.g. "2h", "3D", "45m". */
  text: string;
  seconds: number;
}

/**
 * Parses "2h", "45m", "3D"/"3d", "2W"/"2w" (also "120" = minutes). Returns null for anything
 * else, including months and zero/huge values.
 */
export function parseIntervalSpec(raw: string): IntervalSpec | null {
  const s = raw.trim();
  const m = /^(\d{1,4})\s*([mhdwHDW]?)$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  let unit = m[2] || "m";
  if (unit === "d") unit = "D";
  if (unit === "w") unit = "W";
  if (unit === "H") unit = "h";
  const sec = n * UNIT_SECONDS[unit];
  if (!(n > 0) || !(sec >= 60) || sec > MAX_SECONDS) return null;
  return { text: `${n}${unit}`, seconds: sec };
}

/**
 * The provider interval a custom interval is built from: the coarsest provider interval that
 * divides it evenly (fewest bars to fetch; e.g. 2h/3h/6h → 1h, 12h → 4h, 2D/3D → 1D, 45m → 15m).
 */
export function providerIntervalFor(spec: IntervalSpec): Interval | null {
  let best: Interval | null = null;
  for (const iv of PROVIDER_INTERVALS) {
    const sec = INTERVAL_SECONDS[iv];
    if (sec <= spec.seconds && spec.seconds % sec === 0) best = iv;
  }
  return best;
}

/** The custom spec is exactly one provider interval (no resampling needed). */
export function isNativeInterval(spec: IntervalSpec): Interval | null {
  for (const iv of PROVIDER_INTERVALS) if (INTERVAL_SECONDS[iv] === spec.seconds) return iv;
  return null;
}

/** Provider bars per page so one page yields about `pageSize` custom bars (server max 5000). */
export function providerPageLimit(spec: IntervalSpec, provider: Interval, pageSize: number, max = 5000): number {
  const ratio = spec.seconds / INTERVAL_SECONDS[provider];
  return Math.max(1, Math.min(max, Math.round(pageSize * ratio)));
}

/** Interval text shown to the user for a layout (custom when set). */
export function displayInterval(interval: string, customInterval?: string): string {
  return customInterval || interval;
}

/** Seconds of a layout's effective interval. */
export function effectiveSeconds(interval: Interval, customInterval?: string): number {
  const spec = customInterval ? parseIntervalSpec(customInterval) : null;
  return spec?.seconds ?? INTERVAL_SECONDS[interval];
}

/** Layout fields for a picked interval text: a native interval clears the custom one. */
export function intervalFields(text: string): { interval: Interval; customInterval: string | undefined } | null {
  const spec = parseIntervalSpec(text);
  if (!spec) return null;
  const native = isNativeInterval(spec);
  if (native) return { interval: native, customInterval: undefined };
  const provider = providerIntervalFor(spec);
  return provider ? { interval: provider, customInterval: spec.text } : null;
}
