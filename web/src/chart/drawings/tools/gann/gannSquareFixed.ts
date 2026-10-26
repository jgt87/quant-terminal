// Gann square fixed (catalog LineToolGannFixed): the Gann grid (levels, fans, arcs) in a square
// that stays square on screen at any zoom. The first anchor is the origin; the second anchor sets
// the side (its horizontal distance) and the side of the origin the square opens to.

import { gannFixedCorner, type Drawing, type Point } from "@qt/core";
import type { DrawingToolDef, ToolGeom } from "../../types";
import { everyRow } from "./common";
import { ARCROWS, FANS, LEVELS, hitSquare, renderSquare, squareDefaultProps, squareStyleFields } from "./squareCommon";

function corners(d: Drawing, g: Pick<ToolGeom, "toPx">): [Point, Point] | null {
  const [a, b] = d.anchors;
  if (!a || !b) return null;
  const pa = g.toPx(a);
  return [pa, gannFixedCorner(pa, g.toPx(b))];
}

export const gannSquareFixed: DrawingToolDef = {
  type: "gannSquareFixed",
  catalogType: "LineToolGannFixed",
  family: "gann",
  label: "Gann square fixed",
  icon: "gannSquareFixed",
  iconPath: "M5.5 5.5h17v17h-17zM5.5 13.5A9 9 0 0 1 14.5 22.5M5.5 8.5A14 14 0 0 1 19.5 22.5M5.5 22.5L22.5 5.5",
  iconFill: "M5.5 25a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 2,
  defaults: { width: 2 },
  defaultProps: squareDefaultProps(),
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"],
  floatBindings: { "line-tool-color": everyRow([LEVELS, FANS, ARCROWS], "color"), "line-tool-width": everyRow([LEVELS, FANS, ARCROWS], "width") },
  settings: { coordinates: "time-price", style: squareStyleFields() },
  hitTest(d, g, x, y, tol) {
    const p = corners(d, g);
    return p ? hitSquare(d, p[0], p[1], x, y, tol) : false;
  },
  render(c, d) {
    const p = corners(d, c);
    if (p) renderSquare(c, d, p[0], p[1]);
  },
  handles(d, g) {
    const p = corners(d, g);
    if (p) return p;
    return d.anchors.map((a) => g.toPx(a));
  },
  onAnchorDrag(d, i, a) {
    const anchors = [...d.anchors];
    anchors[i] = a;
    return { ...d, anchors };
  },
};
