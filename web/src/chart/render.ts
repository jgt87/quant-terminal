// Frame rendering for the engine: scale fitting, the scene layer (grid, series, indicators,
// drawings, axes) and the UI layer (crosshair and its axis labels). Everything is drawn in plot
// coordinates; the context is shifted by `plotLeft` when the price scale sits on the left.

import { crisp, hairline } from "./canvas";
import type { ChartEngine } from "./ChartEngine";
import { drawBand, drawDrawing } from "./drawings/render";
import { formatTimeFull } from "./format";
import { zoneLabel } from "./timeZone";
import { levelFill } from "./indicatorStyle";
import type { Pane } from "./Pane";
import { drawPriceAxis, drawTimeAxis } from "./renderers/axes";
import { drawPaneAxisWithCrosshair, drawPaneBadges, lastColor } from "./renderers/axisBadges";
import { drawCandles } from "./renderers/candles";
import { drawGrid } from "./renderers/grid";
import { drawIndicator, drawLevelBand, drawLevels } from "./renderers/indicators";
import { drawLineSeries } from "./renderers/line";
import { drawCrosshairLines, drawLastPriceLine, drawMarkers } from "./renderers/overlays";
import type { PaneRenderCtx } from "./renderers/types";
import { drawVolumeOverlay } from "./renderers/volume";
import { drawBaseline, drawColumns, drawKagi, drawPnf } from "./renderers/chartTypes";
import { drawHighLow, drawHlcArea, drawLineMarkers, drawStepLine, drawVolumeCandles } from "./renderers/chartTypesExtra";
import { drawFootprints, drawVolumeBubbles } from "./renderers/footprint";
import { drawHeatmap } from "./renderers/heatmap";
import { drawFlowEvents } from "./renderers/flowEvents";
import { drawTradeLines } from "./tradeLines";
import { drawCompareLines, compareValues } from "./renderers/compare";
import { drawCrosshairTime, drawEventMarkers, drawExtendedHours, drawReplaySelect, drawSessionBreaks } from "./renderers/marks";
import { drawStudies } from "./studies/render";
import { allAnchors, volumeProfile, type Drawing } from "@qt/core";
import { PriceScale } from "./PriceScale";
import type { ComputedIndicator } from "./IndicatorSet";
import { font } from "./theme";

const CLOSE_ONLY = new Set(["line", "area", "baseline", "columns", "line-markers", "step-line"]);

/** Auto-fit each pane's price scale to the visible data. */
export function fitScales(e: ChartEngine): void {
  const { from, to } = e.ts.visibleRange();
  if (from > to) return;
  const closeOnly = CLOSE_ONLY.has(e.chartType);
  for (const pane of e.panes) {
    let lo = Infinity;
    let hi = -Infinity;
    if (pane.main) {
      const bars = e.display;
      for (let i = from; i <= to; i++) {
        const b = bars[i];
        const l = closeOnly ? b.close : b.low;
        const h = closeOnly ? b.close : b.high;
        if (l < lo) lo = l;
        if (h > hi) hi = h;
      }
      // Percent / indexed mode (or compare overlays): labels relative to the first visible bar's close.
      const pct = e.settings.scales?.percent || e.settings.scales?.indexed || e.compare.length > 0;
      pane.ps.percentBase = pct ? (e.data.bars[Math.max(0, from)]?.close ?? null) : null;
      for (const s of compareValues(e, from)) {
        for (let i = from; i <= to; i++) {
          const v = s[i];
          if (v == null || !isFinite(v)) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
    let hasHist = false;
    let fixed: { min: number; max: number } | undefined;
    for (const uid of pane.uids) {
      const c = e.indicators.get(uid);
      if (!c || !e.indicatorShown(c)) continue;
      if (c.scale === "own" || c.scale === "left") {
        fitOwnScale(e, c, pane, from, to);
        continue;
      }
      if (!pane.main && c.def.range) fixed = c.def.range;
      const r = indicatorExtent(e, c, from, to, pane.main && pane.ps.log);
      if (r.hist) hasHist = true;
      if (r.lo < lo) lo = r.lo;
      if (r.hi > hi) hi = r.hi;
    }
    if (fixed) {
      lo = Math.min(fixed.min, isFinite(lo) ? lo : fixed.min);
      hi = Math.max(fixed.max, isFinite(hi) ? hi : fixed.max);
    }
    if (hasHist) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    if (isFinite(lo) && isFinite(hi)) pane.ps.fit(lo, hi);
  }
}

/** Lowest and highest visible value of an indicator (projected outputs count past the last bar). */
function indicatorExtent(e: ChartEngine, c: ComputedIndicator, from: number, to: number, positiveOnly: boolean): { lo: number; hi: number; hist: boolean } {
  let lo = Infinity;
  let hi = -Infinity;
  let hist = false;
  const ahead = Math.ceil(e.ts.xToIndex(e.plotWidth));
  for (const out of c.def.outputs) {
    const s = c.series[out.key];
    if (!s) continue;
    if (out.style === "histogram") hist = true;
    const end = out.forward ? Math.min(s.length - 1, Math.max(to, ahead)) : to;
    for (let i = from; i <= end; i++) {
      const v = s[i];
      if (v == null || !isFinite(v)) continue;
      if (positiveOnly && v <= 0) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return { lo, hi, hist };
}

/** Fits the hidden scale of an indicator drawn on its own scale (same height and margins as the pane). */
function fitOwnScale(e: ChartEngine, c: ComputedIndicator, pane: Pane, from: number, to: number): void {
  let ps = e.ownScales.get(c.uid);
  if (!ps) e.ownScales.set(c.uid, (ps = new PriceScale()));
  ps.setHeight(pane.height);
  ps.marginTop = pane.ps.marginTop;
  ps.marginBottom = pane.ps.marginBottom;
  let { lo, hi, hist } = indicatorExtent(e, c, from, to, false);
  if (c.def.range) {
    lo = Math.min(c.def.range.min, isFinite(lo) ? lo : c.def.range.min);
    hi = Math.max(c.def.range.max, isFinite(hi) ? hi : c.def.range.max);
  }
  if (hist) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (isFinite(lo) && isFinite(hi)) ps.fit(lo, hi);
}

/** Render context for one indicator: its own scale when it has one. */
function indicatorCtx(e: ChartEngine, rc: PaneRenderCtx, uid: string): PaneRenderCtx {
  const own = e.ownScales.get(uid);
  return own ? { ...rc, ps: own } : rc;
}

function paneCtx(e: ChartEngine, ctx: CanvasRenderingContext2D, pane: Pane, from: number, to: number): PaneRenderCtx {
  return { ctx, ts: e.ts, ps: pane.ps, width: e.plotWidth, height: pane.height, from, to, dpr: e.scene.dpr, theme: e.theme };
}

/** x of the main price axis' left edge in plot coordinates (right unless placement is "left"). */
function axisX(e: ChartEngine): number {
  return e.axisRight ? e.plotWidth : -e.theme.priceAxisWidth;
}

export function renderScene(e: ChartEngine): void {
  const ctx = e.scene.begin();
  const t = e.theme;
  const dpr = e.scene.dpr;
  const left = !e.axisRight;
  ctx.fillStyle = t.background;
  ctx.fillRect(0, 0, e.width, e.height);
  if (e.width === 0 || e.height === 0) return;
  ctx.save();
  ctx.translate(e.plotLeft, 0);

  const hasData = e.data.length > 0;
  const { from, to } = hasData ? e.ts.visibleRange() : { from: 0, to: -1 };
  const timeTicks = hasData ? e.ts.ticks() : [];
  const ap = e.settings.appearance;
  const x0 = axisX(e);

  for (const pane of e.panes) {
    if (pane.height <= 0) continue;
    const rc = paneCtx(e, ctx, pane, from, to);
    // A collapsed pane is only a strip for its legend row.
    const priceTicks = hasData && !pane.collapsed ? pane.ps.ticks() : [];
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, pane.top, e.plotWidth, pane.height);
    ctx.clip();
    ctx.translate(0, pane.top);
    drawGrid(rc, ap?.gridHorizontal === false ? [] : priceTicks, ap?.gridVertical === false || pane.collapsed ? [] : timeTicks);
    if (hasData && !pane.collapsed) {
      if (pane.main) drawMainPane(e, rc);
      else drawIndicatorPane(e, rc, pane);
    }
    ctx.restore();
    drawPriceAxis(ctx, x0, pane.top, pane.height, hasData ? priceTicks : [], t, dpr, left);
    // Second axis on the left: a left-scale indicator's scale, or the pane's scale ("both").
    if (e.axisLeft && e.axisRight) {
      const ls = hasData && !pane.collapsed ? e.leftScaleOf(pane) : null;
      drawPriceAxis(ctx, -t.priceAxisWidth, pane.top, pane.height, ls ? ls.ticks() : [], t, dpr, true);
    }
    if (hasData && !pane.collapsed) drawAxisValueBadges(e, ctx, pane);
  }

  // Separators between visible panes (across plot and axis).
  const sepLeft = e.axisLeft ? -t.priceAxisWidth : 0;
  const shown = e.panes.filter((p) => p.height > 0);
  shown.forEach((p, k) => {
    if (k === shown.length - 1) return;
    ctx.fillStyle = e.panes.indexOf(p) === e.hoverSeparator ? t.separatorHover : t.separator;
    ctx.fillRect(sepLeft, p.top + p.height, e.width, t.separatorHeight);
  });

  drawTimeAxis(ctx, e.plotHeight, e.plotWidth, timeTicks, t, dpr);
  e.eventHits = [];
  if (hasData && e.eventMarkers.length) drawEventMarkers(e, ctx);
  // Axis corner.
  const cornerX = crisp(left ? 0 : e.plotWidth, dpr);
  ctx.strokeStyle = t.axisBorder;
  ctx.lineWidth = hairline(dpr);
  ctx.beginPath();
  ctx.moveTo(cornerX, e.plotHeight);
  ctx.lineTo(cornerX, e.height);
  ctx.stroke();
  ctx.font = font(t, 10);
  ctx.fillStyle = t.axisText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const mps = e.mainPane.ps;
  const lastTime = e.data.times[e.data.times.length - 1] ?? Date.now() / 1000;
  const zone = e.meta.intraday ? zoneLabel(e.timeZone, lastTime) : "UTC";
  const mode = `${mps.percentBase ? (mps.indexed ? "IDX · " : "% · ") : mps.log ? "LOG · " : ""}${mps.inverted ? "INV · " : ""}${zone}`;
  ctx.fillText(mode, x0 + t.priceAxisWidth / 2, e.plotHeight + t.timeAxisHeight / 2);

  if (e.message) {
    ctx.font = font(t, 14, 500);
    ctx.fillStyle = t.message;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(e.message, e.plotWidth / 2, e.plotHeight / 2);
  }
  ctx.restore();
}

function drawMainPane(e: ChartEngine, rc: PaneRenderCtx): void {
  const bars = e.display;
  if (e.shadeExtended && !e.transform) drawExtendedHours(rc, e.data.times);
  if (e.settings.appearance?.sessionBreaks && e.meta.intraday && !e.transform) drawSessionBreaks(rc, e.data.times, e.timeZone);
  if (e.settings.orderFlow?.heatmap && e.depthFrames.length && !e.transform) drawHeatmap(rc, e.visibleDepthFrames());
  if (e.showVolume) drawVolumeOverlay(rc, e.data.bars);
  const hollowAll = e.settings.symbol?.hollow === true;
  switch (e.chartType) {
    case "line":
      drawLineSeries(rc, bars, false);
      break;
    case "area":
      drawLineSeries(rc, bars, true);
      break;
    case "baseline":
      drawBaseline(rc, bars, e.settings.symbol?.baseline ?? bars[Math.max(0, rc.from)]?.close ?? 0);
      break;
    case "columns":
      drawColumns(rc, bars);
      break;
    case "volume-candles":
      drawVolumeCandles(rc, bars);
      break;
    case "hlc-area":
      drawHlcArea(rc, bars);
      break;
    case "high-low":
      drawHighLow(rc, bars);
      break;
    case "line-markers":
      drawLineMarkers(rc, bars);
      break;
    case "step-line":
      drawStepLine(rc, bars);
      break;
    case "kagi":
      drawKagi(rc, bars);
      break;
    case "pnf":
      drawPnf(rc, bars, e.pnfBox);
      break;
    case "bars":
      drawCandles(rc, bars, "bars");
      break;
    case "hollow":
      drawCandles(rc, bars, "hollow");
      break;
    default:
      drawCandles(rc, bars, hollowAll ? "hollow" : "candles");
  }
  const flow = e.settings.orderFlow;
  if (e.flowFootprints.size) {
    if (flow?.footprint) drawFootprints(rc, e.flowFootprints, e.flowTick);
    if (flow?.bubbles) drawVolumeBubbles(rc, e.flowFootprints, e.flowTick);
  }
  if (flow?.signals && e.flowEvents.length && !e.transform) drawFlowEvents(rc, e.flowEvents);
  drawStudies(e, rc);
  for (const uid of e.mainPane.uids) {
    const c = e.indicators.get(uid);
    if (c && e.indicatorShown(c)) drawIndicator(indicatorCtx(e, rc, uid), c, e.data.bars);
  }
  drawCompareLines(e, rc);
  const last = e.data.last();
  if (last && e.settings.scales?.priceLine !== false) drawLastPriceLine(rc, last.close, lastColor(e));
  const allMarkers = e.replayMarkers.length ? [...e.markers, ...e.replayMarkers] : e.markers;
  if (allMarkers.length) {
    drawMarkers(
      rc,
      allMarkers,
      (time) => e.ts.timeToIndex(time),
      (i) => (bars[i] ? { high: bars[i].high, low: bars[i].low } : null),
    );
  }
  // Drawings: committed, then the one being placed.
  const dc = e.drawings;
  const decimals = e.mainPane.ps.formatDecimals(last?.close ?? 1);
  const opts = {
    toPx: (a: { time: number; price: number }) => e.toPx(a),
    toData: (p: { x: number; y: number }) => e.toData(p),
    bars: e.data.bars,
    intervalSec: e.meta.intervalSec,
    formatPrice: (p: number) => e.mainPane.ps.format(p),
    priceDecimals: decimals,
    profile: (d: Drawing) => drawingProfile(e, d),
  };
  // In replay, drawings that start after the revealed bars stay hidden.
  const cutoff = e.replay.phase === "on" ? e.replay.cursor : null;
  for (const d of dc.ordered()) {
    if (!e.drawingShown(d)) continue;
    const pts = allAnchors(d);
    if (cutoff != null && pts.length && Math.min(...pts.map((a) => a.time)) > cutoff) continue;
    drawDrawing(rc, d, { ...opts, selected: dc.isSelected(d.id), hovered: d.id === dc.hoverId });
  }
  const placing = dc.placingDrawing();
  if (placing) drawDrawing(rc, placing, { ...opts, selected: true, hovered: false });
  if (dc.band) drawBand(rc, dc.band);
  if (e.tradeLines.length) drawTradeLines(rc, e.tradeLines, e.tradeDrag);
}

function drawIndicatorPane(e: ChartEngine, paneRc: PaneRenderCtx, pane: Pane): void {
  for (const uid of pane.uids) {
    const c = e.indicators.get(uid);
    if (!c || !e.indicatorShown(c)) continue;
    const rc = indicatorCtx(e, paneRc, uid);
    const levelsOn = c.style?.levels !== false;
    if (levelsOn && c.def.levels?.length) {
      const fill = levelFill(c);
      if (fill && c.def.levels.length >= 2) drawLevelBand(rc, Math.min(...c.def.levels), Math.max(...c.def.levels), fill);
      drawLevels(rc, c.def.levels);
    }
    if (levelsOn && c.def.outputs.some((o) => o.style === "histogram") && !c.def.levels?.includes(0)) drawLevels(rc, [0]);
    drawIndicator(rc, c, e.data.bars);
  }
}

/** Value badges on the price axis (last price, indicators, compare, extras), laid out without overlaps. */
function drawAxisValueBadges(e: ChartEngine, ctx: CanvasRenderingContext2D, pane: Pane): void {
  drawPaneBadges(e, ctx, axisX(e), pane, e.panes.indexOf(pane), e.scene.dpr);
}

/**
 * Crosshair mirrored from another chart (crosshair sync): a vertical line at the bar that
 * contains the time, plus its time label. Never touches the scales.
 */
function renderExternalCrosshair(e: ChartEngine, ctx: CanvasRenderingContext2D): void {
  const time = e.externalCrosshair;
  if (time == null) return e.markCrosshair(null);
  const idx = Math.floor(e.ts.timeToIndex(time) + 1e-6);
  const x = e.ts.indexToX(idx);
  if (x < 0 || x > e.plotWidth) return e.markCrosshair(null);
  const t = e.theme;
  const dpr = e.ui.dpr;
  const style = e.settings.appearance?.crosshair ?? "dashed";
  ctx.save();
  ctx.translate(e.plotLeft, 0);
  if (style !== "hidden") {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, e.plotWidth, e.plotHeight);
    ctx.clip();
    drawCrosshairLines(ctx, x, null, e.plotWidth, e.plotHeight, t.crosshair, dpr, style);
    ctx.restore();
  }
  drawCrosshairTime(e, ctx, x, formatTimeFull(e.ts.indexToTime(idx), e.meta.intraday, e.timeZone), dpr);
  ctx.restore();
  e.markCrosshair(x);
}

export function renderUi(e: ChartEngine): void {
  const ctx = e.ui.begin();
  const h = e.hover;
  if (e.data.length === 0) return e.markCrosshair(null);
  if (e.replay.phase === "select" && h) drawReplaySelect(e, ctx, h.x);
  if (!h) return renderExternalCrosshair(e, ctx);
  const t = e.theme;
  const dpr = e.ui.dpr;
  const style = e.settings.appearance?.crosshair ?? "dashed";
  const overPlot = h.x >= 0 && h.x <= e.plotWidth && h.y <= e.plotHeight;
  const pane = e.panes.find((p) => p.contains(h.y));
  const idx = e.ts.xToBar(Math.min(h.x, e.plotWidth));
  const x = e.ts.indexToX(idx);
  const showX = overPlot && x >= 0 && x <= e.plotWidth;
  const showY = overPlot && pane != null;

  ctx.save();
  ctx.translate(e.plotLeft, 0);
  const cursor = e.drawings.cursorStyle;
  if (cursor === "demo") drawTrail(e, ctx);
  if (cursor === "dot" && overPlot) {
    ctx.fillStyle = t.crosshair;
    ctx.beginPath();
    ctx.arc(h.x, h.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (style !== "hidden" && (cursor === "cross" || cursor === "demo")) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, e.plotWidth, e.plotHeight);
    ctx.clip();
    drawCrosshairLines(ctx, showX ? x : null, showY ? h.y : null, e.plotWidth, e.plotHeight, t.crosshair, dpr, style);
    ctx.restore();
  }

  if (showY && pane) {
    const price = pane.ps.fromY(h.y - pane.top);
    drawPaneAxisWithCrosshair(e, ctx, axisX(e), pane, e.panes.indexOf(pane), { y: h.y, text: pane.ps.format(price) }, dpr);
  }
  if (showX) {
    const time = e.ts.indexToTime(idx);
    drawCrosshairTime(e, ctx, x, formatTimeFull(time, e.meta.intraday, e.timeZone), dpr);
  }
  ctx.restore();
  e.markCrosshair(showX ? x : null);
}

/** Demonstration cursor: a fading highlight trail behind the pointer (keeps repainting while it fades). */
function drawTrail(e: ChartEngine, ctx: CanvasRenderingContext2D): void {
  const now = performance.now();
  const trail = (e.drawings.trail = e.drawings.trail.filter((p) => now - p.t < 900));
  if (trail.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < trail.length; i++) {
    const age = (now - trail[i].t) / 900;
    ctx.strokeStyle = e.theme.accent;
    ctx.globalAlpha = Math.max(0, 0.55 * (1 - age));
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }
  ctx.restore();
  e.invalidate(false);
}

/** Profile of the bars a volume-profile drawing covers, with its x extent in plot px. */
function drawingProfile(e: ChartEngine, d: Drawing): { profile: ReturnType<typeof volumeProfile>; x0: number; x1: number } | null {
  if (!d.anchors.length || e.data.length === 0) return null;
  const last = e.data.length - 1;
  const t0 = d.anchors[0].time;
  const t1 = d.type === "vprofile" && d.anchors[1] ? d.anchors[1].time : Infinity;
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  const i0 = Math.max(0, Math.ceil(e.ts.timeToIndex(lo) - 1e-9));
  const i1 = hi === Infinity ? last : Math.min(last, Math.floor(e.ts.timeToIndex(hi) + 1e-9));
  if (i1 < i0) return null;
  const profile = volumeProfile(e.data.bars as never, i0, i1, 24, 70);
  const half = e.ts.barSpacing / 2;
  return { profile, x0: e.ts.indexToX(i0) - half, x1: e.ts.indexToX(i1) + half };
}
