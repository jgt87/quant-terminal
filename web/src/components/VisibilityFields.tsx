// "Visibility" tab: one checkbox per interval group (minutes / hours / days / weeks / months).

import type { IntervalGroup, IntervalVisibility } from "@qt/core";
import groups from "../config/intervalGroups.json";

interface Props {
  value: IntervalVisibility | undefined;
  onChange(v: IntervalVisibility | undefined): void;
}

export function VisibilityFields({ value, onChange }: Props) {
  const set = (g: IntervalGroup, on: boolean) => {
    const next: IntervalVisibility = { ...(value ?? {}), [g]: on };
    if (on) delete next[g];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div className="form-grid">
      <p className="muted settings-hint">Show on these chart intervals:</p>
      {groups.map((g) => (
        <label key={g.id} className="form-row">
          <span>{g.label}</span>
          <input
            type="checkbox"
            checked={value?.[g.id as IntervalGroup] !== false}
            onChange={(e) => set(g.id as IntervalGroup, e.target.checked)}
          />
        </label>
      ))}
    </div>
  );
}
