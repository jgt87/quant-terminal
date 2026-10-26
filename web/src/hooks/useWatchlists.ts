// Persistent watchlists plus polled quotes for the active list; MT5 symbols also stream ticks.

import { useCallback, useEffect, useState } from "react";
import type { Quote, Watchlist } from "@qt/core";
import { getQuotes, getWatchlists, isAbort, putWatchlists } from "../api/client";
import defaults from "../config/defaultWatchlists.json";
import settings from "../config/settings.json";
import { isLiveSymbol, tickPrice, type LiveTick } from "../chart/liveTick";
import { useTickStream } from "./useTickStream";

export function useWatchlists() {
  const [lists, setLists] = useState<Watchlist[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWatchlists()
      .then((l) => {
        if (Array.isArray(l) && l.length > 0) setLists(l);
        else {
          setLists(defaults);
          putWatchlists(defaults).catch(() => setError("Could not save watchlists"));
        }
      })
      .catch(() => {
        setLists(defaults);
        setError("Watchlists unavailable");
      });
  }, []);

  const save = useCallback((next: Watchlist[]) => {
    setLists(next);
    putWatchlists(next)
      .then(() => setError(null))
      .catch(() => setError("Could not save watchlists"));
  }, []);

  return { lists, save, error };
}

export function useQuotes(symbols: string[]): Map<string, Quote> {
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const key = symbols.join(",");

  useEffect(() => {
    const list = key ? key.split(",") : [];
    if (list.length === 0) return;
    const ctrl = new AbortController();
    let timer: number | undefined;
    const load = async () => {
      try {
        const qs = await getQuotes(list, ctrl.signal);
        setQuotes((prev) => {
          const m = new Map(prev);
          for (const q of qs) m.set(q.symbol, q);
          return m;
        });
      } catch (e) {
        if (isAbort(e)) return;
      }
      if (!ctrl.signal.aborted) timer = window.setTimeout(load, settings.quotesPollMs);
    };
    load();
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [key]);

  // Live last price; the change is measured against the previous close known from the poll.
  const live = key ? key.split(",").filter((s) => isLiveSymbol(s)) : [];
  useTickStream(live, (t: LiveTick) => {
    const price = tickPrice(t);
    if (!Number.isFinite(price) || price <= 0) return;
    setQuotes((prev) => {
      const sym = live.find((s) => s.toUpperCase() === t.symbol.toUpperCase());
      const q = sym ? prev.get(sym) : undefined;
      if (!sym || !q || q.last === price) return prev;
      const prevClose = q.last - q.change;
      const m = new Map(prev);
      m.set(sym, { ...q, last: price, change: price - prevClose, changePct: prevClose ? ((price - prevClose) / prevClose) * 100 : 0, time: t.time });
      return m;
    });
  });

  return quotes;
}
