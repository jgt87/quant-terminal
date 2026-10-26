// Rotated rectangle (catalog LineToolRotatedRectangle): a→b is one side, the third anchor sets
// the width. Filled by default; hit on the border, or inside when filled.

import { shapeHitPolygon, shapeRotatedRect, shapeRotatedRectWidthHandle } from "@qt/core";
import { line, prop } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { borderFields, fillIfOn } from "./common";
import { applyStroke, tracePath } from "./kit";

export const rotatedRectangle: DrawingToolDef = {
  type: "rotatedRectangle",
  catalogType: "LineToolRotatedRectangle",
  family: "shapes",
  label: "Rotated rectangle",
  icon: "rotatedRectangle",
  iconPath: "M4.5 15.5L15.5 4.5L23.5 12.5L12.5 23.5Z",
  iconFill: "M4.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM15.5 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 3,
  defaults: { width: 2, color: "#4caf50", fillColor: "#4caf5033" },
  defaultProps: { fillBackground: true },
  floatingToolbar: ["templates", "line-tool-color", "background-color", "line-tool-width", "settings", "lock", "remove", "more"],
  settings: { coordinates: false, style: borderFields({ color: "#4caf50", background: "rgba(76, 175, 80, 0.2)" }) },
  hitTest(d, g, x, y, tol) {
    const [a, b, c] = d.anchors;
    if (!a || !b) return false;
    const pa = g.toPx(a);
    const pb = g.toPx(b);
    const corners = c ? shapeRotatedRect(pa, pb, g.toPx(c)) : [pa, pb];
    return shapeHitPolygon(x, y, corners, tol, { closed: corners.length > 2, filled: Boolean(c) && prop(d, "fillBackground", true) });
  },
  render(c, d) {
    const [a, b, k] = d.anchors;
    if (!a || !b) return;
    applyStroke(c, d);
    const pa = c.toPx(a);
    const pb = c.toPx(b);
    if (!k) {
      line(c.ctx, pa, pb);
      return;
    }
    tracePath(c.ctx, shapeRotatedRect(pa, pb, c.toPx(k)), true);
    fillIfOn(c, d);
    c.ctx.stroke();
  },
  handles(d, g) {
    const [a, b, k] = d.anchors;
    const pts = d.anchors.map((x) => g.toPx(x));
    if (a && b && k) pts[2] = shapeRotatedRectWidthHandle(g.toPx(a), g.toPx(b), g.toPx(k));
    return pts;
  },
};
