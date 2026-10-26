// Pure watchlist extras: import/export (.txt one symbol per line, CSV), column ids, flags.

import { csvRow, FLAG_COLORS, type FlagColor, type Quote, type ScreenerField, type Watchlist } from "@qt/core";
import { parseCsv } from "../common/csv";
import meta from "./columns.json";

export type QuoteColumn = "last" | "chg" | "chgPct";
export type WatchColumn = QuoteColumn | ScreenerField;
export interface ColumnDef {
  id: WatchColumn;
  label: string;
  short: string;
  source: "quote" | "screener";
}

export const WATCH_COLUMNS = meta.columns as ColumnDef[];
export const DEFAULT_WATCH_COLUMNS = meta.defaults as WatchColumn[];
export const columnDef = (id: WatchColumn) => WATCH_COLUMNS.find((c) => c.id === id) ?? { id, label: id, short: id, source: "screener" as const };
export const screenerColumns = (cols: WatchColumn[]) => cols.filter((c) => columnDef(c).source === "screener") as ScreenerField[];

export { FLAG_COLORS };
export const isFlag = (v: unknown): v is FlagColor => FLAG_COLORS.includes(v as FlagColor);

const SYMBOL_RE = /^[\w^.=:\-/!&]{1,64}$/;
const cleanSymbol = (s: string) => s.trim().replace(/^"|"$/g, "");

/** Symbols (and optional flags) from a .txt (one per line, `#` comments) or .csv file. */
export function parseSymbolFile(text: string, filename = ""): { symbols: string[]; flags: Record<string, FlagColor>; skipped: string[] } {
  const symbols: string[] = [];
  const flags: Record<string, FlagColor> = {};
  const skipped: string[] = [];
  const add = (raw: string, flag?: string) => {
    const s = cleanSymbol(raw);
    if (!s) return;
    if (!SYMBOL_RE.test(s)) {
      skipped.push(s);
      return;
    }
    if (!symbols.includes(s)) symbols.push(s);
    const f = flag?.trim().toLowerCase();
    if (isFlag(f)) flags[s] = f;
  };
  const isCsv = /\.csv$/i.test(filename) || (!/\.txt$/i.test(filename) && /,/.test(text.split(/\r?\n/, 1)[0] ?? ""));
  if (isCsv) {
    const rows = parseCsv(text);
    if (rows.length === 0) return { symbols, flags, skipped };
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const hasHeader = head.includes("symbol");
    const si = hasHeader ? head.indexOf("symbol") : 0;
    const fi = hasHeader ? head.indexOf("flag") : -1;
    for (const r of hasHeader ? rows.slice(1) : rows) add(r[si] ?? "", fi >= 0 ? r[fi] : undefined);
  } else {
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      // Also accept comma/space separated lists on one line.
      for (const part of t.split(/[,\s;]+/)) add(part);
    }
  }
  return { symbols, flags, skipped };
}

export function watchlistToTxt(w: Watchlist): string {
  return w.symbols.join("\n") + "\n";
}

/** CSV with symbol, flag and the given column values (RFC 4180, CRLF). */
export function watchlistToCsv(w: Watchlist, columns: WatchColumn[] = [], value: (symbol: string, col: WatchColumn) => number | null = () => null): string {
  const rows = [csvRow(["symbol", "flag", ...columns])];
  for (const s of w.symbols) rows.push(csvRow([s, w.flags?.[s] ?? "", ...columns.map((c) => value(s, c))]));
  return rows.join("\r\n") + "\r\n";
}

/** Merge imported symbols into a list (append new ones, imported flags win). */
export function mergeIntoList(w: Watchlist, symbols: string[], flags: Record<string, FlagColor>): Watchlist {
  const next = [...w.symbols];
  for (const s of symbols) if (!next.includes(s)) next.push(s);
  const mergedFlags = { ...(w.flags ?? {}), ...flags };
  return withFlags({ ...w, symbols: next }, mergedFlags);
}

/** Set or clear one symbol's flag. */
export function setFlag(w: Watchlist, symbol: string, flag: FlagColor | null): Watchlist {
  const flags = { ...(w.flags ?? {}) };
  if (flag) flags[symbol] = flag;
  else delete flags[symbol];
  return withFlags(w, flags);
}

/** Watchlist with flags limited to its symbols; `flags` is omitted when empty. */
export function withFlags(w: Watchlist, flags: Record<string, FlagColor>): Watchlist {
  const kept = Object.fromEntries(Object.entries(flags).filter(([s]) => w.symbols.includes(s)));
  const { flags: _old, ...rest } = w;
  return Object.keys(kept).length ? { ...rest, flags: kept } : rest;
}

/** Value of a quote column. */
export function quoteValue(q: Quote | undefined, col: QuoteColumn): number | null {
  if (!q) return null;
  return col === "last" ? q.last : col === "chg" ? q.change : q.changePct;
}
