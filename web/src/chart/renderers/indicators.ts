// Indicator outputs: lines, dots, histograms and bands (with fill between upper and lower),
// plus horizontal guide levels.

import type { Bar, Series } from "@qt/core";
import { crisp, hairline, snap } from "../canvas";
import type { ComputedIndicator } from "../IndicatorSet";
import { bandFill, outputStyle } from "../indicatorStyle";
import { withAlpha } from "../theme";
import { traceSeries } from "./line";
import type { PaneRenderCtx } from "./types";

export function drawIndicator(rc: PaneRenderCtx, ind: ComputedIndicator, bars: readonly Bar[]): void {
  if (!ind.visible) return;
  const { ctx, from, to } = rc;
  const a = Math.max(0, from - 1);
  const b = Math.min(bars.length - 1, to + 1);
  if (a > b) return;
  const outs = ind.def.outputs;

  // Band fill first so lines sit on top.
  const upper = outs.find((o) => o.style === "band-upper");
  const lower = outs.find((o) => o.style === "band-lower");
  if (upper && lower && ind.series[upper.key] && ind.series[lower.key]) {
    const uj = outs.indexOf(upper);
    const ust = outputStyle(rc.theme, ind, uj, upper);
    if (ust.visible) fillBetween(rc, ind.series[upper.key], ind.series[lower.key], a, b, bandFill(ind) ?? withAlpha(ust.color, 0.08));
  }

  outs.forEach((out, j) => {
    const values = ind.series[out.key];
    if (!values) return;
    const st = outputStyle(rc.theme, ind, j, out);
    if (!st.visible) return;
    if (out.style === "histogram") {
      drawHistogram(rc, values, a, b, ind.def.id === "volume" ? bars : null, ind.style?.outputs?.[out.key]?.color);
      return;
    }
    if (out.style === "dots") {
      ctx.fillStyle = st.color;
      for (let i = a; i <= b; i++) {
        const v = values[i];
        if (v == null) continue;
        ctx.fillRect(rc.ts.indexToX(i) - 1, rc.ps.toY(v) - 1, 2, 2);
      }
      return;
    }
    ctx.beginPath();
    traceSeries(rc, values, a, b);
    ctx.strokeStyle = st.color;
    ctx.lineWidth = st.width;
    ctx.lineJoin = "round";
    ctx.setLineDash(st.dash);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

function fillBetween(rc: PaneRenderCtx, up: Series, lo: Series, a: number, b: number, fill: string): void {
  const { ctx, ts, ps } = rc;
  ctx.fillStyle = fill;
  let i = a;
  while (i <= b) {
    while (i <= b && (up[i] == null || lo[i] == null)) i++;
    const start = i;
    while (i <= b && up[i] != null && lo[i] != null) i++;
    const end = i - 1;
    if (end <= start) continue;
    ctx.beginPath();
    for (let k = start; k <= end; k++) {
      const x = ts.indexToX(k);
      const y = ps.toY(up[k] as number);
      if (k === start) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let k = end; k >= start; k--) ctx.lineTo(ts.indexToX(k), ps.toY(lo[k] as number));
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Histogram from zero. Volume: colored by bar direction. Otherwise green above / red below zero,
 * with lighter shades while the bars shrink toward zero (momentum fading). A user color
 * override paints every bar in that color.
 */
function drawHistogram(rc: PaneRenderCtx, values: Series, a: number, b: number, bars: readonly Bar[] | null, override?: string): void {
  const { ctx, ts, ps, dpr, theme } = rc;
  const w = Math.max(1 / dpr, snap(ts.barSpacing * 0.62, dpr));
  const y0 = ps.toY(0);
  const shade = (i: number, v: number): number => {
    if (bars) return bars[i].close >= bars[i].open ? 0 : 2;
    const prev = values[i - 1];
    const fading = prev != null && isFinite(prev) && Math.abs(v) < Math.abs(prev);
    return (v >= 0 ? 0 : 2) + (fading ? 1 : 0);
  };
  const fills = bars
    ? [theme.volumeUp, theme.volumeUp, theme.volumeDown, theme.volumeDown]
    : [theme.histUp, theme.histUpFalling, theme.histDown, theme.histDownRising];
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = override ?? fills[k];
    for (let i = a; i <= b; i++) {
      const v = values[i];
      if (v == null || !isFinite(v)) continue;
      if (shade(i, v) !== k) continue;
      const y = ps.toY(v);
      const top = snap(Math.min(y, y0), dpr);
      const bot = snap(Math.max(y, y0), dpr);
      ctx.fillRect(snap(ts.indexToX(i) - w / 2, dpr), top, w, Math.max(1 / dpr, bot - top));
    }
  }
}

/** Faint band between two guide levels (e.g. RSI 30..70). */
export function drawLevelBand(rc: PaneRenderCtx, lo: number, hi: number, fill: string): void {
  const { ctx, ps, width } = rc;
  const y1 = ps.toY(hi);
  const y2 = ps.toY(lo);
  ctx.fillStyle = fill;
  ctx.fillRect(0, Math.min(y1, y2), width, Math.abs(y2 - y1));
}

export function drawLevels(rc: PaneRenderCtx, levels: number[]): void {
  const { ctx, ps, width, dpr, theme } = rc;
  ctx.strokeStyle = theme.level;
  ctx.lineWidth = hairline(dpr);
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (const lv of levels) {
    const y = crisp(ps.toY(lv), dpr);
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}
