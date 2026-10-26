// Screener panel: universe, filters, columns, presets (localStorage), auto-refresh and results.

import { useEffect, useState } from "react";
import type { ScreenerField } from "@qt/core";
import { TextPrompt } from "../../components/TextPrompt";
import { useScreener } from "../../hooks/screener";
import { ColumnChooser } from "../common/ColumnChooser";
import { loadLocal, saveLocal } from "../common/storage";
import { panelIcon } from "../panelIcons";
import type { PanelIntegration } from "../registry";
import { FilterBuilder } from "./FilterBuilder";
import { ScreenerTable } from "./ScreenerTable";
import {
  BUILT_IN_PRESETS, buildRequest, DEFAULT_COLUMNS, FIELDS, filtersToDrafts, REFRESH_OPTIONS, sanitizePresets, upsertPreset,
  type FilterDraft, type ScreenerPreset,
} from "./screenerModel";
import "./screener.css";

const PRESETS_KEY = "qt.screener.presets";
const STATE_KEY = "qt.screener.state";

interface SavedState {
  universe: string;
  filters: FilterDraft[];
  columns: ScreenerField[];
  refreshMs: number;
}

export function ScreenerPanel({ integration }: { integration: PanelIntegration }) {
  const saved = loadLocal<Partial<SavedState>>(STATE_KEY, {});
  const [universe, setUniverse] = useState(saved.universe ?? "us-mega");
  const [filters, setFilters] = useState<FilterDraft[]>(Array.isArray(saved.filters) ? saved.filters : []);
  const [columns, setColumns] = useState<ScreenerField[]>(Array.isArray(saved.columns) && saved.columns.length ? saved.columns : DEFAULT_COLUMNS);
  const [refreshMs, setRefreshMs] = useState(saved.refreshMs ?? 0);
  const [presets, setPresets] = useState<ScreenerPreset[]>(() => sanitizePresets(loadLocal(PRESETS_KEY, [])));
  const [naming, setNaming] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const sc = useScreener(refreshMs);

  useEffect(() => saveLocal(STATE_KEY, { universe, filters, columns, refreshMs }), [universe, filters, columns, refreshMs]);

  const run = (u = universe, f = filters, c = columns) => {
    const { req, errors } = buildRequest(u, f, c);
    setFormErrors(errors);
    void sc.run(req);
  };

  const applyPreset = (p: ScreenerPreset) => {
    const drafts = filtersToDrafts(p.filters);
    setUniverse(p.universe);
    setFilters(drafts);
    setColumns(p.columns.length ? p.columns : DEFAULT_COLUMNS);
    run(p.universe, drafts, p.columns);
  };

  const savePreset = (name: string) => {
    const { req } = buildRequest(universe, filters, columns);
    const next = upsertPreset(presets, { name: name.trim(), universe, filters: req.filters, columns });
    setPresets(next);
    saveLocal(PRESETS_KEY, next);
  };

  const deletePreset = (name: string) => {
    const next = presets.filter((p) => p.name !== name);
    setPresets(next);
    saveLocal(PRESETS_KEY, next);
  };

  const all = [...presets, ...BUILT_IN_PRESETS.filter((b) => !presets.some((p) => p.name === b.name))];
  const r = sc.result;
  return (
    <section className="pn sc-panel" aria-label="Screener">
      <header className="pn-head">
        <h3>Screener</h3>
        <select value={universe} onChange={(e) => setUniverse(e.target.value)} aria-label="Universe" className="sc-universe">
          {sc.universes.length === 0 && <option value={universe}>{universe}</option>}
          {sc.universes.map((u) => (
            <option key={u.id} value={u.id} title={u.description}>
              {u.name} ({u.count})
            </option>
          ))}
        </select>
        <span className="spacer" />
        <ColumnChooser options={FIELDS.map((f) => ({ id: f.id, label: f.label }))} value={columns} onChange={setColumns} title="Columns" />
        <select value={refreshMs} onChange={(e) => setRefreshMs(Number(e.target.value))} aria-label="Auto-refresh" title="Auto-refresh" className="sc-refresh">
          {REFRESH_OPTIONS.map((o) => (
            <option key={o.ms} value={o.ms}>
              {o.label}
            </option>
          ))}
        </select>
      </header>
      <div className="sc-presets">
        <select
          value=""
          aria-label="Load preset"
          onChange={(e) => {
            const p = all.find((x) => x.name === e.target.value);
            if (p) applyPreset(p);
          }}
        >
          <option value="">Presets…</option>
          {all.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="btn ghost" onClick={() => setNaming(true)} title="Save the current universe, filters and columns as a preset">
          Save preset
        </button>
        {presets.length > 0 && (
          <select value="" aria-label="Delete preset" onChange={(e) => e.target.value && deletePreset(e.target.value)}>
            <option value="">Delete…</option>
            {presets.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <span className="spacer" />
        <button className="btn primary" onClick={() => run()} disabled={sc.loading} title="Run (Enter in a value field)">
          {panelIcon("run", 14)} {sc.loading ? "Running…" : "Run"}
        </button>
      </div>
      <FilterBuilder filters={filters} onChange={setFilters} onSubmit={() => run()} />
      {formErrors.length > 0 && <div className="pn-error-box">{formErrors.join(" · ")} (left out)</div>}
      <div className="pn-body">
        {r ? (
          r.rows.length ? (
            <ScreenerTable rows={r.rows} columns={columns} activeSymbol={integration.activeSymbol} onOpen={(s) => integration.onLoadSymbol(s)} />
          ) : (
            <div className="pn-empty">No symbols match.</div>
          )
        ) : (
          <div className="pn-empty">{sc.loading ? "Computing fields over the universe…" : "Choose a universe and filters, then Run."}</div>
        )}
      </div>
      <footer className="pn-foot">
        {r && (
          <span className="muted sc-summary">
            {r.rows.length} rows · computed {new Date(r.computedAt).toLocaleTimeString()}
          </span>
        )}
        {r && r.errors.length > 0 && (
          <button className="btn ghost sc-errors" onClick={() => setShowErrors(!showErrors)} title={r.errors.map((e) => `${e.symbol}: ${e.message}`).join("\n")}>
            {r.errors.length} error{r.errors.length > 1 ? "s" : ""}
          </button>
        )}
        <span className="spacer" />
        {sc.error && <span className="pn-error">{sc.error}</span>}
      </footer>
      {showErrors && r && r.errors.length > 0 && (
        <ul className="sc-error-list">
          {r.errors.map((e) => (
            <li key={e.symbol}>
              <b>{e.symbol}</b> {e.message}
            </li>
          ))}
        </ul>
      )}
      {naming && <TextPrompt title="Save screener preset" label="Preset name" initial="" required maxLength={80} onSubmit={savePreset} onClose={() => setNaming(false)} />}
    </section>
  );
}
