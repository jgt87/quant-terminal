// Pitchfan (3 anchors): median ray from A through the midpoint of B–C; level k rays from A through
// M ± k × (C − M) (k = 1 through B and C); bands between neighbouring rays on each side.

import { fibPitchfanRays, type Drawing, type Point } from "@qt/core";
import { levelTable } from "../../builders";
import { anchorHandles, prop } from "../../draw";
import type { DrawingToolDef, ToolGeom } from "../../types";
import { allLevelsBinding, backgroundFields, bandFill, far, fillAlpha, fillPoly, hitPolys, levelColor, levelsOf, oneColorBinding, px, rows, stroke, strokeLevel, useOneColor, type FibRow } from "./common";

export const PITCHFAN_LEVELS: FibRow[] = rows([
  [0.25, "#ffb74d", false, 2, 0],
  [0.382, "#81c784", false, 2, 0],
  [0.5, "#00bcd4", true, 2, 0],
  [0.618, "#089981", false, 2, 0],
  [0.75, "#00bcd4", false, 2, 0],
  [1, "#2962FF", true, 2, 0],
  [1.5, "#9c27b0", false, 2, 0],
  [1.75, "#e91e63", false, 2, 0],
  [2, "#F77C80", false, 2, 0],
]);

export function pitchfanGeometry(d: Drawing, g: ToolGeom): { a: Point; m: Point; bc: [Point, Point]; rays: { row: FibRow; side: 1 | -1; through: Point }[] } | null {
  const p = px(d, g, 3);
  if (!p) return null;
  const vis = levelsOf(d, PITCHFAN_LEVELS).filter((r) => r.visible !== false);
  const { median, rays } = fibPitchfanRays(p[0], p[1], p[2], vis.map((r) => r.ratio));
  return { a: p[0], m: median[1], bc: [p[1], p[2]], rays: rays.map((r, i) => ({ ...r, row: vis[Math.floor(i / 2)] })) };
}

export const pitchfan: DrawingToolDef = {
  type: "pitchfan",
  catalogType: "LineToolPitchfan",
  family: "fibonacci",
  label: "Pitchfan",
  icon: "pitchfan",
  iconPath: "M4.5 14.5h17M4.5 14.5l17-9M4.5 14.5l17 9M21.5 5.5v18",
  iconFill: "M4.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM21.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM21.5 26a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 3,
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"],
  floatBindings: { "line-tool-color": oneColorBinding(PITCHFAN_LEVELS), "line-tool-width": allLevelsBinding(PITCHFAN_LEVELS, "width", 2) },
  defaults: { levels: PITCHFAN_LEVELS },
  defaultProps: { median_linewidth: 2, median_linestyle: "solid", median_color: "#f23645", fillBackground: true, transparency: 80 },
  settings: {
    coordinates: "time-price",
    style: [
      { kind: "width", key: "props.median_linewidth", label: "Median width", catalog: "median.linewidth", default: 2 },
      { kind: "lineStyle", key: "props.median_linestyle", label: "Median style", catalog: "median.linestyle", default: "solid" },
      { kind: "color", key: "props.median_color", label: "Median color", catalog: "median.color", default: "#f23645" },
      levelTable(() => PITCHFAN_LEVELS, { catalogPrefix: "level", lineColumns: true }),
      useOneColor,
      ...backgroundFields(true),
    ],
  },
  hitTest(d, g, x, y, tol) {
    const geo = pitchfanGeometry(d, g);
    if (!geo) return false;
    return hitPolys([[geo.a, far(geo.a, geo.m)], ...geo.rays.map((r) => [geo.a, far(geo.a, r.through)])], x, y, tol);
  },
  render(c, d) {
    const geo = pitchfanGeometry(d, c);
    if (!geo) {
      if (d.anchors.length === 2) stroke(c, d.anchors.map((a) => c.toPx(a)));
      return;
    }
    const { a, m } = geo;
    const alpha = fillAlpha(d);
    if (alpha > 0) {
      for (const side of [1, -1] as const) {
        const rs = geo.rays.filter((r) => r.side === side).sort((u, v) => u.row.ratio - v.row.ratio);
        let prev = m;
        for (const r of rs) {
          fillPoly(c, [a, far(a, prev), far(a, r.through)], bandFill(levelColor(d, r.row, c.color), alpha));
          prev = r.through;
        }
      }
    }
    for (const r of geo.rays) {
      strokeLevel(c, levelColor(d, r.row, c.color), r.row, 2, "solid");
      stroke(c, [a, far(a, r.through)]);
    }
    strokeLevel(c, prop(d, "median_color", "#f23645"), undefined, Number(prop(d, "median_linewidth", 2)), prop(d, "median_linestyle", "solid"));
    stroke(c, [a, far(a, m)]);
    // B–C base
    strokeLevel(c, levelColor(d, { ratio: 1, color: c.color }, c.color), undefined, 1, "solid");
    stroke(c, geo.bc);
  },
  handles: anchorHandles,
};
