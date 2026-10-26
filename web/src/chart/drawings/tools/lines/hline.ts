// Horizontal line: full width at the anchor price with a price label (catalog LineToolHorzLine).
// Alt+H draws one at the cursor.

import { hitTestBody } from "@qt/core";
import { crisp } from "../../../canvas";
import { anchorHandles, drawText, line, priceTag, prop, textStyleOf } from "../../draw";
import type { DrawCtx, DrawingToolDef, FloatButton } from "../../types";
import type { Drawing } from "@qt/core";
import { lineFields, lineTextFields } from "./lineTool";

export const HLINE_FLOAT: FloatButton[] = ["templates", "line-tool-color", "text-color", "line-tool-width", "style", "settings", "add-alert", "lock", "remove", "more"];

/** Text on a horizontal line between x0 and x1 (alignment props). */
export function drawHorzText(c: DrawCtx, d: Drawing, x0: number, x1: number, y: number, size: number, vertFallback: string): void {
  if (!d.text) return;
  const horz = prop(d, "horzLabelsAlign", "center");
  const vert = prop(d, "vertLabelsAlign", vertFallback);
  const x = horz === "left" ? x0 + 4 : horz === "right" ? x1 - 70 : (x0 + x1) / 2;
  drawText(c, d.text, x, y + (vert === "bottom" ? -4 : vert === "top" ? 4 : 0), {
    ...textStyleOf(d, c, size),
    align: horz === "left" ? "left" : horz === "right" ? "right" : "center",
    baseline: vert === "bottom" ? "bottom" : vert === "top" ? "top" : "middle",
    background: vert === "middle" ? c.theme.boxBg : undefined,
  });
}

export const hline: DrawingToolDef = {
  type: "hline",
  catalogType: "LineToolHorzLine",
  family: "lines",
  label: "Horizontal line",
  icon: "hline",
  anchors: 1,
  hotkey: "Alt+H",
  hotkeyAction: "draw-at-cursor",
  defaults: { color: "#2962ff", width: 2, lineStyle: "solid", textColor: "#2962ff", textSize: 12, bold: false, italic: false },
  defaultProps: { showPrice: true, vertLabelsAlign: "middle", horzLabelsAlign: "center" },
  settings: {
    style: [...lineFields(), { kind: "checkbox", key: "props.showPrice", label: "Price label", catalog: "showPrice", default: true }],
    text: lineTextFields({ size: 12, vert: "middle" }),
    coordinates: "price",
  },
  alert: "line",
  floatingToolbar: HLINE_FLOAT,
  hitTest: (d, g, x, y, tol) => hitTestBody(d, g.toPx, x, y, tol, g.viewport),
  render(c, d) {
    const a = d.anchors[0];
    if (!a) return;
    const y = crisp(c.toPx(a).y, c.dpr);
    line(c.ctx, { x: 0, y }, { x: c.width, y });
    if (prop(d, "showPrice", true)) priceTag(c, y, c.formatPrice(a.price), c.color);
    drawHorzText(c, d, 0, c.width, y, 12, "middle");
  },
  handles: anchorHandles,
  bounds(d, g) {
    const p = g.toPx(d.anchors[0]);
    return { x: 0, y: p.y, width: g.viewport.width, height: 0 };
  },
};
