// Portfolio panel: portfolios CRUD, totals bar, holdings + allocation donut, transactions with
// add form and CSV import/export.

import { useState } from "react";
import type { PortfolioTransaction } from "@qt/core";
import { formatNumber, formatSigned } from "../../chart/format";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Tabs } from "../../components/Tabs";
import { errorText } from "../../api/http";
import { usePortfolios } from "../../hooks/portfolio";
import { dateStamp, downloadText, pickTextFile } from "../common/files";
import { pushToast } from "../common/toasts";
import { panelIcon } from "../panelIcons";
import type { PanelIntegration } from "../registry";
import { AllocationDonut } from "./AllocationDonut";
import { HoldingsTable } from "./HoldingsTable";
import { PortfolioDialog } from "./PortfolioDialog";
import { TransactionForm } from "./TransactionForm";
import { TransactionsTable } from "./TransactionsTable";
import { parseTransactionsCsv, transactionsToCsv } from "./txCsv";
import "./portfolio.css";

type Tab = "holdings" | "transactions";
const tone = (v: number) => (v > 0 ? "pos" : v < 0 ? "neg" : "");

export function PortfolioPanel({ integration, visible }: { integration: PanelIntegration; visible: boolean }) {
  const pf = usePortfolios(visible);
  const [tab, setTab] = useState<Tab>("holdings");
  const [dialog, setDialog] = useState<"new" | "edit" | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "portfolio" } | { kind: "tx"; tx: PortfolioTransaction } | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const p = pf.selected;
  const h = pf.holdings;
  const t = h?.totals;

  const importCsv = async () => {
    if (!p) return;
    const file = await pickTextFile(".csv,text/csv");
    if (!file) return;
    const { txs, errors } = parseTransactionsCsv(file.text);
    const ids = new Set(p.transactions.map((x) => x.id));
    const fresh = txs.map((x) => (x.id && ids.has(x.id) ? { ...x, id: undefined } : x));
    if (fresh.length === 0) {
      pushToast({ title: "Nothing imported", body: errors.slice(0, 3).join("\n") || "The file has no transactions.", tone: "error" });
      return;
    }
    try {
      for (let i = 0; i < fresh.length; i += 1000) await pf.addTx(p.id, fresh.slice(i, i + 1000));
      pushToast({ title: `Imported ${fresh.length} transaction${fresh.length > 1 ? "s" : ""}`, body: errors.length ? `${errors.length} rows skipped: ${errors.slice(0, 2).join("; ")}` : undefined });
    } catch (e) {
      pushToast({ title: "Import failed", body: errorText(e), tone: "error" });
    }
  };

  return (
    <section className="pn pf-panel" aria-label="Portfolio">
      <header className="pn-head">
        <h3>Portfolio</h3>
        <select value={p?.id ?? ""} onChange={(e) => pf.select(e.target.value)} aria-label="Portfolio" className="pf-select">
          {pf.list.length === 0 && <option value="">No portfolios</option>}
          {pf.list.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} ({x.currency})
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button className="icon-btn" title="New portfolio" onClick={() => setDialog("new")}>
          {panelIcon("plus", 16)}
        </button>
        <button className="icon-btn" title="Edit portfolio" onClick={() => setDialog("edit")} disabled={!p}>
          {panelIcon("settings", 16)}
        </button>
        <button className="icon-btn" title="Delete portfolio" onClick={() => setConfirm({ kind: "portfolio" })} disabled={!p}>
          {panelIcon("trash", 16)}
        </button>
      </header>
      {p && (
        <div className="pf-totals" aria-label="Totals">
          <div>
            <span>Equity</span>
            <b className="num">{t ? formatNumber(t.equity, 2) : "—"}</b>
          </div>
          <div>
            <span>Value</span>
            <b className="num">{t ? formatNumber(t.marketValue, 2) : "—"}</b>
          </div>
          <div>
            <span>Cash</span>
            <b className="num">{t ? formatNumber(t.cash, 2) : "—"}</b>
          </div>
          <div>
            <span>Unrealized</span>
            <b className={`num ${t ? tone(t.unrealizedPnl) : ""}`}>{t ? formatSigned(t.unrealizedPnl, 2) : "—"}</b>
          </div>
          <div>
            <span>Realized</span>
            <b className={`num ${t ? tone(t.realizedPnl) : ""}`}>{t ? formatSigned(t.realizedPnl, 2) : "—"}</b>
          </div>
          <div>
            <span>Day</span>
            <b className={`num ${t ? tone(t.dayChange) : ""}`}>{t ? formatSigned(t.dayChange, 2) : "—"}</b>
          </div>
        </div>
      )}
      {p && (
        <div className="pn-tabs">
          <Tabs<Tab>
            label="Portfolio view"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "holdings", label: "Holdings" },
              { id: "transactions", label: `Transactions (${p.transactions.length})` },
            ]}
          />
          <span className="spacer" />
          {tab === "holdings" ? (
            <label className="pn-check">
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
              Closed
            </label>
          ) : (
            <>
              <button className="icon-btn" title="Import transactions (CSV)" onClick={() => void importCsv()}>
                {panelIcon("upload", 16)}
              </button>
              <button
                className="icon-btn"
                title="Export transactions (CSV)"
                onClick={() => downloadText(`${p.name.replace(/[^\w-]+/g, "_")}-transactions-${dateStamp()}.csv`, transactionsToCsv(p.transactions), "text/csv;charset=utf-8")}
              >
                {panelIcon("download", 16)}
              </button>
            </>
          )}
        </div>
      )}
      <div className="pn-body">
        {!p ? (
          <div className="pn-empty">
            <button className="btn primary" onClick={() => setDialog("new")}>
              Create a portfolio
            </button>
          </div>
        ) : tab === "holdings" ? (
          <>
            <AllocationDonut
              currency={p.currency}
              items={[...(h?.holdings ?? []).filter((x) => x.qty > 0).map((x) => ({ label: x.symbol, value: x.marketValue ?? 0 })), { label: "Cash", value: t?.cash ?? 0 }]}
            />
            <HoldingsTable holdings={h?.holdings ?? []} showClosed={showClosed} onOpen={(s) => integration.onLoadSymbol(s)} />
            {t && t.missingQuotes.length > 0 && <div className="muted pf-missing">No quote: {t.missingQuotes.join(", ")}</div>}
          </>
        ) : (
          <>
            <TransactionForm defaultSymbol={integration.activeSymbol} onAdd={(tx) => pf.addTx(p.id, tx)} />
            <TransactionsTable txs={p.transactions} onDelete={(tx) => setConfirm({ kind: "tx", tx })} />
          </>
        )}
      </div>
      <footer className="pn-foot">
        {h && <span className="muted">as of {new Date(h.asOf).toLocaleTimeString()}</span>}
        <span className="spacer" />
        {pf.error && <span className="pn-error">{pf.error}</span>}
      </footer>
      {dialog && (
        <PortfolioDialog
          title={dialog === "new" ? "New portfolio" : "Edit portfolio"}
          initial={dialog === "edit" && p ? { name: p.name, currency: p.currency, cash: p.cash } : { name: `Portfolio ${pf.list.length + 1}`, currency: "USD", cash: 0 }}
          onSubmit={(v) => (dialog === "edit" && p ? pf.rename(p.id, v) : pf.create(v.name, v.currency, v.cash))}
          onClose={() => setDialog(null)}
        />
      )}
      {confirm?.kind === "portfolio" && p && (
        <ConfirmDialog title="Delete portfolio" message={`Delete "${p.name}" and its ${p.transactions.length} transactions?`} confirmLabel="Delete" onConfirm={() => void pf.remove(p.id).catch(() => {})} onClose={() => setConfirm(null)} />
      )}
      {confirm?.kind === "tx" && p && (
        <ConfirmDialog
          title="Delete transaction"
          message={`Delete ${confirm.tx.side} ${confirm.tx.qty} ${confirm.tx.symbol} @ ${confirm.tx.price}?`}
          confirmLabel="Delete"
          onConfirm={() => void pf.removeTx(p.id, confirm.tx.id).catch(() => {})}
          onClose={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
