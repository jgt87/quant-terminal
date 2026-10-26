// Comment (catalog LineToolComment): a rounded text bubble above the anchor with a short tail
// pointing down at it. makeBubble also builds the balloon.

import { textBalloonBox, textInRect, type Drawing, type Point } from "@qt/core";
import { prop } from "../../draw";
import type { DrawCtx, DrawingToolDef, ToolGeom } from "../../types";
import { F } from "../shapes/kit";
import { drawLines, measureBox, paint, PLACEHOLDER, roundRect, styleOf, textEdit } from "./textKit";

const TAIL = 10;

function layoutOf(d: Drawing, g: Pick<ToolGeom, "toPx">, size: number, c?: DrawCtx) {
  const p = g.toPx(d.anchors[0]);
  const st = styleOf(d, size);
  const l = measureBox(d, d.text || PLACEHOLDER, st, { padding: 8, minWidth: 32 }, c);
  return { p, st, l, box: textBalloonBox(p, l.width, l.height, TAIL) };
}

/** Bubble outline: rounded box + tail down to p. */
function bubble(ctx: CanvasRenderingContext2D, box: { x: number; y: number; width: number; height: number }, p: Point): void {
  roundRect(ctx, box, 8);
  ctx.moveTo(p.x - 6, box.y + box.height - 0.5);
  ctx.lineTo(p.x, p.y);
  ctx.lineTo(p.x + 6, box.y + box.height - 0.5);
}

export function makeBubble(o: { type: string; catalogType: string; label: string; size: number; textColor: string; bg: string; border: string; bgCatalog: string; icon: string }): DrawingToolDef {
  return {
    type: o.type,
    catalogType: o.catalogType,
    family: "text",
    label: o.label,
    icon: o.type,
    iconPath: o.icon,
    anchors: 1,
    defaultText: "",
    defaults: { textColor: o.textColor, textSize: o.size, fillColor: o.bg },
    defaultProps: { borderColor: o.border },
    floatingToolbar: ["templates", "text-color", "background-color", "font-size", "settings", "lock", "remove", "more"],
    settings: {
      coordinates: "time-price",
      style: [],
      text: [
        F.text("Text"),
        F.color("style.textColor", "Text color", "color", o.textColor),
        F.font("style.textSize", "Font size", "fontsize", o.size),
        F.color("style.fillColor", "Background color", o.bgCatalog, o.bg),
        F.color("props.borderColor", "Border color", "borderColor", o.border),
      ],
    },
    hitTest(d, g, x, y, tol) {
      if (!d.anchors[0]) return false;
      const { box, p } = layoutOf(d, g, o.size);
      return textInRect(x, y, box, tol) || (Math.abs(x - p.x) <= 6 + tol && y >= box.y + box.height && y <= p.y + tol);
    },
    render(c, d) {
      if (!d.anchors[0]) return;
      const { ctx } = c;
      const { box, p, l, st } = layoutOf(d, c, o.size, c);
      bubble(ctx, box, p);
      paint(ctx, d.style?.fillColor ?? o.bg, prop(d, "borderColor", o.border), 1);
      drawLines(c, l, box, { ...st, color: d.style?.textColor ?? o.textColor }, "center");
    },
    handles: (d, g) => d.anchors.map((a) => g.toPx(a)),
    editText: (d, g) => (d.anchors[0] ? textEdit(d, layoutOf(d, g, o.size).box, { size: d.style?.textSize ?? o.size, color: d.style?.textColor ?? o.textColor }) : null),
    bounds(d, g) {
      const { box, p } = layoutOf(d, g, o.size);
      return { x: box.x, y: box.y, width: box.width, height: p.y - box.y };
    },
  };
}

export const comment = makeBubble({
  type: "comment",
  catalogType: "LineToolComment",
  label: "Comment",
  size: 16,
  textColor: "#ffffff",
  bg: "#2962ff",
  border: "#2962ff",
  // The catalog stores the background as the color + its transparency under `transparency`.
  bgCatalog: "transparency",
  icon: "M5.5 5.5H22.5V18.5H12.5L7.5 23.5V18.5H5.5Z",
});
