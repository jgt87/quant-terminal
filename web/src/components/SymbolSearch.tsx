// Symbol search dialog: debounced server search, keyboard navigation, Enter picks.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { isExpression, type SymbolInfo } from "@qt/core";
import { isAbort, LatestRequest, searchSymbols } from "../api/client";
import { Dialog } from "./Dialog";
import { Icon } from "./icons";

interface Props {
  initial: string;
  title?: string;
  onPick(symbol: string): void;
  onClose(): void;
}

export function SymbolSearch({ initial, title = "Symbol search", onPick, onClose }: Props) {
  const [q, setQ] = useState(initial);
  const [results, setResults] = useState<SymbolInfo[]>([]);
  /** The term `results` belong to; results for an older term never win over typed text. */
  const [resultsFor, setResultsFor] = useState("");
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const req = useRef(new LatestRequest());
  const input = useRef<HTMLInputElement>(null);

  // Characters typed on the chart before this input had focus arrive through `initial`.
  const lastInitial = useRef(initial);
  useEffect(() => {
    if (initial === lastInitial.current) return;
    lastInitial.current = initial;
    setQ(initial);
  }, [initial]);

  useEffect(() => {
    input.current?.focus();
    const len = input.current?.value.length ?? 0;
    input.current?.setSelectionRange(len, len);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      setResultsFor("");
      setStatus("idle");
      return;
    }
    const t = window.setTimeout(() => {
      setStatus("loading");
      req.current
        .run((signal) => searchSymbols(term, signal))
        .then((r) => {
          setResults(r);
          setResultsFor(term);
          setActive(0);
          setStatus("idle");
        })
        .catch((e) => !isAbort(e) && setStatus("error"));
    }, 150);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => () => req.current.abort(), []);

  const pick = (s: string) => {
    onPick(s);
    onClose();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const raw = q.trim();
      if (!raw) return;
      // Spread / ratio formulas (e.g. AAPL/MSFT) open as a formula chart.
      if (isExpression(raw)) return pick(raw);
      // Fresh results: exact symbol match first, else the highlighted row. While results are
      // loading, stale or empty, the typed text is taken as the symbol.
      const fresh = resultsFor === raw ? results : [];
      const exact = fresh.find((x) => x.symbol.toUpperCase() === raw.toUpperCase());
      const r = exact ?? fresh[active];
      pick(r ? r.symbol : raw.toUpperCase());
    }
  };

  return (
    <Dialog title={title} onClose={onClose} width={560}>
      <div className="search-box">
        <Icon name="search" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          aria-label="Symbol"
          placeholder="Symbol, name or formula, e.g. AAPL, ^NDX, EURUSD=X, AAPL/MSFT"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <ul className="search-results" role="listbox">
        {isExpression(q.trim()) && (
          <li role="option" aria-selected="true" aria-label={`Formula ${q.trim()}`} className="active formula" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(q.trim())}>
            <span className="sr-symbol">{q.trim()}</span>
            <span className="sr-name">Formula chart: press Enter to open</span>
            <span className="sr-type">formula</span>
          </li>
        )}
        {results.map((r, i) => (
          <li
            key={r.symbol}
            role="option"
            aria-selected={i === active}
            aria-label={r.symbol}
            className={i === active ? "active" : ""}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(r.symbol)}
          >
            <span className="sr-symbol">{r.symbol}</span>
            <span className="sr-name">{r.name}</span>
            <span className="sr-type">{r.type}</span>
            <span className="sr-exch">{r.exchange}</span>
          </li>
        ))}
        {q.trim() && results.length === 0 && (
          <li className="search-empty">
            {status === "loading" ? "Searching…" : status === "error" ? "Search unavailable" : "No matches. Press Enter to open as typed."}
          </li>
        )}
      </ul>
    </Dialog>
  );
}
