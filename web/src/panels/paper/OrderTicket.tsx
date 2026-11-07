// Paper order ticket: side, type (market/limit/stop/stop-limit/trailing stop), qty, price, optional SL/TP. Enter submits;
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
  const [stop, setStop] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [trail, setTrail] = useState("");
  const [trailUnit, setTrailUnit] = useState<"pct" | "amount">("pct");
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSymbol(activeSymbol), [activeSymbol]);

  const submit = async () => {
    const q = num(qty);
    const p = num(price);
    const s = num(sl);
    const t = num(tp);
    const st = num(stop);
    const tr = num(trail);
    const trailing = type === "trailing-stop";
    if (!symbol.trim()) return setMsg({ text: "Symbol is required", err: true });
    if (!(q !== undefined && q > 0)) return setMsg({ text: "Quantity must be positive", err: true });
    if (type !== "market" && !trailing && !(p !== undefined && p > 0)) return setMsg({ text: `${type} orders need a price`, err: true });
    if (trailing && p !== undefined && !(p > 0)) return setMsg({ text: "The starting stop must be a positive price", err: true });
    if (trailing && !(tr !== undefined && tr > 0 && (trailUnit === "amount" || tr < 100))) return setMsg({ text: trailUnit === "pct" ? "The trail must be between 0 and 100%" : "The trail must be a positive amount", err: true });
    if (type === "stop-limit" && !(st !== undefined && st > 0)) return setMsg({ text: "stop-limit orders need a stop price", err: true });
    if (!trailing && [s, t].some((v) => v !== undefined && !(v > 0))) return setMsg({ text: "SL/TP must be positive prices", err: true });
    const o: PaperOrderRequest = { symbol: symbol.trim(), side, type, qty: q };
    if (type !== "market" && p !== undefined) o.price = p;
    if (type === "stop-limit") o.stopPrice = st;
    if (trailing) {
      if (trailUnit === "pct") o.trailPercent = tr;
      else o.trailAmount = tr;
    } else {
      if (s !== undefined) o.stopLoss = s;
      if (t !== undefined) o.takeProfit = t;
    }
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
            <option value="stop-limit">Stop-limit</option>
            <option value="trailing-stop">Trailing stop</option>
          </select>
        </label>
        <label>
          Qty
          <input type="text" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Order quantity" />
        </label>
        <label>
          {type === "stop-limit" ? "Limit" : type === "trailing-stop" ? "Start stop" : "Price"}
          <input type="text" inputMode="decimal" value={type === "market" ? "" : price} placeholder={type === "market" ? "market" : type === "trailing-stop" ? "from price" : ""} disabled={type === "market"} onChange={(e) => setPrice(e.target.value)} aria-label="Order price" />
        </label>
        {type === "stop-limit" && (
          <label>
            Stop
            <input type="text" inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} aria-label="Stop price" />
          </label>
        )}
        {type === "trailing-stop" && (
          <label>
            Trail
            <span className="pp-trail">
              <input type="text" inputMode="decimal" value={trail} onChange={(e) => setTrail(e.target.value)} aria-label="Trail distance" />
              <select value={trailUnit} onChange={(e) => setTrailUnit(e.target.value as "pct" | "amount")} aria-label="Trail unit">
                <option value="pct">%</option>
                <option value="amount">price</option>
              </select>
            </span>
          </label>
        )}
        <label>
          Stop loss
          <input type="text" inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} placeholder="optional" disabled={type === "trailing-stop"} aria-label="Stop loss" />
        </label>
        <label>
          Take profit
          <input type="text" inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} placeholder="optional" disabled={type === "trailing-stop"} aria-label="Take profit" />
        </label>
      </div>
      <button type="submit" className={`btn pp-submit ${side}`} disabled={disabled || busy}>
        {side === "buy" ? "Buy" : "Sell"} {qty || ""} {symbol} · Paper
      </button>
      {msg && <div className={msg.err ? "pn-error" : "muted"}>{msg.text}</div>}
    </form>
  );
}
