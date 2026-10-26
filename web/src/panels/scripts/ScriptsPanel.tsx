// Scripts panel: editor, saved scripts and examples, and Run (sandboxed worker, 2 s limit) over
// the active chart's bars; strategies are backtested from their signals.

import { useState } from "react";
import type { BacktestResult, Bar, SymbolType, UserScript } from "@qt/core";
import { getBars } from "../../api/client";
import { errorText } from "../../api/http";
import { barsPerYear } from "../../backtest/barsPerYear";
import { DEFAULT_COSTS, toConfig } from "../../backtest/config";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useScripts } from "../../hooks/scripts";
import { loadLocal, saveLocal } from "../common/storage";
import { panelIcon } from "../panelIcons";
import type { PanelIntegration } from "../registry";
import { CodeEditor } from "./CodeEditor";
import examples from "./examples.json";
import { runUserScript } from "./runner";
import type { ScriptOutput } from "./sandbox";
import { ScriptOutputs } from "./ScriptOutputs";
import { backtestSignals } from "./signals";
import "../../styles/backtest.css";
import "./scripts.css";

type Draft = { id?: string; name: string; kind: UserScript["kind"]; source: string };
const DRAFT_KEY = "qt.scripts.draft";
const EXAMPLES = examples as (Draft & { id: string })[];
const BAR_LIMIT = 1000;

export function ScriptsPanel({ integration }: { integration: PanelIntegration }) {
  const sc = useScripts();
  const [draft, setDraftState] = useState<Draft>(() => loadLocal<Draft>(DRAFT_KEY, { ...EXAMPLES[0], id: undefined }));
  const [dirty, setDirty] = useState(false);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<{ out: ScriptOutput; bars: Bar[]; backtest: BacktestResult | null; ms: number; label: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [last, setLast] = useState<ScriptOutput | null>(null);

  const setDraft = (d: Draft, isDirty = true) => {
    setDraftState(d);
    setDirty(isDirty);
    saveLocal(DRAFT_KEY, d);
  };

  const open = async (value: string) => {
    if (!value) return;
    if (value.startsWith("example:")) {
      const ex = EXAMPLES.find((e) => e.id === value.slice(8));
      if (ex) setDraft({ name: ex.name, kind: ex.kind, source: ex.source }, false);
    } else {
      try {
        const s = await sc.load(value);
        setDraft({ id: s.id, name: s.name, kind: s.kind, source: s.source }, false);
      } catch {
        /* error shown by the hook */
      }
    }
    setRun(null);
  };

  const save = async () => {
    try {
      const s = await sc.save({ name: draft.name.trim() || "Untitled script", kind: draft.kind, source: draft.source }, draft.id);
      setDraft({ id: s.id, name: s.name, kind: s.kind, source: s.source }, false);
      setMsg(`Saved ${new Date(s.updatedAt).toLocaleTimeString()}`);
    } catch {
      /* error shown by the hook */
    }
  };

  const execute = async () => {
    const ctx = integration.getActiveChartContext();
    const symbol = ctx?.symbol ?? integration.activeSymbol;
    const interval = ctx?.interval ?? "1D";
    if (!symbol) return setMsg("No active chart symbol");
    setRunning(true);
    setMsg(null);
    try {
      // The chart's own bars keep plots aligned 1:1 with the chart; fetch only when it has none yet.
      let bars: Bar[];
      let type: SymbolType | undefined;
      if (ctx && ctx.bars.length > 0) bars = [...ctx.bars];
      else {
        const res = await getBars({ symbol, interval, limit: BAR_LIMIT });
        bars = res.bars;
        type = res.symbol.type;
      }
      const t0 = performance.now();
      const out = await runUserScript(draft, bars);
      const ms = Math.round(performance.now() - t0);
      let backtest: BacktestResult | null = null;
      if (!out.error && draft.kind === "strategy" && out.signals) {
        backtest = backtestSignals(bars, out.signals, toConfig(DEFAULT_COSTS, barsPerYear(interval, type)), draft.name);
      }
      setRun({ out, bars, backtest, ms, label: `${symbol} ${interval}` });
      setLast(out.error ? null : out);
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="pn sp-panel" aria-label="Scripts">
      <header className="pn-head">
        <h3>Scripts</h3>
        <select value="" onChange={(e) => void open(e.target.value)} aria-label="Open script" className="sp-open">
          <option value="">Open…</option>
          {sc.list.length > 0 && (
            <optgroup label="Saved">
              {sc.list.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.kind})
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Examples">
            {EXAMPLES.map((e) => (
              <option key={e.id} value={`example:${e.id}`}>
                {e.name}
              </option>
            ))}
          </optgroup>
        </select>
        <span className="spacer" />
        <button className="icon-btn" title="New script" onClick={() => setDraft({ name: "New script", kind: "indicator", source: "// bars, open, high, low, close, volume, ta, plot, log, signal\nplot(\"sma20\", ta.sma(close, 20), { title: \"SMA 20\" });\n" })}>
          {panelIcon("plus", 16)}
        </button>
        <button className="icon-btn" title="Save (Ctrl+S)" onClick={() => void save()}>
          {panelIcon("save", 16)}
        </button>
        <button className="icon-btn" title="Delete saved script" disabled={!draft.id} onClick={() => setConfirm(true)}>
          {panelIcon("trash", 16)}
        </button>
      </header>
      <div className="sp-meta">
        <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Script name" className="sp-name" />
        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as UserScript["kind"] })} aria-label="Script kind">
          <option value="indicator">Indicator</option>
          <option value="strategy">Strategy</option>
        </select>
        {dirty && <span className="muted" title="Unsaved changes">●</span>}
        <span className="spacer" />
        <button className="btn ghost" disabled={!last} onClick={() => last && integration.onAddScriptPlots(last)} title="Draw the plots of the last run on the active chart">
          Add to chart
        </button>
        <button className="btn primary sp-run" onClick={() => void execute()} disabled={running} title="Run on the active chart (Ctrl+Enter)">
          {panelIcon("run", 14)} {running ? "Running…" : "Run"}
        </button>
      </div>
      <CodeEditor value={draft.source} onChange={(source) => setDraft({ ...draft, source })} onRun={() => void execute()} onSave={() => void save()} errorLine={run?.out.error?.line} />
      <div className="pn-body sp-body">
        {run ? <ScriptOutputs out={run.out} bars={run.bars} backtest={run.backtest} ms={run.ms} /> : <div className="pn-empty">Run the script over the active chart's bars (Ctrl+Enter).</div>}
      </div>
      <footer className="pn-foot">
        <span className="muted">{run ? run.label : "Sandboxed worker · 2 s limit · no network"}</span>
        {msg && <span className="muted"> · {msg}</span>}
        <span className="spacer" />
        {sc.error && <span className="pn-error">{sc.error}</span>}
      </footer>
      {confirm && draft.id && (
        <ConfirmDialog
          title="Delete script"
          message={`Delete the saved script "${draft.name}"? The editor keeps the text.`}
          confirmLabel="Delete"
          onConfirm={() => {
            void sc.remove(draft.id!).catch(() => {});
            setDraft({ ...draft, id: undefined });
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </section>
  );
}
