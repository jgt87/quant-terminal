import { memo } from "react";
import type { Quote } from "@qt/core";
import { formatPct, formatPrice, formatSigned, priceDecimals } from "../chart/format";
import { Icon } from "./icons";

interface Props {
  symbol: string;
  quote: Quote | undefined;
  active: boolean;
  onClick(): void;
  onRemove(): void;
  onDragStart(): void;
  onDrop(): void;
  onContextMenu(clientX: number, clientY: number): void;
}

export const WatchlistRow = memo(function WatchlistRow(p: Props) {
  const q = p.quote;
  const fx = p.symbol.endsWith("=X");
  const d = q ? priceDecimals(q.last, fx) : 2;
  const dir = !q || q.change === 0 ? "flat" : q.change > 0 ? "pos" : "neg";
  return (
    <li
      className={`wl-row ${dir}${p.active ? " active" : ""}`}
      onClick={p.onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        p.onContextMenu(e.clientX, e.clientY);
      }}
      data-symbol={p.symbol}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        p.onDragStart();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        p.onDrop();
      }}
      title={p.symbol}
    >
      <span className="wl-sym">{p.symbol}</span>
      <span className="wl-num">{q ? formatPrice(q.last, d) : "—"}</span>
      <span className="wl-num wl-chg">{q ? formatSigned(q.change, d) : ""}</span>
      <span className="wl-num wl-chg">{q ? formatPct(q.changePct) : ""}</span>
      <button
        className="icon-btn wl-remove"
        title="Remove"
        onClick={(e) => {
          e.stopPropagation();
          p.onRemove();
        }}
      >
        <Icon name="close" size={12} />
      </button>
    </li>
  );
});
