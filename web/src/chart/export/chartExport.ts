// Export actions of a chart: CSV of the bars and visible indicator outputs, PNG and SVG of the chart.

import type { Bar } from "@qt/core";
import type { ChartEngine } from "../ChartEngine";
import { formatPrice } from "../format";
import { computedLabel } from "../IndicatorSet";
import { outputStyle } from "../indicatorStyle";
import type { AxisBar } from "../transform";
import { chartCsv, downloadBlob, exportFileName, type ExportIndicator } from "./csvExport";
import { compositePng, HEADER_LINE, HEADER_PAD, pngHeaderLines, pngLayout } from "./pngExport";
import { asCanvasContext, SvgContext } from "./svgContext";
import { renderScene } from "../render";
import { font } from "../theme";

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

/**
 * The chart as an SVG document: the same header as the image, then the scene (panes, series,
 * indicators, drawings, axes) rendered through a recording context. The crosshair is left out.
 */
export function chartSvg(e: ChartEngine, symbol: string, interval: string, measure: CanvasRenderingContext2D | null = null): string {
  const lines = chartHeader(e, symbol, interval);
  const L = pngLayout(e.width, e.height, 1, lines.length);
  const svg = new SvgContext(e.width, e.height + L.header, measure);
  const ctx = asCanvasContext(svg);
  const t = e.theme;
  ctx.fillStyle = t.background;
  ctx.fillRect(0, 0, e.width, e.height + L.header);
  lines.forEach((text, i) => {
    ctx.font = font(t, i === 0 ? 13 : 11, i === 0 ? 700 : 400);
    ctx.fillStyle = i === 0 ? t.text : t.axisText;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(text, HEADER_PAD, HEADER_PAD + i * HEADER_LINE + HEADER_LINE / 2);
  });
  ctx.translate(0, L.header);
  // Render the scene into the recording context instead of the canvas, then put the canvas back.
  const target = e as unknown as { scene: unknown };
  const real = target.scene;
  target.scene = { begin: () => ctx, dpr: 1, canvas: (real as { canvas: HTMLCanvasElement }).canvas };
  try {
    renderScene(e);
  } finally {
    target.scene = real;
  }
  return svg.toSvg();
}

export function exportChartSvg(e: ChartEngine, symbol: string, interval: string): void {
  const measure = document.createElement("canvas").getContext("2d");
  downloadBlob(new Blob([chartSvg(e, symbol, interval, measure)], { type: "image/svg+xml" }), exportFileName(symbol, interval, "svg"));
}

export async function exportChartPng(e: ChartEngine, symbol: string, interval: string): Promise<void> {
  const blob = await compositePng([e.scene.canvas, e.ui.canvas], e.width, e.height, e.scene.dpr, chartHeader(e, symbol, interval), e.theme);
  downloadBlob(blob, exportFileName(symbol, interval, "png"));
}
