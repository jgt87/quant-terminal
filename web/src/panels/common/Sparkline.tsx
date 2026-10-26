// Minimal SVG line chart (equity curves, script output previews). Colors are CSS values
// (theme tokens) passed by the caller.

export function valueRange(list: readonly (readonly (number | null)[])[]): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const values of list)
    for (const v of values) {
      if (v === null || !Number.isFinite(v)) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  return { lo, hi };
}

/** SVG path of `values` scaled into w x h (shared `range` lets several lines use one scale). */
export function sparkPath(values: readonly (number | null)[], w: number, h: number, range = valueRange([values]), pad = 2): string {
  if (values.filter((v) => v !== null && Number.isFinite(v)).length < 2) return "";
  const { lo, hi } = range;
  const span = hi - lo || 1;
  const n = Math.max(1, values.length - 1);
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    const x = (i / n) * (w - 2 * pad) + pad;
    const y = h - pad - ((v - lo) / span) * (h - 2 * pad);
    d += `${pen ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    pen = true;
  });
  return d;
}

interface Props {
  series: { values: readonly (number | null)[]; color: string }[];
  width?: number;
  height?: number;
  label: string;
  /** One scale for all series (default) or one per series. */
  shared?: boolean;
}

export function Sparkline({ series, width = 300, height = 60, label, shared = true }: Props) {
  const range = shared ? valueRange(series.map((s) => s.values)) : undefined;
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height={height} role="img" aria-label={label}>
      {series.map((s, i) => (
        <path key={i} d={sparkPath(s.values, width, height, range ?? valueRange([s.values]))} fill="none" style={{ stroke: s.color }} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
