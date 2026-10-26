// Cyclic lines (catalog LineToolCircleLines): full-height vertical lines starting at anchor a and
// repeating every |x(b) − x(a)| px in b's direction to the edge of the chart (nothing is drawn
// on the far side of a). Spacing comes from core `cyclicLineXs`.

import { cyclicLineXs } from "@qt/core";
import { crisp } from "../../../canvas";
import { anchorHandles, line } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { applyStroke, lineFields } from "./common";

const COLOR = "#80ccdb";

export const cyclicLines: DrawingToolDef = {
  type: "cyclicLines",
  catalogType: "LineToolCircleLines",
  family: "cycles",
  label: "Cyclic lines",
  icon: "cycles",
  iconPath: "M5.5 4.5v19M11.5 4.5v19M17.5 4.5v19M23.5 4.5v19",
  anchors: 2,
  defaults: { width: 2, lineStyle: "solid", color: COLOR },
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"],
  settings: { coordinates: "time-price", style: lineFields("Lines", COLOR) },
  hitTest(d, g, x, _y, tol) {
    const [a, b] = d.anchors;
    if (!a || !b) return false;
    return cyclicLineXs(g.toPx(a), g.toPx(b), g.viewport.width).some((lx) => Math.abs(x - lx) <= tol);
  },
  render(c, d) {
    const [a, b] = d.anchors;
    if (!a) return;
    applyStroke(c, d);
    const pa = c.toPx(a);
    const xs = b ? cyclicLineXs(pa, c.toPx(b), c.width) : [pa.x];
    for (const x of xs) {
      const cx = crisp(x, c.dpr);
      line(c.ctx, { x: cx, y: 0 }, { x: cx, y: c.height });
    }
  },
  handles: anchorHandles,
  bounds(d, g) {
    const xs = d.anchors.map((a) => g.toPx(a).x);
    const [a, b] = d.anchors;
    const all = a && b ? cyclicLineXs(g.toPx(a), g.toPx(b), g.viewport.width) : xs;
    const x0 = Math.min(...xs, ...all);
    const x1 = Math.max(...xs, ...all);
    return { x: x0, y: 0, width: x1 - x0, height: g.viewport.height };
  },
};
