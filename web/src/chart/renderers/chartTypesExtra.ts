// More time-based chart types: volume candles (body width by volume), HLC area, high-low bars,
// line with markers and step line.

import type { Bar } from "@qt/core";
import { crisp, hairline, snap } from "../canvas";
import { withAlpha } from "../theme";
import type { PaneRenderCtx } from "./types";

/** Visible bars plus one on each side (lines run off the edges); empty when nothing is visible. */
const span = (rc: PaneRenderCtx, n: number) => (rc.from > rc.to ? { a: 1, b: 0 } : { a: Math.max(0, rc.from - 1), b: Math.min(n - 1, rc.to + 1) });

/** Body width of volume candles: 15–95% of the bar spacing, scaled by volume / largest visible volume. */
export function volumeCandleWidth(volume: number, maxVolume: number, spacing: number): number {
  const f = maxVolume > 0 && Number.isFinite(volume) && volume > 0 ? Math.min(1, volume / maxVolume) : 0;
  return spacing * (0.15 + 0.8 * f);
}

/** Candles whose body width follows the bar's volume relative to the largest visible volume. */
export function drawVolumeCandles(rc: PaneRenderCtx, bars: readonly Bar[]): void {
  const { ctx, ts, ps, from, to, dpr, theme } = rc;
  if (from > to) return;
  let maxV = 0;
  for (let i = from; i <= to; i++) if (bars[i].volume > maxV) maxV = bars[i].volume;
  ctx.lineWidth = hairline(dpr);
  for (const up of [true, false]) {
    ctx.strokeStyle = up ? theme.upWick : theme.downWick;
    ctx.beginPath();
    for (let i = from; i <= to; i++) {
      const b = bars[i];
      if (b.close >= b.open !== up) continue;
      const x = crisp(ts.indexToX(i), dpr);
      ctx.moveTo(x, snap(ps.toY(b.high), dpr));
      ctx.lineTo(x, snap(ps.toY(b.low), dpr));
    }
    ctx.stroke();
    ctx.fillStyle = up ? theme.upBody : theme.downBody;
    for (let i = from; i <= to; i++) {
      const b = bars[i];
      if (b.close >= b.open !== up) continue;
      const w = Math.max(1 / dpr, snap(volumeCandleWidth(b.volume, maxV, ts.barSpacing), dpr));
      const ya = snap(ps.toY(b.open), dpr);
      const yc = snap(ps.toY(b.close), dpr);
      ctx.fillRect(snap(ts.indexToX(i) - w / 2, dpr), Math.min(ya, yc), w, Math.max(1 / dpr, Math.abs(yc - ya)));
    }
  }
}

function tracePath(rc: PaneRenderCtx, bars: readonly Bar[], a: number, b: number, v: (x: Bar) => number): void {
  const { ctx, ts, ps } = rc;
  for (let i = a; i <= b; i++) {
    const x = ts.indexToX(i);
    const y = ps.toY(v(bars[i]));
    if (i === a) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

/** High-low-close area: high..close filled in the up color, close..low in the down color, close line on top. */
export function drawHlcArea(rc: PaneRenderCtx, bars: readonly Bar[]): void {
  const { ctx, ts, ps, theme } = rc;
  const { a, b } = span(rc, bars.length);
  if (a > b) return;
  const band = (top: (x: Bar) => number, bottom: (x: Bar) => number, fill: string) => {
    ctx.beginPath();
    tracePath(rc, bars, a, b, top);
    for (let i = b; i >= a; i--) ctx.lineTo(ts.indexToX(i), ps.toY(bottom(bars[i])));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  band((x) => x.high, (x) => x.close, withAlpha(theme.up, 0.22));
  band((x) => x.close, (x) => x.low, withAlpha(theme.down, 0.22));
  const line = (v: (x: Bar) => number, color: string, width: number) => {
    ctx.beginPath();
    tracePath(rc, bars, a, b, v);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.stroke();
  };
  line((x) => x.high, withAlpha(theme.up, 0.6), 1);
  line((x) => x.low, withAlpha(theme.down, 0.6), 1);
  line((x) => x.close, theme.line, 1.5);
}

/** High-low bars: a vertical bar from low to high, colored by the bar's direction. */
export function drawHighLow(rc: PaneRenderCtx, bars: readonly Bar[]): void {
  const { ctx, ts, ps, from, to, dpr, theme } = rc;
  if (from > to) return;
  const w = Math.max(1 / dpr, snap(Math.min(ts.barSpacing * 0.5, 6), dpr));
  for (const up of [true, false]) {
    ctx.fillStyle = up ? theme.upBody : theme.downBody;
    for (let i = from; i <= to; i++) {
      const b = bars[i];
      if (b.close >= b.open !== up) continue;
      const yh = snap(ps.toY(b.high), dpr);
      const yl = snap(ps.toY(b.low), dpr);
      ctx.fillRect(snap(ts.indexToX(i) - w / 2, dpr), Math.min(yh, yl), w, Math.max(1 / dpr, Math.abs(yl - yh)));
    }
  }
}

/** Close line with a dot on every bar (dots are left out when bars are closer than 4 px). */
export function drawLineMarkers(rc: PaneRenderCtx, bars: readonly Bar[]): void {
  const { ctx, ts, ps, theme } = rc;
  const { a, b } = span(rc, bars.length);
  if (a > b) return;
  ctx.beginPath();
  tracePath(rc, bars, a, b, (x) => x.close);
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.stroke();
  if (ts.barSpacing < 4) return;
  const r = Math.min(3.5, ts.barSpacing * 0.3);
  ctx.fillStyle = theme.line;
  ctx.beginPath();
  for (let i = a; i <= b; i++) {
    const x = ts.indexToX(i);
    const y = ps.toY(bars[i].close);
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

/** Step line: the close holds flat across each bar and jumps at the next bar's center. */
export function drawStepLine(rc: PaneRenderCtx, bars: readonly Bar[]): void {
  const { ctx, ts, ps, theme } = rc;
  const { a, b } = span(rc, bars.length);
  if (a > b) return;
  ctx.beginPath();
  for (let i = a; i <= b; i++) {
    const x = ts.indexToX(i);
    const y = ps.toY(bars[i].close);
    if (i === a) ctx.moveTo(x, y);
    else {
      ctx.lineTo(x, ps.toY(bars[i - 1].close));
      ctx.lineTo(x, y);
    }
  }
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "miter";
  ctx.stroke();
}
