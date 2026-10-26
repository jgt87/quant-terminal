// Visibility of drawings / indicators per interval group (seconds, minutes, hours, days, weeks,
// months), optionally limited to a multiplier range inside a group (e.g. minutes 5..30).

import type { Interval, IntervalGroup, IntervalRange, IntervalVisibility, VisibilityGroup } from "./types";

export const INTERVAL_GROUPS: readonly IntervalGroup[] = ["minutes", "hours", "days", "weeks", "months"];

/** Groups of the drawing visibility tab, smallest first. */
export const VISIBILITY_GROUPS: readonly VisibilityGroup[] = ["seconds", "minutes", "hours", "days", "weeks", "months"];

/** Largest multiplier offered per group (the range editors clamp to 1..max). */
export const VISIBILITY_MAX: Record<VisibilityGroup, number> = { seconds: 59, minutes: 59, hours: 24, days: 366, weeks: 52, months: 12 };

/** An interval as group + multiplier, e.g. 15m = minutes × 15, 4h = hours × 4. */
export interface IntervalUnit {
  group: VisibilityGroup;
  n: number;
}

export function intervalGroup(interval: Interval): IntervalGroup {
  if (interval.endsWith("m")) return "minutes";
  if (interval.endsWith("h")) return "hours";
  if (interval === "1D") return "days";
  if (interval === "1W") return "weeks";
  return "months";
}

/** Group and multiplier of an interval length in seconds (custom intervals included). */
export function intervalUnit(seconds: number): IntervalUnit {
  const s = Math.max(1, Math.round(seconds));
  if (s % 2592000 === 0) return { group: "months", n: s / 2592000 };
  if (s % 604800 === 0) return { group: "weeks", n: s / 604800 };
  if (s % 86400 === 0) return { group: "days", n: s / 86400 };
  if (s % 3600 === 0) return { group: "hours", n: s / 3600 };
  if (s % 60 === 0) return { group: "minutes", n: s / 60 };
  return { group: "seconds", n: s };
}

/** Group and multiplier of a built-in interval ("15m" → minutes × 15, "1W" → weeks × 1). */
export function unitOfInterval(interval: Interval): IntervalUnit {
  const n = parseInt(interval, 10) || 1;
  return { group: intervalGroup(interval), n };
}

const isRange = (v: unknown): v is IntervalRange => typeof v === "object" && v !== null && "min" in v && "max" in v;

/** True unless the unit's group is switched off or the multiplier lies outside its range. */
export function visibleAt(vis: IntervalVisibility | undefined, unit: IntervalUnit): boolean {
  const v = vis?.[unit.group];
  if (v === undefined || v === true) return true;
  if (v === false) return false;
  if (isRange(v)) return unit.n >= v.min && unit.n <= v.max;
  return true;
}

/** True unless the group of `interval` is explicitly switched off (or outside its range). */
export function visibleOnInterval(vis: IntervalVisibility | undefined, interval: Interval): boolean {
  return visibleAt(vis, unitOfInterval(interval));
}

export type VisibilityPreset = "above" | "below" | "only" | "all";

/**
 * Menu presets relative to the current interval: "current interval and above", "… and below",
 * "only current interval", "all intervals" (undefined = no restriction).
 */
export function visibilityPreset(preset: VisibilityPreset, unit: IntervalUnit): IntervalVisibility | undefined {
  if (preset === "all") return undefined;
  const k = VISIBILITY_GROUPS.indexOf(unit.group);
  const out: IntervalVisibility = {};
  VISIBILITY_GROUPS.forEach((g, i) => {
    const max = VISIBILITY_MAX[g];
    if (i === k) {
      if (preset === "only") out[g] = { min: unit.n, max: unit.n };
      else if (preset === "above" && unit.n > 1) out[g] = { min: unit.n, max };
      else if (preset === "below" && unit.n < max) out[g] = { min: 1, max: unit.n };
    } else if (preset === "only" || (preset === "above" && i < k) || (preset === "below" && i > k)) {
      out[g] = false;
    }
  });
  return out;
}

const normVis = (v: IntervalVisibility | undefined) =>
  JSON.stringify(
    Object.entries(v ?? {})
      .filter(([, x]) => x !== true && x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );

/** Which preset (if any) a visibility value equals for the given unit (menu check marks). */
export function matchingPreset(vis: IntervalVisibility | undefined, unit: IntervalUnit): VisibilityPreset | null {
  const cur = normVis(vis);
  for (const p of ["all", "only", "above", "below"] as const) if (normVis(visibilityPreset(p, unit)) === cur) return p;
  return null;
}
