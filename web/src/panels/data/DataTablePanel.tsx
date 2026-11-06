// Data table panel: every loaded bar of the active chart with OHLCV and the visible indicator
// values, newest first, virtualised. Clicking a row scrolls the chart to that bar; the table can
// be copied or downloaded as CSV.

import { useEffect, useMemo, useRef, useState } from "react";
import { chartCsvText, exportBars, exportChartCsv, visibleIndicatorOutputs } from "../../chart/export/chartExport";
import { formatPrice, formatTimeFull } from "../../chart/format";
import { shortVolume } from "../../chart/renderers/footprint";
import { copyText } from "../../state/chartMenuFor";
import { panelIcon } from "../panelIcons";
import type { ActiveChartHandles } from "../registry";
import { dataColumns, rowToIndex, visibleRows } from "./dataTableModel";
import "./data.css";

const ROW_H = 22;

export function DataTablePanel({ chart }: { chart: ActiveChartHandles | null }) {
  const engine = chart?.engine ?? null;
  const [version, setVersion] = useState(0);
  const [scroll, setScroll] = useState({ top: 0, height: 600 });
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!engine) return;
    let raf = 0;
    // Live updates arrive often: refresh at most once per frame.
    const bump = () => {
      if (!raf) raf = requestAnimationFrame(() => ((raf = 0), setVersion((v) => v + 1)));
    };
    const off = engine.events.on("data", bump);
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [engine]);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScroll((s) => ({ ...s, height: el.clientHeight })));
    ro.observe(el);
    return () => ro.disconnect();
  }, [engine]);

  const model = useMemo(() => {
    if (!engine) return null;
    const bars = exportBars(engine);
    return { bars, cols: dataColumns(bars, visibleIndicatorOutputs(engine)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, version]);

  if (!chart || !engine || !model) {
    return (
      <section className="pn data-panel" aria-label="Data table">
        <header className="pn-head">
          <h3>Data table</h3>
        </header>
        <div className="pn-empty">No chart is active.</div>
      </section>
    );
  }

  const { bars, cols } = model;
  const n = bars.length;
  const intraday = engine.meta.intraday;
  const ps = engine.mainPane.ps;
  const fmt = (kind: string, v: number | null) => {
    if (v == null || !Number.isFinite(v)) return "";
    if (kind === "price") return formatPrice(v, ps.formatDecimals(v));
    if (kind === "volume") return shortVolume(v);
    return Math.abs(v) >= 1e5 ? shortVolume(v) : Number(v.toPrecision(6)).toString();
  };
  const { first, last } = visibleRows(scroll.top, scroll.height, ROW_H, n);
  const rows: number[] = [];
  for (let r = first; r <= last; r++) rows.push(r);
  const interval = chart.layout.customInterval || chart.layout.interval;
  const template = `150px repeat(${cols.length}, minmax(76px, 1fr))`;

  return (
    <section className="pn data-panel" aria-label="Data table">
      <header className="pn-head">
        <h3>Data table</h3>
        <span className="data-meta">
          {chart.layout.symbol} · {n} bars
        </span>
        <span className="spacer" />
        <button className="icon-btn" title="Copy as CSV" onClick={() => copyText(chartCsvText(engine))}>
          {panelIcon("file", 16)}
        </button>
        <button className="icon-btn" title="Download CSV" onClick={() => exportChartCsv(engine, chart.layout.symbol, interval)}>
          {panelIcon("download", 16)}
        </button>
      </header>
      <div className="data-scroll" ref={body} onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}>
        <div className="data-grid" style={{ minWidth: 150 + cols.length * 76 }}>
          <div className="data-row data-headrow" style={{ gridTemplateColumns: template }} role="row">
            <span role="columnheader">Time (UTC)</span>
            {cols.map((c) => (
              <span key={c.key} role="columnheader" title={c.label}>
                {c.label}
              </span>
            ))}
          </div>
          <div style={{ height: n * ROW_H, position: "relative" }} role="rowgroup">
            {rows.map((r) => {
              const i = rowToIndex(r, n);
              const b = bars[i];
              const up = b.close >= b.open;
              return (
                <div
                  key={i}
                  className="data-row"
                  role="row"
                  style={{ gridTemplateColumns: template, top: r * ROW_H, height: ROW_H }}
                  onClick={() => engine.scrollToTime(engine.data.times[i] ?? b.time)}
                  title="Show this bar on the chart"
                >
                  <span>{formatTimeFull(b.time, intraday)}</span>
                  {cols.map((c) => (
                    <span key={c.key} className={c.key === "close" ? (up ? "pos" : "neg") : ""}>
                      {fmt(c.kind, c.value(i))}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
