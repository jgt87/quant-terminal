// Holdings: qty, average cost, last, value, unrealized P&L (up/down colored) and realized P&L.

import type { Holding } from "@qt/core";
import { formatNumber, formatPrice, formatSigned } from "../../chart/format";
import { sortBy, sortMark, useSort } from "../common/sort";

type Key = "symbol" | "qty" | "avgPrice" | "last" | "marketValue" | "unrealizedPnl" | "realizedPnl";
const COLS: { key: Key; label: string }[] = [
  { key: "symbol", label: "Symbol" },
  { key: "qty", label: "Qty" },
  { key: "avgPrice", label: "Avg" },
  { key: "last", label: "Last" },
  { key: "marketValue", label: "Value" },
  { key: "unrealizedPnl", label: "Unreal. P&L" },
  { key: "realizedPnl", label: "Realized" },
];

const tone = (v: number | null) => (v === null || v === 0 ? "" : v > 0 ? "pos" : "neg");

export function HoldingsTable({ holdings, showClosed, onOpen }: { holdings: Holding[]; showClosed: boolean; onOpen(symbol: string): void }) {
  const { sort, toggle } = useSort<Key>({ key: "marketValue", dir: "desc" });
  const rows = sortBy(
    holdings.filter((h) => showClosed || h.qty > 0),
    sort,
    (h, k) => h[k],
  );
  if (rows.length === 0) return <div className="pn-empty">No holdings. Add a buy transaction.</div>;
  return (
    <div className="pn-table-wrap">
      <table className="pn-table pf-holdings">
        <thead>
          <tr>
            {COLS.map((c) => (
              <th key={c.key} className={c.key === "symbol" ? "left" : ""} onClick={() => toggle(c.key)}>
                {c.label}
                {sortMark(sort, c.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.symbol} tabIndex={0} data-symbol={h.symbol} className={h.qty > 0 ? "" : "closed"} onClick={() => onOpen(h.symbol)} onKeyDown={(e) => e.key === "Enter" && onOpen(h.symbol)}>
              <td className="left sym">{h.symbol}</td>
              <td className="num">{formatNumber(h.qty, h.qty % 1 ? 4 : 0)}</td>
              <td className="num">{h.qty > 0 ? formatPrice(h.avgPrice) : "—"}</td>
              <td className="num">{formatPrice(h.last)}</td>
              <td className="num">{formatNumber(h.marketValue, 2)}</td>
              <td className={`num ${tone(h.unrealizedPnl)}`}>{formatSigned(h.unrealizedPnl, 2)}</td>
              <td className={`num ${tone(h.realizedPnl)}`}>{formatSigned(h.realizedPnl, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
