// High and low labels: the highest high and the lowest low of the visible bars, marked on the
// bar where they happened with a short leader line and the price.

import type { Bar } from "@qt/core";
import { crisp, hairline } from "../canvas";
import { font } from "../theme";
import type { PaneRenderCtx } from "./types";

export interface Extreme {
  index: number;
  price: number;
}

/** Highest high and lowest low of bars from..to (inclusive, clamped); the first bar wins ties. */
export function visibleHighLow(bars: readonly Bar[], from: number, to: number): { high: Extreme; low: Extreme } | null {
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(bars.length - 1, Math.ceil(to));
  if (a > b) return null;
  let high: Extreme | null = null;
  let low: Extreme | null = null;
  for (let i = a; i <= b; i++) {
    const bar = bars[i];
    if (!bar || !isFinite(bar.high) || !isFinite(bar.low)) continue;
    if (!high || bar.high > high.price) high = { index: i, price: bar.high };
    if (!low || bar.low < low.price) low = { index: i, price: bar.low };
  }
  return high && low ? { high, low } : null;
}

export function drawHighLowLabels(rc: PaneRenderCtx, bars: readonly Bar[], format: (v: number) => string): void {
  const hl = visibleHighLow(bars, rc.from, rc.to);
  if (!hl) return;
  const { ctx, dpr, theme } = rc;
  ctx.font = font(theme, 11);
  ctx.textBaseline = "middle";
  ctx.strokeStyle = theme.highLowLabel;
  ctx.fillStyle = theme.highLowLabel;
  ctx.lineWidth = hairline(dpr);
  const mark = (ex: Extreme, above: boolean) => {
    const x = rc.ts.indexToX(ex.index);
    const y = crisp(rc.ps.toY(ex.price) + (above ? -4 : 4), dpr);
    const text = format(ex.price);
    const w = ctx.measureText(text).width;
    // The leader runs right of the bar, or left when the label would leave the plot.
    const right = x + 24 + w <= rc.width;
    const x1 = right ? x + 18 : x - 18;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.textAlign = right ? "left" : "right";
    ctx.fillText(text, right ? x1 + 3 : x1 - 3, y);
  };
  mark(hl.high, true);
  mark(hl.low, false);
}
