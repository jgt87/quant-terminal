// Visibility tab of the drawing settings: one row per interval group (seconds … months) with a
// checkbox and a min–max multiplier range.

import { VISIBILITY_GROUPS, VISIBILITY_MAX, type IntervalRange, type IntervalVisibility, type VisibilityGroup } from "@qt/core";
import { NumberField } from "../NumberField";

const LABELS: Record<VisibilityGroup, string> = { seconds: "Seconds", minutes: "Minutes", hours: "Hours", days: "Days", weeks: "Weeks", months: "Months" };

interface Props {
  value: IntervalVisibility | undefined;
  onChange(v: IntervalVisibility | undefined): void;
}

export function VisibilityRanges({ value, onChange }: Props) {
  const put = (g: VisibilityGroup, v: boolean | IntervalRange) => {
    const next: IntervalVisibility = { ...(value ?? {}), [g]: v };
    const max = VISIBILITY_MAX[g];
    if (v === true || (typeof v === "object" && v.min <= 1 && v.max >= max)) delete next[g];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div className="vis-ranges" role="table" aria-label="Visibility on intervals">
      {VISIBILITY_GROUPS.map((g) => {
        const v = value?.[g];
        const on = v !== false;
        const range = typeof v === "object" ? v : { min: 1, max: VISIBILITY_MAX[g] };
        return (
          <div key={g} className="vis-row" role="row" data-group={g}>
            <label className="vis-check">
              <input type="checkbox" checked={on} onChange={(e) => put(g, e.target.checked)} />
              <span>{LABELS[g]}</span>
            </label>
            <NumberField
              value={range.min}
              integer
              min={1}
              max={VISIBILITY_MAX[g]}
              disabled={!on}
              title={`${LABELS[g]} from`}
              onChange={(min) => put(g, { min, max: Math.max(min, range.max) })}
            />
            <span className="vis-dash">–</span>
            <NumberField
              value={range.max}
              integer
              min={1}
              max={VISIBILITY_MAX[g]}
              disabled={!on}
              title={`${LABELS[g]} to`}
              onChange={(max) => put(g, { min: Math.min(range.min, max), max })}
            />
          </div>
        );
      })}
    </div>
  );
}
