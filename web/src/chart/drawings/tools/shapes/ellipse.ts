// Ellipse (catalog LineToolEllipse): the first two anchors are the ends of one axis, the third
// sets the other semi-axis. Filled by default, optional centered text.

import { shapeEllipse3, shapeEllipsePoint, shapeEllipsePoints, shapeHitEllipse, type Anchor, type Drawing, type Point } from "@qt/core";
import { line, prop } from "../../draw";
import type { DrawingToolDef, ToolGeom } from "../../types";
import { borderFields, centerText, fillIfOn, shapeTextFields } from "./common";
import { applyStroke } from "./kit";

/** Ellipse of a drawing in px (null until two anchors exist; the third defaults to a circle). */
function ellipseOf(d: Drawing, toPx: (a: Anchor) => Point) {
  const [a, b, k] = d.anchors;
  if (!a || !b) return null;
  const pa = toPx(a);
  const pb = toPx(b);
  if (k) return shapeEllipse3(pa, pb, toPx(k));
  const e = shapeEllipse3(pa, pb, pa);
  return { ...e, ry: e.rx };
}

export const ellipse: DrawingToolDef = {
  type: "ellipse",
  catalogType: "LineToolEllipse",
  family: "shapes",
  label: "Ellipse",
  icon: "ellipse",
  iconPath: "M14 7.5c5.8 0 10.5 2.9 10.5 6.5S19.8 20.5 14 20.5S3.5 17.6 3.5 14S8.2 7.5 14 7.5z",
  iconFill: "M14 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM24.5 16.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 3,
  defaults: { width: 2, color: "#f23645", fillColor: "#f2364533", textColor: "#f23645", textSize: 14, bold: false, italic: false },
  defaultProps: { fillBackground: true },
  floatingToolbar: ["templates", "line-tool-color", "background-color", "text-color", "line-tool-width", "settings", "lock", "remove", "more"],
  settings: {
    coordinates: false,
    style: borderFields({ color: "#f23645", background: "rgba(242, 54, 69, 0.2)" }),
    text: shapeTextFields("#f23645"),
  },
  hitTest(d, g, x, y, tol) {
    const e = ellipseOf(d, g.toPx);
    return e ? shapeHitEllipse(x, y, e, tol, prop(d, "fillBackground", true)) : false;
  },
  render(c, d) {
    const e = ellipseOf(d, c.toPx);
    if (!e) return;
    applyStroke(c, d);
    if (d.anchors.length < 3) {
      // Placing: the axis first.
      line(c.ctx, c.toPx(d.anchors[0]), c.toPx(d.anchors[1]));
      return;
    }
    c.ctx.beginPath();
    c.ctx.ellipse(e.cx, e.cy, Math.max(0, e.rx), Math.max(0, e.ry), e.rotation, 0, Math.PI * 2);
    fillIfOn(c, d);
    c.ctx.stroke();
    centerText(c, d, e.cx, e.cy);
  },
  handles(d, g: ToolGeom) {
    const pts = d.anchors.map((a) => g.toPx(a));
    const e = ellipseOf(d, g.toPx);
    // Third handle: on the outline at the end of the second axis.
    if (e && d.anchors[2]) pts[2] = shapeEllipsePoint(e, Math.PI / 2);
    return pts;
  },
  onAnchorDrag(d, index, a) {
    const anchors = [...d.anchors];
    anchors[index] = a;
    return { ...d, anchors };
  },
  bounds(d, g) {
    const e = ellipseOf(d, g.toPx);
    if (!e) return { x: 0, y: 0, width: 0, height: 0 };
    const pts = shapeEllipsePoints(e, 36);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  },
};
