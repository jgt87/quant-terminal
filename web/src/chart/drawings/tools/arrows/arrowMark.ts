// Arrow marks (catalog LineToolArrowMarkUp / Down / Left / Right): a small solid arrow pointing
// at its single anchor, with an optional label beyond its tail. Up and down are in the
// toolbar; left and right are registered for layouts that use them (toolbar: false).

import { arrowHitPolygon, arrowMarkLabelAt, arrowMarkPolygon, type ArrowMarkDir } from "@qt/core";
import { drawText, prop, textStyleOf } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { F, tracePath, withText } from "../shapes/kit";

const ICONS: Record<ArrowMarkDir, string> = {
  up: "M14 4.5L21.5 13.5H17.5V23.5H10.5V13.5H6.5Z",
  down: "M14 23.5L21.5 14.5H17.5V4.5H10.5V14.5H6.5Z",
  left: "M4.5 14L13.5 6.5V10.5H23.5V17.5H13.5V21.5Z",
  right: "M23.5 14L14.5 6.5V10.5H4.5V17.5H14.5V21.5Z",
};

function makeArrowMark(dir: ArrowMarkDir, o: { type: string; catalogType: string; label: string; color: string }): DrawingToolDef {
  return {
    type: o.type,
    catalogType: o.catalogType,
    family: "arrows",
    label: o.label,
    icon: o.type,
    iconPath: ICONS[dir],
    anchors: 1,
    // Arrow color in style.color (line-tool-color button), label color in style.textColor.
    defaults: { color: o.color, textColor: o.color, textSize: 14, bold: false, italic: false },
    defaultProps: { showLabel: true },
    floatingToolbar: ["templates", "line-tool-color", "text-color", "settings", "lock", "remove", "more"],
    settings: {
      coordinates: "time-price",
      style: [F.color("style.color", "Arrow", "arrowColor", o.color)],
      text: [
        F.text("Text"),
        F.color("style.textColor", "Text color", "color", o.color, { testWith: withText }),
        F.font("style.textSize", "Font size", "fontsize", 14, { testWith: withText }),
        F.check("style.bold", "Bold", "bold", false, { testWith: withText }),
        F.check("style.italic", "Italic", "italic", false, { testWith: withText }),
      ],
    },
    hitTest(d, g, x, y, tol) {
      const a = d.anchors[0];
      return a ? arrowHitPolygon(x, y, arrowMarkPolygon(g.toPx(a), dir), tol) : false;
    },
    render(c, d) {
      const a = d.anchors[0];
      if (!a) return;
      const { ctx } = c;
      const p = c.toPx(a);
      ctx.save();
      ctx.setLineDash([]);
      ctx.fillStyle = c.color;
      tracePath(ctx, arrowMarkPolygon(p, dir), true);
      ctx.fill();
      ctx.restore();
      if (d.text && prop(d, "showLabel", true)) {
        const at = arrowMarkLabelAt(p, dir);
        drawText(c, d.text, at.x, at.y, { ...textStyleOf(d, c, 14), align: at.align, baseline: at.baseline });
      }
    },
    handles: (d, g) => d.anchors.map((x) => g.toPx(x)),
    bounds(d, g) {
      const pts = arrowMarkPolygon(g.toPx(d.anchors[0]), dir);
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    },
  };
}

export const arrowMarkUp = makeArrowMark("up", { type: "arrowMarkUp", catalogType: "LineToolArrowMarkUp", label: "Arrow mark up", color: "#089981" });
export const arrowMarkDown = makeArrowMark("down", { type: "arrowMarkDown", catalogType: "LineToolArrowMarkDown", label: "Arrow mark down", color: "#cc2f3c" });
export const arrowMarkLeft: DrawingToolDef = { ...makeArrowMark("left", { type: "arrowMarkLeft", catalogType: "LineToolArrowMarkLeft", label: "Arrow mark left", color: "#2962ff" }), toolbar: false };
export const arrowMarkRight: DrawingToolDef = { ...makeArrowMark("right", { type: "arrowMarkRight", catalogType: "LineToolArrowMarkRight", label: "Arrow mark right", color: "#2962ff" }), toolbar: false };
