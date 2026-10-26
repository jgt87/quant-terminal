// Time-based Fibonacci tools: vertical lines at bar offsets.
//  · Fib time zone (2 anchors): x_A + k × (x_B − x_A), k = 0, 1, 2, 3, 5, 8, … (Fibonacci numbers).
//  · Trend-based fib time (3 anchors): x_C + k × (x_B − x_A).
// The x axis is linear in bar index, so pixel offsets are bar offsets (anchors sit on bars).

import { fibCoeffLabel, fibTimeZoneXs, fibTrendTimeXs, type Drawing } from "@qt/core";
import { levelTable } from "../../builders";
import { anchorHandles, prop } from "../../draw";
import type { DrawCtx, DrawingToolDef, ToolGeom } from "../../types";
import {
  HORZ_ALIGN,
  VERT_POS,
  allLevelsBinding,
  backgroundFields,
  bandFill,
  fillAlpha,
  hitPolys,
  levelColor,
  levelsOf,
  oneColorBinding,
  px,
  rows,
  stroke,
  strokeLevel,
  trendlineFields,
  useOneColor,
  vLineLabel,
  type FibRow,
} from "./common";
import { drawTrend } from "./extension";

export const TIMEZONE_LEVELS: FibRow[] = rows(
  [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89].map((k, i) => [k, i === 0 ? "#808080" : "#2962FF", true, 2, 0]),
);

export const TREND_TIME_LEVELS: FibRow[] = rows([
  [0, "#808080", true, 2, 0],
  [0.382, "#F23645", true, 2, 0],
  [0.5, "#81c784", false, 2, 0],
  [0.618, "#4caf50", true, 2, 0],
  [1, "#089981", true, 2, 0],
  [1.382, "#00bcd4", true, 2, 0],
  [1.618, "#808080", true, 2, 0],
  [2, "#2962FF", true, 2, 0],
  [2.382, "#e91e63", true, 2, 0],
  [2.618, "#9c27b0", true, 2, 0],
  [3, "#673ab7", true, 2, 0],
]);

/** Visible vertical lines sorted by x. */
function timeLines(d: Drawing, g: ToolGeom, factory: FibRow[], trend: boolean): { row: FibRow; x: number }[] | null {
  const p = px(d, g, trend ? 3 : 2);
  if (!p) return null;
  const vis = levelsOf(d, factory).filter((r) => r.visible !== false);
  const ks = vis.map((r) => r.ratio);
  const xs = trend ? fibTrendTimeXs(p[0].x, p[1].x, p[2].x, ks) : fibTimeZoneXs(p[0].x, p[1].x, ks);
  return vis.map((row, i) => ({ row, x: xs[i] })).sort((u, v) => u.x - v.x);
}

function drawTimeLines(c: DrawCtx, d: Drawing, lines: { row: FibRow; x: number }[], labelsKey: "showLabels" | "showCoeffs"): void {
  const alpha = fillAlpha(d, labelsKey === "showCoeffs");
  if (alpha > 0) {
    for (let i = 1; i < lines.length; i++) {
      c.ctx.fillStyle = bandFill(levelColor(d, lines[i].row, c.color), alpha);
      c.ctx.fillRect(lines[i - 1].x, 0, lines[i].x - lines[i - 1].x, c.height);
    }
  }
  for (const l of lines) {
    strokeLevel(c, levelColor(d, l.row, c.color), l.row, 2, "solid");
    stroke(c, [{ x: l.x, y: 0 }, { x: l.x, y: c.height }]);
  }
  if (prop(d, labelsKey, true)) {
    const horz = prop(d, "horzLabelsAlign", "right");
    const vert = prop(d, "vertLabelsAlign", "bottom");
    for (const l of lines) vLineLabel(c, fibCoeffLabel(l.row.ratio), l.x, horz, vert, levelColor(d, l.row, c.color), 12);
  }
}

const labelAlignFields = (key: "showLabels" | "showCoeffs") => [
  { kind: "checkbox" as const, key: `props.${key}` as const, label: "Labels", catalog: key, default: true },
  { kind: "select" as const, key: "props.horzLabelsAlign" as const, label: "Labels horizontal", catalog: "horzLabelsAlign", options: HORZ_ALIGN, default: "right" },
  { kind: "select" as const, key: "props.vertLabelsAlign" as const, label: "Labels vertical", catalog: "vertLabelsAlign", options: VERT_POS, default: "bottom" },
];

export const fibTimeZone: DrawingToolDef = {
  type: "fibTimeZone",
  catalogType: "LineToolFibTimeZone",
  family: "fibonacci",
  label: "Fib time zone",
  icon: "fibTimeZone",
  iconPath: "M4.5 3.5v21M7.5 3.5v21M10.5 3.5v21M13.5 3.5v21M18.5 3.5v21M24.5 3.5v21",
  anchors: 2,
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "style", "settings", "lock", "remove", "more"],
  floatBindings: {
    "line-tool-color": oneColorBinding(TIMEZONE_LEVELS),
    "line-tool-width": allLevelsBinding(TIMEZONE_LEVELS, "width", 2),
    style: allLevelsBinding(TIMEZONE_LEVELS, "lineStyle", "solid"),
  },
  defaults: { levels: TIMEZONE_LEVELS },
  defaultProps: { fillBackground: false, transparency: 80, showLabels: true, horzLabelsAlign: "right", vertLabelsAlign: "bottom" },
  settings: {
    coordinates: "time-price",
    style: [levelTable(() => TIMEZONE_LEVELS, { catalogPrefix: "level", lineColumns: true }), useOneColor, ...backgroundFields(false), ...labelAlignFields("showLabels")],
  },
  hitTest(d, g, x, y, tol) {
    const ls = timeLines(d, g, TIMEZONE_LEVELS, false);
    return !!ls && hitPolys(ls.map((l) => [{ x: l.x, y: 0 }, { x: l.x, y: g.viewport.height }]), x, y, tol);
  },
  render(c, d) {
    const ls = timeLines(d, c, TIMEZONE_LEVELS, false);
    if (ls) drawTimeLines(c, d, ls, "showLabels");
  },
  handles: anchorHandles,
};

export const fibTrendTime: DrawingToolDef = {
  type: "fibTrendTime",
  catalogType: "LineToolTrendBasedFibTime",
  family: "fibonacci",
  label: "Trend-based fib time",
  icon: "fibTrendTime",
  iconPath: "M5.5 20.5l4-12 4 9M13.5 3.5v21M17.5 3.5v21M20.5 3.5v21M24.5 3.5v21",
  iconFill: "M5.5 23a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM9.5 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM13.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 3,
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"],
  floatBindings: { "line-tool-color": oneColorBinding(TREND_TIME_LEVELS), "line-tool-width": allLevelsBinding(TREND_TIME_LEVELS, "width", 2) },
  defaults: { levels: TREND_TIME_LEVELS },
  defaultProps: {
    trendline_visible: true,
    trendline_linewidth: 2,
    trendline_linestyle: "dashed",
    trendline_color: "#808080",
    fillBackground: true,
    transparency: 80,
    showCoeffs: true,
    horzLabelsAlign: "right",
    vertLabelsAlign: "bottom",
  },
  settings: {
    coordinates: "time-price",
    style: [
      ...trendlineFields(),
      levelTable(() => TREND_TIME_LEVELS, { catalogPrefix: "level", lineColumns: true }),
      useOneColor,
      ...backgroundFields(true),
      ...labelAlignFields("showCoeffs"),
    ],
  },
  hitTest(d, g, x, y, tol) {
    const ls = timeLines(d, g, TREND_TIME_LEVELS, true);
    if (!ls) return false;
    const polys = ls.map((l) => [{ x: l.x, y: 0 }, { x: l.x, y: g.viewport.height }]);
    if (prop(d, "trendline_visible", true)) polys.push(d.anchors.map((a) => g.toPx(a)));
    return hitPolys(polys, x, y, tol);
  },
  render(c, d) {
    const ls = timeLines(d, c, TREND_TIME_LEVELS, true);
    if (ls) drawTimeLines(c, d, ls, "showCoeffs");
    drawTrend(c, d, d.anchors.slice(0, 3).map((a) => c.toPx(a)));
  },
  handles: anchorHandles,
};
