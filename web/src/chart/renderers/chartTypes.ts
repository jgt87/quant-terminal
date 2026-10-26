// Chart types beyond candles/bars/line: baseline, columns, kagi lines and point & figure boxes.

import type { Bar } from "@qt/core";
import { crisp, hairline, snap } from "../canvas";
import type { PaneRenderCtx } from "./types";

/** Area around a base price: above in the up colors, below in the down colors. */
export function drawBaseline(rc: PaneRenderCtx, bars: readonly Bar[], base: number): void {
  const { ctx, ts, ps, from, to, width, height, dpr, theme } = rc;
  if (from > to) return;
  const a = Math.max(0, from - 1);
  const b = Math.min(bars.length - 1, to + 1);
  const yb = ps.toY(base);
  const trace = () => {
    ctx.beginPath();
    for (let i = a; i <= b; i++) {
      const x = ts.indexToX(i);
      const y = ps.toY(bars[i].close);
      if (i === a) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  };
  for (const up of [true, false]) {
    ctx.save();
    ctx.beginPath();
    if (up) ctx.rect(0, 0, width, Math.max(0, yb));
    else ctx.rect(0, yb, width, Math.max(0, height - yb));
    ctx.clip();
    trace();
    ctx.lineTo(ts.indexToX(b), yb);
    ctx.lineTo(ts.indexToX(a), yb);
    ctx.closePath();
    ctx.fillStyle = up ? theme.baselineUpFill : theme.baselineDownFill;
    ctx.fill();
    trace();
    ctx.strokeStyle = up ? theme.baselineUpLine : theme.baselineDownLine;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = theme.baselineLevel;
  ctx.lineWidth = hairline(dpr);
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  const y = crisp(yb, dpr);
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Columns from the pane bottom to the close, colored by the change versus the previous close. */
export function drawColumns(rc: PaneRenderCtx, bars: readonly Bar[]): void {
  const { ctx, ts, ps, from, to, height, dpr, theme } = rc;
  if (from > to) return;
  const w = Math.max(1 / dpr, snap(ts.barSpacing * 0.7, dpr));
  for (const up of [true, false]) {
    ctx.fillStyle = up ? theme.columnUp : theme.columnDown;
    for (let i = from; i <= to; i++) {
      const ref = i > 0 ? bars[i - 1].close : bars[i].open;
      if (bars[i].close >= ref !== up) continue;
      const y = snap(ps.toY(bars[i].close), dpr);
      ctx.fillRect(snap(ts.indexToX(i) - w / 2, dpr), y, w, Math.max(1 / dpr, height - y));
    }
  }
}

/**
 * Kagi: each element is a vertical line from open to close at its index, joined to the previous
 * line by a horizontal shoulder/waist. Yang lines (dir 1) are thick, yin lines thin.
 */
export function drawKagi(rc: PaneRenderCtx, bars: readonly (Bar & { dir?: 1 | -1 })[]): void {
  const { ctx, ts, ps, from, to, dpr, theme } = rc;
  if (from > to) return;
  const a = Math.max(0, from - 1);
  const b = Math.min(bars.length - 1, to + 1);
  ctx.lineJoin = "miter";
  for (let i = a; i <= b; i++) {
    const e = bars[i];
    const yang = (e.dir ?? (e.close >= e.open ? 1 : -1)) === 1;
    ctx.strokeStyle = yang ? theme.kagiYang : theme.kagiYin;
    ctx.lineWidth = hairline(dpr, yang ? 3 : 1);
    const x = crisp(ts.indexToX(i), dpr);
    ctx.beginPath();
    if (i > 0) ctx.moveTo(crisp(ts.indexToX(i - 1), dpr), ps.toY(e.open));
    else ctx.moveTo(x, ps.toY(e.open));
    ctx.lineTo(x, ps.toY(e.open));
    ctx.lineTo(x, ps.toY(e.close));
    ctx.stroke();
  }
}

/** Point & figure: a column of X (dir 1) or O (dir -1) boxes from low to high, one per box. */
export function drawPnf(rc: PaneRenderCtx, bars: readonly (Bar & { dir?: 1 | -1 })[], box: number | null): void {
  const { ctx, ts, ps, from, to, dpr, theme } = rc;
  if (from > to || !box || !(box > 0)) return;
  const boxPx = Math.abs(ps.toY(0) - ps.toY(box));
  const half = Math.max(1.5, Math.min(ts.barSpacing * 0.4, boxPx * 0.45));
  ctx.lineWidth = hairline(dpr, half > 4 ? 2 : 1);
  for (let i = from; i <= to; i++) {
    const e = bars[i];
    const x = ts.indexToX(i);
    const isX = (e.dir ?? (e.close >= e.open ? 1 : -1)) === 1;
    ctx.strokeStyle = isX ? theme.pnfX : theme.pnfO;
    const n = Math.max(1, Math.round((e.high - e.low) / box) + 1);
    // Too many boxes for their height: draw the column as one bar.
    if (boxPx < 3) {
      ctx.beginPath();
      ctx.moveTo(crisp(x, dpr), ps.toY(e.high));
      ctx.lineTo(crisp(x, dpr), ps.toY(e.low));
      ctx.stroke();
      continue;
    }
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const y = ps.toY(e.low + k * box);
      if (isX) {
        ctx.moveTo(x - half, y - half);
        ctx.lineTo(x + half, y + half);
        ctx.moveTo(x + half, y - half);
        ctx.lineTo(x - half, y + half);
      } else {
        ctx.moveTo(x + half, y);
        ctx.arc(x, y, half, 0, Math.PI * 2);
      }
    }
    ctx.stroke();
  }
}
