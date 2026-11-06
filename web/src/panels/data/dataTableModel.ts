// Data table model: the active chart's bars and visible indicator outputs as columns and rows,
// newest bar first.

import type { Bar, Series } from "@qt/core";
import type { ExportIndicator } from "../../chart/export/csvExport";

export interface DataColumn {
  key: string;
  label: string;
  /** Value of row `i` (bar index), null when missing. */
  value(i: number): number | null;
  /** Price-like columns use the chart's price format; others a compact number. */
  kind: "price" | "volume" | "value";
}

export function dataColumns(bars: readonly Bar[], indicators: readonly ExportIndicator[]): DataColumn[] {
  const cols: DataColumn[] = [
    { key: "open", label: "Open", kind: "price", value: (i) => bars[i]?.open ?? null },
    { key: "high", label: "High", kind: "price", value: (i) => bars[i]?.high ?? null },
    { key: "low", label: "Low", kind: "price", value: (i) => bars[i]?.low ?? null },
    { key: "close", label: "Close", kind: "price", value: (i) => bars[i]?.close ?? null },
    { key: "volume", label: "Volume", kind: "volume", value: (i) => bars[i]?.volume ?? null },
  ];
  indicators.forEach((ind, k) => {
    ind.outputs.forEach((o, j) => {
      const s: Series | undefined = o.series;
      const label = ind.outputs.length === 1 ? ind.label : `${ind.label} · ${o.label}`;
      cols.push({ key: `ind${k}-${j}`, label, kind: "value", value: (i) => (s && i < s.length ? (s[i] ?? null) : null) });
    });
  });
  return cols;
}

/** Bar index of display row `row` (row 0 = newest bar). */
export const rowToIndex = (row: number, count: number): number => count - 1 - row;

/** Rows to render for a scroll position: a window around the visible rows. */
export function visibleRows(scrollTop: number, viewHeight: number, rowHeight: number, count: number, overscan = 8): { first: number; last: number } {
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const last = Math.min(count - 1, Math.ceil((scrollTop + viewHeight) / rowHeight) + overscan);
  return { first, last };
}
