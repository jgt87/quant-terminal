// Price axis (per pane), time axis, and the label badges used by last price and crosshair.
// Coordinates here are absolute canvas media px (no pane translation).

import { crisp, hairline, snap } from "../canvas";
import type { PriceTick } from "../PriceScale";
import type { TimeTick } from "../TimeScale";
import { font, type ChartTheme } from "../theme";

export const BADGE_H = 18;

export function drawPriceAxis(
  ctx: CanvasRenderingContext2D,
  x0: number,
  top: number,
  height: number,
  ticks: PriceTick[],
  theme: ChartTheme,
  dpr: number,
  /** Axis on the left of the plot: its border is on its right edge. */
  left = false,
): void {
  ctx.strokeStyle = theme.axisBorder;
  ctx.lineWidth = hairline(dpr);
  ctx.beginPath();
  const x = crisp(left ? x0 + theme.priceAxisWidth : x0, dpr);
  ctx.moveTo(x, top);
  ctx.lineTo(x, top + height);
  ctx.stroke();
  ctx.font = font(theme);
  ctx.fillStyle = theme.axisText;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const t of ticks) {
    const y = top + t.y;
    if (y < top + 6 || y > top + height - 6) continue;
    ctx.fillText(t.text, x0 + 8, y);
  }
}

export function drawPriceBadge(
  ctx: CanvasRenderingContext2D,
  x0: number,
  w: number,
  y: number,
  text: string,
  bg: string,
  fg: string,
  theme: ChartTheme,
  dpr: number,
): void {
  const top = snap(y - BADGE_H / 2, dpr);
  ctx.fillStyle = bg;
  ctx.fillRect(snap(x0, dpr), top, w, BADGE_H);
  ctx.fillStyle = fg;
  ctx.font = font(theme, theme.fontSize, 500);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x0 + 8, top + BADGE_H / 2 + 0.5);
}

export function drawTimeAxis(
  ctx: CanvasRenderingContext2D,
  top: number,
  width: number,
  ticks: TimeTick[],
  theme: ChartTheme,
  dpr: number,
): void {
  ctx.strokeStyle = theme.axisBorder;
  ctx.lineWidth = hairline(dpr);
  ctx.beginPath();
  const y = crisp(top, dpr);
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of ticks) {
    if (t.x < 16 || t.x > width - 16) continue;
    ctx.font = font(theme, theme.fontSize, t.major ? 600 : 400);
    ctx.fillStyle = t.major ? theme.text : theme.axisText;
    ctx.fillText(t.text, t.x, top + 12);
  }
}

/** Left edge and width of the time badge for `text` centered at x (kept inside [0, maxX]). */
export function timeBadgeBox(ctx: CanvasRenderingContext2D, x: number, maxX: number, text: string, theme: ChartTheme): { left: number; width: number } {
  ctx.font = font(theme, theme.fontSize, 500);
  const width = ctx.measureText(text).width + 16;
  return { left: Math.max(0, Math.min(maxX - width, x - width / 2)), width };
}

export function drawTimeBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  maxX: number,
  text: string,
  theme: ChartTheme,
  dpr: number,
): void {
  const box = timeBadgeBox(ctx, x, maxX, text, theme);
  const w = box.width;
  const left = snap(box.left, dpr);
  ctx.fillStyle = theme.crosshairLabelBg;
  ctx.fillRect(left, snap(top + 1, dpr), w, 20);
  ctx.fillStyle = theme.crosshairLabelText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, left + w / 2, top + 11.5);
}
