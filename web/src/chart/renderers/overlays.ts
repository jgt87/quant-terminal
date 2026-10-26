// Last-price line, crosshair lines and trade markers.

import { crisp, hairline } from "../canvas";
import type { PaneRenderCtx } from "./types";

export function drawLastPriceLine(rc: PaneRenderCtx, price: number, color: string): void {
  const { ctx, ps, width, dpr } = rc;
  const y = crisp(ps.toY(price), dpr);
  ctx.strokeStyle = color;
  ctx.lineWidth = hairline(dpr);
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawCrosshairLines(
  ctx: CanvasRenderingContext2D,
  x: number | null,
  y: number | null,
  width: number,
  height: number,
  color: string,
  dpr: number,
  style: "dashed" | "dotted" | "solid" = "dashed",
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = hairline(dpr);
  ctx.setLineDash(style === "solid" ? [] : style === "dotted" ? [1, 3] : [4, 4]);
  ctx.beginPath();
  if (x != null) {
    const cx = crisp(x, dpr);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, height);
  }
  if (y != null) {
    const cy = crisp(y, dpr);
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

export interface TradeMarker {
  time: number;
  /** Price of the fill; the marker is placed beyond the bar's high/low. */
  price: number;
  kind: "entry-long" | "entry-short" | "exit-long" | "exit-short";
  label?: string;
}

/**
 * Long entries are up-colored, short entries down-colored, exits use the accent.
 * Long entries / short exits point up below the bar;
 * short entries / long exits point down above it.
 */
export function drawMarkers(
  rc: PaneRenderCtx,
  markers: TradeMarker[],
  indexOf: (time: number) => number,
  highLow: (index: number) => { high: number; low: number } | null,
): void {
  const { ctx, ts, ps, from, to, theme } = rc;
  const size = Math.max(3, Math.min(6, ts.barSpacing * 0.45));
  for (const m of markers) {
    const i = Math.round(indexOf(m.time));
    if (i < from - 1 || i > to + 1) continue;
    const hl = highLow(i);
    if (!hl) continue;
    const x = ts.indexToX(i);
    const pointUp = m.kind === "entry-long" || m.kind === "exit-short";
    const y = pointUp ? ps.toY(hl.low) + size + 4 : ps.toY(hl.high) - size - 4;
    ctx.fillStyle = m.kind === "entry-long" ? theme.markerLong : m.kind === "entry-short" ? theme.markerShort : theme.markerExit;
    ctx.beginPath();
    if (pointUp) {
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y + size);
      ctx.lineTo(x - size, y + size);
    } else {
      ctx.moveTo(x, y + size);
      ctx.lineTo(x + size, y - size);
      ctx.lineTo(x - size, y - size);
    }
    ctx.closePath();
    ctx.fill();
  }
}
