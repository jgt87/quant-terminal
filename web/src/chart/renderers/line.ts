// Line and area series (close prices) plus a generic nullable polyline helper.

import type { Bar, Series } from "@qt/core";
import type { PaneRenderCtx } from "./types";

export function drawLineSeries(rc: PaneRenderCtx, bars: readonly Bar[], area: boolean): void {
  const { ctx, ts, ps, from, to, height, theme } = rc;
  if (from > to) return;
  const a = Math.max(0, from - 1);
  const b = Math.min(bars.length - 1, to + 1);
  const trace = () => {
    ctx.beginPath();
    for (let i = a; i <= b; i++) {
      const x = ts.indexToX(i);
      const y = ps.toY(bars[i].close);
      if (i === a) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  };
  if (area) {
    trace();
    ctx.lineTo(ts.indexToX(b), height);
    ctx.lineTo(ts.indexToX(a), height);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, theme.areaTop);
    g.addColorStop(1, theme.areaBottom);
    ctx.fillStyle = g;
    ctx.fill();
  }
  trace();
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.setLineDash([]);
  ctx.stroke();
}

/** Trace a nullable series into the current path; gaps (null) break the line. */
export function traceSeries(rc: PaneRenderCtx, values: Series, from: number, to: number, reverse = false): void {
  const { ctx, ts, ps } = rc;
  let pen = false;
  const step = reverse ? -1 : 1;
  for (let i = reverse ? to : from; reverse ? i >= from : i <= to; i += step) {
    const v = values[i];
    if (v == null || !isFinite(v)) {
      pen = false;
      continue;
    }
    const x = ts.indexToX(i);
    const y = ps.toY(v);
    if (pen) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
    pen = true;
  }
}
