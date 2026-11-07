// Symbol watermark: the symbol and interval in large faint type behind the price pane.

import { font } from "../theme";
import type { PaneRenderCtx } from "./types";

/** "1m", "4h", "1D", "1W", "1M" style label for a bar length in seconds. */
export function intervalText(sec: number, monthly = false): string {
  if (monthly) return "1M";
  if (sec % 604800 === 0) return `${sec / 604800}W`;
  if (sec % 86400 === 0) return `${sec / 86400}D`;
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  if (sec % 60 === 0) return `${sec / 60}m`;
  return `${sec}s`;
}

/** The watermark's text: the symbol without its source prefix ("MT5:EURUSD" → "EURUSD") and the interval. */
export function watermarkText(symbol: string, intervalSec: number, monthly = false): string {
  const name = symbol.includes(":") ? symbol.slice(symbol.indexOf(":") + 1) : symbol;
  return name ? `${name}, ${intervalText(intervalSec, monthly)}` : "";
}

export function drawWatermark(rc: PaneRenderCtx, text: string): void {
  if (!text) return;
  const { ctx, width, height, theme } = rc;
  // As large as fits: about a sixth of the pane height, and never wider than 80% of it.
  let size = Math.max(14, Math.min(96, height / 6));
  ctx.font = font(theme, size, 700);
  const w = ctx.measureText(text).width;
  if (w > width * 0.8) size = Math.max(12, (size * width * 0.8) / w);
  ctx.save();
  ctx.font = font(theme, size, 700);
  ctx.fillStyle = theme.watermark;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2);
  ctx.restore();
}
