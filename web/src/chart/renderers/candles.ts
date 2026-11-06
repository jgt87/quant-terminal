// Candles, hollow candles and OHLC bars. Only the visible range is drawn; when bars are
// narrower than a device pixel they are aggregated per pixel column.

import type { Bar } from "@qt/core";
import { crisp, hairline, snap } from "../canvas";
import type { PaneRenderCtx } from "./types";

export type CandleStyle = "candles" | "hollow" | "bars";

export function drawCandles(rc: PaneRenderCtx, bars: readonly Bar[], style: CandleStyle): void {
  const { ctx, ts, ps, from, to, dpr, theme } = rc;
  if (from > to) return;
  const spacing = ts.barSpacing;
  const lw = hairline(dpr);

  if (spacing * dpr < 2.5) {
    drawCompressed(rc, bars);
    return;
  }

  if (style === "bars") {
    drawOhlcBars(rc, bars);
    return;
  }

  // Body width: ~70% of spacing, odd number of device px so the wick centers exactly.
  let bodyDev = Math.max(1, Math.floor(spacing * dpr * 0.72));
  if (bodyDev % 2 === 0) bodyDev -= 1;
  const bodyW = bodyDev / dpr;
  const showBorder = bodyDev >= 3;

  // Wicks: one path per direction.
  ctx.lineWidth = lw;
  for (const upW of [true, false]) {
    ctx.strokeStyle = upW ? theme.upWick : theme.downWick;
    ctx.beginPath();
    for (let i = from; i <= to; i++) {
      const b = bars[i];
      if (b.close >= b.open !== upW) continue;
      const x = crisp(ts.indexToX(i), dpr);
      const yh = ps.toY(b.high);
      const yl = ps.toY(b.low);
      const yt = ps.toY(Math.max(b.open, b.close));
      const yb = ps.toY(Math.min(b.open, b.close));
      if (showBorder) {
        ctx.moveTo(x, snap(yh, dpr));
        ctx.lineTo(x, snap(yt, dpr));
        ctx.moveTo(x, snap(yb, dpr));
        ctx.lineTo(x, snap(yl, dpr));
      } else {
        ctx.moveTo(x, snap(yh, dpr));
        ctx.lineTo(x, snap(yl, dpr));
      }
    }
    ctx.stroke();
  }

  // Bodies.
  for (const up of [true, false]) {
    const hollow = style === "hollow" && up;
    ctx.fillStyle = up ? theme.upBody : theme.downBody;
    ctx.strokeStyle = up ? theme.upBorder : theme.downBorder;
    ctx.lineWidth = lw;
    if (!hollow) {
      for (let i = from; i <= to; i++) {
        const b = bars[i];
        if (b.close >= b.open !== up) continue;
        const x = snap(ts.indexToX(i) - bodyW / 2, dpr);
        const ya = snap(ps.toY(b.open), dpr);
        const yb = snap(ps.toY(b.close), dpr);
        const y1 = Math.min(ya, yb);
        ctx.fillRect(x, y1, bodyW, Math.max(1 / dpr, Math.max(ya, yb) - y1));
      }
    }
    if (showBorder) {
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        const b = bars[i];
        if (b.close >= b.open !== up) continue;
        const x = snap(ts.indexToX(i) - bodyW / 2, dpr) + lw / 2;
        const ya = snap(ps.toY(b.open), dpr);
        const yb = snap(ps.toY(b.close), dpr);
        const y1 = Math.min(ya, yb) + lw / 2;
        const y2 = Math.max(ya, yb) - lw / 2;
        ctx.rect(x, y1, bodyW - lw, Math.max(0, y2 - y1));
      }
      ctx.stroke();
    }
  }
}

function drawOhlcBars(rc: PaneRenderCtx, bars: readonly Bar[]): void {
  const { ctx, ts, ps, from, to, dpr, theme } = rc;
  const tick = Math.max(1 / dpr, snap(ts.barSpacing * 0.35, dpr));
  ctx.lineWidth = hairline(dpr, ts.barSpacing > 12 ? 2 : 1);
  for (const up of [true, false]) {
    ctx.strokeStyle = up ? theme.upBody : theme.downBody;
    ctx.beginPath();
    for (let i = from; i <= to; i++) {
      const b = bars[i];
      if (b.close >= b.open !== up) continue;
      const x = crisp(ts.indexToX(i), dpr);
      const yo = crisp(ps.toY(b.open), dpr);
      const yc = crisp(ps.toY(b.close), dpr);
      ctx.moveTo(x, snap(ps.toY(b.high), dpr));
      ctx.lineTo(x, snap(ps.toY(b.low), dpr));
      ctx.moveTo(x - tick, yo);
      ctx.lineTo(x, yo);
      ctx.moveTo(x, yc);
      ctx.lineTo(x + tick, yc);
    }
    ctx.stroke();
  }
}

/** Very dense view: one high-low line per device pixel column. */
function drawCompressed(rc: PaneRenderCtx, bars: readonly Bar[]): void {
  const { ctx, ts, ps, from, to, dpr, theme } = rc;
  ctx.lineWidth = hairline(dpr);
  ctx.strokeStyle = theme.line;
  ctx.beginPath();
  let col = Number.NaN;
  let hi = -Infinity;
  let lo = Infinity;
  const flush = () => {
    if (!isFinite(hi)) return;
    const x = (col + 0.5) / dpr;
    const y1 = snap(Math.min(ps.toY(hi), ps.toY(lo)), dpr);
    const y2 = snap(Math.max(ps.toY(hi), ps.toY(lo)), dpr);
    ctx.moveTo(x, y1);
    ctx.lineTo(x, Math.max(y2, y1 + 1 / dpr));
  };
  for (let i = from; i <= to; i++) {
    const c = Math.floor(ts.indexToX(i) * dpr);
    if (c !== col) {
      flush();
      col = c;
      hi = -Infinity;
      lo = Infinity;
    }
    const b = bars[i];
    if (b.high > hi) hi = b.high;
    if (b.low < lo) lo = b.low;
  }
  flush();
  ctx.stroke();
}
