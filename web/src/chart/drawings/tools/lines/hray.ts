// Horizontal ray: from the anchor to the right edge at the anchor price (catalog LineToolHorzRay).
// Alt+J draws one at the cursor.

import { hitTestBody } from "@qt/core";
import { crisp } from "../../../canvas";
import { anchorHandles, line, priceTag, prop } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { drawHorzText, HLINE_FLOAT } from "./hline";
import { lineFields, lineTextFields } from "./lineTool";

export const hray: DrawingToolDef = {
  type: "hray",
  catalogType: "LineToolHorzRay",
  family: "lines",
  label: "Horizontal ray",
  icon: "hray",
  anchors: 1,
  hotkey: "Alt+J",
  hotkeyAction: "draw-at-cursor",
  defaults: { color: "#2962ff", width: 2, lineStyle: "solid", textColor: "#2962ff", textSize: 12, bold: false, italic: false },
  defaultProps: { showPrice: true, vertLabelsAlign: "top", horzLabelsAlign: "center" },
  settings: {
    style: [...lineFields(), { kind: "checkbox", key: "props.showPrice", label: "Price label", catalog: "showPrice", default: false }],
    text: lineTextFields({ size: 12, vert: "top" }),
  },
  alert: "line",
  floatingToolbar: HLINE_FLOAT,
  hitTest: (d, g, x, y, tol) => hitTestBody(d, g.toPx, x, y, tol, g.viewport),
  render(c, d) {
    const a = d.anchors[0];
    if (!a) return;
    const p = c.toPx(a);
    const y = crisp(p.y, c.dpr);
    line(c.ctx, { x: p.x, y }, { x: c.width, y });
    if (prop(d, "showPrice", false)) priceTag(c, y, c.formatPrice(a.price), c.color);
    drawHorzText(c, d, p.x, c.width, y, 12, "top");
  },
  handles: anchorHandles,
  bounds(d, g) {
    const p = g.toPx(d.anchors[0]);
    return { x: p.x, y: p.y, width: Math.max(0, g.viewport.width - p.x), height: 0 };
  },
};
