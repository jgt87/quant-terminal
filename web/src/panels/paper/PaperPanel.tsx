// Paper trading panel (simulated): account selector/create/reset, order ticket, positions,
// working orders, fills, a trade journal and an equity mini-chart. Polls the account every 2 s while visible.

import { useState } from "react";
import { formatNumber, formatSigned } from "../../chart/format";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Tabs } from "../../components/Tabs";
import { TextPrompt } from "../../components/TextPrompt";
import { usePaper } from "../../hooks/paper";
import { Sparkline } from "../common/Sparkline";
import { panelIcon } from "../panelIcons";
import type { PanelIntegration } from "../registry";
import { OrderTicket } from "./OrderTicket";
import { FillsTable, PositionsTable, WorkingOrdersTable } from "./PaperTables";
import { JournalView } from "./JournalView";
import "./paper.css";

type Tab = "positions" | "orders" | "fills" | "journal";
const tone = (v: number | undefined) => (!v ? "" : v > 0 ? "pos" : "neg");

export function PaperPanel({ integration, visible }: { integration: PanelIntegration; visible: boolean }) {
  const pp = usePaper(visible);
  const [tab, setTab] = useState<Tab>("positions");
  const [naming, setNaming] = useState(false);
  const [confirm, setConfirm] = useState<"reset" | "delete" | null>(null);
  const a = pp.account;
  const working = a?.orders.filter((o) => o.status === "working").length ?? 0;
  const positions = a ? Object.keys(a.positions).length : 0;
  const equity = a?.equity ?? a?.balance;
  const pnl = equity !== undefined && a ? equity - a.initialBalance : undefined;

  return (
    <section className="pn pp-panel" aria-label="Paper trading (simulated)">
      <header className="pn-head">
        <h3>Paper trading</h3>
        <span className="pp-badge" title="Orders are simulated in this app; nothing is sent to a broker.">
          Paper (simulated)
        </span>
        <span className="spacer" />
        <select value={a?.id ?? pp.accounts[0]?.id ?? ""} onChange={(e) => pp.select(e.target.value)} aria-label="Paper account" className="pp-select">
          {pp.accounts.length === 0 && <option value="">No paper accounts</option>}
          {pp.accounts.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <button className="icon-btn" title="New paper account" onClick={() => setNaming(true)}>
          {panelIcon("plus", 16)}
        </button>
        <button className="icon-btn" title="Reset paper account" onClick={() => setConfirm("reset")} disabled={!a}>
          {panelIcon("refresh", 16)}
        </button>
        <button className="icon-btn" title="Delete paper account" onClick={() => setConfirm("delete")} disabled={!a}>
          {panelIcon("trash", 16)}
        </button>
      </header>
      {pp.accounts.length === 0 ? (
        <div className="pn-empty">
          <button className="btn primary" onClick={() => setNaming(true)}>
            Create a paper (simulated) account
          </button>
        </div>
      ) : (
        <>
          <div className="pf-totals pp-totals" aria-label="Paper account (simulated)">
            <div>
              <span>Equity</span>
              <b className="num">{equity !== undefined ? formatNumber(equity, 2) : "—"}</b>
            </div>
            <div>
              <span title="Starting balance + realized P&amp;L − fees (simulated)">Balance</span>
              <b className="num">{a ? formatNumber(a.balance, 2) : "—"}</b>
            </div>
            <div>
              <span>Unrealized</span>
              <b className={`num ${tone(a?.unrealizedPnl)}`}>{a?.unrealizedPnl !== undefined ? formatSigned(a.unrealizedPnl, 2) : "—"}</b>
            </div>
            <div>
              <span>Total P&amp;L</span>
              <b className={`num ${tone(pnl)}`}>{pnl !== undefined ? formatSigned(pnl, 2) : "—"}</b>
            </div>
          </div>
          {a && a.history.length > 1 && (
            <div className="pp-equity" title="Equity (simulated)">
              <Sparkline label="Paper equity (simulated)" height={44} series={[{ values: a.history.map((h) => h.equity), color: pnl !== undefined && pnl < 0 ? "var(--neg)" : "var(--pos)" }]} />
            </div>
          )}
          <OrderTicket symbol={integration.activeSymbol} disabled={!a} onPlace={pp.place} />
          <div className="pn-tabs">
            <Tabs<Tab>
              label="Paper view"
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "positions", label: `Positions (${positions})` },
                { id: "orders", label: `Orders (${working})` },
                { id: "fills", label: "Fills" },
                { id: "journal", label: "Journal" },
              ]}
            />
          </div>
          <div className="pn-body">
            {!a ? (
              <div className="pn-empty">Loading…</div>
            ) : tab === "positions" ? (
              <PositionsTable positions={a.positions} onClose={(s) => void pp.close(s).catch(() => {})} onOpen={(s) => integration.onLoadSymbol(s)} />
            ) : tab === "orders" ? (
              <WorkingOrdersTable orders={a.orders} onCancel={(id) => void pp.cancel(id).catch(() => {})} />
            ) : tab === "journal" ? (
              <JournalView accountId={a.id} accountName={a.name} orders={a.orders} onOpen={(s) => integration.onLoadSymbol(s)} />
            ) : (
              <FillsTable orders={a.orders} />
            )}
          </div>
        </>
      )}
      <footer className="pn-foot">
        <span className="muted">Simulated fills at live quotes{a ? ` · fees ${a.commissionBps} bps · slippage ${a.slippageBps} bps` : ""}</span>
        <span className="spacer" />
        {pp.error && <span className="pn-error">{pp.error}</span>}
      </footer>
      {naming && (
        <TextPrompt
          title="New paper account (simulated)"
          label="Account name"
          initial={`Paper ${pp.accounts.length + 1}`}
          required
          maxLength={100}
          onSubmit={(name) => void pp.create(name, 100_000).catch(() => {})}
          onClose={() => setNaming(false)}
        />
      )}
      {confirm && a && (
        <ConfirmDialog
          title={confirm === "reset" ? "Reset paper account" : "Delete paper account"}
          message={
            confirm === "reset"
              ? `Reset "${a.name}" to ${formatNumber(a.initialBalance, 0)} ${a.currency}? Simulated positions, orders and history are cleared.`
              : `Delete the paper account "${a.name}"?`
          }
          confirmLabel={confirm === "reset" ? "Reset" : "Delete"}
          onConfirm={() => void (confirm === "reset" ? pp.reset() : pp.remove()).catch(() => {})}
          onClose={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
