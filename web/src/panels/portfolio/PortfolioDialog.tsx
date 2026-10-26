// Create / edit a portfolio: name, currency, starting cash.

import { useState } from "react";
import { errorText } from "../../api/http";
import { Dialog } from "../../components/Dialog";

interface Props {
  title: string;
  initial: { name: string; currency: string; cash: number };
  onSubmit(v: { name: string; currency: string; cash: number }): Promise<unknown>;
  onClose(): void;
}

export function PortfolioDialog({ title, initial, onSubmit, onClose }: Props) {
  const [name, setName] = useState(initial.name);
  const [currency, setCurrency] = useState(initial.currency);
  const [cash, setCash] = useState(String(initial.cash));
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    const c = Number(cash.replace(",", ".") || "0");
    if (!name.trim()) return setErr("Name is required");
    if (!/^[A-Za-z0-9]{2,10}$/.test(currency.trim())) return setErr("Currency must be a code such as USD");
    if (!Number.isFinite(c)) return setErr("Cash must be a number");
    try {
      await onSubmit({ name: name.trim(), currency: currency.trim().toUpperCase(), cash: c });
      onClose();
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <Dialog
      title={title}
      onClose={onClose}
      width={360}
      footer={
        <>
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void submit()}>
            OK
          </button>
        </>
      }
    >
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="form-row">
          Name
          <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={200} aria-label="Portfolio name" />
        </label>
        <label className="form-row">
          Currency
          <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={10} aria-label="Currency" />
        </label>
        <label className="form-row">
          Starting cash
          <input type="text" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} aria-label="Starting cash" />
        </label>
        {err && <div className="pn-error">{err}</div>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
