// Note (catalog LineToolTextNote): a label box (second anchor) connected by a line to a point
// on the chart (first anchor). Background / border toggles, line color, text style.

import { distanceToSegment, textInRect, type Drawing } from "@qt/core";
import { line, prop } from "../../draw";
import type { DrawCtx, DrawingToolDef, ToolGeom } from "../../types";
import { F, withProps } from "../shapes/kit";
import { drawLines, measureBox, paint, PLACEHOLDER, roundRect, styleOf, textEdit } from "./textKit";

function layoutOf(d: Drawing, g: Pick<ToolGeom, "toPx">, c?: DrawCtx) {
  const [a, b] = d.anchors;
  const p = g.toPx(a);
  const q = b ? g.toPx(b) : p;
  const st = styleOf(d, 14);
  const l = measureBox(d, d.text || PLACEHOLDER, st, { padding: 8, wrap: 260, minWidth: 40 }, c);
  return { p, q, st, l, box: { x: q.x - l.width / 2, y: q.y - l.height / 2, width: l.width, height: l.height } };
}

export const textNote: DrawingToolDef = {
  type: "textNote",
  catalogType: "LineToolTextNote",
  family: "text",
  label: "Note",
  icon: "textNote",
  iconPath: "M5.5 23.5L11.5 16.5 M9.5 5.5H23.5V16.5H9.5Z M12.5 9.5H20.5M12.5 12.5H18.5",
  iconFill: "M5.5 26a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 2,
  defaultText: "",
  // Line color in style.color (line-tool-color).
  defaults: { color: "#dbdbdb", fillColor: "#2e2e2e", textColor: "#dbdbdb", textSize: 14, bold: false, italic: false },
  defaultProps: { drawBackground: true, drawBorder: false, borderColor: "#4a4a4a" },
  floatingToolbar: ["templates", "line-tool-color", "background-color", "text-color", "settings", "lock", "remove", "more"],
  settings: {
    coordinates: "time-price",
    style: [
      F.check("props.drawBackground", "Label background", "drawBackground", true),
      F.color("style.fillColor", "Label background color", "backgroundColor", "#2e2e2e"),
      F.check("props.drawBorder", "Label border", "drawBorder", false),
      F.color("props.borderColor", "Label border color", "borderColor", "#4a4a4a", { testWith: withProps({ drawBorder: true }) }),
      F.color("style.color", "Line color", "lineColor", "#dbdbdb"),
    ],
    text: [
      F.text("Text"),
      F.color("style.textColor", "Text color", "textColor", "#dbdbdb"),
      F.font("style.textSize", "Font size", "fontSize", 14),
      F.check("style.bold", "Bold", "bold", false),
      F.check("style.italic", "Italic", "italic", false),
    ],
  },
  hitTest(d, g, x, y, tol) {
    if (!d.anchors[0]) return false;
    const { p, q, box } = layoutOf(d, g);
    return textInRect(x, y, box, tol) || distanceToSegment(x, y, p.x, p.y, q.x, q.y) <= tol;
  },
  render(c, d) {
    if (!d.anchors[0]) return;
    const { ctx } = c;
    const { p, q, st, l, box } = layoutOf(d, c, c);
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    line(ctx, p, q);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    paint(ctx, c.color, null);
    roundRect(ctx, box, 4);
    paint(ctx, prop(d, "drawBackground", true) ? (d.style?.fillColor ?? "#2e2e2e") : null, prop(d, "drawBorder", false) ? prop(d, "borderColor", "#4a4a4a") : null);
    drawLines(c, l, box, { ...st, color: d.style?.textColor ?? "#dbdbdb" });
  },
  handles: (d, g) => d.anchors.map((a) => g.toPx(a)),
  editText: (d, g) => (d.anchors[0] ? textEdit(d, layoutOf(d, g).box, { color: d.style?.textColor ?? "#dbdbdb" }) : null),
  bounds(d, g) {
    const { p, box } = layoutOf(d, g);
    const x0 = Math.min(p.x, box.x);
    const y0 = Math.min(p.y, box.y);
    return { x: x0, y: y0, width: Math.max(p.x, box.x + box.width) - x0, height: Math.max(p.y, box.y + box.height) - y0 };
  },
};
