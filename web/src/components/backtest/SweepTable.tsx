// Two-parameter grid sweep. Cells are shaded by brightness (better = lighter).

import { useEffect, useState } from "react";
import type { BacktestMetrics, StrategyDef } from "@qt/core";
import { rangeValues } from "../../backtest/config";
import metrics from "../../config/metrics.json";
import { NumberField } from "../NumberField";
import { formatMetric } from "./MetricsGrid";

export interface SweepSpec {
  x: { key: string; values: number[] };
  y: { key: string; values: number[] };
  metric: keyof BacktestMetrics;
}

export interface SweepCell {
  x: number;
  /** null for single-parameter sweeps. */
  y: number | null;
  value: number;
}

interface Props {
  strategy: StrategyDef;
  running: boolean;
  result: { spec: SweepSpec; cells: SweepCell[] } | null;
  onRun(spec: SweepSpec): void;
  onPick(params: Record<string, number>): void;
}

interface Axis {
  key: string;
  from: number;
  to: number;
  step: number;
}

function defaultAxis(strategy: StrategyDef, idx: number): Axis {
  const p = strategy.params[idx] ?? strategy.params[0];
  if (!p) return { key: "", from: 0, to: 0, step: 1 };
  const step = p.step ?? (p.type === "int" ? Math.max(1, Math.round(p.default / 4)) : p.default / 4 || 0.5);
  return { key: p.key, from: Math.max(p.min ?? -Infinity, p.default - 2 * step), to: p.default + 2 * step, step };
}

export function SweepTable({ strategy, running, result, onRun, onPick }: Props) {
  const [x, setX] = useState<Axis>(() => defaultAxis(strategy, 0));
  const [y, setY] = useState<Axis>(() => defaultAxis(strategy, 1));
  const [metric, setMetric] = useState<keyof BacktestMetrics>("sharpe");

  useEffect(() => {
    setX(defaultAxis(strategy, 0));
    setY(defaultAxis(strategy, 1));
  }, [strategy]);

  if (strategy.params.length < 1) return <p className="muted bt-empty">This strategy has no parameters to sweep.</p>;
  const xs = rangeValues(x.from, x.to, x.step, 12);
  const ys = strategy.params.length > 1 ? rangeValues(y.from, y.to, y.step, 12) : [];

  const axisEditor = (label: string, a: Axis, set: (a: Axis) => void) => (
    <div className="sweep-axis">
      <span className="sweep-label">{label}</span>
      <select value={a.key} onChange={(e) => set({ ...defaultAxis(strategy, strategy.params.findIndex((p) => p.key === e.target.value)) })}>
        {strategy.params.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
      <NumberField value={a.from} onChange={(v) => set({ ...a, from: v })} title="From" />
      <NumberField value={a.to} onChange={(v) => set({ ...a, to: v })} title="To" />
      <NumberField value={a.step} min={0} onChange={(v) => set({ ...a, step: v })} title="Step" />
    </div>
  );

  const fmt = metrics.find((m) => m.key === metric)?.format ?? "ratio";
  const cells = result?.cells ?? [];
  const finite = cells.map((c) => c.value).filter((v) => isFinite(v));
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const lookup = new Map(cells.map((c) => [`${c.x}|${c.y ?? ""}`, c.value]));
  const shade = (v: number | undefined) => {
    if (v == null || !isFinite(v) || hi === lo) return undefined;
    const f = (v - lo) / (hi - lo);
    return { background: `color-mix(in srgb, var(--accent) ${Math.round(6 + f * 64)}%, transparent)`, color: f > 0.6 ? "var(--accent-fg)" : undefined };
  };

  return (
    <div className="sweep">
      <div className="sweep-controls">
        {axisEditor("X", x, setX)}
        {strategy.params.length > 1 && axisEditor("Y", y, setY)}
        <div className="sweep-axis">
          <span className="sweep-label">Metric</span>
          <select value={metric} onChange={(e) => setMetric(e.target.value as keyof BacktestMetrics)}>
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            className="btn primary"
            disabled={running || xs.length === 0 || (strategy.params.length > 1 && x.key === y.key)}
            onClick={() =>
              onRun({ x: { key: x.key, values: xs }, y: { key: strategy.params.length > 1 ? y.key : "", values: ys }, metric })
            }
          >
            {running ? "Running…" : `Sweep ${xs.length * Math.max(1, ys.length)} runs`}
          </button>
        </div>
      </div>
      {result && (
        <div className="bt-table-wrap">
          <table className="bt-table sweep-grid">
            <thead>
              <tr>
                <th>
                  {result.spec.y.key ? `${result.spec.y.key} / ${result.spec.x.key}` : result.spec.x.key}
                </th>
                {result.spec.x.values.map((xv) => (
                  <th key={xv} className="r">
                    {xv}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(result.spec.y.values.length ? result.spec.y.values : [Number.NaN]).map((yv) => (
                <tr key={String(yv)}>
                  <th>{isNaN(yv) ? "" : yv}</th>
                  {result.spec.x.values.map((xv) => {
                    const v = lookup.get(`${xv}|${isNaN(yv) ? "" : yv}`);
                    return (
                      <td
                        key={xv}
                        className="r sweep-cell"
                        style={shade(v)}
                        title="Use these parameters"
                        onClick={() => onPick(isNaN(yv) ? { [result.spec.x.key]: xv } : { [result.spec.x.key]: xv, [result.spec.y.key]: yv })}
                      >
                        {v == null ? "—" : formatMetric(v, fmt)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
