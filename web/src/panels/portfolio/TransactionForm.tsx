// Add-transaction form (one dense row). Enter submits; the symbol defaults to the active chart.

import { useState } from "react";
import { errorText } from "../../api/http";
import type { NewTransaction } from "../../api/portfolio";
import { toLocalDateTime, parseLocalDateTime } from "../alerts/alertModel";

interface Props {
  defaultSymbol: string;
  onAdd(tx: NewTransaction): Promise<unknown>;
}

export function TransactionForm({ defaultSymbol, onAdd }: Props) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [time, setTime] = useState(() => toLocalDateTime(Date.now()));
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const q = Number(qty.replace(",", "."));
    const p = Number(price.replace(",", "."));
    const f = Number(fee.replace(",", ".") || "0");
    const t = parseLocalDateTime(time) ?? Date.now();
    if (!symbol.trim()) return setErr("Symbol is required");
    if (!(q > 0)) return setErr("Quantity must be positive");
    if (!(p >= 0) || price.trim() === "") return setErr("Price is required");
    if (!(f >= 0)) return setErr("Fee must be 0 or more");
    try {
      await onAdd({ symbol: symbol.trim(), side, qty: q, price: p, fee: f, time: t, ...(note.trim() ? { note: note.trim() } : {}) });
      setQty("");
      setNote("");
      setErr(null);
    } catch (e) {
      setErr(errorText(e));
    }
  };

  return (
    <form
      className="pf-txform"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      aria-label="Add transaction"
    >
      <select value={side} onChange={(e) => setSide(e.target.value as "buy" | "sell")} aria-label="Side" className={side}>
        <option value="buy">Buy</option>
        <option value="sell">Sell</option>
      </select>
      <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Symbol" aria-label="Symbol" className="pf-sym" />
      <input type="text" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" aria-label="Quantity" className="pf-n" />
      <input type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" aria-label="Price" className="pf-n" />
      <input type="text" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Fee" aria-label="Fee" className="pf-n small" title="Fee" />
      <input type="datetime-local" className="text-input pf-time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" aria-label="Note" className="pf-note" />
      <button className="btn primary" type="submit">
        Add
      </button>
      {err && <div className="pn-error pf-form-err">{err}</div>}
    </form>
  );
}
