// Trade journal (paper): the account's fills grouped into round trips, win rate and P&L statistics,
// a note and tags per trade (saved on the server), filtering by tag and a CSV export.

import { useEffect, useMemo, useState } from "react";
import { journalCsv, journalStats, parseTags, roundTrips, type JournalFill, type TradeJournalDoc } from "@qt/core";
import { getTradeJournal, putTradeNote, tradeKey } from "../../api/tradeJournal";
import { formatNumber, formatPrice, formatSigned } from "../../chart/format";
import type { PaperOrderView } from "../../api/paper";
import { dateStamp, downloadText } from "../common/files";

const tone = (v: number | null | undefined) => (!v ? "" : v > 0 ? "pos" : "neg");
const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const pct = (v: number | null) => (v === null ? "—" : `${formatNumber(v * 100, 0)}%`);

/** Filled orders of an account as journal fills. */
export function fillsOf(orders: readonly PaperOrderView[]): JournalFill[] {
  return orders
    .filter((o) => o.status === "filled" && o.fillPrice !== undefined && o.filledAt !== undefined)
    .map((o) => ({ id: o.id, symbol: o.symbol, side: o.side, qty: o.qty, fillPrice: o.fillPrice!, filledAt: o.filledAt!, realizedPnl: o.realizedPnl, commission: o.commission }));
}

export function JournalView({ accountId, accountName, orders, onOpen }: { accountId: string; accountName: string; orders: PaperOrderView[]; onOpen(symbol: string): void }) {
  const trips = useMemo(() => roundTrips(fillsOf(orders)), [orders]);
  const [doc, setDoc] = useState<TradeJournalDoc>({ notes: {} });
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ note: "", tags: "" });
  const [tag, setTag] = useState("");

  useEffect(() => {
    getTradeJournal().then(setDoc, (e) => setError(String(e?.message ?? e)));
  }, []);

  const noteOf = (id: string) => doc.notes[tradeKey(accountId, id)];
  const tags = useMemo(() => [...new Set(trips.flatMap((t) => noteOf(t.id)?.tags ?? []))].sort(), [trips, doc, accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = tag ? trips.filter((t) => noteOf(t.id)?.tags.includes(tag)) : trips;
  const stats = journalStats(shown);

  const edit = (id: string) => {
    const n = noteOf(id);
    setEditing(id);
    setDraft({ note: n?.note ?? "", tags: n?.tags.join(" ") ?? "" });
  };
  const save = async (id: string) => {
    try {
      setDoc(await putTradeNote(tradeKey(accountId, id), { note: draft.note, tags: parseTags(draft.tags) }));
      setEditing(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const exportCsv = () => {
    const notes = Object.fromEntries(shown.map((t) => [t.id, noteOf(t.id)]).filter(([, n]) => n));
    downloadText(`${accountName}-journal-${dateStamp()}.csv`, journalCsv(shown, notes), "text/csv;charset=utf-8");
  };

  if (trips.length === 0) return <div className="pn-empty">No paper trades yet. Trades appear here once orders fill.</div>;
  return (
    <div className="pp-journal">
      <div className="pf-totals pp-jstats" aria-label="Journal statistics">
        <div>
          <span>Trades</span>
          <b className="num">{stats.trades}</b>
        </div>
        <div>
          <span>Win rate</span>
          <b className="num">{pct(stats.winRate)}</b>
        </div>
        <div>
          <span title="Gross profit / gross loss">Profit factor</span>
          <b className="num">{stats.profitFactor === null ? "—" : formatNumber(stats.profitFactor, 2)}</b>
        </div>
        <div>
          <span>Net P&amp;L</span>
          <b className={`num ${tone(stats.netPnl)}`}>{formatSigned(stats.netPnl, 2)}</b>
        </div>
        <div>
          <span>Avg win / loss</span>
          <b className="num">
            <span className="pos">{stats.avgWin === null ? "—" : formatNumber(stats.avgWin, 2)}</span> / <span className="neg">{stats.avgLoss === null ? "—" : formatNumber(stats.avgLoss, 2)}</span>
          </b>
        </div>
      </div>
      <div className="pp-jbar">
        <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag" disabled={tags.length === 0}>
          <option value="">{tags.length ? "All tags" : "No tags yet"}</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button className="btn ghost" onClick={exportCsv} title="Download the trades with notes and tags as CSV">
          Export CSV
        </button>
      </div>
      {error && <div className="pn-error">{error}</div>}
      <table className="pn-table pp-jtable">
        <thead>
          <tr>
            <th className="left">Opened</th>
            <th className="left">Symbol</th>
            <th className="left">Side</th>
            <th>Qty</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>Net P&amp;L</th>
            <th className="left">Notes</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((t) => {
            const n = noteOf(t.id);
            const open = editing === t.id;
            return (
              <tr key={t.id} data-trade-id={t.id} className={t.open ? "open" : ""}>
                <td className="left muted" title={t.exitTime ? `Closed ${when(t.exitTime)}` : "Open"}>
                  {when(t.entryTime)}
                </td>
                <td className="left sym">
                  <button className="link" onClick={() => onOpen(t.symbol)}>
                    {t.symbol}
                  </button>
                </td>
                <td className={`left ${t.side === "long" ? "pos" : "neg"}`}>{t.side}</td>
                <td className="num">{formatNumber(t.qty, t.qty % 1 ? 4 : 0)}</td>
                <td className="num">{formatPrice(t.entryPrice)}</td>
                <td className="num">{t.open ? <span className="muted">open</span> : formatPrice(t.exitPrice)}</td>
                <td className={`num ${tone(t.netPnl)}`}>{t.closedQty ? formatSigned(t.netPnl, 2) : ""}</td>
                <td className="left pp-jnote">
                  {open ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void save(t.id);
                      }}
                      onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                    >
                      <textarea autoFocus rows={2} value={draft.note} maxLength={2000} placeholder="Why you took it, what happened" aria-label="Trade note" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                      <input value={draft.tags} placeholder="tags, e.g. breakout news" aria-label="Trade tags" onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
                      <div className="pp-jactions">
                        <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                        <button type="submit" className="btn primary">
                          Save
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button className="pp-jedit" onClick={() => edit(t.id)} title="Add or edit the note and tags">
                      {n ? (
                        <>
                          {n.tags.map((x) => (
                            <span key={x} className="pp-tag">
                              #{x}
                            </span>
                          ))}
                          <span className="pp-jtext">{n.note}</span>
                        </>
                      ) : (
                        <span className="muted">Add note…</span>
                      )}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
