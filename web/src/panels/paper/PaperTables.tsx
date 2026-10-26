// Paper account tables: positions (close, unrealized P&L), working orders (cancel), fills.

import { formatNumber, formatPrice, formatSigned } from "../../chart/format";
import { Icon } from "../../components/icons";
import type { MarkedPosition, PaperOrderView } from "../../api/paper";

const tone = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? "" : v > 0 ? "pos" : "neg");
const time = (ms?: number) => (ms ? new Date(ms).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");

export function PositionsTable({ positions, onClose, onOpen }: { positions: Record<string, MarkedPosition>; onClose(symbol: string): void; onOpen(symbol: string): void }) {
  const list = Object.entries(positions);
  if (list.length === 0) return <div className="pn-empty">No open paper positions.</div>;
  return (
    <table className="pn-table pp-positions">
      <thead>
        <tr>
          <th className="left">Symbol</th>
          <th>Qty</th>
          <th>Avg</th>
          <th>Last</th>
          <th>Unreal. P&amp;L</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {list.map(([sym, p]) => (
          <tr key={sym} data-symbol={sym} tabIndex={0} onClick={() => onOpen(sym)} onKeyDown={(e) => e.key === "Enter" && onOpen(sym)}>
            <td className="left sym">{sym}</td>
            <td className={`num ${p.qty > 0 ? "pos" : "neg"}`}>{formatNumber(p.qty, p.qty % 1 ? 4 : 0)}</td>
            <td className="num">{formatPrice(p.avgPrice)}</td>
            <td className="num">{formatPrice(p.last ?? null)}</td>
            <td className={`num ${tone(p.unrealizedPnl)}`}>{formatSigned(p.unrealizedPnl ?? null, 2)}</td>
            <td>
              <button
                className="btn ghost pp-close"
                title="Close at market (simulated)"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(sym);
                }}
              >
                Close
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const describe = (o: PaperOrderView) => `${o.type}${o.role ? ` (${o.role})` : ""}`;

export function WorkingOrdersTable({ orders, onCancel }: { orders: PaperOrderView[]; onCancel(id: string): void }) {
  const list = orders.filter((o) => o.status === "working");
  if (list.length === 0) return <div className="pn-empty">No working paper orders.</div>;
  return (
    <table className="pn-table pp-orders">
      <thead>
        <tr>
          <th className="left">Symbol</th>
          <th className="left">Side</th>
          <th className="left">Type</th>
          <th>Qty</th>
          <th>Price</th>
          <th>SL / TP</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {list.map((o) => (
          <tr key={o.id} data-order-id={o.id}>
            <td className="left sym">{o.symbol}</td>
            <td className={`left ${o.side === "buy" ? "pos" : "neg"}`}>{o.side}</td>
            <td className="left">{describe(o)}</td>
            <td className="num">{formatNumber(o.qty, o.qty % 1 ? 4 : 0)}</td>
            <td className="num">{formatPrice(o.price ?? null)}</td>
            <td className="num muted">
              {o.stopLoss ? formatPrice(o.stopLoss) : "—"} / {o.takeProfit ? formatPrice(o.takeProfit) : "—"}
            </td>
            <td>
              <button className="icon-btn" title="Cancel order" onClick={() => onCancel(o.id)}>
                <Icon name="close" size={12} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FillsTable({ orders }: { orders: PaperOrderView[] }) {
  const list = orders.filter((o) => o.status !== "working").sort((a, b) => (b.filledAt ?? b.createdAt) - (a.filledAt ?? a.createdAt));
  if (list.length === 0) return <div className="pn-empty">No fills yet.</div>;
  return (
    <table className="pn-table pp-fills">
      <thead>
        <tr>
          <th className="left">Time</th>
          <th className="left">Symbol</th>
          <th className="left">Side</th>
          <th>Qty</th>
          <th>Fill</th>
          <th>P&amp;L</th>
          <th className="left">Status</th>
        </tr>
      </thead>
      <tbody>
        {list.map((o) => (
          <tr key={o.id} className={o.status === "filled" ? "" : "closed"} title={o.cancelReason}>
            <td className="left muted">{time(o.filledAt ?? o.createdAt)}</td>
            <td className="left sym">{o.symbol}</td>
            <td className={`left ${o.side === "buy" ? "pos" : "neg"}`}>{o.side}</td>
            <td className="num">{formatNumber(o.qty, o.qty % 1 ? 4 : 0)}</td>
            <td className="num">{formatPrice(o.fillPrice ?? null)}</td>
            <td className={`num ${tone(o.realizedPnl)}`}>{o.realizedPnl ? formatSigned(o.realizedPnl, 2) : ""}</td>
            <td className="left muted">{o.status === "filled" ? describe(o) : o.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
