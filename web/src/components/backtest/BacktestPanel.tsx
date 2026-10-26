// Bottom, collapsible backtest panel. Runs strategies client-side on the loaded bars
// (server endpoint as fallback), shows metrics, equity/drawdown, trades and sweeps,
// and marks trades on the main chart.

import { useEffect, useMemo, useState } from "react";
import { metricsToCsv, runBacktest, STRATEGIES, sweepParams, getStrategy, tradesToCsv } from "@qt/core";
import { downloadBlob, exportFileName } from "../../chart/export/csvExport";
import type { BacktestResult, Bar, Interval, SymbolInfo, Trade } from "@qt/core";
import { postBacktest } from "../../api/client";
import { barsPerYear } from "../../backtest/barsPerYear";
import { DEFAULT_COSTS, toConfig, tradeMarkers, type CostForm } from "../../backtest/config";
import type { ChartEngine } from "../../chart/ChartEngine";
import { Icon } from "../icons";
import { BacktestForm } from "./BacktestForm";
import { EquityChart } from "./EquityChart";
import { MetricsGrid } from "./MetricsGrid";
import { SweepTable, type SweepCell, type SweepSpec } from "./SweepTable";
import { TradesTable } from "./TradesTable";
import "../../styles/backtest.css";

type Tab = "results" | "trades" | "sweep";

interface Props {
  open: boolean;
  onToggle(): void;
  engine: ChartEngine | null;
  symbol: string;
  interval: Interval;
  info: SymbolInfo | null;
}

/** Yield to the browser so "Running" paints before a synchronous run. */
const nextFrame = () => new Promise<void>((r) => setTimeout(r, 16));

export function BacktestPanel({ open, onToggle, engine, symbol, interval, info }: Props) {
  const [strategyId, setStrategyId] = useState(STRATEGIES[0]?.id ?? "");
  const strategy = getStrategy(strategyId) ?? STRATEGIES[0];
  const [params, setParams] = useState<Record<string, number>>({});
  const [costs, setCosts] = useState<CostForm>(DEFAULT_COSTS);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [ranOn, setRanOn] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<Tab>("results");
  const [sweep, setSweep] = useState<{ spec: SweepSpec; cells: SweepCell[] } | null>(null);
  const bpy = barsPerYear(interval, info?.type);
  const intraday = interval.endsWith("m") || interval.endsWith("h");

  // Results belong to one series; clear them when the series changes.
  useEffect(() => {
    setResult(null);
    setSweep(null);
    engine?.setMarkers([]);
  }, [engine, symbol, interval]);

  const fullParams = useMemo(() => {
    const p: Record<string, number> = {};
    for (const d of strategy?.params ?? []) p[d.key] = params[d.key] ?? d.default;
    return p;
  }, [strategy, params]);

  if (!strategy) return null;

  const bars = (): Bar[] => (engine ? engine.data.bars.slice() : []);

  const run = async () => {
    const data = bars();
    setError(null);
    if (data.length < 3) {
      setError("Not enough bars loaded");
      return;
    }
    setRunning(true);
    await nextFrame();
    const config = toConfig(costs, bpy);
    let r: BacktestResult;
    try {
      r = runBacktest(data, strategy, fullParams, config);
    } catch (e) {
      try {
        r = await postBacktest({ symbol, interval, strategyId: strategy.id, params: fullParams, config });
      } catch {
        setError(e instanceof Error ? e.message : "Backtest failed");
        setRunning(false);
        return;
      }
    }
    setResult(r);
    setRanOn(`${symbol} · ${interval} · ${data.length} bars`);
    engine?.setMarkers(tradeMarkers(r.trades));
    setRunning(false);
    if (tab === "sweep") setTab("results");
  };

  const runSweep = async (spec: SweepSpec) => {
    const data = bars();
    if (data.length < 3) {
      setError("Not enough bars loaded");
      return;
    }
    setError(null);
    setRunning(true);
    await nextFrame();
    try {
      const grid: Record<string, number[]> = { [spec.x.key]: spec.x.values };
      if (spec.y.key) grid[spec.y.key] = spec.y.values;
      // Keep the non-swept params as set in the form.
      for (const [k, v] of Object.entries(fullParams)) if (!(k in grid)) grid[k] = [v];
      const rows = sweepParams(data, strategy, grid, toConfig(costs, bpy), spec.metric);
      setSweep({
        spec,
        cells: rows.map((r) => ({ x: r.params[spec.x.key], y: spec.y.key ? r.params[spec.y.key] : null, value: r.metrics[spec.metric] })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sweep failed");
    }
    setRunning(false);
  };

  const clear = () => {
    setResult(null);
    engine?.setMarkers([]);
  };

  const showTrade = (t: Trade) => engine?.scrollToTime(t.entryTime);

  return (
    <section className={`backtest${open ? " open" : ""}`} aria-label="Backtest" data-testid="backtest-panel">
      <header className="bt-head">
        <button className="bt-toggle" onClick={onToggle} aria-expanded={open} title={open ? "Collapse" : "Expand"}>
          <Icon name={open ? "chevronDown" : "chevronUp"} size={14} />
          <span>Strategy tester</span>
        </button>
        {open && (
          <div className="bt-tabs" role="tablist">
            {(["results", "trades", "sweep"] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                {t === "results" ? "Overview" : t === "trades" ? `Trades${result ? ` (${result.trades.length})` : ""}` : "Sweep"}
              </button>
            ))}
          </div>
        )}
        <span className="spacer" />
        {result && <span className="bt-ranon">{ranOn}</span>}
        {error && <span className="bt-error">{error}</span>}
        {result && (
          <>
            <button
              className="btn ghost"
              title="Download the trade list as CSV"
              onClick={() => downloadBlob(new Blob([tradesToCsv(result.trades)], { type: "text/csv" }), exportFileName(`${symbol}_${strategy.id}_trades`, interval, "csv"))}
            >
              Trades CSV
            </button>
            <button
              className="btn ghost"
              title="Download the metrics as CSV"
              onClick={() => downloadBlob(new Blob([metricsToCsv(result.metrics)], { type: "text/csv" }), exportFileName(`${symbol}_${strategy.id}_metrics`, interval, "csv"))}
            >
              Metrics CSV
            </button>
            <button className="btn ghost" onClick={clear}>
              Clear
            </button>
          </>
        )}
        <button className="btn primary" onClick={run} disabled={running} aria-label="Run backtest">
          <Icon name="play" size={12} />
          {running ? "Running…" : "Run"}
        </button>
      </header>
      {open && (
        <div className="bt-body">
          <BacktestForm
            strategies={STRATEGIES}
            strategy={strategy}
            params={fullParams}
            costs={costs}
            barsPerYear={bpy}
            onStrategy={(id) => {
              setStrategyId(id);
              setParams({});
              setSweep(null);
            }}
            onParam={(k, v) => setParams((p) => ({ ...p, [k]: v }))}
            onCosts={setCosts}
          />
          <div className="bt-results">
            {tab === "results" &&
              (result ? (
                <div className="bt-overview">
                  <MetricsGrid m={result.metrics} />
                  <EquityChart equity={result.equity} />
                </div>
              ) : (
                <p className="muted bt-empty">Configure a strategy and press Run. Fills happen at the next bar open.</p>
              ))}
            {tab === "trades" && (result ? <TradesTable trades={result.trades} intraday={intraday} onPick={showTrade} /> : <p className="muted bt-empty">Run a backtest first.</p>)}
            {tab === "sweep" && (
              <SweepTable
                strategy={strategy}
                running={running}
                result={sweep}
                onRun={runSweep}
                onPick={(p) => setParams((old) => ({ ...old, ...p }))}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
