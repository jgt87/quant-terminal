// panels.html: the panel host on its own with a stand-in chart (symbol, interval, bars), used to
// verify the panels before/independently of the app shell. Theme via ?theme=light|dark.

import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { INTERVALS, type Bar, type Interval, type ScriptRunResult } from "@qt/core";
import { getBars } from "../../api/client";
import { PanelHost } from "../PanelHost";
import type { ActiveChartContext } from "../registry";
import { createAlertFromChart } from "../alerts/createFromChart";
import "../../styles/base.css";
import "../../styles/app.css";
import "./harness.css";

function Harness() {
  const params = new URLSearchParams(location.search);
  const [symbol, setSymbol] = useState(params.get("symbol") ?? "AAPL");
  const [interval, setInterval] = useState<Interval>((params.get("interval") as Interval) ?? "1D");
  const [open, setOpen] = useState(true);
  const [bars, setBars] = useState<Bar[]>([]);
  const [plots, setPlots] = useState<ScriptRunResult | null>(null);
  const [loaded, setLoaded] = useState<string[]>([]);
  const ctx = useRef<ActiveChartContext>({ symbol, interval, layoutId: "panels-harness", bars });
  ctx.current = { symbol, interval, layoutId: "panels-harness", bars };

  useEffect(() => {
    document.documentElement.dataset.theme = params.get("theme") === "light" ? "light" : "dark";
  }, []);
  useEffect(() => {
    let alive = true;
    getBars({ symbol, interval, limit: 500 })
      .then((r) => alive && setBars(r.bars))
      .catch(() => alive && setBars([]));
    return () => {
      alive = false;
    };
  }, [symbol, interval]);

  const last = bars.at(-1)?.close;
  return (
    <div className="app with-watchlist harness">
      <header className="harness-top">
        <b>Panels</b>
        <input aria-label="Harness symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
        <select aria-label="Harness interval" value={interval} onChange={(e) => setInterval(e.target.value as Interval)}>
          {INTERVALS.map((i) => (
            <option key={i}>{i}</option>
          ))}
        </select>
        <span className="muted">
          {bars.length} bars · last {last ?? "—"}
        </span>
        <button className="btn" disabled={last === undefined} onClick={() => last !== undefined && createAlertFromChart(symbol, interval, last)}>
          Add alert on last price
        </button>
      </header>
      <main className="harness-chart">
        <div className="muted">Stand-in chart · loaded symbols: <span data-testid="loaded">{loaded.join(", ")}</span></div>
        {plots && <div className="muted" data-testid="plots">Script plots on chart: {(plots.plots ?? []).map((p) => p.key).join(", ")}</div>}
      </main>
      <PanelHost
        open={open}
        onOpenChange={setOpen}
        integration={{
          activeSymbol: symbol,
          onLoadSymbol: (s) => {
            setSymbol(s);
            setLoaded((l) => [...l.slice(-9), s]);
          },
          getActiveChartContext: () => ctx.current,
          onAddScriptPlots: setPlots,
        }}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
