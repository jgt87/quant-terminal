// Price note (catalog LineToolPriceNote): a line from a price point (first anchor) to a label
// (second anchor) showing that price, with optional text aligned around the label.

import { distanceToSegment, textInRect, type Drawing } from "@qt/core";
import { drawText, line, prop, textStyleOf } from "../../draw";
import type { DrawCtx, DrawingToolDef, ToolGeom } from "../../types";
import { F, HORZ_ALIGN, VERT_ALIGN, withText } from "../shapes/kit";
import { drawLines, measureBox, paint, roundRect, textEdit } from "./textKit";

const fmt2 = (p: number) => p.toFixed(2);

function labelOf(d: Drawing, g: Pick<ToolGeom, "toPx">, fmt: (p: number) => string, c?: DrawCtx) {
  const [a, b] = d.anchors;
  const p = g.toPx(a);
  const q = b ? g.toPx(b) : p;
  const st = { size: prop(d, "priceLabelFontSize", 12), bold: prop(d, "priceLabelBold", false), italic: prop(d, "priceLabelItalic", false) };
  const l = measureBox(d, fmt(a.price), st, { padding: 5 }, c);
  return { p, q, st, l, box: { x: q.x - l.width / 2, y: q.y - l.height / 2, width: l.width, height: l.height } };
}

export const priceNote: DrawingToolDef = {
  type: "priceNote",
  catalogType: "LineToolPriceNote",
  family: "text",
  label: "Price note",
  icon: "priceNote",
  iconPath: "M5.5 21.5L13.5 12.5 M13.5 8.5H23.5V16.5H13.5Z",
  iconFill: "M5.5 24a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 2,
  // Line color in style.color (line-tool-color); label background via the background button.
  defaults: { color: "#2962ff", textColor: "#2962ff", textSize: 14, bold: false, italic: false },
  defaultProps: {
    priceLabelTextColor: "#ffffff",
    priceLabelFontSize: 12,
    priceLabelBold: false,
    priceLabelItalic: false,
    priceLabelBackgroundColor: "#2962ff",
    priceLabelBorderColor: "#2962ff",
    vertLabelsAlign: "bottom",
    horzLabelsAlign: "center",
  },
  floatingToolbar: ["templates", "line-tool-color", "background-color", "text-color", "settings", "lock", "remove", "more"],
  floatBindings: { "background-color": "props.priceLabelBackgroundColor" },
  settings: {
    coordinates: "time-price",
    style: [
      F.color("props.priceLabelTextColor", "Label text color", "priceLabelTextColor", "#ffffff"),
      F.font("props.priceLabelFontSize", "Label font size", "priceLabelFontSize", 12),
      F.check("props.priceLabelBold", "Label bold", "priceLabelBold", false),
      F.check("props.priceLabelItalic", "Label italic", "priceLabelItalic", false),
      F.color("props.priceLabelBackgroundColor", "Label background", "priceLabelBackgroundColor", "#2962ff"),
      F.color("props.priceLabelBorderColor", "Label border", "priceLabelBorderColor", "#2962ff"),
      F.color("style.color", "Line color", "lineColor", "#2962ff"),
    ],
    text: [
      F.text("Text"),
      F.color("style.textColor", "Text color", "textColor", "#2962ff", { testWith: withText }),
      F.font("style.textSize", "Font size", "fontSize", 14, { testWith: withText }),
      F.check("style.bold", "Bold", "bold", false, { testWith: withText }),
      F.check("style.italic", "Italic", "italic", false, { testWith: withText }),
      F.select("props.vertLabelsAlign", "Text alignment (vertical)", "vertLabelsAlign", VERT_ALIGN, "bottom", { testWith: withText }),
      F.select("props.horzLabelsAlign", "Text alignment (horizontal)", "horzLabelsAlign", HORZ_ALIGN, "center", { testWith: withText }),
    ],
  },
  hitTest(d, g, x, y, tol) {
    if (!d.anchors[0]) return false;
    const { p, q, box } = labelOf(d, g, fmt2);
    return distanceToSegment(x, y, p.x, p.y, q.x, q.y) <= tol || textInRect(x, y, box, tol);
  },
  render(c, d) {
    if (!d.anchors[0]) return;
    const { ctx } = c;
    const { p, q, st, l, box } = labelOf(d, c, c.formatPrice, c);
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    line(ctx, p, q);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    paint(ctx, c.color, null);
    roundRect(ctx, box, 3);
    paint(ctx, prop(d, "priceLabelBackgroundColor", "#2962ff"), prop(d, "priceLabelBorderColor", "#2962ff"));
    drawLines(c, l, box, { ...st, color: prop(d, "priceLabelTextColor", "#ffffff") }, "center");
    if (!d.text) return;
    const horz = prop(d, "horzLabelsAlign", "center");
    const vert = prop(d, "vertLabelsAlign", "bottom");
    const x = horz === "left" ? box.x : horz === "right" ? box.x + box.width : q.x;
    const y = vert === "bottom" ? box.y - 4 : vert === "top" ? box.y + box.height + 4 : q.y;
    drawText(c, d.text, horz === "center" || vert !== "middle" ? x : horz === "left" ? x - 6 : x + 6, y, {
      ...textStyleOf(d, c, 14),
      align: vert === "middle" ? (horz === "left" ? "right" : "left") : (horz as CanvasTextAlign),
      baseline: vert === "bottom" ? "bottom" : vert === "top" ? "top" : "middle",
    });
  },
  handles: (d, g) => d.anchors.map((a) => g.toPx(a)),
  // Inline editor for the note text, just above the price label.
  editText(d, g) {
    if (!d.anchors[0]) return null;
    const { box } = labelOf(d, g, fmt2);
    const size = d.style?.textSize ?? 14;
    return textEdit(d, { x: box.x, y: box.y - size * 1.6 - 6, width: Math.max(box.width, 160), height: size * 1.6 + 4 }, { size, color: d.style?.textColor ?? "#2962ff" });
  },
};
