// Price label (catalog LineToolPriceLabel): a bold label showing the anchor's price, above
// and to the right of the anchor with a pointer down to it.

import { textInRect, type Drawing } from "@qt/core";
import type { DrawCtx, DrawingToolDef, ToolGeom } from "../../types";
import { F } from "../shapes/kit";
import { drawLines, measureBox, paint } from "./textKit";

function layoutOf(d: Drawing, g: Pick<ToolGeom, "toPx">, fmt: (p: number) => string, c?: DrawCtx) {
  const a = d.anchors[0];
  const p = g.toPx(a);
  const st = { size: d.style?.textSize ?? 14, bold: true };
  const l = measureBox(d, fmt(a.price), st, { padding: 6 }, c);
  return { p, st, l, box: { x: p.x + 6, y: p.y - 8 - l.height, width: l.width, height: l.height } };
}

const fmt2 = (p: number) => p.toFixed(2);

export const priceLabel: DrawingToolDef = {
  type: "priceLabel",
  catalogType: "LineToolPriceLabel",
  family: "text",
  label: "Price label",
  icon: "priceLabel",
  iconPath: "M8.5 19.5V7.5H23.5V19.5H12.5L8.5 23.5Z M11.5 11.5H20.5M11.5 15.5H17.5",
  anchors: 1,
  defaults: { textColor: "#ffffff", textSize: 14, fillColor: "#2962ff" },
  defaultProps: { borderColor: "#2962ff", fontWeight: "bold" },
  floatingToolbar: ["templates", "text-color", "background-color", "font-size", "settings", "lock", "remove", "more"],
  settings: {
    coordinates: "time-price",
    style: [
      F.color("style.textColor", "Text color", "color", "#ffffff"),
      F.font("style.textSize", "Font size", "fontsize", 14),
      // The catalog stores the background as the color + its transparency under `transparency`.
      F.color("style.fillColor", "Background color", "transparency", "#2962ff"),
      F.color("props.borderColor", "Border color", "borderColor", "#2962ff"),
    ],
  },
  hitTest(d, g, x, y, tol) {
    if (!d.anchors[0]) return false;
    const { box, p } = layoutOf(d, g, fmt2);
    return textInRect(x, y, box, tol) || textInRect(x, y, { x: p.x, y: box.y + box.height, width: 10, height: p.y - box.y - box.height }, tol);
  },
  render(c, d) {
    if (!d.anchors[0]) return;
    const { ctx } = c;
    const { box, p, l, st } = layoutOf(d, c, c.formatPrice, c);
    ctx.beginPath();
    ctx.moveTo(box.x + 4, box.y);
    ctx.lineTo(box.x + box.width - 4, box.y);
    ctx.arcTo(box.x + box.width, box.y, box.x + box.width, box.y + 4, 4);
    ctx.lineTo(box.x + box.width, box.y + box.height);
    ctx.lineTo(box.x + 12, box.y + box.height);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(box.x, box.y + box.height - 2);
    ctx.lineTo(box.x, box.y + 4);
    ctx.arcTo(box.x, box.y, box.x + 4, box.y, 4);
    ctx.closePath();
    paint(ctx, d.style?.fillColor ?? "#2962ff", (d.props?.borderColor as string | undefined) ?? "#2962ff");
    drawLines(c, l, box, { ...st, color: d.style?.textColor ?? "#ffffff" }, "center");
  },
  handles: (d, g) => d.anchors.map((a) => g.toPx(a)),
  bounds(d, g) {
    const { box, p } = layoutOf(d, g, fmt2);
    return { x: p.x, y: box.y, width: box.x + box.width - p.x, height: p.y - box.y };
  },
};
