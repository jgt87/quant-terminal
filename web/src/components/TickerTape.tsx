// Ticker tape: a scrolling strip of the first watchlist's symbols with last price and change,
// under the toolbar. Hovering pauses it; a click loads the symbol in the active chart. Quotes
// refresh every 15 s while the page is visible; with reduced motion the strip scrolls by hand.

import { useEffect, useState } from "react";
import type { Quote } from "@qt/core";
import { getQuotes, getWatchlists } from "../api/client";
import { formatPrice, formatSigned } from "../chart/format";

const REFRESH_MS = 15_000;
/** At most this many symbols ride on the tape. */
export const MAX_TAPE_SYMBOLS = 40;

/** Symbols for the tape: the first watchlist's, without blanks or duplicates. */
export function tapeSymbols(lists: readonly { symbols: string[] }[]): string[] {
  const out: string[] = [];
  for (const s of lists[0]?.symbols ?? []) {
    const t = s.trim();
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_TAPE_SYMBOLS) break;
  }
  return out;
}

export function TickerTape({ onSelect }: { onSelect(symbol: string): void }) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());

  useEffect(() => {
    let alive = true;
    const load = () => getWatchlists().then((l) => alive && setSymbols(tapeSymbols(l)), () => undefined);
    void load();
    const t = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!symbols.length) return;
    const ctrl = new AbortController();
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      getQuotes(symbols, ctrl.signal).then((q) => setQuotes(new Map(q.map((x) => [x.symbol, x]))), () => undefined);
    };
    refresh();
    const t = window.setInterval(refresh, REFRESH_MS);
    return () => {
      ctrl.abort();
      window.clearInterval(t);
    };
  }, [symbols]);

  if (!symbols.length) return <div className="ticker-tape empty">Add symbols to your first watchlist to fill the ticker tape.</div>;
  const items = (copy: boolean) =>
    symbols.map((s) => {
      const q = quotes.get(s);
      const dir = !q || q.change === 0 ? "" : q.change > 0 ? "pos" : "neg";
      return (
        <button key={s} type="button" className="tt-item" tabIndex={copy ? -1 : undefined} onClick={() => onSelect(s)} title={`Open ${s}`}>
          <span className="tt-sym">{s}</span>
          <span className="tt-last">{q ? formatPrice(q.last) : "—"}</span>
          <span className={`tt-chg ${dir}`}>{q ? formatSigned(q.changePct, 2, "%") : ""}</span>
        </button>
      );
    });
  // Two copies side by side make the loop seamless; the second is hidden from assistive tech.
  const duration = Math.max(20, symbols.length * 4);
  return (
    <div className="ticker-tape" role="region" aria-label="Ticker tape">
      <div className="tt-track" style={{ animationDuration: `${duration}s` }}>
        <div className="tt-run">{items(false)}</div>
        <div className="tt-run" aria-hidden="true">
          {items(true)}
        </div>
      </div>
    </div>
  );
}
