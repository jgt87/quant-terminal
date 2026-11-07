// One-click paper trading on the chart: Sell and Buy buttons with the last price and a quantity
// field, over the top right of the price pane. Each click sends a market order to the selected
// paper account at once (simulated; nothing reaches a broker).

import { useState } from "react";
import { quickOrder } from "../hooks/useChartTrading";
import { loadLocal, saveLocal } from "../panels/common/storage";
import { pushToast } from "../panels/common/toasts";

const QTY_KEY = "qt.quickTrade.qty";

interface Props {
  symbol: string;
  /** Last price as shown on the price axis, "" while loading. */
  priceText: string;
  /** Right edge of the price pane's plot, from the chart's right side (px). */
  right: number;
  top: number;
}

/** Quantity typed in the field: a positive number, or null. */
export function parseQty(s: string): number | null {
  const v = Number(s.trim().replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function QuickTrade({ symbol, priceText, right, top }: Props) {
  const [qty, setQty] = useState(() => loadLocal<string>(QTY_KEY, "1"));
  const [busy, setBusy] = useState<"buy" | "sell" | null>(null);
  const n = parseQty(qty);

  const trade = async (side: "buy" | "sell") => {
    if (n === null) return pushToast({ title: "Paper order not placed", body: "Enter a quantity above 0", tone: "error" });
    setBusy(side);
    try {
      pushToast({ title: "Paper order", body: await quickOrder(symbol, side, n) });
    } catch (e) {
      pushToast({ title: "Paper order not placed", body: e instanceof Error ? e.message : String(e), tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="quick-trade" style={{ right, top }} role="group" aria-label="One-click paper trading (simulated)" onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className="qt-side sell" disabled={busy !== null || n === null} onClick={() => void trade("sell")} title={`Sell ${qty} ${symbol} at market (paper)`}>
        <span className="qt-verb">Sell</span>
        <span className="qt-price">{priceText}</span>
      </button>
      <input
        className="qt-qty"
        type="text"
        inputMode="decimal"
        value={qty}
        aria-label="Quantity"
        aria-invalid={n === null}
        onChange={(e) => {
          setQty(e.target.value);
          saveLocal(QTY_KEY, e.target.value);
        }}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <button type="button" className="qt-side buy" disabled={busy !== null || n === null} onClick={() => void trade("buy")} title={`Buy ${qty} ${symbol} at market (paper)`}>
        <span className="qt-verb">Buy</span>
        <span className="qt-price">{priceText}</span>
      </button>
    </div>
  );
}
