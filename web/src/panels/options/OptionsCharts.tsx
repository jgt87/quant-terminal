// Small SVG charts of the options panel: the volatility smile (IV by strike, strike axis) and
// the term structure (at-the-money IV by expiry, maturity axis).

import { linear, niceTicks, shortNumber } from "./optionsModel";

const W = 300;
const H = 130;
const PAD = { l: 34, r: 8, t: 8, b: 22 };

interface Point {
  x: number;
  y: number;
}

function LineChart({ points, xTicks, xLabel, yLabel, marker, title }: { points: Point[]; xTicks: { v: number; text: string }[]; xLabel: (v: number) => string; yLabel: string; marker?: number | null; title: string }) {
  if (points.length < 2) {
    return (
      <figure className="opt-chart">
        <figcaption>{title}</figcaption>
        <div className="opt-chart-empty">—</div>
      </figure>
    );
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const yPad = (Math.max(...ys) - Math.min(...ys)) * 0.1 || 0.01;
  const y0 = Math.max(0, Math.min(...ys) - yPad);
  const y1 = Math.max(...ys) + yPad;
  const sx = linear(x0, x1, PAD.l, W - PAD.r);
  const sy = linear(y0, y1, H - PAD.b, PAD.t);
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join("");
  return (
    <figure className="opt-chart">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {niceTicks(y0, y1, 4).map((v) => (
          <g key={`y${v}`}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} />
            <text className="tick" x={PAD.l - 4} y={sy(v)} textAnchor="end" dominantBaseline="central">
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}
        {xTicks
          .filter((t) => t.v >= x0 && t.v <= x1)
          .map((t) => (
            <text key={`x${t.v}`} className="tick" x={sx(t.v)} y={H - 6} textAnchor="middle">
              {t.text}
            </text>
          ))}
        {marker != null && marker >= x0 && marker <= x1 && <line className="marker" x1={sx(marker)} x2={sx(marker)} y1={PAD.t} y2={H - PAD.b} />}
        <path className="line" d={d} />
        {points.map((p) => (
          <circle key={p.x} className="dot" cx={sx(p.x)} cy={sy(p.y)} r={2}>
            <title>{`${xLabel(p.x)}: ${(p.y * 100).toFixed(1)} % ${yLabel}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}

export function SmileChart({ points, index, title }: { points: { strike: number; iv: number }[]; index: number | null; title: string }) {
  const p = points.map((q) => ({ x: q.strike, y: q.iv }));
  const xs = p.map((q) => q.x);
  const ticks = xs.length ? niceTicks(Math.min(...xs), Math.max(...xs), 4).map((v) => ({ v, text: shortNumber(v) })) : [];
  return <LineChart points={p} xTicks={ticks} xLabel={(v) => `Strike ${shortNumber(v)}`} yLabel="IV" marker={index} title={title} />;
}

export function TermChart({ points, now, title }: { points: { time: number; iv: number }[]; now: number; title: string }) {
  // Maturity axis in days to expiry.
  const p = points.map((q) => ({ x: Math.max(0, (q.time - now) / 86_400_000), y: q.iv }));
  const xs = p.map((q) => q.x);
  const ticks = xs.length ? niceTicks(Math.min(...xs), Math.max(...xs), 4).map((v) => ({ v, text: `${Math.round(v)}d` })) : [];
  return <LineChart points={p} xTicks={ticks} xLabel={(v) => `${Math.round(v)} days`} yLabel="ATM IV" title={title} />;
}
