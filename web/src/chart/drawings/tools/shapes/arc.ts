// Arc (catalog LineToolArc): start, end and a point the arc passes through (circular arc
// through three points). Filled by default (the arc segment closed by its chord).

import { shapeArc3, shapeArcPoints, shapeHitArc } from "@qt/core";
import { anchorHandles, line, prop } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { borderFields, fillIfOn } from "./common";
import { applyStroke } from "./kit";

export const arc: DrawingToolDef = {
  type: "arc",
  catalogType: "LineToolArc",
  family: "shapes",
  label: "Arc",
  icon: "arc",
  iconPath: "M4.5 20.5C6.5 10.5 21.5 10.5 23.5 20.5",
  iconFill: "M4.5 23a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM14 15.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM23.5 23a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 3,
  defaults: { width: 2, color: "#e91e63", fillColor: "#e91e6333" },
  defaultProps: { fillBackground: true },
  floatingToolbar: ["templates", "line-tool-color", "background-color", "line-tool-width", "settings", "lock", "remove", "more"],
  settings: { coordinates: false, style: borderFields({ color: "#e91e63", background: "rgba(233, 30, 99, 0.2)" }) },
  hitTest(d, g, x, y, tol) {
    const [a, b, k] = d.anchors;
    if (!a || !b) return false;
    const pa = g.toPx(a);
    const pb = g.toPx(b);
    return shapeHitArc(x, y, pa, pb, k ? g.toPx(k) : pb, tol, Boolean(k) && prop(d, "fillBackground", true));
  },
  render(c, d) {
    const [a, b, k] = d.anchors;
    if (!a || !b) return;
    applyStroke(c, d);
    const pa = c.toPx(a);
    const pb = c.toPx(b);
    const arcDef = k ? shapeArc3(pa, pb, c.toPx(k)) : null;
    if (!arcDef) {
      line(c.ctx, pa, pb);
      return;
    }
    const { ctx } = c;
    ctx.beginPath();
    ctx.arc(arcDef.cx, arcDef.cy, arcDef.r, arcDef.start, arcDef.end, arcDef.ccw);
    ctx.closePath();
    fillIfOn(c, d);
    // Stroke the curve only (not the chord).
    ctx.beginPath();
    ctx.arc(arcDef.cx, arcDef.cy, arcDef.r, arcDef.start, arcDef.end, arcDef.ccw);
    ctx.stroke();
  },
  handles: anchorHandles,
  bounds(d, g) {
    const [a, b, k] = d.anchors;
    const pa = g.toPx(a);
    const pb = g.toPx(b ?? a);
    const arcDef = k ? shapeArc3(pa, pb, g.toPx(k)) : null;
    const pts = arcDef ? shapeArcPoints(arcDef, 24) : [pa, pb];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  },
};
