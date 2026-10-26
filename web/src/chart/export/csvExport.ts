// Chart data export: bars plus the visible indicator outputs as CSV columns. Pure.

import { barsToCsv, type Bar, type Series } from "@qt/core";

export interface ExportIndicator {
  label: string;
  outputs: { label: string; series: Series | undefined }[];
}

/** Column name → values; names are made unique ("EMA 20", "EMA 20 (2)"). */
export function indicatorColumns(items: readonly ExportIndicator[]): Record<string, Series> {
  const out: Record<string, Series> = {};
  for (const it of items) {
    for (const o of it.outputs) {
      if (!o.series) continue;
      const base = it.outputs.length > 1 ? `${it.label} ${o.label}` : it.label;
      let name = base;
      for (let k = 2; name in out; k++) name = `${base} (${k})`;
      out[name] = o.series;
    }
  }
  return out;
}

/** CSV of `bars` with indicator columns aligned 1:1 (missing values are empty fields). */
export function chartCsv(bars: readonly Bar[], items: readonly ExportIndicator[]): string {
  const cols = indicatorColumns(items);
  for (const k of Object.keys(cols)) {
    const s = cols[k];
    if (s.length !== bars.length) cols[k] = bars.map((_, i) => s[i] ?? null);
  }
  return barsToCsv(bars as Bar[], cols);
}

/** File name like "AAPL_1D_2026-10-13.csv"; characters outside [A-Za-z0-9._-] become "_". */
export function exportFileName(symbol: string, interval: string, ext: string, now = new Date()): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "chart";
  return `${clean(symbol)}_${clean(interval)}_${now.toISOString().slice(0, 10)}.${ext}`;
}

/** Hands a blob to the browser as a download. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
