// Fib speed resistance fan (2 anchors): the anchors span a box; price rays run from the origin to
// the far vertical edge at k of the height, time rays to the far horizontal edge at k of the
// width. Grid lines at every level inside the box, bands between neighbouring rays, labels on
// the four box sides. Reverse mirrors the box vertically.

import { fibCoeffLabel, fibFanBox, fibSpeedFanRays, type Drawing, type FibFanRay, type Point } from "@qt/core";
import { catalogColor, levelTable } from "../../builders";
import { anchorHandles, prop } from "../../draw";
import type { DrawingToolDef, ToolGeom } from "../../types";
import { backgroundFields, bandFill, far, fillAlpha, fillPoly, hitPolys, label, levelColor, levelsOf, oneColorBinding, px, rows, stroke, strokeLevel, useOneColor, type FibRow } from "./common";

const FAN_ROWS: [number, string, boolean][] = [
  [0, "#808080", true],
  [0.25, "#FF9800", true],
  [0.382, "#00bcd4", true],
  [0.5, "#4caf50", true],
  [0.618, "#089981", true],
  [0.75, "#2962FF", true],
  [1, "#808080", true],
];
export const FAN_PRICE_LEVELS: FibRow[] = rows(FAN_ROWS);
export const FAN_TIME_LEVELS: FibRow[] = rows(FAN_ROWS);
const GRID_COLOR = catalogColor("rgba(21, 56, 153, 0.8)");

interface FanGeo {
  o: Point;
  q: Point;
  rays: (FibFanRay & { row: FibRow })[];
}

export function speedFanGeometry(d: Drawing, g: ToolGeom): FanGeo | null {
  const p = px(d, g, 2);
  if (!p) return null;
  const reverse = prop(d, "reverse", false);
  const hp = levelsOf(d, FAN_PRICE_LEVELS).filter((r) => r.visible !== false);
  const vt = levelsOf(d, FAN_TIME_LEVELS, "vlevels").filter((r) => r.visible !== false);
  const rays = fibSpeedFanRays(p[0], p[1], hp.map((r) => r.ratio), vt.map((r) => r.ratio), reverse);
  const { o, q } = fibFanBox(p[0], p[1], reverse);
  return { o, q, rays: rays.map((r, i) => ({ ...r, row: i < hp.length ? hp[i] : vt[i - hp.length] })) };
}

/** Grid inside the box: a horizontal line per price level, a vertical line per time level. */
function gridLines({ o, q, rays }: FanGeo): Point[][] {
  const x0 = Math.min(o.x, q.x);
  const x1 = Math.max(o.x, q.x);
  const y0 = Math.min(o.y, q.y);
  const y1 = Math.max(o.y, q.y);
  return rays.map((r) => (r.kind === "price" ? [{ x: x0, y: r.to.y }, { x: x1, y: r.to.y }] : [{ x: r.to.x, y: y0 }, { x: r.to.x, y: y1 }]));
}

export const fibSpeedFan: DrawingToolDef = {
  type: "fibSpeedFan",
  catalogType: "LineToolFibSpeedResistanceFan",
  family: "fibonacci",
  label: "Fib speed resistance fan",
  icon: "fibSpeedFan",
  iconPath: "M5.5 22.5l18-18M5.5 22.5l18-7M5.5 22.5l18-12M5.5 22.5l7-18M5.5 22.5l12-18",
  iconFill: "M5.5 25a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM23.5 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 2,
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "style", "settings", "lock", "remove", "more"],
  floatBindings: { "line-tool-color": oneColorBinding(FAN_PRICE_LEVELS) },
  defaults: { width: 2, lineStyle: "solid", levels: FAN_PRICE_LEVELS },
  defaultProps: {
    vlevels: FAN_TIME_LEVELS,
    showLeftLabels: true,
    showRightLabels: true,
    showTopLabels: true,
    showBottomLabels: true,
    fillBackground: true,
    transparency: 80,
    grid_visible: true,
    grid_color: GRID_COLOR,
    grid_linewidth: 1,
    grid_linestyle: "solid",
    reverse: false,
  },
  settings: {
    coordinates: "time-price",
    style: [
      { kind: "section", label: "Price levels" },
      levelTable(() => FAN_PRICE_LEVELS, { catalogPrefix: "hlevel", label: "Price levels" }),
      { kind: "checkbox", key: "props.showLeftLabels", label: "Left labels", catalog: "showLeftLabels", default: true },
      { kind: "checkbox", key: "props.showRightLabels", label: "Right labels", catalog: "showRightLabels", default: true },
      { kind: "section", label: "Time levels" },
      levelTable(() => FAN_TIME_LEVELS, { key: "props.vlevels", catalogPrefix: "vlevel", label: "Time levels" }),
      { kind: "checkbox", key: "props.showTopLabels", label: "Top labels", catalog: "showTopLabels", default: true },
      { kind: "checkbox", key: "props.showBottomLabels", label: "Bottom labels", catalog: "showBottomLabels", default: true },
      useOneColor,
      ...backgroundFields(true),
      { kind: "checkbox", key: "props.grid_visible", label: "Grid", catalog: "grid.visible", default: true },
      { kind: "color", key: "props.grid_color", label: "Grid color", catalog: "grid.color", default: GRID_COLOR },
      { kind: "width", key: "props.grid_linewidth", label: "Grid width", catalog: "grid.linewidth", default: 1 },
      { kind: "lineStyle", key: "props.grid_linestyle", label: "Grid style", catalog: "grid.linestyle", default: "solid" },
      { kind: "checkbox", key: "props.reverse", label: "Reverse", catalog: "reverse", default: false },
    ],
  },
  hitTest(d, g, x, y, tol) {
    const geo = speedFanGeometry(d, g);
    if (!geo) return false;
    const polys: Point[][] = geo.rays.map((r) => [r.from, far(r.from, r.to)]);
    if (prop(d, "grid_visible", true)) polys.push(...gridLines(geo));
    return hitPolys(polys, x, y, tol);
  },
  render(c, d) {
    const geo = speedFanGeometry(d, c);
    if (!geo) return;
    const { o, q, rays } = geo;
    const x0 = Math.min(o.x, q.x);
    const x1 = Math.max(o.x, q.x);
    const y0 = Math.min(o.y, q.y);
    const y1 = Math.max(o.y, q.y);
    const price = rays.filter((r) => r.kind === "price").sort((u, v) => u.coeff - v.coeff);
    const time = rays.filter((r) => r.kind === "time").sort((u, v) => u.coeff - v.coeff);
    // bands between neighbouring rays (inside the box)
    const alpha = fillAlpha(d);
    if (alpha > 0) {
      for (const set of [price, time]) for (let i = 1; i < set.length; i++) fillPoly(c, [o, set[i - 1].to, set[i].to], bandFill(levelColor(d, set[i].row, c.color), alpha));
    }
    // grid
    if (prop(d, "grid_visible", true)) {
      strokeLevel(c, prop(d, "grid_color", GRID_COLOR), undefined, Number(prop(d, "grid_linewidth", 1)), prop(d, "grid_linestyle", "solid"));
      for (const l of gridLines(geo)) stroke(c, l);
    }
    // rays
    const lw = d.style?.width ?? 2;
    const ls = d.style?.lineStyle ?? "solid";
    for (const r of rays) {
      strokeLevel(c, levelColor(d, r.row, c.color), undefined, lw, ls);
      stroke(c, [r.from, far(r.from, r.to)]);
    }
    // labels on the four sides
    const size = 12;
    for (const r of price) {
      const col = levelColor(d, r.row, c.color);
      const t = fibCoeffLabel(r.coeff);
      if (prop(d, "showLeftLabels", true)) label(c, t, x0 - 4, r.to.y, col, size, "right", "middle");
      if (prop(d, "showRightLabels", true)) label(c, t, x1 + 4, r.to.y, col, size, "left", "middle");
    }
    for (const r of time) {
      const col = levelColor(d, r.row, c.color);
      const t = fibCoeffLabel(r.coeff);
      if (prop(d, "showTopLabels", true)) label(c, t, r.to.x, y0 - 4, col, size, "center", "bottom");
      if (prop(d, "showBottomLabels", true)) label(c, t, r.to.x, y1 + 4, col, size, "center", "top");
    }
  },
  handles: anchorHandles,
};
