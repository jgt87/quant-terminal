// Callout (catalog LineToolCallout): a text bubble (centered on the second anchor) whose tail
// points at the first anchor. Background, border width / color and optional word wrap.

import { shapeDistanceToPolyline, textCalloutOutline, textInRect, textPointInPolygon, type Drawing, type Point } from "@qt/core";
import { catalogColor } from "../../builders";
import { prop } from "../../draw";
import type { DrawCtx, DrawingToolDef, ToolGeom } from "../../types";
import { F, tracePath, withText } from "../shapes/kit";
import { drawLines, measureBox, paint, PLACEHOLDER, styleOf, textEdit } from "./textKit";

const BG = catalogColor("rgba(0, 151, 167, 0.7)");
const LONG = "A long sample text that wraps onto several lines when word wrap is on";

function layoutOf(d: Drawing, g: Pick<ToolGeom, "toPx">, c?: DrawCtx) {
  const [a, b] = d.anchors;
  const tip = g.toPx(a);
  const center: Point = b ? g.toPx(b) : { x: tip.x + 40, y: tip.y - 40 };
  const st = styleOf(d, 14);
  const wrap = prop(d, "wordWrap", false) ? prop(d, "wordWrapWidth", 200) : undefined;
  const l = measureBox(d, d.text || PLACEHOLDER, st, { padding: 8, wrap, minWidth: 40 }, c);
  const box = { x: center.x - l.width / 2, y: center.y - l.height / 2, width: l.width, height: l.height };
  return { tip, box, l, st, outline: textCalloutOutline(box, tip, 16) };
}

export const callout: DrawingToolDef = {
  type: "callout",
  catalogType: "LineToolCallout",
  family: "text",
  label: "Callout",
  icon: "callout",
  iconPath: "M7.5 5.5H23.5V16.5H13.5L7.5 23.5V16.5H4.5V5.5Z M8.5 9.5H19.5M8.5 12.5H16.5",
  anchors: 2,
  defaultText: "",
  defaults: { textColor: "#ffffff", textSize: 14, bold: false, italic: false, fillColor: BG, width: 2 },
  defaultProps: { bordercolor: "#0097a7", wordWrap: false, wordWrapWidth: 200 },
  floatingToolbar: ["templates", "text-color", "background-color", "font-size", "settings", "lock", "remove", "more"],
  settings: {
    coordinates: "time-price",
    style: [],
    text: [
      F.text("Text"),
      F.color("style.textColor", "Text color", "color", "#ffffff"),
      F.font("style.textSize", "Font size", "fontsize", 14),
      F.check("style.bold", "Bold", "bold", false),
      F.check("style.italic", "Italic", "italic", false),
      F.color("style.fillColor", "Background color", "backgroundColor", BG),
      F.number("style.width", "Border width", "linewidth", 2, { min: 0, max: 10, step: 1 }),
      F.color("props.bordercolor", "Border color", "bordercolor", "#0097a7"),
      F.check("props.wordWrap", "Text wrap", "wordWrap", false, { testWith: (d) => withText({ ...d, text: LONG }) }),
    ],
  },
  hitTest(d, g, x, y, tol) {
    if (!d.anchors[0]) return false;
    const { box, outline } = layoutOf(d, g);
    return textInRect(x, y, box, tol) || textPointInPolygon(x, y, outline) || shapeDistanceToPolyline(x, y, outline, true) <= tol;
  },
  render(c, d) {
    if (!d.anchors[0]) return;
    const { ctx } = c;
    const { box, l, st, outline } = layoutOf(d, c, c);
    tracePath(ctx, outline, true);
    const bw = d.style?.width ?? 2;
    paint(ctx, d.style?.fillColor ?? BG, bw > 0 ? prop(d, "bordercolor", "#0097a7") : null, bw);
    drawLines(c, l, box, { ...st, color: d.style?.textColor ?? "#ffffff" }, "left");
  },
  handles: (d, g) => d.anchors.map((a) => g.toPx(a)),
  editText: (d, g) => (d.anchors[0] ? textEdit(d, layoutOf(d, g).box, { color: d.style?.textColor ?? "#ffffff" }) : null),
  bounds(d, g) {
    const { box, tip } = layoutOf(d, g);
    const x0 = Math.min(box.x, tip.x);
    const y0 = Math.min(box.y, tip.y);
    return { x: x0, y: y0, width: Math.max(box.x + box.width, tip.x) - x0, height: Math.max(box.y + box.height, tip.y) - y0 };
  },
};
