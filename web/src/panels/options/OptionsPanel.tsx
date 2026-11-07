// Options panel (Binance options, public market data): the chain of one expiry around the money
// with bid / ask, implied volatility and delta per call and put, open interest or volume by strike
// as bars, the put / call ratios, the volatility smile and the term structure. Market data only.

import { useEffect, useMemo, useRef, useState } from "react";
import { atmIv, atmStrike, putCallRatio, smile, type OptionChain, type OptionQuote } from "@qt/core";
import { errorText } from "../../api/http";
import { fetchOptionChain, fetchOptionUnderlyings } from "../../api/options";
import { loadLocal, saveLocal } from "../common/storage";
import { SmileChart, TermChart } from "./OptionsCharts";
import { expiryLabel, inTheMoney, measureMax, rowsAroundMoney, shortNumber, type OptionMeasure } from "./optionsModel";
import "./options.css";

const POLL_MS = 15_000;
const SIDE_ROWS = 12;
const MEASURE_KEY = "qt.options.measure";

const fmt = (v: number | null | undefined, d = 2) => (v == null ? "" : v.toFixed(d));
const pct = (v: number | null | undefined) => (v == null ? "" : `${(v * 100).toFixed(1)}`);

export function OptionsPanel({ symbol, visible }: { symbol: string; visible: boolean }) {
  const [underlyings, setUnderlyings] = useState<{ underlying: string; symbol: string }[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<number | undefined>(undefined);
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [measure, setMeasure] = useState<OptionMeasure>(() => loadLocal<OptionMeasure>(MEASURE_KEY, "openInterest"));
  const atmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || underlyings.length) return;
    fetchOptionUnderlyings()
      .then((r) => setUnderlyings(r.underlyings))
      .catch((e) => setError(errorText(e)));
  }, [visible, underlyings.length]);

  // Follow the active chart when it has listed options; otherwise keep the choice (BTC first).
  const fromChart = useMemo(() => {
    const s = symbol.trim().toUpperCase().replace(/^BINANCE:/, "");
    return underlyings.find((u) => u.underlying === s || u.underlying === `${s}USDT`)?.underlying ?? null;
  }, [symbol, underlyings]);
  const underlying = chosen ?? fromChart ?? underlyings.find((u) => u.underlying === "BTCUSDT")?.underlying ?? underlyings[0]?.underlying ?? null;

  useEffect(() => {
    setChosen(null);
  }, [fromChart]);
  useEffect(() => {
    setExpiry(undefined);
    setChain(null);
  }, [underlying]);

  useEffect(() => {
    if (!visible || !underlying) return;
    let alive = true;
    const load = () =>
      fetchOptionChain(`BINANCE:${underlying}`, expiry)
        .then((c) => {
          if (!alive) return;
          setChain(c);
          setError(null);
        })
        .catch((e) => alive && setError(errorText(e)));
    void load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [visible, underlying, expiry]);

  const index = chain?.index ?? null;
  const atm = chain ? atmStrike(chain.rows, index) : null;
  const rows = chain ? rowsAroundMoney(chain.rows, atm, SIDE_ROWS) : [];
  const max = measureMax(rows, measure);
  const now = chain?.time ?? Date.now();

  useEffect(() => {
    atmRef.current?.scrollIntoView({ block: "center" });
  }, [atm, chain?.expiry?.time]);

  const cells = (q: OptionQuote | null, side: "call" | "put", itm: boolean) => {
    const c = `opt-cell ${side}${itm ? " itm" : ""}`;
    const v = [
      <span key="bid" className={c}>{fmt(q?.bid)}</span>,
      <span key="ask" className={c}>{fmt(q?.ask)}</span>,
      <span key="iv" className={c}>{pct(q?.iv)}</span>,
      <span key="d" className={c}>{fmt(q?.delta, 2)}</span>,
    ];
    return side === "call" ? v : v.reverse();
  };
  const bar = (q: OptionQuote | null, side: "call" | "put", itm: boolean) => {
    const val = q?.[measure] ?? 0;
    return (
      <span className={`opt-bar ${side}${itm ? " itm" : ""}`} title={`${side === "call" ? "Calls" : "Puts"} ${measure === "openInterest" ? "Open interest" : "Volume"}: ${val}`}>
        <i style={{ width: max > 0 ? `${Math.round((val / max) * 100)}%` : 0 }} />
        <b>{val > 0 ? shortNumber(val) : ""}</b>
      </span>
    );
  };

  return (
    <section className="pn opt-panel" aria-label="Options">
      <header className="pn-head">
        <h3>Options</h3>
        <select value={underlying ?? ""} onChange={(e) => setChosen(e.target.value)} aria-label="Underlying">
          {underlyings.map((u) => (
            <option key={u.underlying} value={u.underlying}>
              {u.underlying.replace(/USDT$/, "")}
            </option>
          ))}
        </select>
        <select value={chain?.expiry?.time ?? ""} onChange={(e) => setExpiry(Number(e.target.value))} aria-label="Expiry">
          {chain?.expiries.map((x) => (
            <option key={x.time} value={x.time}>
              {expiryLabel(x.time, now)}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <select
          value={measure}
          onChange={(e) => {
            const m = e.target.value as OptionMeasure;
            setMeasure(m);
            saveLocal(MEASURE_KEY, m);
          }}
          aria-label="Bars"
        >
          <option value="openInterest">Open interest</option>
          <option value="volume">Volume</option>
        </select>
      </header>
      {error && <div className="pn-error">{error}</div>}
      {chain && (
        <div className="opt-summary">
          <span>
            Index <b>{fmt(index, index != null && index < 10 ? 4 : 2)}</b>
          </span>
          <span>
            ATM IV <b>{pct(atmIv(chain.rows, index))}%</b>
          </span>
          <span title="Put / call ratio of open interest">
            P/C OI <b>{fmt(putCallRatio(chain.rows, "openInterest"))}</b>
          </span>
          <span title="Put / call ratio of volume">
            P/C Vol <b>{fmt(putCallRatio(chain.rows, "volume"))}</b>
          </span>
        </div>
      )}
      {chain && (
        <div className="opt-charts">
          <SmileChart points={smile(chain.rows, index)} index={index} title="Volatility smile" />
          <TermChart points={chain.term} now={now} title="Term structure (ATM IV)" />
        </div>
      )}
      <div className="opt-head" role="row">
        <span>{measure === "openInterest" ? "OI" : "Vol"}</span>
        <span>Bid</span>
        <span>Ask</span>
        <span>IV</span>
        <span>Δ</span>
        <span className="opt-strike">Strike</span>
        <span>Δ</span>
        <span>IV</span>
        <span>Ask</span>
        <span>Bid</span>
        <span>{measure === "openInterest" ? "OI" : "Vol"}</span>
      </div>
      <div className="opt-table" role="grid" aria-label="Option chain">
        {!chain && !error && <div className="pn-empty">Loading the option chain…</div>}
        {rows.map((r) => (
          <div key={r.strike} ref={r.strike === atm ? atmRef : undefined} className={`opt-row${r.strike === atm ? " atm" : ""}`} role="row">
            {bar(r.call, "call", inTheMoney("call", r.strike, index))}
            {cells(r.call, "call", inTheMoney("call", r.strike, index))}
            <span className="opt-strike">{shortNumber(r.strike)}</span>
            {cells(r.put, "put", inTheMoney("put", r.strike, index))}
            {bar(r.put, "put", inTheMoney("put", r.strike, index))}
          </div>
        ))}
      </div>
      <footer className="opt-foot">Binance options, market data only. Shaded: in the money. IV in percent.</footer>
    </section>
  );
}
