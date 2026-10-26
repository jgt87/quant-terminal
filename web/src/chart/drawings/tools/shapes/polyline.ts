// Polyline (catalog LineToolPolyline): click vertices, Enter or double-click finishes; the
// outline is closed and filled by default. Hit on the outline, or inside when filled.

import { shapeHitPolygon } from "@qt/core";
import { anchorHandles, prop } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { borderFields, fillIfOn } from "./common";
import { applyStroke, tracePath } from "./kit";
import { pxPoints } from "./path";

export const polyline: DrawingToolDef = {
  type: "polyline",
  catalogType: "LineToolPolyline",
  family: "shapes",
  label: "Polyline",
  icon: "polyline",
  iconPath: "M5.5 18.5L9.5 6.5L21.5 8.5L22.5 20.5Z",
  iconFill: "M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM9.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM21.5 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM22.5 23a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: "poly",
  defaults: { width: 2, color: "#00bcd4", fillColor: "#00bcd433" },
  defaultProps: { fillBackground: true },
  floatingToolbar: ["templates", "line-tool-color", "background-color", "line-tool-width", "style", "settings", "lock", "remove", "more"],
  settings: { coordinates: false, style: borderFields({ color: "#00bcd4", colorKey: "linecolor", background: "rgba(0, 188, 212, 0.2)" }) },
  hitTest(d, g, x, y, tol) {
    const pts = pxPoints(d, g);
    return shapeHitPolygon(x, y, pts, tol, { closed: pts.length > 2, filled: prop(d, "fillBackground", true) });
  },
  render(c, d) {
    const pts = pxPoints(d, c);
    if (pts.length < 2) return;
    applyStroke(c, d);
    tracePath(c.ctx, pts, pts.length > 2);
    fillIfOn(c, d);
    c.ctx.stroke();
  },
  handles: anchorHandles,
};
