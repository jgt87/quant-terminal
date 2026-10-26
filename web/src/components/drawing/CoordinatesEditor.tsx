// Coordinates tab: date-time (UTC) and/or price per anchor; path tools list their points.

import type { Anchor, Drawing } from "@qt/core";
import { NumberField } from "../NumberField";

const toInput = (t: number) => new Date(t * 1000).toISOString().slice(0, 16);
const fromInput = (v: string) => {
  const ms = Date.parse(`${v}:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 1000) : null;
};

interface Props {
  drawing: Drawing;
  mode: "time-price" | "price" | "time";
  onChange(d: Drawing): void;
}

export function CoordinatesEditor({ drawing: d, mode, onChange }: Props) {
  const rows: { key: "anchors" | "points"; i: number; a: Anchor }[] = [
    ...d.anchors.map((a, i) => ({ key: "anchors" as const, i, a })),
    ...(d.points ?? []).map((a, i) => ({ key: "points" as const, i, a })),
  ];
  const set = (key: "anchors" | "points", i: number, patch: Partial<Anchor>) =>
    onChange({ ...d, [key]: (d[key] ?? []).map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  return (
    <>
      {mode !== "price" && <p className="muted settings-hint">Times are UTC.</p>}
      {rows.map(({ key, i, a }, n) => (
        <div key={n} className="anchor-line">
          <span>Point {n + 1}</span>
          {mode !== "price" && (
            <input
              type="datetime-local"
              aria-label={`Point ${n + 1} time`}
              value={toInput(a.time)}
              onChange={(e) => {
                const t = fromInput(e.target.value);
                if (t != null) set(key, i, { time: t });
              }}
            />
          )}
          {mode !== "time" && <NumberField value={Number(a.price.toPrecision(10))} title={`Point ${n + 1} price`} onChange={(price) => set(key, i, { price })} />}
        </div>
      ))}
    </>
  );
}
