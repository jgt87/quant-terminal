// Background and axis marks: extended-hours shading, corporate event markers on the time axis,
// and the replay start-point picker.

import { toZone } from "../timeZone";
import { crisp, hairline, snap } from "../canvas";
import type { ChartEngine } from "../ChartEngine";
import { isExtendedHours, type EventMarker } from "../events";
import { drawTimeAxis, drawTimeBadge, timeBadgeBox } from "./axes";
import { layoutLabels, type AxisLabel } from "./labelLayout";
import { font } from "../theme";
import type { PaneRenderCtx } from "./types";

/** Shades bars outside regular trading hours (merged into runs). */
export function drawExtendedHours(rc: PaneRenderCtx, times: readonly number[]): void {
  const { ctx, ts, from, to, height, dpr, theme } = rc;
  if (from > to) return;
  ctx.fillStyle = theme.extendedHours;
  const half = ts.barSpacing / 2;
  let start = -1;
  const flush = (end: number) => {
    if (start < 0) return;
    const x0 = snap(ts.indexToX(start) - half, dpr);
    const x1 = snap(ts.indexToX(end) + half, dpr);
    ctx.fillRect(x0, 0, x1 - x0, height);
    start = -1;
  };
  for (let i = from; i <= to; i++) {
    if (isExtendedHours(times[i])) {
      if (start < 0) start = i;
    } else flush(i - 1);
  }
  flush(to);
}

/** Bar indexes in [from, to] where a new day starts in `zone` (the first bar of each day). */
export function sessionBreakIndexes(times: readonly number[], from: number, to: number, zone: string): number[] {
  const out: number[] = [];
  const day = (t: number) => Math.floor(toZone(t, zone) / 86400);
  for (let i = Math.max(1, from); i <= to && i < times.length; i++) if (day(times[i]) !== day(times[i - 1])) out.push(i);
  return out;
}

/** Dashed vertical lines before the first bar of each day (intraday charts). */
export function drawSessionBreaks(rc: PaneRenderCtx, times: readonly number[], zone: string): void {
  const { ctx, ts, from, to, height, dpr, theme } = rc;
  if (from > to) return;
  ctx.save();
  ctx.strokeStyle = theme.axisText;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (const i of sessionBreakIndexes(times, from, to, zone)) {
    const x = snap(ts.indexToX(i) - ts.barSpacing / 2, dpr) + 0.5 / dpr;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  ctx.stroke();
  ctx.restore();
}

export const EVENT_RADIUS = 7;

/** Time-axis label to keep clear of (the crosshair time badge): center x and width. */
export interface TimeAxisPin {
  x: number;
  width: number;
}

/**
 * D / S / E badges sitting on the time axis line; positions are kept for hover tooltips.
 * Badges are spread so they never overlap each other or the pinned crosshair time label;
 * badges that do not fit fold into one "+n" badge whose tooltip lists all their events.
 */
export function drawEventMarkers(e: ChartEngine, ctx: CanvasRenderingContext2D, pin?: TimeAxisPin, recordHits = true): void {
  const t = e.theme;
  const y = e.plotHeight + EVENT_RADIUS + 1;
  const hits: ChartEngine["eventHits"] = [];
  const visible = e.eventMarkers
    .map((m) => ({ m, x: e.ts.indexToX(m.index) }))
    .filter(({ x }) => x >= 0 && x <= e.plotWidth);
  const radius = (label: string) => (label.length > 1 ? EVENT_RADIUS + 2 : EVENT_RADIUS);
  const labels: AxisLabel[] = visible.map(({ m, x }, i) => ({ id: String(i), pos: x, size: radius(m.label) * 2 + 2, priority: 0 }));
  if (pin) labels.push({ id: "pin", pos: pin.x, size: pin.width, priority: 1, pin: true });
  const res = layoutLabels(labels, 0, e.plotWidth, { gap: 1, markerSize: (EVENT_RADIUS + 2) * 2 + 2 });
  clearCoveredTimeTicks(e, ctx, [...res.placed.filter((p) => p.id !== "pin"), ...res.collapsed]);
  ctx.font = font(t, 9, 700);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const draw = (x: number, marker: EventMarker, color: string) => {
    const r = radius(marker.label);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.eventText;
    ctx.fillText(marker.label, x, y + 0.5);
    hits.push({ x, y, r, marker });
  };
  for (const p of res.placed) {
    if (p.id === "pin") continue;
    const { m } = visible[Number(p.id)];
    const kind = m.kinds[0];
    draw(p.pos, m, kind === "dividend" ? t.eventDividend : kind === "split" ? t.eventSplit : t.eventEarnings);
  }
  for (const c of res.collapsed) {
    const ms = c.ids.map((id) => visible[Number(id)].m);
    draw(c.pos, foldMarkers(ms), t.crosshairLabelBg);
  }
  if (recordHits) e.eventHits = hits;
}

/** Erases time tick labels an event badge would overlap (the badge wins; the label would be cut). */
function clearCoveredTimeTicks(e: ChartEngine, ctx: CanvasRenderingContext2D, badges: readonly { pos: number; size: number }[]): void {
  if (!badges.length) return;
  const t = e.theme;
  ctx.fillStyle = t.background;
  for (const tick of e.ts.ticks()) {
    if (tick.x < 16 || tick.x > e.plotWidth - 16) continue;
    ctx.font = font(t, t.fontSize, tick.major ? 600 : 400);
    const w = ctx.measureText(tick.text).width + 4;
    if (badges.some((b) => tick.x + w / 2 > b.pos - b.size / 2 && tick.x - w / 2 < b.pos + b.size / 2)) {
      ctx.fillRect(tick.x - w / 2, e.plotHeight + 2, w, t.timeAxisHeight - 3);
    }
  }
}

/** One "+n" marker standing for several folded markers (its tooltip lists all their events). */
export function foldMarkers(ms: readonly EventMarker[]): EventMarker {
  const kinds = [...new Set(ms.flatMap((m) => m.kinds))];
  return { index: ms[0]?.index ?? 0, label: `+${ms.length}`, kinds, events: ms.flatMap((m) => m.events) };
}

/** While picking the replay start: a cursor line and the bars that will be hidden shaded. */
export function drawReplaySelect(e: ChartEngine, ctx: CanvasRenderingContext2D, hx: number): void {
  if (hx < 0 || hx > e.plotWidth) return;
  const t = e.theme;
  const dpr = e.ui.dpr;
  const x = crisp(e.ts.indexToX(e.ts.xToBar(hx)), dpr);
  ctx.save();
  ctx.translate(e.plotLeft, 0);
  ctx.fillStyle = t.replayShade;
  ctx.fillRect(x, 0, e.plotWidth - x, e.plotHeight);
  ctx.strokeStyle = t.replayCursor;
  ctx.lineWidth = hairline(dpr, 2);
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, e.plotHeight);
  ctx.stroke();
  ctx.restore();
}

/**
 * Crosshair time label on the UI layer. With event badges on screen, the time axis strip is
 * repainted first (ticks + badges moved clear of the label) so badges never hide under it.
 */
export function drawCrosshairTime(e: ChartEngine, ctx: CanvasRenderingContext2D, x: number, text: string, dpr: number): void {
  const t = e.theme;
  if (e.eventMarkers.length) {
    const box = timeBadgeBox(ctx, x, e.plotWidth, text, t);
    ctx.fillStyle = t.background;
    ctx.fillRect(0, e.plotHeight, e.plotWidth, t.timeAxisHeight);
    drawTimeAxis(ctx, e.plotHeight, e.plotWidth, e.ts.ticks(), t, dpr);
    drawEventMarkers(e, ctx, { x: box.left + box.width / 2, width: box.width }, false);
  }
  drawTimeBadge(ctx, x, e.plotHeight, e.plotWidth, text, t, dpr);
}
