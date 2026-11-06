// Time and sales (Binance symbols): the latest trades of the active chart's symbol, newest first,
// with the aggressor side, large prints highlighted and buy / sell totals. Polls while visible.

import { useEffect, useMemo, useState } from "react";
import type { FlowTrade } from "@qt/core";
import { fetchTrades } from "../../api/orderflow";
import { errorText } from "../../api/http";
import { isBinanceSymbol } from "../../state/chartMenuFor";
import { shortVolume } from "../../chart/renderers/footprint";
import { tapeSummary } from "./tapeSummary";
import "./tape.css";

const POLL_MS = 1500;
const KEEP = 300;

const hms = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}`;
};

export function TapePanel({ symbol, visible }: { symbol: string; visible: boolean }) {
  const [trades, setTrades] = useState<FlowTrade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [minSize, setMinSize] = useState(0);
  const ok = isBinanceSymbol(symbol);

  useEffect(() => {
    setTrades([]);
    setError(null);
    if (!visible || !ok) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetchTrades(symbol, 200);
        if (!alive) return;
        setError(null);
        // Merge by trade id, keep the newest.
        setTrades((old) => {
          const m = new Map(old.map((t) => [t.id, t]));
          for (const t of r.trades) m.set(t.id, t);
          return [...m.values()].sort((a, b) => b.id - a.id).slice(0, KEEP);
        });
      } catch (e) {
        if (alive) setError(errorText(e));
      }
    };
    void load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [symbol, visible, ok]);

  const sum = useMemo(() => tapeSummary(trades), [trades]);
  const shown = minSize > 0 ? trades.filter((t) => t.qty >= minSize) : trades;

  return (
    <section className="pn tape-panel" aria-label="Time and sales">
      <header className="pn-head">
        <h3>Time and sales</h3>
        <span className="tape-symbol">{symbol}</span>
        <span className="spacer" />
        <label className="tape-filter" title="Hide trades smaller than this size">
          Min
          <input type="number" min={0} step="any" value={minSize || ""} placeholder="0" onChange={(e) => setMinSize(Math.max(0, Number(e.target.value) || 0))} />
        </label>
      </header>
      {!ok ? (
        <div className="pn-empty">Time and sales needs a Binance symbol (for example BINANCE:BTCUSDT).</div>
      ) : (
        <>
          <div className="tape-summary" aria-label="Totals of the listed trades">
            <span>
              Buy <b className="pos">{shortVolume(sum.buy)}</b>
            </span>
            <span>
              Sell <b className="neg">{shortVolume(sum.sell)}</b>
            </span>
            <span>
              Delta <b className={sum.buy - sum.sell >= 0 ? "pos" : "neg"}>{shortVolume(sum.buy - sum.sell)}</b>
            </span>
          </div>
          {error && <div className="pn-empty pn-error">{error}</div>}
          <div className="tape-head" aria-hidden>
            <span>Time (UTC)</span>
            <span>Price</span>
            <span>Size</span>
          </div>
          <ol className="tape-list">
            {shown.map((t) => (
              <li key={t.id} className={`${t.buy ? "buy" : "sell"}${t.qty >= sum.large ? " large" : ""}`} title={t.buy ? "Aggressive buy" : "Aggressive sell"}>
                <span>{hms(t.time)}</span>
                <span>{t.price}</span>
                <span>{shortVolume(t.qty)}</span>
              </li>
            ))}
          </ol>
          {!shown.length && !error && <div className="pn-empty">Waiting for trades…</div>}
        </>
      )}
    </section>
  );
}
