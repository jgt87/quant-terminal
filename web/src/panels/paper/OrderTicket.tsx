// Paper order ticket: side, type (market/limit/stop), qty, price, optional SL/TP. Enter submits;
// B / S switch the side when the ticket (not a field) has focus.

import { useEffect, useState } from "react";
import type { PaperOrderType } from "@qt/core";
import { errorText } from "../../api/http";
import type { PaperOrderRequest } from "../../api/paper";

interface Props {
  symbol: string;
  disabled: boolean;
  onPlace(o: PaperOrderRequest): Promise<unknown>;
}

const num = (s: string) => {
  const t = s.trim().replace(",", ".");
  if (!t) return undefined;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
};

export function OrderTicket({ symbol: activeSymbol, disabled, onPlace }: Props) {
  const [symbol, setSymbol] = useState(activeSymbol);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [type, setType] = useState<PaperOrderType>("market");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSymbol(activeSymbol), [activeSymbol]);

  const submit = async () => {
    const q = num(qty);
    const p = num(price);
    const s = num(sl);
    const t = num(tp);
    if (!symbol.trim()) return setMsg({ text: "Symbol is required", err: true });
    if (!(q !== undefined && q > 0)) return setMsg({ text: "Quantity must be positive", err: true });
    if (type !== "market" && !(p !== undefined && p > 0)) return setMsg({ text: `${type} orders need a price`, err: true });
    if ([s, t].some((v) => v !== undefined && !(v > 0))) return setMsg({ text: "SL/TP must be positive prices", err: true });
    const o: PaperOrderRequest = { symbol: symbol.trim(), side, type, qty: q };
    if (type !== "market") o.price = p;
    if (s !== undefined) o.stopLoss = s;
    if (t !== undefined) o.takeProfit = t;
    setBusy(true);
    try {
      await onPlace(o);
      setMsg({ text: `Paper ${side} ${q} ${o.symbol} ${type} placed (simulated)`, err: false });
    } catch (e) {
      setMsg({ text: errorText(e), err: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="pp-ticket"
      aria-label="Paper order ticket (simulated)"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("input, select")) return;
        const k = e.key.toLowerCase();
        if ((k === "b" || k === "s") && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          setSide(k === "b" ? "buy" : "sell");
        }
      }}
    >
      <div className="pp-sides" role="radiogroup" aria-label="Side">
        <button type="button" role="radio" aria-checked={side === "buy"} className={`pp-side buy${side === "buy" ? " on" : ""}`} onClick={() => setSide("buy")}>
          Buy
        </button>
        <button type="button" role="radio" aria-checked={side === "sell"} className={`pp-side sell${side === "sell" ? " on" : ""}`} onClick={() => setSide("sell")}>
          Sell
        </button>
      </div>
      <div className="pp-grid">
        <label>
          Symbol
          <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="Order symbol" />
        </label>
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value as PaperOrderType)} aria-label="Order type">
            <option value="market">Market</option>
            <option value="limit">Limit</option>
            <option value="stop">Stop</option>
          </select>
        </label>
        <label>
          Qty
          <input type="text" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Order quantity" />
        </label>
        <label>
          Price
          <input type="text" inputMode="decimal" value={type === "market" ? "" : price} placeholder={type === "market" ? "market" : ""} disabled={type === "market"} onChange={(e) => setPrice(e.target.value)} aria-label="Order price" />
        </label>
        <label>
          Stop loss
          <input type="text" inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} placeholder="optional" aria-label="Stop loss" />
        </label>
        <label>
          Take profit
          <input type="text" inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} placeholder="optional" aria-label="Take profit" />
        </label>
      </div>
      <button type="submit" className={`btn pp-submit ${side}`} disabled={disabled || busy}>
        {side === "buy" ? "Buy" : "Sell"} {qty || ""} {symbol} · Paper
      </button>
      {msg && <div className={msg.err ? "pn-error" : "muted"}>{msg.text}</div>}
    </form>
  );
}
