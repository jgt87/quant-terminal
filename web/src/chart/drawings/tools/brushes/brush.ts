// Brush (catalog LineToolBrush): freehand stroke from the pointer path (simplified by the
// controller, smoothed here per the catalog's smoothing factor). Optional arrow ends and a
// filled area (start joined to end).

import { brushHit, brushSmooth, BRUSH_DEFAULT_SMOOTH, type Drawing, type Point } from "@qt/core";
import { catalogColor } from "../../builders";
import { anchorHandles, fillColor, prop } from "../../draw";
import type { DrawCtx, DrawingToolDef, ToolGeom } from "../../types";
import { applyStroke, F, LINE_END, lineEnds, tracePath, withProps } from "../shapes/kit";

/** Smoothed stroke of a freehand drawing in px. */
export function strokePoints(d: Drawing, g: Pick<ToolGeom, "toPx">): Point[] {
  return brushSmooth(
    (d.points ?? []).map((a) => g.toPx(a)),
    prop(d, "smooth", BRUSH_DEFAULT_SMOOTH),
  );
}

/** Traces the stroke as a smooth path (quadratic segments through the midpoints). */
export function traceSmooth(ctx: CanvasRenderingContext2D, pts: readonly Point[]): void {
  ctx.beginPath();
  if (pts.length < 3) {
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    return;
  }
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

const BG = "rgba(0, 188, 212, 0.2)";

export const brush: DrawingToolDef = {
  type: "brush",
  catalogType: "LineToolBrush",
  family: "brushes",
  label: "Brush",
  icon: "brush",
  iconPath: "M5.5 20.5C8.5 13.5 11.5 22.5 14.5 15.5S20.5 6.5 22.5 8.5",
  iconFill: "M4 23.5c0-1.5 0.8-2.6 1.9-2.6s1.4 1.1 0.6 2.1c-0.7 0.8-1.6 0.9-2.5 0.5z",
  anchors: "freehand",
  defaults: { width: 2, color: "#00bcd4", fillColor: catalogColor(BG) },
  defaultProps: { leftEnd: 0, rightEnd: 0, fillBackground: false, smooth: BRUSH_DEFAULT_SMOOTH },
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"],
  settings: {
    coordinates: false,
    style: [
      F.color("style.color", "Line", "linecolor", "#00bcd4"),
      F.width("style.width", "Width", "linewidth", 2),
      F.select("props.leftEnd", "Left end", "leftEnd", LINE_END, 0),
      F.select("props.rightEnd", "Right end", "rightEnd", LINE_END, 0),
      F.check("props.fillBackground", "Background", "fillBackground", false),
      F.color("style.fillColor", "Background color", "backgroundColor", catalogColor(BG), { testWith: withProps({ fillBackground: true }) }),
    ],
  },
  hitTest(d, g, x, y, tol) {
    return brushHit(x, y, strokePoints(d, g), d.style?.width ?? 2, tol, prop(d, "fillBackground", false));
  },
  render(c: DrawCtx, d) {
    const pts = strokePoints(d, c);
    if (pts.length < 2) return;
    const { ctx } = c;
    applyStroke(c, d);
    if (prop(d, "fillBackground", false)) {
      tracePath(ctx, pts, true);
      ctx.save();
      ctx.fillStyle = fillColor(d, c.color);
      ctx.fill();
      ctx.restore();
    }
    traceSmooth(ctx, pts);
    ctx.stroke();
    lineEnds(c, d, pts);
  },
  handles: (d, g) => {
    // Only the two ends: dragging inner points of a freehand stroke is not useful.
    const all = anchorHandles(d, g);
    return all.length > 2 ? [all[0], all[all.length - 1]] : all;
  },
  onAnchorDrag(d, index, a) {
    const points = [...(d.points ?? [])];
    if (!points.length) return d;
    points[index === 0 ? 0 : points.length - 1] = a;
    return { ...d, points };
  },
};
