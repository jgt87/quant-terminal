// Circle (catalog LineToolCircle): center and a point on the circumference. Filled by default,
// optional centered text. Hit on the outline, or inside when filled.

import { shapeCircle, shapeHitEllipse } from "@qt/core";
import { anchorHandles, prop } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { borderFields, centerText, fillIfOn, shapeTextFields } from "./common";
import { applyStroke } from "./kit";

export const circle: DrawingToolDef = {
  type: "circle",
  catalogType: "LineToolCircle",
  family: "shapes",
  label: "Circle",
  icon: "circle",
  iconPath: "M14 4.5a9.5 9.5 0 1 1 0 19a9.5 9.5 0 1 1 0-19z",
  iconFill: "M14 16.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 2,
  defaults: { width: 2, color: "#ff9800", fillColor: "#ff980033", textColor: "#ff9800", textSize: 14, bold: false, italic: false },
  defaultProps: { fillBackground: true },
  floatingToolbar: ["templates", "line-tool-color", "background-color", "text-color", "line-tool-width", "settings", "lock", "remove", "more"],
  settings: {
    coordinates: "time-price",
    style: borderFields({ color: "#ff9800", background: "rgba(255, 152, 0, 0.2)" }),
    text: shapeTextFields("#ff9800"),
  },
  hitTest(d, g, x, y, tol) {
    const [a, b] = d.anchors;
    if (!a || !b) return false;
    return shapeHitEllipse(x, y, shapeCircle(g.toPx(a), g.toPx(b)), tol, prop(d, "fillBackground", true));
  },
  render(c, d) {
    const [a, b] = d.anchors;
    if (!a || !b) return;
    const e = shapeCircle(c.toPx(a), c.toPx(b));
    applyStroke(c, d);
    c.ctx.beginPath();
    c.ctx.arc(e.cx, e.cy, e.rx, 0, Math.PI * 2);
    fillIfOn(c, d);
    c.ctx.stroke();
    centerText(c, d, e.cx, e.cy);
  },
  handles: anchorHandles,
  bounds(d, g) {
    const [a, b] = d.anchors;
    const e = shapeCircle(g.toPx(a), g.toPx(b ?? a));
    return { x: e.cx - e.rx, y: e.cy - e.rx, width: 2 * e.rx, height: 2 * e.rx };
  },
};
