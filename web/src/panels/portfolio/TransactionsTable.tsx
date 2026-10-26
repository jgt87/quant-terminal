// Transactions (newest first) with delete.

import type { PortfolioTransaction } from "@qt/core";
import { formatNumber, formatPrice } from "../../chart/format";
import { Icon } from "../../components/icons";

export function TransactionsTable({ txs, onDelete }: { txs: PortfolioTransaction[]; onDelete(tx: PortfolioTransaction): void }) {
  if (txs.length === 0) return <div className="pn-empty">No transactions.</div>;
  const rows = [...txs].sort((a, b) => b.time - a.time);
  return (
    <div className="pn-table-wrap">
      <table className="pn-table pf-txs">
        <thead>
          <tr>
            <th className="left">Date</th>
            <th className="left">Symbol</th>
            <th className="left">Side</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Fee</th>
            <th className="left">Note</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} data-tx-id={t.id} tabIndex={0} onKeyDown={(e) => e.key === "Delete" && onDelete(t)}>
              <td className="left muted">{new Date(t.time).toISOString().slice(0, 10)}</td>
              <td className="left sym">{t.symbol}</td>
              <td className={`left ${t.side === "buy" ? "pos" : "neg"}`}>{t.side}</td>
              <td className="num">{formatNumber(t.qty, t.qty % 1 ? 4 : 0)}</td>
              <td className="num">{formatPrice(t.price)}</td>
              <td className="num">{formatNumber(t.fee, 2)}</td>
              <td className="left muted pf-note-cell" title={t.note}>
                {t.note}
              </td>
              <td>
                <button className="icon-btn" title="Delete transaction (Del)" onClick={() => onDelete(t)}>
                  <Icon name="close" size={12} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
