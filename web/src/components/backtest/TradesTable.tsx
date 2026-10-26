import type { Trade } from "@qt/core";
import { formatDateTime, formatNumber, formatPct, formatPrice } from "../../chart/format";

interface Props {
  trades: Trade[];
  intraday: boolean;
  onPick(t: Trade): void;
}

export function TradesTable({ trades, intraday, onPick }: Props) {
  if (trades.length === 0) return <p className="muted bt-empty">No trades.</p>;
  return (
    <div className="bt-table-wrap">
      <table className="bt-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Side</th>
            <th>Entry</th>
            <th className="r">Price</th>
            <th>Exit</th>
            <th className="r">Price</th>
            <th className="r">Qty</th>
            <th className="r">P&amp;L</th>
            <th className="r">%</th>
            <th className="r">Fees</th>
            <th className="r">Bars</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => (
            <tr key={i} onClick={() => onPick(t)} title="Show on chart">
              <td>{i + 1}</td>
              <td>{t.side}</td>
              <td>{formatDateTime(t.entryTime, intraday)}</td>
              <td className="r">{formatPrice(t.entryPrice)}</td>
              <td>{formatDateTime(t.exitTime, intraday)}</td>
              <td className="r">{formatPrice(t.exitPrice)}</td>
              <td className="r">{formatNumber(t.qty, t.qty < 10 ? 4 : 0)}</td>
              <td className={`r ${t.pnl < 0 ? "neg" : t.pnl > 0 ? "pos" : ""}`}>{formatNumber(t.pnl, 2)}</td>
              <td className={`r ${t.pnl < 0 ? "neg" : t.pnl > 0 ? "pos" : ""}`}>{formatPct(t.pnlPct)}</td>
              <td className="r">{formatNumber(t.fees, 2)}</td>
              <td className="r">{t.barsHeld}</td>
              <td>{t.exitReason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
