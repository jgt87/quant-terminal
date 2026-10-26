// Arrow marker (catalog LineToolArrowMarker): a solid block arrow from the first click (tail)
// to the second (tip), with optional bold text at the tail.

import { arrowHitPolygon, arrowMarkerPolygon, type Point } from "@qt/core";
import { drawText, textStyleOf } from "../../draw";
import type { DrawingToolDef } from "../../types";
import { F, tracePath, withText } from "../shapes/kit";

export const arrowMarker: DrawingToolDef = {
  type: "arrowMarker",
  catalogType: "LineToolArrowMarker",
  family: "arrows",
  label: "Arrow marker",
  icon: "arrowMarker",
  iconPath: "M23.5 4.5L18.5 17.5L15.5 14.5L7.5 22.5L5.5 20.5L13.5 12.5L10.5 9.5Z",
  anchors: 2,
  defaults: { fillColor: "#1e53e5", textColor: "#1e53e5", textSize: 16, bold: true, italic: false },
  floatingToolbar: ["templates", "background-color", "text-color", "settings", "lock", "remove", "more"],
  settings: {
    coordinates: "time-price",
    style: [F.color("style.fillColor", "Color", "backgroundColor", "#1e53e5")],
    text: [
      F.text("Text"),
      F.color("style.textColor", "Text color", "textColor", "#1e53e5", { testWith: withText }),
      F.font("style.textSize", "Font size", "fontsize", 16, { testWith: withText }),
      F.check("style.bold", "Bold", "bold", true, { testWith: withText }),
      F.check("style.italic", "Italic", "italic", false, { testWith: withText }),
    ],
  },
  hitTest(d, g, x, y, tol) {
    const [a, b] = d.anchors;
    if (!a || !b) return false;
    return arrowHitPolygon(x, y, arrowMarkerPolygon(g.toPx(a), g.toPx(b)), tol);
  },
  render(c, d) {
    const [a, b] = d.anchors;
    if (!a || !b) return;
    const { ctx } = c;
    const tail = c.toPx(a);
    const tip = c.toPx(b);
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = d.style?.fillColor ?? c.color;
    tracePath(ctx, arrowMarkerPolygon(tail, tip), true);
    ctx.fill();
    ctx.restore();
    if (d.text) {
      // Text sits beyond the tail, away from the tip.
      const dx = tail.x - tip.x;
      const dy = tail.y - tip.y;
      const l = Math.hypot(dx, dy) || 1;
      const at: Point = { x: tail.x + (dx / l) * 8, y: tail.y + (dy / l) * 8 };
      drawText(c, d.text, at.x, at.y, {
        ...textStyleOf(d, c, 16),
        align: Math.abs(dx) < Math.abs(dy) ? "center" : dx > 0 ? "left" : "right",
        baseline: Math.abs(dy) <= Math.abs(dx) ? "middle" : dy > 0 ? "top" : "bottom",
      });
    }
  },
  handles: (d, g) => d.anchors.map((x) => g.toPx(x)),
};
