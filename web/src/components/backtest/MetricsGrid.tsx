import type { BacktestMetrics } from "@qt/core";
import { formatNumber, formatPct } from "../../chart/format";
import metrics from "../../config/metrics.json";

export function formatMetric(v: number, format: string): string {
  switch (format) {
    case "pct":
      return formatPct(v);
    case "pctAbs":
      return isFinite(v) ? `${v.toFixed(2)}%` : "—";
    case "ratio":
      return formatNumber(v, 2);
    case "int":
      return isFinite(v) ? String(Math.round(v)) : "—";
    case "bars":
      return isFinite(v) ? `${Math.round(v)} bars` : "—";
    default:
      return formatNumber(v, 2);
  }
}

export function MetricsGrid({ m }: { m: BacktestMetrics }) {
  return (
    <dl className="bt-metrics">
      {metrics.map((d) => {
        const v = m[d.key as keyof BacktestMetrics];
        // Fees are a cost, not a result: never colored as profit or loss.
        const signed = (d.format === "pct" || d.format === "money") && d.key !== "totalFees";
        return (
          <div key={d.key} className={`metric${signed && v < 0 ? " neg" : signed && v > 0 ? " pos" : ""}`}>
            <dt>{d.label}</dt>
            <dd>{formatMetric(v, d.format)}</dd>
          </div>
        );
      })}
    </dl>
  );
}
