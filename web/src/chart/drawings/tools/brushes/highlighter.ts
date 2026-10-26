// Highlighter (catalog LineToolHighlighter): a wide, translucent freehand stroke (20 px of
// 20%-alpha red by default) drawn as one path so overlaps do not darken.

import { brushHit, BRUSH_DEFAULT_SMOOTH } from "@qt/core";
import { catalogColor } from "../../builders";
import type { DrawingToolDef } from "../../types";
import { F } from "../shapes/kit";
import { strokePoints, traceSmooth } from "./brush";

const COLOR = catalogColor("rgba(242, 54, 69, 0.2)");
const WIDTHS = [8, 12, 20, 32, 48, 64, 80, 96].map((w) => ({ value: w, label: `${w}px` }));

export const highlighter: DrawingToolDef = {
  type: "highlighter",
  catalogType: "LineToolHighlighter",
  family: "brushes",
  label: "Highlighter",
  icon: "highlighter",
  iconPath: "M8.5 19.5L17.5 6.5L22.5 10.5L13.5 23.5H8.5Z M5.5 24.5H23.5",
  iconFill: "M8.5 19.5L13.5 23.5H8.5Z",
  anchors: "freehand",
  defaults: { color: COLOR, width: 20 },
  defaultProps: { smooth: BRUSH_DEFAULT_SMOOTH },
  floatingToolbar: ["templates", "line-tool-color", "highlighter-width", "settings", "lock", "remove", "more"],
  settings: {
    coordinates: false,
    style: [F.color("style.color", "Line", "linecolor", COLOR), F.select("style.width", "Thickness", "width", WIDTHS, 20)],
  },
  hitTest(d, g, x, y, tol) {
    return brushHit(x, y, strokePoints(d, g), d.style?.width ?? 20, tol);
  },
  render(c, d) {
    const pts = strokePoints(d, c);
    if (pts.length < 2) return;
    const { ctx } = c;
    ctx.strokeStyle = c.color;
    ctx.lineWidth = d.style?.width ?? 20;
    ctx.setLineDash([]);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    traceSmooth(ctx, pts);
    ctx.stroke();
  },
  handles(d, g) {
    const pts = (d.points ?? []).map((a) => g.toPx(a));
    return pts.length > 2 ? [pts[0], pts[pts.length - 1]] : pts;
  },
  onAnchorDrag(d, index, a) {
    const points = [...(d.points ?? [])];
    if (!points.length) return d;
    points[index === 0 ? 0 : points.length - 1] = a;
    return { ...d, points };
  },
};
