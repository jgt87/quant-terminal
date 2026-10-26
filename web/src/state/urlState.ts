// URL deep links: `?symbol=AAPL&interval=1h` loads into the active cell, `?tab=<id>` selects a
// tab, `?layout=<id>` binds the active cell to that layout (as before). The app keeps the URL in
// sync with the active cell via replaceState; `layout` is dropped once applied.

import { INTERVAL_SECONDS, type Interval } from "@qt/core";

export interface UrlState {
  tab?: string;
  symbol?: string;
  interval?: Interval;
  layout?: string;
}

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const SYMBOL_RE = /^[A-Za-z0-9:._=^/!&-]{1,64}$/;

export function isInterval(v: unknown): v is Interval {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(INTERVAL_SECONDS, v);
}

export function parseUrlState(search: string): UrlState {
  const p = new URLSearchParams(search);
  const out: UrlState = {};
  const tab = p.get("tab");
  if (tab && ID_RE.test(tab)) out.tab = tab;
  const layout = p.get("layout");
  if (layout && ID_RE.test(layout)) out.layout = layout;
  const symbol = p.get("symbol")?.trim();
  if (symbol && SYMBOL_RE.test(symbol)) out.symbol = symbol;
  const interval = p.get("interval");
  if (isInterval(interval)) out.interval = interval;
  return out;
}

/** The search string for the current view; unrelated parameters are kept, `layout` removed. */
export function serializeUrlState(search: string, s: { tab: string; symbol: string; interval: Interval }): string {
  const p = new URLSearchParams(search);
  p.delete("layout");
  p.set("tab", s.tab);
  p.set("symbol", s.symbol);
  p.set("interval", s.interval);
  // Readable symbols (":" and "^" need no escaping in a query value).
  const q = p.toString().replace(/%3A/gi, ":").replace(/%5E/gi, "^");
  return q ? `?${q}` : "";
}
