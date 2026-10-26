// Export actions of a chart: CSV of the bars and visible indicator outputs, PNG of the chart.

import type { Bar } from "@qt/core";
import type { ChartEngine } from "../ChartEngine";
import { formatPrice } from "../format";
import { computedLabel } from "../IndicatorSet";
import { outputStyle } from "../indicatorStyle";
import type { AxisBar } from "../transform";
import { chartCsv, downloadBlob, exportFileName, type ExportIndicator } from "./csvExport";
import { compositePng, pngHeaderLines } from "./pngExport";

/** Visible, computed indicator outputs (studies and hidden outputs are left out). */
export function visibleIndicatorOutputs(e: ChartEngine): ExportIndicator[] {
  const out: ExportIndicator[] = [];
  for (const c of e.indicators.items) {
    if (!e.indicatorShown(c) || c.def.outputs.length === 0) continue;
    const outputs = c.def.outputs
      .map((o, j) => ({ o, visible: outputStyle(e.theme, c, j, o).visible }))
      .filter((x) => x.visible)
      .map(({ o }) => ({ label: o.label, series: c.series[o.key] }));
    if (outputs.length) out.push({ label: computedLabel(c), outputs });
  }
  return out;
}

/** The chart's bars for export: transformed elements carry their real completing time. */
export function exportBars(e: ChartEngine): Bar[] {
  const bars = e.data.bars as Bar[];
  if (!e.transform) return bars.slice();
  return (bars as AxisBar[]).map((b) => ({ time: b.sourceTime, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
}

export function chartCsvText(e: ChartEngine): string {
  return chartCsv(exportBars(e), visibleIndicatorOutputs(e));
}

export function exportChartCsv(e: ChartEngine, symbol: string, interval: string): void {
  downloadBlob(new Blob([chartCsvText(e)], { type: "text/csv" }), exportFileName(symbol, interval, "csv"));
}

/** Header lines of the image: symbol line with the last OHLC, then indicators / compares. */
export function chartHeader(e: ChartEngine, symbol: string, interval: string): string[] {
  const lg = e.legend(null);
  const d = e.mainPane.ps.formatDecimals(lg?.bar.close ?? 1);
  const f = (v: number) => formatPrice(v, d);
  const title = lg ? `${symbol} · ${interval}   O ${f(lg.bar.open)}  H ${f(lg.bar.high)}  L ${f(lg.bar.low)}  C ${f(lg.bar.close)}` : `${symbol} · ${interval}`;
  const items = [
    ...(lg?.transform ? [`Transformed: ${lg.transform}`] : []),
    ...(lg?.compare ?? []).map((c) => `Compare ${c.symbol}`),
    ...(lg?.indicators ?? []).filter((i) => i.visible).map((i) => i.label),
  ];
  return pngHeaderLines(title, items);
}

export async function exportChartPng(e: ChartEngine, symbol: string, interval: string): Promise<void> {
  const blob = await compositePng([e.scene.canvas, e.ui.canvas], e.width, e.height, e.scene.dpr, chartHeader(e, symbol, interval), e.theme);
  downloadBlob(blob, exportFileName(symbol, interval, "png"));
}
