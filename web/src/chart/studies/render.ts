// Draws the built-in studies on the price pane and hit-tests their geometry (context menu).

import { distanceToSegment, fibLevels, volumeProfile, type Anchor, type CandlePattern, type ChartPattern, type Drawing, type PriceGap, type SrLevel } from "@qt/core";
import candleNames from "../../config/candlePatterns.json";
import { crisp, hairline } from "../canvas";
import type { ChartEngine } from "../ChartEngine";
import { drawDrawing } from "../drawings/render";
import type { ComputedIndicator } from "../IndicatorSet";
import { drawTpo, drawVolumeProfile } from "../renderers/profile";
import type { PaneRenderCtx } from "../renderers/types";
import { font } from "../theme";
import type { StudyResult } from "./compute";
import { isStudy } from "./defs";

const NAMES = candleNames as Record<string, { abbr: string; label: string }>;

export function candleLabel(name: string): string {
  return NAMES[name]?.label ?? name.replace(/-/g, " ");
}

export function chartPatternLabel(name: string): string {
  const s = name.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Overlay studies of the price pane with their results. */
export function mainStudies(e: ChartEngine): { c: ComputedIndicator; r: StudyResult }[] {
  const out: { c: ComputedIndicator; r: StudyResult }[] = [];
  for (const uid of e.mainPane.uids) {
    const c = e.indicators.get(uid);
    if (!c || !isStudy(c.def) || !e.indicatorShown(c)) continue;
    out.push({ c, r: e.studyResult(c) });
  }
  return out;
}

export function drawStudies(e: ChartEngine, rc: PaneRenderCtx): void {
  for (const { c, r } of mainStudies(e)) {
    if (!isStudy(c.def)) continue;
    switch (c.def.study) {
      case "vp-visible":
        drawVisibleProfile(e, rc, c);
        break;
      case "vp-session":
        for (const p of r.sessions ?? []) {
          if (p.endIndex < rc.from - 1 || p.startIndex > rc.to + 1) continue;
          const x0 = e.ts.indexToX(p.startIndex) - e.ts.barSpacing / 2;
          const x1 = e.ts.indexToX(p.endIndex) + e.ts.barSpacing / 2;
          drawVolumeProfile(rc, p, x0, (x1 - x0) * 0.85, 1, [x0, x1]);
        }
        break;
      case "tpo":
        for (const s of r.tpo ?? []) {
          if (s.endIndex < rc.from - 1 || s.startIndex > rc.to + 1) continue;
          const x0 = e.ts.indexToX(s.startIndex);
          const x1 = e.ts.indexToX(s.endIndex);
          drawTpo(rc, s, x0, Math.max(20, x1 - x0));
        }
        break;
      case "candle-patterns":
        drawCandlePatterns(e, rc, r.candles ?? []);
        break;
      case "chart-patterns":
        for (const p of visiblePatterns(r.patterns ?? [], rc.from, rc.to)) drawChartPattern(e, rc, p);
        break;
      case "zigzag":
        drawPolyline(rc, (r.pivots ?? []).map((p) => e.toPx(p)), e.theme.zigzag, 1.5);
        break;
      case "gaps":
        drawGaps(e, rc, r.gaps ?? []);
        break;
      case "support-resistance":
        drawLevels(e, rc, r.levels ?? []);
        break;
      case "autofib": {
        const d = autoFibDrawing(e, r);
        if (d) drawDrawing(rc, d, { toPx: (a) => e.toPx(a), selected: false, hovered: false, intervalSec: e.meta.intervalSec, formatPrice: (v) => e.mainPane.ps.format(v), priceDecimals: 2 });
        break;
      }
    }
  }
}

/** The auto fib as a (transient) fib drawing in the study color. */
export function autoFibDrawing(e: ChartEngine, r: StudyResult): Drawing | null {
  if (!r.fib) return null;
  return { id: "__autofib", type: "fib", anchors: [r.fib.a, r.fib.b], style: { color: e.theme.autoFib, fillOpacity: 0.06 } };
}

function drawVisibleProfile(e: ChartEngine, rc: PaneRenderCtx, c: ComputedIndicator): void {
  if (rc.from > rc.to) return;
  const rows = Math.max(1, Math.round(Number(c.inputs.rows) || 24));
  const p = volumeProfile(e.data.bars as never, rc.from, rc.to, rows, Number(c.inputs.valueArea) || 70);
  const w = (rc.width * Math.max(5, Math.min(80, Number(c.inputs.width) || 25))) / 100;
  drawVolumeProfile(rc, p, rc.width, w, -1, [0, rc.width]);
}

/**
 * Gap zones: from the bar that opened the gap to the bar that filled it (or the right edge while
 * open). An open gap shows the part still unfilled; a filled one (when shown) its original zone.
 */
function drawGaps(e: ChartEngine, rc: PaneRenderCtx, gaps: PriceGap[]): void {
  const { ctx, dpr, theme } = rc;
  const half = e.ts.barSpacing / 2;
  ctx.lineWidth = hairline(dpr);
  for (const g of gaps) {
    const end = g.filledIndex ?? Infinity;
    if (end < rc.from - 1 || g.index > rc.to + 1) continue;
    const x0 = e.ts.indexToX(g.index) - half;
    const x1 = g.filledIndex === null ? rc.width : e.ts.indexToX(g.filledIndex) + half;
    const top = g.openTop ?? g.top;
    const bottom = g.openBottom ?? g.bottom;
    const y0 = rc.ps.toY(top);
    const y1 = rc.ps.toY(bottom);
    const y = Math.min(y0, y1);
    const h = Math.max(1, Math.abs(y1 - y0));
    ctx.fillStyle = g.up ? theme.gapUp : theme.gapDown;
    ctx.globalAlpha = g.filledIndex === null ? 1 : 0.5;
    ctx.fillRect(x0, y, x1 - x0, h);
    ctx.strokeStyle = theme.gapBorder;
    ctx.strokeRect(crisp(x0, dpr), crisp(y, dpr), x1 - x0, h);
    ctx.globalAlpha = 1;
  }
}

/**
 * Support and resistance levels: a line from the first swing point of the level to the right
 * edge, thicker the more often it was touched, with its touch count at the right.
 */
function drawLevels(e: ChartEngine, rc: PaneRenderCtx, levels: SrLevel[]): void {
  const { ctx, dpr, theme } = rc;
  for (const l of levels) {
    if (l.firstIndex > rc.to + 1) continue;
    const y = crisp(rc.ps.toY(l.price), dpr);
    if (y < -2 || y > rc.height + 2) continue;
    const x0 = Math.max(0, e.ts.indexToX(l.firstIndex));
    const color = l.kind === "support" ? theme.srSupport : theme.srResistance;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.min(4, 1 + (l.touches - 2) * 0.5);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(rc.width, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const label = `${l.kind === "support" ? "S" : "R"} ${l.touches}`;
    pill(rc, label, rc.width - 22, y - 9, color, 9);
  }
}

function drawPolyline(rc: PaneRenderCtx, pts: { x: number; y: number }[], color: string, width: number, dash: number[] = []): void {
  if (pts.length < 2) return;
  const { ctx } = rc;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.setLineDash(dash);
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.setLineDash([]);
}

function pill(rc: PaneRenderCtx, text: string, x: number, y: number, bg: string, size = 10): { w: number; h: number } {
  const { ctx, theme } = rc;
  ctx.font = font(theme, size, 600);
  const w = ctx.measureText(text).width + 6;
  const h = size + 4;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 3);
  ctx.fill();
  ctx.fillStyle = theme.patternLabelText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 0.5);
  return { w, h };
}

function biasColor(e: ChartEngine, bias: "bullish" | "bearish" | "neutral"): string {
  return bias === "bullish" ? e.theme.patternBull : bias === "bearish" ? e.theme.patternBear : e.theme.patternNeutral;
}

function drawCandlePatterns(e: ChartEngine, rc: PaneRenderCtx, list: CandlePattern[]): void {
  const bars = e.display;
  const above = new Map<number, number>();
  const below = new Map<number, number>();
  const dense = e.ts.barSpacing < 6;
  for (const p of list) {
    if (p.index < rc.from || p.index > rc.to || !bars[p.index]) continue;
    const b = bars[p.index];
    const x = e.ts.indexToX(p.index);
    const up = p.bias === "bullish";
    const stack = up ? below : above;
    const k = stack.get(p.index) ?? 0;
    stack.set(p.index, k + 1);
    const color = biasColor(e, p.bias);
    if (dense) {
      const y = up ? e.mainPane.ps.toY(b.low) + 6 + k * 5 : e.mainPane.ps.toY(b.high) - 6 - k * 5;
      rc.ctx.fillStyle = color;
      rc.ctx.beginPath();
      rc.ctx.arc(x, y, 2, 0, Math.PI * 2);
      rc.ctx.fill();
      continue;
    }
    const y = up ? e.mainPane.ps.toY(b.low) + 11 + k * 14 : e.mainPane.ps.toY(b.high) - 11 - k * 14;
    pill(rc, NAMES[p.name]?.abbr ?? p.name.slice(0, 2).toUpperCase(), x, y, color, 9);
  }
}

/** The latest patterns that end inside the visible range (older ones would only clutter). */
export function visiblePatterns(list: ChartPattern[], from: number, to: number, max = 4): ChartPattern[] {
  return list.filter((p) => p.endIndex >= from && p.startIndex <= to).slice(-max);
}

function drawChartPattern(e: ChartEngine, rc: PaneRenderCtx, p: ChartPattern): void {
  if (p.endIndex < rc.from - 50 || p.startIndex > rc.to + 1) return;
  const color = e.theme.chartPattern;
  const pts = p.points.map((q) => e.toPx(q));
  drawPolyline(rc, pts, color, 1.5);
  const { ctx, dpr } = rc;
  ctx.fillStyle = color;
  for (const q of pts) {
    ctx.beginPath();
    ctx.arc(q.x, q.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const last = pts[pts.length - 1];
  const hi = Math.min(...pts.map((q) => q.y));
  const mid = pts.reduce((s, q) => s + q.x, 0) / pts.length;
  pill(rc, chartPatternLabel(p.name), mid, hi - 12, biasColor(e, p.bias), 10);
  if (p.target !== undefined && isFinite(p.target)) {
    const y = crisp(e.mainPane.ps.toY(p.target), dpr);
    const len = Math.max(40, last.x - pts[0].x);
    ctx.strokeStyle = e.theme.chartPatternTarget;
    ctx.lineWidth = hairline(dpr);
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(last.x, y);
    ctx.lineTo(last.x + len, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = font(rc.theme, 10);
    ctx.fillStyle = e.theme.chartPatternTarget;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`Target ${e.mainPane.ps.format(p.target)}`, last.x + 4, y - 2);
  }
}

// ---------- hit-testing and conversion ----------

const nearPolyline = (pts: { x: number; y: number }[], x: number, y: number, tol: number) => {
  for (let i = 1; i < pts.length; i++) if (distanceToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= tol) return true;
  return false;
};

/** Whether (x, y) in main-pane px lies on the study's drawn geometry. */
export function studyHit(e: ChartEngine, c: ComputedIndicator, x: number, y: number, tol: number): boolean {
  if (!isStudy(c.def)) return false;
  const r = e.studyResult(c);
  switch (c.def.study) {
    case "zigzag":
      return nearPolyline((r.pivots ?? []).map((p) => e.toPx(p)), x, y, tol);
    case "chart-patterns":
      return visiblePatterns(r.patterns ?? [], e.ts.visibleRange().from, e.ts.visibleRange().to).some((p) => nearPolyline(p.points.map((q) => e.toPx(q)), x, y, tol));
    case "autofib": {
      if (!r.fib) return false;
      const a = e.toPx(r.fib.a);
      const b = e.toPx(r.fib.b);
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      if (x < lo - tol || x > hi + tol) return false;
      return fibLevels(r.fib.a, r.fib.b).some((l) => Math.abs(e.mainPane.ps.toY(l.price) - y) <= tol);
    }
    default:
      return false;
  }
}

/** Editable drawings equivalent to a study's current geometry (auto fib, chart patterns, zig zag). */
export function studyToDrawings(e: ChartEngine, c: ComputedIndicator, newId: () => string, nearX?: number): Drawing[] {
  if (!isStudy(c.def)) return [];
  const r = e.studyResult(c);
  const seg = (a: Anchor, b: Anchor, color: string): Drawing => ({ id: newId(), type: "trendline", anchors: [{ ...a }, { ...b }], style: { color } });
  switch (c.def.study) {
    case "autofib":
      return r.fib ? [{ id: newId(), type: "fib", anchors: [{ ...r.fib.a }, { ...r.fib.b }] }] : [];
    case "zigzag": {
      const piv = r.pivots ?? [];
      return piv.slice(1).map((p, i) => seg(piv[i], p, e.theme.zigzag));
    }
    case "chart-patterns": {
      const list = r.patterns ?? [];
      if (!list.length) return [];
      // The pattern nearest to the clicked x, else the latest one.
      let p = list[list.length - 1];
      if (nearX !== undefined) {
        let best = Infinity;
        for (const q of list) {
          const xs = q.points.map((k) => e.toPx(k).x);
          const d = nearX < Math.min(...xs) ? Math.min(...xs) - nearX : nearX > Math.max(...xs) ? nearX - Math.max(...xs) : 0;
          if (d < best) {
            best = d;
            p = q;
          }
        }
      }
      const out = p.points.slice(1).map((q, i) => seg(p.points[i], q, e.theme.chartPattern));
      const end = p.points[p.points.length - 1];
      if (p.target !== undefined && isFinite(p.target)) out.push({ id: newId(), type: "hray", anchors: [{ time: end.time, price: p.target }], style: { color: e.theme.chartPatternTarget, lineStyle: "dashed" } });
      out.push({ id: newId(), type: "text", anchors: [{ time: p.points[0].time, price: Math.max(...p.points.map((k) => k.price)) }], text: chartPatternLabel(p.name), style: { color: e.theme.chartPattern } });
      return out;
    }
    default:
      return [];
  }
}

/** Tooltip lines for candle patterns at bar `index`. */
export function candlePatternsAt(e: ChartEngine, index: number): { text: string; bias: CandlePattern["bias"] }[] {
  const out: { text: string; bias: CandlePattern["bias"] }[] = [];
  for (const { c, r } of mainStudies(e)) {
    if (!isStudy(c.def) || c.def.study !== "candle-patterns") continue;
    for (const p of r.candles ?? []) if (p.index === index) out.push({ text: candleLabel(p.name), bias: p.bias });
  }
  return out;
}
