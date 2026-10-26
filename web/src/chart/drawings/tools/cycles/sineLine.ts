// Sine line (catalog LineToolSineLine): a sine wave through two anchors. a is an extreme (peak
// or trough), b the opposite extreme half a period later; the wave runs across the whole chart
// (core `sinePoints`).

import { distanceToSine, sinePoints } from "@qt/core";
import { anchorHandles, line, polyline } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { applyStroke, lineFields } from "./common";

const COLOR = "#159980";

export const sineLine: DrawingToolDef = {
  type: "sineLine",
  catalogType: "LineToolSineLine",
  family: "cycles",
  label: "Sine line",
  icon: "cycles",
  iconPath: "M3.5 14.5C5.5 6.5 8.5 6.5 10.5 14.5S15.5 22.5 17.5 14.5S22.5 6.5 24.5 14.5",
  anchors: 2,
  defaults: { width: 2, lineStyle: "solid", color: COLOR },
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "style", "settings", "lock", "remove", "more"],
  settings: { coordinates: "time-price", style: lineFields("Lines", COLOR) },
  hitTest(d, g, x, y, tol) {
    const [a, b] = d.anchors;
    if (!a || !b) return false;
    return distanceToSine(g.toPx(a), g.toPx(b), x, y) <= tol;
  },
  render(c, d) {
    const [a, b] = d.anchors;
    if (!a || !b) return;
    applyStroke(c, d);
    const pa = c.toPx(a);
    const pb = c.toPx(b);
    const pts = sinePoints(pa, pb, 0, c.width);
    if (pts.length) polyline(c.ctx, pts);
    else line(c.ctx, pa, pb);
  },
  handles: anchorHandles,
  bounds(d, g) {
    const [a, b] = d.anchors;
    const pts = d.anchors.map((x) => g.toPx(x));
    const ys = pts.map((p) => p.y);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    return a && b ? { x: 0, y: y0, width: g.viewport.width, height: y1 - y0 } : { x: pts[0]?.x ?? 0, y: y0, width: 0, height: 0 };
  },
};
