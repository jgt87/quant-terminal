// Anchored text (catalog LineToolTextAbsolute, not in the toolbar): a text block pinned to the
// pane ("Anchor" on by default) with optional background, border and word wrap.

import { textInRect, type Drawing } from "@qt/core";
import { catalogColor } from "../../builders";
import { prop } from "../../draw";
import type { DrawCtx, DrawingToolDef, ToolGeom } from "../../types";
import { F, withProps } from "../shapes/kit";
import { anchorBinding, anchorHooks, anchorMenu, anchorPx, dragAnchorable, drawLines, measureBox, paint, PLACEHOLDER, styleOf, textEdit } from "./textKit";

const BG = catalogColor("rgba(41, 98, 255, 0.25)");
const LONG = "A long sample text that wraps onto several lines when word wrap is on";

function layoutOf(d: Drawing, g: Pick<ToolGeom, "toPx" | "viewport">, c?: DrawCtx) {
  const p = anchorPx(d, g, true);
  const st = styleOf(d, 14);
  const wrap = prop(d, "wordWrap", false) ? prop(d, "wordWrapWidth", 200) : undefined;
  const l = measureBox(d, d.text || PLACEHOLDER, st, { padding: 4, wrap }, c);
  return { p, st, l, box: { x: p.x, y: p.y, width: l.width, height: l.height } };
}

export const textAbsolute: DrawingToolDef = {
  type: "textAbsolute",
  catalogType: "LineToolTextAbsolute",
  family: "text",
  label: "Anchored text",
  toolbar: false,
  icon: "textAbsolute",
  iconPath: "M8.5 7.5H19.5M14 7.5V20.5 M4.5 4.5V8.5M4.5 4.5H8.5M23.5 23.5V19.5M23.5 23.5H19.5",
  anchors: 1,
  defaultText: "",
  defaults: { textColor: "#2962ff", textSize: 14, bold: false, italic: false, fillColor: BG },
  defaultProps: { fillBackground: false, drawBorder: false, borderColor: "#707070", wordWrap: false, wordWrapWidth: 200, anchored: true },
  floatingToolbar: ["templates", "text-color", "font-size", "settings", "lock", "toggle-anchor", "remove", "more"],
  floatBindings: { "toggle-anchor": anchorBinding(true) },
  menuSection: anchorMenu(true),
  settings: {
    coordinates: false,
    style: [],
    text: [
      F.text("Text"),
      F.color("style.textColor", "Text color", "color", "#2962ff"),
      F.font("style.textSize", "Font size", "fontsize", 14),
      F.check("style.bold", "Bold", "bold", false),
      F.check("style.italic", "Italic", "italic", false),
      F.check("props.fillBackground", "Background", "fillBackground", false),
      F.color("style.fillColor", "Background color", "backgroundColor", BG, { testWith: withProps({ fillBackground: true }) }),
      F.check("props.drawBorder", "Border", "drawBorder", false),
      F.color("props.borderColor", "Border color", "borderColor", "#707070", { testWith: withProps({ drawBorder: true }) }),
      F.check("props.wordWrap", "Text wrap", "wordWrap", false, { testWith: (d) => ({ ...d, text: LONG }) }),
    ],
  },
  hitTest(d, g, x, y, tol) {
    if (!d.anchors[0]) return false;
    return textInRect(x, y, layoutOf(d, g).box, tol);
  },
  render(c, d) {
    if (!d.anchors[0]) return;
    const { ctx } = c;
    const { st, l, box } = layoutOf(d, c, c);
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.width, box.height);
    paint(ctx, prop(d, "fillBackground", false) ? (d.style?.fillColor ?? BG) : null, prop(d, "drawBorder", false) ? prop(d, "borderColor", "#707070") : null);
    drawLines(c, l, box, { ...st, color: d.style?.textColor ?? "#2962ff" });
  },
  handles: (d, g) => (d.anchors[0] ? [anchorPx(d, g, true)] : []),
  onAnchorDrag: (d, i, a, g) => dragAnchorable(d, i, a, g, true),
  ...anchorHooks(true),
  editText: (d, g) => (d.anchors[0] ? textEdit(d, layoutOf(d, g).box, { color: d.style?.textColor ?? "#2962ff" }) : null),
  bounds: (d, g) => layoutOf(d, g).box,
};
