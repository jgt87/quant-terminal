// CSV export (RFC 4180): comma separator, CRLF line endings, a header row, and fields
// quoted with double quotes (inner quotes doubled) when they contain a comma, a double
// quote, CR or LF. Times are ISO 8601 UTC (e.g. 2024-01-02T00:00:00.000Z). null,
// undefined and non-finite numbers are written as empty fields.

import type { BacktestMetrics, Bar, Series, Trade } from "../types";

export function csvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" && !Number.isFinite(v)) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(fields: unknown[]): string {
  return fields.map(csvField).join(",");
}

const iso = (t: number) => (Number.isFinite(t) ? new Date(t * 1000).toISOString() : "");

function lines(rows: unknown[][]): string {
  return rows.map(csvRow).join("\r\n") + "\r\n";
}

/** Bars plus optional extra series (aligned 1:1 with bars) as extra columns, keyed by name. */
export function barsToCsv(bars: Bar[], extraSeries: Record<string, Series> = {}): string {
  const keys = Object.keys(extraSeries);
  const rows: unknown[][] = [["time", "open", "high", "low", "close", "volume", ...keys]];
  bars.forEach((b, i) => rows.push([iso(b.time), b.open, b.high, b.low, b.close, b.volume, ...keys.map((k) => extraSeries[k][i])]));
  return lines(rows);
}

const TRADE_COLUMNS = [
  "side",
  "entryIndex",
  "entryTime",
  "entryPrice",
  "exitIndex",
  "exitTime",
  "exitPrice",
  "qty",
  "pnl",
  "pnlPct",
  "fees",
  "barsHeld",
  "exitReason",
] as const satisfies readonly (keyof Trade)[];

export function tradesToCsv(trades: Trade[]): string {
  const rows: unknown[][] = [[...TRADE_COLUMNS]];
  for (const t of trades) rows.push(TRADE_COLUMNS.map((k) => (k === "entryTime" || k === "exitTime" ? iso(t[k]) : t[k])));
  return lines(rows);
}

/** One row per metric: `metric,value`. */
export function metricsToCsv(metrics: BacktestMetrics): string {
  const rows: unknown[][] = [["metric", "value"]];
  for (const [k, v] of Object.entries(metrics)) rows.push([k, v]);
  return lines(rows);
}
