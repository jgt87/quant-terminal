// Path (catalog LineToolPath): click vertices, Enter or double-click finishes. An open
// polyline with optional arrow ends (arrow at the end by default); hit on the line.

import { shapeHitPolygon, type Drawing, type Point } from "@qt/core";
import { anchorHandles } from "../../draw";
import type { DrawCtx, DrawingToolDef, ToolGeom } from "../../types";
import { applyStroke, F, LINE_END, lineEnds, tracePath } from "./kit";

/** Path points in px. */
export const pxPoints = (d: Drawing, g: Pick<ToolGeom, "toPx">): Point[] => (d.points ?? []).map((a) => g.toPx(a));

export const path: DrawingToolDef = {
  type: "path",
  catalogType: "LineToolPath",
  family: "shapes",
  label: "Path",
  icon: "path",
  iconPath: "M5.5 21.5L10.5 9.5L17.5 17.5L22.5 6.5",
  iconFill: "M24.6 4.2l-0.8 5.9-4.6-2.1z",
  anchors: "poly",
  defaults: { width: 2, lineStyle: "solid", color: "#2962ff" },
  defaultProps: { leftEnd: 0, rightEnd: 1 },
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "style", "settings", "lock", "remove", "more"],
  settings: {
    coordinates: false,
    style: [
      F.color("style.color", "Line", "lineColor", "#2962ff"),
      F.width("style.width", "Width", "lineWidth", 2),
      F.lineStyle("style.lineStyle", "Line style", "lineStyle", "solid"),
      F.select("props.leftEnd", "Left end", "leftEnd", LINE_END, 0),
      F.select("props.rightEnd", "Right end", "rightEnd", LINE_END, 1),
    ],
  },
  hitTest(d, g, x, y, tol) {
    return shapeHitPolygon(x, y, pxPoints(d, g), tol, { closed: false, filled: false });
  },
  render(c: DrawCtx, d) {
    const pts = pxPoints(d, c);
    if (pts.length < 2) return;
    applyStroke(c, d);
    tracePath(c.ctx, pts);
    c.ctx.stroke();
    lineEnds(c, d, pts, { left: 0, right: 1 });
  },
  handles: anchorHandles,
};
