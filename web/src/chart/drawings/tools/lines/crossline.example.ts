// EXAMPLE (not registered): a complete tool module for the catalog's Crossline
// (LineToolCrossLine), as a template for family agents. The Lines family agent ships the real one
// as crossline.ts and registers it in ./index.ts.
//
// Pattern: catalogType + factory defaults (catalog) + fields tagged with `catalog` keys +
// floatingToolbar layout + hit-test from core geometry + render that honors every field + icon.

import { distanceToLine } from "@qt/core";
import { crisp } from "../../../canvas";
import { formatDate } from "../../../format";
import { checkbox, styleFields, withCatalog } from "../../builders";
import { anchorHandles, line, priceTag, prop } from "../../draw";
import type { DrawingToolDef } from "../../types";

export const crosslineExample: DrawingToolDef = {
  type: "crossline",
  catalogType: "LineToolCrossLine",
  family: "lines",
  label: "Cross line",
  menuName: "crossline",
  icon: "crossline",
  iconPath: "M3.5 14.5h21M14.5 3.5v21",
  iconFill: "M14.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 1,
  hotkey: "Alt+C",
  hotkeyAction: "draw-at-cursor",
  // Factory values from the catalog: new drawings start with them.
  defaults: { width: 2, lineStyle: "solid", color: "#2962ff" },
  defaultProps: { showPrice: true, showTime: true },
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "style", "settings", "lock", "remove", "more"],
  settings: {
    coordinates: "time-price",
    style: [
      ...withCatalog(styleFields({ line: true }), { "style.color": "linecolor", "style.width": "linewidth", "style.lineStyle": "linestyle" }).filter(
        (f) => f.key !== "style.opacity",
      ),
      { ...checkbox("props.showPrice", "Price label", true), catalog: "showPrice" },
      { ...checkbox("props.showTime", "Time label", true), catalog: "showTime" },
    ],
  },
  hitTest(d, g, x, y, tol) {
    const p = g.toPx(d.anchors[0]);
    return distanceToLine(x, y, 0, p.y, 1, p.y) <= tol || distanceToLine(x, y, p.x, 0, p.x, 1) <= tol;
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
      c.ctx.textAlign = "center";
      c.ctx.textBaseline = "bottom";
      c.ctx.fillText(formatDate(a.time), x, c.height - 4);
    }
  },
  handles: anchorHandles,
  bounds: (d, g) => ({ x: 0, y: 0, width: g.viewport.width, height: g.viewport.height }),
};
