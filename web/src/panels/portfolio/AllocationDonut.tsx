// Allocation donut (SVG) of market value by holding, plus cash; colors are theme tokens.

import { formatNumber } from "../../chart/format";
import { seriesColor } from "../common/palette";

export interface Slice {
  label: string;
  value: number;
}

/** Positive slices with their share; small ones (< 2%) merged into "Other". */
export function allocationSlices(items: Slice[]): (Slice & { share: number })[] {
  const pos = items.filter((s) => s.value > 0);
  const total = pos.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return [];
  const big = pos.filter((s) => s.value / total >= 0.02).sort((a, b) => b.value - a.value);
  const other = pos.filter((s) => s.value / total < 0.02).reduce((a, s) => a + s.value, 0);
  const out = other > 0 ? [...big, { label: "Other", value: other }] : big;
  return out.map((s) => ({ ...s, share: s.value / total }));
}

const R = 42;
const STROKE = 16;
const C = 2 * Math.PI * R;

export function AllocationDonut({ items, currency }: { items: Slice[]; currency: string }) {
  const slices = allocationSlices(items);
  if (slices.length === 0) return <div className="pf-donut-empty muted">No allocation yet.</div>;
  let offset = 0;
  return (
    <div className="pf-donut">
      <svg viewBox="0 0 120 120" width={120} height={120} role="img" aria-label="Allocation">
        <circle cx={60} cy={60} r={R} fill="none" style={{ stroke: "var(--border)" }} strokeWidth={STROKE} />
        {slices.map((s, i) => {
          const len = s.share * C;
          const el = (
            <circle
              key={s.label}
              cx={60}
              cy={60}
              r={R}
              fill="none"
              style={{ stroke: seriesColor(i) }}
              strokeWidth={STROKE}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
            >
              <title>{`${s.label}: ${(s.share * 100).toFixed(1)}%`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      </svg>
      <ul className="pf-legend">
        {slices.map((s, i) => (
          <li key={s.label}>
            <span className="pf-swatch" style={{ background: seriesColor(i) }} />
            <span className="pf-legend-label">{s.label}</span>
            <span className="num">{(s.share * 100).toFixed(1)}%</span>
            <span className="num muted">
              {formatNumber(s.value, 0)} {currency}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
