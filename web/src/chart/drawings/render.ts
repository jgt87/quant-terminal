// Generic drawing renderer: applies the common stroke style (color, width, dash, opacity), lets
// the tool from the registry draw its body, then draws selection/hover handles. Unknown types
// (tools not registered in this build) are skipped but kept in the layout.

import type { Anchor, Bar, Drawing, Point, VolumeProfile } from "@qt/core";
import { dashFor, withAlpha } from "../theme";
import type { PaneRenderCtx } from "../renderers/types";
import { drawHandles } from "./draw";
import { getTool } from "./registry";
import type { DrawCtx } from "./types";

export { fibLevelStyles } from "./tools/fibonacci/fib";

export interface DrawingRenderOpts {
  toPx: (a: Anchor) => Point;
  toData?: (p: Point) => Anchor;
  bars?: readonly Bar[];
  selected: boolean;
  hovered: boolean;
  intervalSec: number;
  formatPrice: (p: number) => string;
  priceDecimals: number;
  /**
   * Volume profile drawings: the profile of the bars the drawing covers and its x extent
   * (fixed range: between the anchors; anchored: from the anchor to the last bar).
   */
  profile?: (d: Drawing) => { profile: VolumeProfile; x0: number; x1: number } | null;
}

export function drawDrawing(rc: PaneRenderCtx, d: Drawing, o: DrawingRenderOpts): void {
  const def = getTool(d.type);
  if (!def) return;
  const { ctx, theme, dpr } = rc;
  const color = d.style?.color ?? theme.drawing;
  const lw = d.style?.width ?? 1;
  const c: DrawCtx = {
    ...rc,
    toPx: o.toPx,
    toData: o.toData ?? (() => ({ time: 0, price: 0 })),
    viewport: { width: rc.width, height: rc.height },
    bars: o.bars ?? [],
    intervalSec: o.intervalSec,
    color,
    selected: o.selected,
    hovered: o.hovered,
    formatPrice: o.formatPrice,
    priceDecimals: o.priceDecimals,
    profile: o.profile,
  };
  ctx.save();
  ctx.globalAlpha = d.style?.opacity ?? 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = o.selected || o.hovered ? lw + 0.5 : lw;
  ctx.setLineDash(d.style?.lineStyle ? dashFor(d.style.lineStyle, lw) : (d.style?.dash ?? []));
  def.render(c, d);
  ctx.restore();
  if (o.selected || o.hovered) drawHandles(ctx, def.handles(d, c), theme.handleFill, o.selected ? theme.accent : color, dpr);
}

/** Rubber-band / zoom selection rectangle (pane pixels). */
export function drawBand(rc: PaneRenderCtx, band: { x: number; y: number; width: number; height: number }): void {
  const { ctx, theme } = rc;
  ctx.save();
  ctx.fillStyle = withAlpha(theme.accent, 0.1);
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.fillRect(band.x, band.y, band.width, band.height);
  ctx.strokeRect(band.x + 0.5, band.y + 0.5, band.width, band.height);
  ctx.restore();
}
