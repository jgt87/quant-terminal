// Time cycles (catalog LineToolTimeCycles): half ellipses standing on anchor a's price, one per
// period |x(b) − x(a)|, repeating in b's direction across the chart. b's height above / below a
// sets the arc height and direction (level with a: half circles). Optional background fill.

import { cycleArcPoints, distanceToCycleArc, timeCycleArcs } from "@qt/core";
import { anchorHandles, fillColor, prop } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { applyStroke, lineFields } from "./common";

const COLOR = "#159980";
const FILL = "#6aa84f80";

export const timeCycles: DrawingToolDef = {
  type: "timeCycles",
  catalogType: "LineToolTimeCycles",
  family: "cycles",
  label: "Time cycles",
  icon: "cycles",
  iconPath: "M4.5 19.5a5 5 0 0 1 10 0a5 5 0 0 1 10 0M3.5 19.5h21",
  anchors: 2,
  defaults: { width: 2, lineStyle: "solid", color: COLOR, fillColor: FILL },
  defaultProps: { fillBackground: true },
  floatingToolbar: ["templates", "line-tool-color", "background-color", "line-tool-width", "style", "settings", "lock", "remove", "more"],
  settings: {
    coordinates: "time-price",
    style: [
      ...lineFields("Line", COLOR),
      { kind: "checkbox", key: "props.fillBackground", label: "Background (on/off)", catalog: "fillBackground", default: true },
      {
        kind: "color",
        key: "style.fillColor",
        label: "Background / color",
        catalog: "backgroundColor",
        default: FILL,
        testWith: (d) => ({ ...d, props: { ...d.props, fillBackground: true } }),
      },
    ],
  },
  hitTest(d, g, x, y, tol) {
    const [a, b] = d.anchors;
    if (!a || !b) return false;
    return timeCycleArcs(g.toPx(a), g.toPx(b), g.viewport.width).some((arc) => distanceToCycleArc(arc, x, y) <= tol);
  },
  render(c, d) {
    const [a, b] = d.anchors;
    if (!a || !b) return;
    const { ctx } = c;
    const arcs = timeCycleArcs(c.toPx(a), c.toPx(b), c.width);
    if (prop(d, "fillBackground", true)) {
      ctx.fillStyle = fillColor(d, c.color);
      for (const arc of arcs) {
        const pts = cycleArcPoints(arc);
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
      }
    }
    applyStroke(c, d);
    for (const arc of arcs) {
      const pts = cycleArcPoints(arc);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
  },
  handles: anchorHandles,
  bounds(d, g) {
    const [a, b] = d.anchors;
    const pts = d.anchors.map((x) => g.toPx(x));
    const arcs = a && b ? timeCycleArcs(g.toPx(a), g.toPx(b), g.viewport.width) : [];
    const xs = [...pts.map((p) => p.x), ...arcs.flatMap((r) => [r.cx - r.rx, r.cx + r.rx])];
    const ys = [...pts.map((p) => p.y), ...arcs.flatMap((r) => [r.cy, r.up ? r.cy - r.ry : r.cy + r.ry])];
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    return { x: x0, y: y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 };
  },
};
