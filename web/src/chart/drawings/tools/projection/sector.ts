// Projection (catalog LineToolProjection, "Sector"): three anchors. The first is the pivot, the
// second sets the radius and the start arm, the third the end arm. The catalog's background is one
// two-color property (propType "twoColors": color1, color2): the sector is filled with a gradient
// from color1 at the start arm to color2 at the end arm. The level arc (level1, coefficient 1) is
// drawn with its coefficient label. The floating toolbar has one button per background color.

import { hitSector, sectorGeometry, sectorPoint, type Drawing } from "@qt/core";
import { font } from "../../../theme";
import { catalogColor } from "../../builders";
import { anchorHandles, line, prop, strokeWith } from "../../draw";
import type { DrawingToolDef, ToolGeom } from "../../types";
import { withTransparency } from "./common";

const COLOR1 = catalogColor("rgba(41, 98, 255, 0.2)");
const COLOR2 = catalogColor("rgba(156, 39, 176, 0.2)");

function geomOf(d: Drawing, g: Pick<ToolGeom, "toPx">) {
  const [a, b, c] = d.anchors;
  if (!a || !b) return null;
  const p0 = g.toPx(a);
  const p1 = g.toPx(b);
  return sectorGeometry(p0, p1, c ? g.toPx(c) : p1);
}

export const sector: DrawingToolDef = {
  type: "projectionSector",
  catalogType: "LineToolProjection",
  family: "projection",
  section: "Forecasting",
  label: "Sector",
  menuName: "projection",
  icon: "projectionSector",
  // Pie slice: two arms from the pivot and the arc between them.
  iconPath: "M5.5 22.5L22.5 22.5M5.5 22.5L17.5 8.5M22.5 22.5a17 17 0 0 0-5-14",
  iconFill: "M5.5 25a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 3,
  floatingToolbar: ["templates", "background-color", "background-color-2", "line-tool-width", "settings", "lock", "remove", "more"],
  floatBindings: { "background-color": "props.color1", "background-color-2": "props.color2" },
  defaults: { width: 2 },
  defaultProps: {
    showCoeffs: true,
    fillBackground: true,
    transparency: 80,
    trendline_visible: true,
    trendline_linestyle: "solid",
    trendline_color: "#9c9c9c",
    level1_coeff: 1,
    level1_visible: true,
    level1_linestyle: "solid",
    level1_linewidth: 2,
    level1_color: "#808080",
    color1: COLOR1,
    color2: COLOR2,
  },
  settings: {
    coordinates: false,
    style: [
      { kind: "color", key: "props.color1", label: "Background 1", catalog: "color1", default: COLOR1, alpha: true },
      { kind: "color", key: "props.color2", label: "Background 2", catalog: "color2", default: COLOR2, alpha: true },
      { kind: "width", key: "style.width", label: "Border width", catalog: "linewidth", default: 2 },
      { kind: "color", key: "props.trendline_color", label: "Border", catalog: "trendline.color", default: "#9c9c9c" },
    ],
  },
  hitTest(d, g, x, y, tol) {
    const s = geomOf(d, g);
    return s ? hitSector(s, x, y, tol) : false;
  },
  render(c, d) {
    const s = geomOf(d, c);
    if (!s) return;
    const { ctx } = c;
    const width = Number(d.style?.width ?? 2);
    const tr = Number(prop(d, "transparency", 80));
    const end0 = sectorPoint(s, 1, 0);
    const end1 = sectorPoint(s, 1, 1);
    if (prop(d, "fillBackground", true) && d.anchors[2]) {
      // Two-color background: a gradient across the sweep, color1 at the start arm → color2 at the end arm.
      const c1 = withTransparency(String(prop(d, "color1", COLOR1)), tr);
      const c2 = withTransparency(String(prop(d, "color2", COLOR2)), tr);
      ctx.save();
      const grad = end0.x === end1.x && end0.y === end1.y ? null : ctx.createLinearGradient?.(end0.x, end0.y, end1.x, end1.y);
      if (grad) {
        grad.addColorStop(0, c1);
        grad.addColorStop(1, c2);
        ctx.fillStyle = grad;
      } else ctx.fillStyle = c1;
      ctx.beginPath();
      ctx.moveTo(s.center.x, s.center.y);
      ctx.arc(s.center.x, s.center.y, s.radius, s.start, s.end, s.sweep < 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    if (prop(d, "trendline_visible", true)) {
      strokeWith(ctx, String(prop(d, "trendline_color", "#9c9c9c")), width, String(prop(d, "trendline_linestyle", "solid")));
      line(ctx, s.center, end0);
      if (d.anchors[2]) line(ctx, s.center, end1);
    }
    if (prop(d, "level1_visible", true) && d.anchors[2]) {
      const k = Number(prop(d, "level1_coeff", 1));
      strokeWith(ctx, String(prop(d, "level1_color", "#808080")), Number(prop(d, "level1_linewidth", width)), String(prop(d, "level1_linestyle", "solid")));
      ctx.beginPath();
      ctx.arc(s.center.x, s.center.y, s.radius * k, s.start, s.end, s.sweep < 0);
      ctx.stroke();
      if (prop(d, "showCoeffs", true)) {
        const p = sectorPoint(s, k, 0.5);
        ctx.fillStyle = String(prop(d, "level1_color", "#808080"));
        ctx.font = font(c.theme, 11);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(k), p.x + Math.cos(s.start + s.sweep / 2) * 10, p.y + Math.sin(s.start + s.sweep / 2) * 10);
      }
    }
    ctx.restore();
  },
  handles: anchorHandles,
  bounds(d, g) {
    const s = geomOf(d, g);
    if (!s) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: s.center.x - s.radius, y: s.center.y - s.radius, width: 2 * s.radius, height: 2 * s.radius };
  },
};
