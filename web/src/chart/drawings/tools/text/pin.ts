// Pin (catalog LineToolNote): a collapsed pin marker; hovering or selecting it opens a popup
// with the note text. "Anchor" pins it to the pane. makePin also builds the anchored note.

import { textInRect, type Drawing, type Point } from "@qt/core";
import { prop } from "../../draw";
import type { DrawCtx, DrawingToolDef, ToolGeom } from "../../types";
import { F, withProps, withText } from "../shapes/kit";
import { anchorBinding, anchorHooks, anchorMenu, anchorPx, dragAnchorable, drawLines, measureBox, paint, PLACEHOLDER, roundRect, styleOf, textEdit } from "./textKit";

const MARKER = { w: 18, h: 24 };
/** Popup is open while hovered/selected, or when `props.popupOpen` keeps it open. */
const popupOpen = withProps({ popupOpen: true });
const open = (d: Drawing) => popupOpen(withText(d));

function markerRect(p: Point) {
  return { x: p.x - MARKER.w / 2, y: p.y - MARKER.h, width: MARKER.w, height: MARKER.h };
}

function popup(d: Drawing, p: Point, c?: DrawCtx) {
  const st = styleOf(d, 14);
  const l = measureBox(d, d.text || PLACEHOLDER, st, { padding: 10, wrap: 260, minWidth: 60 }, c);
  return { st, l, box: { x: p.x - l.width / 2, y: p.y - MARKER.h - 8 - l.height, width: l.width, height: l.height } };
}

export function makePin(o: { type: string; catalogType: string; label: string; anchored: boolean; coordinates: "time-price" | false }): DrawingToolDef {
  const pos = (d: Drawing, g: Pick<ToolGeom, "toPx" | "viewport">) => anchorPx(d, g, o.anchored);
  return {
    type: o.type,
    catalogType: o.catalogType,
    family: "text",
    label: o.label,
    icon: o.type,
    iconPath: "M14 24.5L8.5 14.5A6.5 6.5 0 1 1 19.5 14.5Z",
    iconFill: "M14 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
    anchors: 1,
    defaultText: "",
    defaults: { color: "#2962ff", textColor: "#dbdbdb", textSize: 14, bold: false, italic: false, fillColor: "#2e2e2e" },
    defaultProps: { drawBackground: true, drawBorder: false, borderColor: "#4a4a4a", anchored: o.anchored },
    floatingToolbar: ["templates", "line-tool-color", "text-color", "font-size", "settings", "lock", "toggle-anchor", "remove", "more"],
    floatBindings: { "toggle-anchor": anchorBinding(o.anchored) },
    menuSection: anchorMenu(o.anchored),
    settings: {
      coordinates: o.coordinates,
      style: [F.color("style.color", "Label", "markerColor", "#2962ff")],
      text: [
        F.text("Text", { testWith: popupOpen }),
        F.color("style.textColor", "Text color", "textColor", "#dbdbdb", { testWith: open }),
        F.font("style.textSize", "Font size", "fontSize", 14, { testWith: open }),
        F.check("style.bold", "Bold", "bold", false, { testWith: open }),
        F.check("style.italic", "Italic", "italic", false, { testWith: open }),
        F.check("props.drawBackground", "Background", "drawBackground", true, { testWith: open }),
        F.color("style.fillColor", "Background color", "backgroundColor", "#2e2e2e", { testWith: open }),
        F.check("props.drawBorder", "Border", "drawBorder", false, { testWith: open }),
        F.color("props.borderColor", "Border color", "borderColor", "#4a4a4a", { testWith: (d) => withProps({ drawBorder: true })(open(d)) }),
      ],
    },
    hitTest(d, g, x, y, tol) {
      if (!d.anchors[0]) return false;
      return textInRect(x, y, markerRect(pos(d, g)), tol);
    },
    render(c, d) {
      if (!d.anchors[0]) return;
      const { ctx } = c;
      const p = pos(d, c);
      // Marker: a pin with a round head.
      const r = MARKER.w / 2;
      const cy = p.y - MARKER.h + r;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - r * 0.8, cy + r * 0.6);
      ctx.arc(p.x, cy, r, Math.PI * 0.8, Math.PI * 0.2);
      ctx.closePath();
      paint(ctx, c.color, null);
      ctx.beginPath();
      ctx.arc(p.x, cy, r * 0.38, 0, Math.PI * 2);
      paint(ctx, c.theme.background, null);
      if (!(c.hovered || c.selected || prop(d, "popupOpen", false))) return;
      const pp = popup(d, p, c);
      roundRect(ctx, pp.box, 6);
      paint(ctx, prop(d, "drawBackground", true) ? (d.style?.fillColor ?? "#2e2e2e") : null, prop(d, "drawBorder", false) ? prop(d, "borderColor", "#4a4a4a") : null);
      drawLines(c, pp.l, pp.box, { ...pp.st, color: d.style?.textColor ?? "#dbdbdb" });
    },
    handles: (d, g) => (d.anchors[0] ? [pos(d, g)] : []),
    onAnchorDrag: (d, i, a, g) => dragAnchorable(d, i, a, g, o.anchored),
    ...anchorHooks(o.anchored),
    // Inline editing over the note popup.
    editText: (d, g) => (d.anchors[0] ? textEdit(d, popup(d, pos(d, g)).box, { color: d.style?.textColor ?? "#dbdbdb" }) : null),
    bounds: (d, g) => markerRect(pos(d, g)),
  };
}

export const pin = makePin({ type: "note", catalogType: "LineToolNote", label: "Pin", anchored: false, coordinates: "time-price" });
