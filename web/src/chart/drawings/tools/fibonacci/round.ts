// Round Fibonacci tools. Shapes are built from the projected anchors in the anchors' own aspect
// (|dx| : |dy|), which is the data-space shape re-projected through the current scales (the
// constructions in core are affine-covariant):
//  · Fib circles (2): ellipses centered at A, level 1 through B.
//  · Fib speed resistance arcs (2): ellipses centered at B, level 1 through A, half towards A
//    (full circles optional).
//  · Fib spiral (2): golden spiral centered at A through B (×φ per quarter turn).
//  · Fib wedge (3): apex A, rays through B and C, level arcs at k × |AB| between the rays.

import { fibArcLevels, fibCircleLevels, fibCoeffLabel, fibEllipsePoint, fibEllipsePoints, fibWedgeLevels, goldenSpiral, type Drawing, type FibEllipse, type Point } from "@qt/core";
import { levelTable } from "../../builders";
import { anchorHandles, prop } from "../../draw";
import type { Rect } from "@qt/core";
import type { DrawCtx, DrawingToolDef, ToolGeom } from "../../types";
import {
  allLevelsBinding,
  backgroundFields,
  bandFill,
  fillAlpha,
  hitPolys,
  label,
  levelColor,
  levelsOf,
  oneColorBinding,
  px,
  rows,
  stroke,
  strokeLevel,
  trendlineFields,
  truthy,
  useOneColor,
  type FibRow,
} from "./common";
import { drawTrend } from "./extension";

const ROUND_ROWS: [number, string, boolean, number, number][] = [
  [0.236, "#F23645", true, 2, 0],
  [0.382, "#FF9800", true, 2, 0],
  [0.5, "#089981", true, 2, 0],
  [0.618, "#4caf50", true, 2, 0],
  [0.786, "#00bcd4", true, 2, 0],
  [1, "#808080", true, 2, 0],
  [1.618, "#2962FF", true, 2, 0],
  [2.618, "#e91e63", true, 2, 0],
  [3.618, "#2962FF", true, 2, 0],
  [4.236, "#e91e63", true, 2, 0],
  [4.618, "#F23645", true, 2, 0],
];
export const CIRCLE_LEVELS: FibRow[] = rows(ROUND_ROWS);
export const ARC_LEVELS: FibRow[] = rows(ROUND_ROWS);
export const WEDGE_LEVELS: FibRow[] = rows([
  [0.236, "#F23645", true, 2, 0],
  [0.382, "#FF9800", true, 2, 0],
  [0.5, "#4caf50", true, 2, 0],
  [0.618, "#089981", true, 2, 0],
  [0.786, "#00bcd4", true, 2, 0],
  [1, "#808080", true, 2, 0],
  [1.618, "#2962FF", false, 2, 0],
  [2.618, "#F23645", false, 2, 0],
  [3.618, "#673ab7", false, 2, 0],
  [4.236, "#e91e63", false, 2, 0],
  [4.618, "#e91e63", false, 2, 0],
]);

interface Arc {
  row: FibRow;
  e: FibEllipse;
  t0: number;
  t1: number;
  pts: Point[];
}

const arc = (row: FibRow, e: FibEllipse, t0 = 0, t1 = 2 * Math.PI): Arc => ({ row, e, t0, t1, pts: fibEllipsePoints(e, t0, t1, 128) });

/** Ring band between two arcs (outer forward, inner backward). */
function fillRing(c: DrawCtx, outer: Point[], inner: Point[], style: string, closedRings: boolean): void {
  const { ctx } = c;
  ctx.save();
  ctx.fillStyle = style;
  ctx.beginPath();
  if (closedRings) {
    outer.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    inner.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill("evenodd");
  } else {
    outer.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i].x, inner[i].y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawArcs(
  c: DrawCtx,
  d: Drawing,
  arcs: Arc[],
  closed: boolean,
  labelAt: (a: Arc) => { p: Point; align: CanvasTextAlign; baseline: CanvasTextBaseline },
  apex?: Point,
): void {
  const sorted = [...arcs].sort((u, v) => u.row.ratio - v.row.ratio);
  const alpha = fillAlpha(d);
  if (alpha > 0) {
    // bands between neighbouring levels (with an apex: the innermost band reaches it)
    sorted.forEach((a, i) => {
      if (i) fillRing(c, a.pts, sorted[i - 1].pts, bandFill(levelColor(d, a.row, c.color), alpha), closed);
      else if (apex) fillRing(c, a.pts, [apex], bandFill(levelColor(d, a.row, c.color), alpha), false);
    });
  }
  for (const a of sorted) {
    strokeLevel(c, levelColor(d, a.row, c.color), a.row, 2, "solid");
    stroke(c, a.pts);
  }
  if (prop(d, "showCoeffs", true)) {
    const pct = truthy(prop(d, "coeffsAsPercents", false));
    for (const a of sorted) {
      const at = labelAt(a);
      label(c, fibCoeffLabel(a.row.ratio, pct), at.p.x, at.p.y, levelColor(d, a.row, c.color), 12, at.align, at.baseline);
    }
  }
}

const ellipseRect = (arcs: Arc[], extra: Point[]): Rect => {
  const pts = [...extra, ...arcs.flatMap((a) => [fibEllipsePoint(a.e, 0), fibEllipsePoint(a.e, Math.PI / 2), fibEllipsePoint(a.e, Math.PI), fibEllipsePoint(a.e, -Math.PI / 2)])];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
};

// ---------- Fib circles ----------

export function circleArcs(d: Drawing, g: ToolGeom): Arc[] | null {
  const p = px(d, g, 2);
  if (!p) return null;
  const vis = levelsOf(d, CIRCLE_LEVELS).filter((r) => r.visible !== false);
  return fibCircleLevels(p[0], p[1], vis.map((r) => r.ratio)).map((e, i) => arc(vis[i], e));
}

const trendTail = (d: Drawing, g: ToolGeom, polys: Point[][]) => {
  if (prop(d, "trendline_visible", true)) polys.push(d.anchors.slice(0, 2).map((a) => g.toPx(a)));
  return polys;
};

export const fibCircles: DrawingToolDef = {
  type: "fibCircles",
  catalogType: "LineToolFibCircles",
  family: "fibonacci",
  label: "Fib circles",
  icon: "fibCircles",
  iconPath: "M14.5 14.5l6 5M14.5 10.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM14.5 7.5a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM14.5 4.5a10 10 0 1 1 0 20 10 10 0 0 1 0-20z",
  iconFill: "M14.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 2,
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"],
  floatBindings: { "line-tool-color": oneColorBinding(CIRCLE_LEVELS), "line-tool-width": allLevelsBinding(CIRCLE_LEVELS, "width", 2) },
  defaults: { levels: CIRCLE_LEVELS },
  defaultProps: { trendline_visible: true, trendline_linewidth: 2, trendline_linestyle: "dashed", trendline_color: "#808080", fillBackground: true, transparency: 80, showCoeffs: true, coeffsAsPercents: false },
  settings: {
    coordinates: "time-price",
    style: [
      ...trendlineFields(),
      levelTable(() => CIRCLE_LEVELS, { catalogPrefix: "level", lineColumns: true }),
      useOneColor,
      ...backgroundFields(true),
      { kind: "checkbox", key: "props.showCoeffs", label: "Levels", catalog: "showCoeffs", default: true },
      { kind: "checkbox", key: "props.coeffsAsPercents", label: "Levels as percents", catalog: "coeffsAsPercents", default: false },
    ],
  },
  hitTest(d, g, x, y, tol) {
    const arcs = circleArcs(d, g);
    return !!arcs && hitPolys(trendTail(d, g, arcs.map((a) => a.pts)), x, y, tol);
  },
  render(c, d) {
    const arcs = circleArcs(d, c);
    if (arcs) drawArcs(c, d, arcs, true, (a) => ({ p: fibEllipsePoint(a.e, -Math.PI / 2), align: "center", baseline: "bottom" }));
    drawTrend(c, d, d.anchors.slice(0, 2).map((a) => c.toPx(a)));
  },
  handles: anchorHandles,
  bounds(d, g) {
    return ellipseRect(circleArcs(d, g) ?? [], d.anchors.map((a) => g.toPx(a)));
  },
};

// ---------- Fib speed resistance arcs ----------

export function speedArcs(d: Drawing, g: ToolGeom): Arc[] | null {
  const p = px(d, g, 2);
  if (!p) return null;
  const vis = levelsOf(d, ARC_LEVELS).filter((r) => r.visible !== false);
  return fibArcLevels(p[0], p[1], vis.map((r) => r.ratio), prop(d, "fullCircles", false)).map((e, i) => arc(vis[i], e, e.t0, e.t1));
}

export const fibSpeedArcs: DrawingToolDef = {
  type: "fibSpeedArcs",
  catalogType: "LineToolFibSpeedResistanceArcs",
  family: "fibonacci",
  label: "Fib speed resistance arcs",
  icon: "fibSpeedArcs",
  iconPath: "M22.5 5.5l-17 17M22.5 11.5a6 6 0 0 1-6-6M22.5 16.5a11 11 0 0 1-11-11M22.5 22.5a17 17 0 0 1-17-17",
  iconFill: "M22.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM5.5 25a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 2,
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"],
  floatBindings: { "line-tool-color": oneColorBinding(ARC_LEVELS), "line-tool-width": allLevelsBinding(ARC_LEVELS, "width", 2) },
  defaults: { levels: ARC_LEVELS },
  defaultProps: { trendline_visible: true, trendline_linewidth: 2, trendline_linestyle: "dashed", trendline_color: "#808080", fillBackground: true, transparency: 80, showCoeffs: true, fullCircles: false },
  settings: {
    coordinates: "time-price",
    style: [
      ...trendlineFields(),
      levelTable(() => ARC_LEVELS, { catalogPrefix: "level", lineColumns: true }),
      useOneColor,
      ...backgroundFields(true),
      { kind: "checkbox", key: "props.showCoeffs", label: "Levels", catalog: "showCoeffs", default: true },
      { kind: "checkbox", key: "props.fullCircles", label: "Full circles", catalog: "fullCircles", default: false },
    ],
  },
  hitTest(d, g, x, y, tol) {
    const arcs = speedArcs(d, g);
    return !!arcs && hitPolys(trendTail(d, g, arcs.map((a) => a.pts)), x, y, tol);
  },
  render(c, d) {
    const arcs = speedArcs(d, c);
    const full = prop(d, "fullCircles", false);
    if (arcs) {
      drawArcs(c, d, arcs, full, (a) => {
        const down = a.t0 === 0;
        return { p: fibEllipsePoint(a.e, full ? -Math.PI / 2 : down ? Math.PI / 2 : -Math.PI / 2), align: "center", baseline: down && !full ? "top" : "bottom" };
      });
    }
    drawTrend(c, d, d.anchors.slice(0, 2).map((a) => c.toPx(a)));
  },
  handles: anchorHandles,
  bounds(d, g) {
    return ellipseRect(speedArcs(d, g) ?? [], d.anchors.map((a) => g.toPx(a)));
  },
};

// ---------- Fib spiral ----------

export function spiralPoints(d: Drawing, g: ToolGeom): Point[] | null {
  const p = px(d, g, 2);
  if (!p) return null;
  const [a] = p;
  const { width: w, height: h } = g.viewport;
  const maxR = Math.max(Math.hypot(a.x, a.y), Math.hypot(a.x - w, a.y), Math.hypot(a.x, a.y - h), Math.hypot(a.x - w, a.y - h)) * 2 + 50;
  return goldenSpiral(p[0], p[1], prop(d, "counterclockwise", false), { minR: 0.5, maxR: Math.min(maxR, 1e5), perQuarter: 24 });
}

export const fibSpiral: DrawingToolDef = {
  type: "fibSpiral",
  catalogType: "LineToolFibSpiral",
  family: "fibonacci",
  label: "Fib spiral",
  icon: "fibSpiral",
  iconPath: "M14.5 12.5a2 2 0 0 1 2 2a3 3 0 0 1-3 3a5 5 0 0 1-5-5a8 8 0 0 1 8-8",
  iconFill: "M14.5 15a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 2,
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"],
  defaults: { color: "#00bcd4", width: 2, lineStyle: "solid" },
  defaultProps: { counterclockwise: false },
  settings: {
    coordinates: "time-price",
    style: [
      { kind: "color", key: "style.color", label: "Line", catalog: "linecolor", default: "#00bcd4" },
      { kind: "width", key: "style.width", label: "Width", catalog: "linewidth", default: 2 },
      { kind: "lineStyle", key: "style.lineStyle", label: "Line style", catalog: "linestyle", default: "solid" },
      { kind: "checkbox", key: "props.counterclockwise", label: "Counterclockwise", catalog: "counterclockwise", default: false },
    ],
  },
  hitTest(d, g, x, y, tol) {
    const pts = spiralPoints(d, g);
    return !!pts && hitPolys([pts], x, y, tol);
  },
  render(c, d) {
    const pts = spiralPoints(d, c);
    if (!pts) return;
    strokeLevel(c, c.color, undefined, d.style?.width ?? 2, d.style?.lineStyle ?? "solid");
    stroke(c, pts);
  },
  handles: anchorHandles,
};

// ---------- Fib wedge ----------

export function wedgeArcs(d: Drawing, g: ToolGeom): { arcs: Arc[]; rays: [Point, Point][] } | null {
  const p = px(d, g, 3);
  if (!p) return null;
  const vis = levelsOf(d, WEDGE_LEVELS).filter((r) => r.visible !== false);
  const lv = fibWedgeLevels(p[0], p[1], p[2], vis.map((r) => r.ratio));
  const arcs = lv.map((e, i) => arc(vis[i], e, e.t0, e.t1));
  // rays reach the outermost level (at least the anchors)
  const maxK = Math.max(1, ...vis.map((r) => r.ratio));
  const reach = (b: Point): Point => ({ x: p[0].x + (b.x - p[0].x) * maxK, y: p[0].y + (b.y - p[0].y) * maxK });
  const lvC = fibWedgeLevels(p[0], p[1], p[2], [1])[0];
  const cOnArc = fibEllipsePoint(lvC, lvC.t1);
  const cDir = Math.hypot(p[2].x - p[0].x, p[2].y - p[0].y) >= Math.hypot(cOnArc.x - p[0].x, cOnArc.y - p[0].y) ? p[2] : cOnArc;
  return { arcs, rays: [[p[0], reach(p[1])], [p[0], reach(cDir)]] };
}

export const fibWedge: DrawingToolDef = {
  type: "fibWedge",
  catalogType: "LineToolFibWedge",
  family: "fibonacci",
  label: "Fib wedge",
  icon: "fibWedge",
  iconPath: "M4.5 22.5h20M4.5 22.5l16-12M14.5 22.5A10 10 0 0 0 12.5 16.5M19.5 22.5A15 15 0 0 0 16.5 13.5",
  iconFill: "M4.5 25a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM24.5 25a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM20.5 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 3,
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"],
  floatBindings: { "line-tool-color": oneColorBinding(WEDGE_LEVELS), "line-tool-width": allLevelsBinding(WEDGE_LEVELS, "width", 2) },
  defaults: { levels: WEDGE_LEVELS },
  defaultProps: { trendline_visible: true, trendline_linewidth: 2, trendline_color: "#808080", fillBackground: true, transparency: 80, showCoeffs: true },
  settings: {
    coordinates: false,
    style: [
      ...trendlineFields({ style: null }),
      levelTable(() => WEDGE_LEVELS, { catalogPrefix: "level", lineColumns: true }),
      useOneColor,
      ...backgroundFields(true),
      { kind: "checkbox", key: "props.showCoeffs", label: "Levels", catalog: "showCoeffs", default: true },
    ],
  },
  hitTest(d, g, x, y, tol) {
    const w = wedgeArcs(d, g);
    if (!w) return false;
    const polys = w.arcs.map((a) => a.pts);
    if (prop(d, "trendline_visible", true)) polys.push(...w.rays);
    return hitPolys(polys, x, y, tol);
  },
  render(c, d) {
    const w = wedgeArcs(d, c);
    if (!w) {
      drawTrend(c, d, d.anchors.map((a) => c.toPx(a)), { style: "solid" });
      return;
    }
    drawArcs(c, d, w.arcs, false, (a) => ({ p: fibEllipsePoint(a.e, a.t0), align: "left", baseline: "middle" }), w.rays[0][0]);
    if (prop(d, "trendline_visible", true)) {
      strokeLevel(c, prop(d, "trendline_color", "#808080"), undefined, Number(prop(d, "trendline_linewidth", 2)), "solid");
      for (const r of w.rays) stroke(c, r);
    }
  },
  handles: anchorHandles,
};
