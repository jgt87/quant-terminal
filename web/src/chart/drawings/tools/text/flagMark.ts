// Flag mark (catalog LineToolFlagMark): a small flag on a pole standing on the anchor.

import { textInRect } from "@qt/core";
import type { Point } from "@qt/core";
import type { DrawingToolDef } from "../../types";
import { F, tracePath } from "../shapes/kit";
import { paint } from "./textKit";

/** Flag cloth polygon of a flag whose pole foot is p. */
function cloth(p: Point): Point[] {
  return [
    { x: p.x, y: p.y - 26 },
    { x: p.x + 18, y: p.y - 26 },
    { x: p.x + 13, y: p.y - 20.5 },
    { x: p.x + 18, y: p.y - 15 },
    { x: p.x, y: p.y - 15 },
  ];
}

export const flagMark: DrawingToolDef = {
  type: "flagMark",
  catalogType: "LineToolFlagMark",
  family: "text",
  label: "Flag mark",
  icon: "flagMark",
  iconPath: "M8.5 24.5V4.5 M8.5 5.5H21.5L18.5 9.5L21.5 13.5H8.5",
  iconFill: "M8.5 5.5H21.5L18.5 9.5L21.5 13.5H8.5Z",
  anchors: 1,
  // Flag color is the background-color button's value.
  defaults: { fillColor: "#2962ff" },
  floatingToolbar: ["templates", "background-color", "settings", "lock", "remove", "more"],
  settings: { coordinates: "time-price", style: [F.color("style.fillColor", "Flag", "flagColor", "#2962ff")] },
  hitTest(d, g, x, y, tol) {
    if (!d.anchors[0]) return false;
    const p = g.toPx(d.anchors[0]);
    return textInRect(x, y, { x: p.x - 2, y: p.y - 26, width: 20, height: 26 }, tol);
  },
  render(c, d) {
    if (!d.anchors[0]) return;
    const { ctx } = c;
    const p = c.toPx(d.anchors[0]);
    const color = d.style?.fillColor ?? "#2962ff";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y - 26);
    paint(ctx, null, color, 2);
    tracePath(ctx, cloth(p), true);
    paint(ctx, color, null);
  },
  handles: (d, g) => d.anchors.map((a) => g.toPx(a)),
  bounds(d, g) {
    const p = g.toPx(d.anchors[0]);
    return { x: p.x - 2, y: p.y - 26, width: 20, height: 26 };
  },
};
