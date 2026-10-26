// Crossline (catalog LineToolCrossLine): a horizontal and a vertical line through one anchor,
// with price and time labels. Alt+C draws it at the cursor.

import { distanceToCross } from "@qt/core";
import { crisp } from "../../../canvas";
import { formatDate } from "../../../format";
import { anchorHandles, line, priceTag, prop } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { lineRows } from "./lineParts";

export const crossline: DrawingToolDef = {
  type: "crossline",
  catalogType: "LineToolCrossLine",
  family: "lines",
  label: "Crossline",
  menuName: "crossline",
  icon: "crossline",
  iconPath: "M3.5 14.5h21M14.5 3.5v21",
  iconFill: "M14.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 1,
  hotkey: "Alt+C",
  hotkeyAction: "draw-at-cursor",
  defaults: { width: 2, lineStyle: "solid", color: "#2962ff" },
  defaultProps: { showPrice: true, showTime: true },
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "style", "settings", "lock", "remove", "more"],
  settings: {
    coordinates: "time-price",
    style: [
      ...lineRows("#2962ff"),
      { kind: "checkbox", key: "props.showPrice", label: "Price label", catalog: "showPrice", default: true },
      { kind: "checkbox", key: "props.showTime", label: "Time label", catalog: "showTime", default: true },
    ],
  },
  hitTest(d, g, x, y, tol) {
    const a = d.anchors[0];
    return a ? distanceToCross(x, y, g.toPx(a)) <= tol : false;
  },
  render(c, d) {
    const a = d.anchors[0];
    if (!a) return;
    const p = c.toPx(a);
    const x = crisp(p.x, c.dpr);
    const y = crisp(p.y, c.dpr);
    line(c.ctx, { x: 0, y }, { x: c.width, y });
    line(c.ctx, { x, y: 0 }, { x, y: c.height });
    if (prop(d, "showPrice", true)) priceTag(c, y, c.formatPrice(a.price), c.color);
    if (prop(d, "showTime", true)) {
      c.ctx.fillStyle = c.color;
      c.ctx.textAlign = "left";
      c.ctx.textBaseline = "bottom";
      c.ctx.fillText(formatDate(a.time), x + 4, c.height - 4);
    }
  },
  handles: anchorHandles,
  bounds: (_d, g) => ({ x: 0, y: 0, width: g.viewport.width, height: g.viewport.height }),
};
