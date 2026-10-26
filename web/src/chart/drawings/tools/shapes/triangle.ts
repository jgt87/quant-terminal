// Triangle (catalog LineToolTriangle): three corners, filled by default. Hit on the outline, or
// inside when filled.

import { shapeHitPolygon } from "@qt/core";
import { anchorHandles, prop } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { borderFields, fillIfOn } from "./common";
import { applyStroke, tracePath } from "./kit";

export const triangle: DrawingToolDef = {
  type: "triangle",
  catalogType: "LineToolTriangle",
  family: "shapes",
  label: "Triangle",
  icon: "triangle",
  iconPath: "M4.5 22.5L13.5 5.5L23.5 20.5Z",
  iconFill: "M4.5 25a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM13.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM23.5 23a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 3,
  defaults: { width: 2, color: "#089981", fillColor: "#08998133" },
  defaultProps: { fillBackground: true },
  floatingToolbar: ["templates", "line-tool-color", "background-color", "line-tool-width", "settings", "lock", "remove", "more"],
  settings: { coordinates: "time-price", style: borderFields({ color: "#089981", background: "rgba(8, 153, 129, 0.2)" }) },
  hitTest(d, g, x, y, tol) {
    const pts = d.anchors.map((a) => g.toPx(a));
    if (pts.length < 2) return false;
    return shapeHitPolygon(x, y, pts, tol, { closed: pts.length > 2, filled: pts.length > 2 && prop(d, "fillBackground", true) });
  },
  render(c, d) {
    const pts = d.anchors.map((a) => c.toPx(a));
    if (pts.length < 2) return;
    applyStroke(c, d);
    tracePath(c.ctx, pts, pts.length > 2);
    if (pts.length > 2) fillIfOn(c, d);
    c.ctx.stroke();
  },
  handles: anchorHandles,
};
