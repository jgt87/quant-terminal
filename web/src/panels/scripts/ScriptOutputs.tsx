// Result of a script run: error (with line), plots with last values and a preview, signals and
// backtest metrics for strategies, and the log.

import type { BacktestResult, Bar } from "@qt/core";
import { formatPrice } from "../../chart/format";
import { MetricsGrid } from "../../components/backtest/MetricsGrid";
import { seriesColor } from "../common/palette";
import { Sparkline } from "../common/Sparkline";
import type { ScriptOutput } from "./sandbox";

interface Props {
  out: ScriptOutput;
  bars: Bar[];
  backtest: BacktestResult | null;
  ms: number;
}

const lastValue = (s: (number | null)[] | undefined) => {
  if (!s) return null;
  for (let i = s.length - 1; i >= 0; i--) if (s[i] !== null) return s[i];
  return null;
};

export function ScriptOutputs({ out, bars, backtest, ms }: Props) {
  const plots = out.plots ?? [];
  const overlay = plots.filter((p) => p.pane === "overlay");
  const separate = plots.filter((p) => p.pane === "separate");
  const tail = (s: (number | null)[]) => s.slice(-300);
  return (
    <div className="sp-out" aria-label="Script outputs">
      {out.error ? (
        <div className="sp-error" role="alert">
          {out.error.line ? <b>Line {out.error.line}{out.error.column ? `:${out.error.column}` : ""}: </b> : null}
          {out.error.message}
        </div>
      ) : (
        <div className="muted sp-ok">
          Ran over {bars.length} bars in {ms} ms · {plots.length} plot{plots.length === 1 ? "" : "s"}
          {out.signals?.length ? ` · ${out.signals.length} signals` : ""}
        </div>
      )}
      {plots.length > 0 && (
        <>
          {overlay.length > 0 && (
            <Sparkline
              label="Overlay plots preview"
              height={70}
              series={[{ values: tail(bars.map((b) => b.close)), color: "var(--muted)" }, ...overlay.map((p, i) => ({ values: tail(out.outputs?.[p.key] ?? []), color: seriesColor(i) }))]}
            />
          )}
          {separate.length > 0 && (
            <Sparkline label="Separate pane plots preview" height={50} series={separate.map((p, i) => ({ values: tail(out.outputs?.[p.key] ?? []), color: seriesColor(overlay.length + i) }))} />
          )}
          <table className="pn-table sp-plots">
            <thead>
              <tr>
                <th className="left">Plot</th>
                <th className="left">Style</th>
                <th className="left">Pane</th>
                <th>Last</th>
              </tr>
            </thead>
            <tbody>
              {plots.map((p, i) => (
                <tr key={p.key} data-plot={p.key}>
                  <td className="left">
                    <span className="pf-swatch" style={{ background: seriesColor(p.pane === "overlay" ? overlay.indexOf(p) : overlay.length + separate.indexOf(p)) }} data-i={i} />
                    {p.title}
                  </td>
                  <td className="left muted">{p.style}</td>
                  <td className="left muted">{p.pane}</td>
                  <td className="num">{formatPrice(lastValue(out.outputs?.[p.key]))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {backtest && (
        <div className="sp-bt">
          <div className="sp-section">Backtest of the script's signals ({backtest.trades.length} trades)</div>
          <MetricsGrid m={backtest.metrics} />
        </div>
      )}
      {out.logs && out.logs.length > 0 && (
        <>
          <div className="sp-section">Log</div>
          <pre className="sp-log">{out.logs.join("\n")}</pre>
        </>
      )}
    </div>
  );
}
