// Trend-based fib extension (3 anchors): levels C + k × (B − A) drawn from C to the right over the
// A→C span, bands between neighbouring levels, labels (level / price), optional row text, and the
// dashed A→B→C trend line.

import { fibCoeffLabel, fibExtensionLevels, type Drawing, type Point } from "@qt/core";
import { levelTable } from "../../builders";
import { anchorHandles, prop } from "../../draw";
import type { DrawCtx, DrawingToolDef, ToolGeom } from "../../types";
import {
  HORZ_ALIGN,
  VERT_ALIGN,
  backgroundFields,
  bandFill,
  fillAlpha,
  hLineLabel,
  hLineText,
  hitPolys,
  labelFontSizeField,
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

export const EXTENSION_LEVELS: FibRow[] = rows([
  [0, "#808080", true],
  [0.236, "#F23645", true],
  [0.382, "#FF9800", true],
  [0.5, "#4caf50", true],
  [0.618, "#089981", true],
  [0.786, "#00bcd4", true],
  [1, "#808080", true],
  [1.618, "#2962FF", true],
  [2.618, "#F23645", true],
  [3.618, "#9c27b0", true],
  [4.236, "#e91e63", true],
  [1.272, "#FF9800", false],
  [1.414, "#F23645", false],
  [2.272, "#FF9800", false],
  [2.414, "#4caf50", false],
  [2, "#089981", false],
  [3, "#00bcd4", false],
  [3.272, "#808080", false],
  [3.414, "#2962FF", false],
  [4, "#F23645", false],
  [4.272, "#9c27b0", false],
  [4.414, "#e91e63", false],
  [4.618, "#FF9800", false],
  [4.764, "#089981", false],
]);

/** Level lines of an extension in px: visible rows sorted by price. */
export function extensionGeometry(d: Drawing, g: ToolGeom): { x0: number; x1: number; trend: Point[]; levels: { row: FibRow; y: number; price: number }[] } | null {
  const p = px(d, g, 3);
  if (!p) return null;
  const [a, b, c] = d.anchors;
  const [pa, , pc] = p;
  const span = Math.max(Math.abs(pc.x - pa.x), 20);
  let x0 = pc.x;
  let x1 = pc.x + span;
  if (prop(d, "extendLinesLeft", false)) x0 = Math.min(x0, 0) - 1e4;
  if (prop(d, "extendLines", false)) x1 = Math.max(x1, g.viewport.width) + 1e4;
  const vis = levelsOf(d, EXTENSION_LEVELS).filter((r) => r.visible !== false);
  const prices = fibExtensionLevels(a, b, c, vis.map((r) => r.ratio), { reverse: prop(d, "reverse", false), log: prop(d, "fibLevelsBasedOnLogScale", false) });
  const levels = vis.map((row, i) => ({ row, price: prices[i].price, y: g.toPx({ time: c.time, price: prices[i].price }).y })).sort((u, v) => u.price - v.price);
  return { x0, x1, trend: p, levels };
}

/** Horizontal level set: bands, lines, labels and texts (extension and channel share the label rules). */
export function drawHorizontalLevels(c: DrawCtx, d: Drawing, levels: { row: FibRow; y: number; price: number }[], x0: number, x1: number, lw: number, ls: string): void {
  const alpha = fillAlpha(d);
  const size = Number(prop(d, "labelFontSize", 12));
  const horz = prop(d, "horzLabelsAlign", "left");
  const vert = prop(d, "vertLabelsAlign", "middle");
  if (alpha > 0) {
    for (let i = 1; i < levels.length; i++) {
      const y0 = levels[i - 1].y;
      const y1 = levels[i].y;
      c.ctx.fillStyle = bandFill(levelColor(d, levels[i].row, c.color), alpha);
      c.ctx.fillRect(Math.max(x0, -1e4), Math.min(y0, y1), Math.min(x1, 2e4) - Math.max(x0, -1e4), Math.abs(y1 - y0));
    }
  }
  for (const l of levels) {
    const col = levelColor(d, l.row, c.color);
    strokeLevel(c, col, undefined, lw, ls);
    stroke(c, [{ x: x0, y: l.y }, { x: x1, y: l.y }]);
  }
  const showCoeffs = prop(d, "showCoeffs", true);
  const showPrices = prop(d, "showPrices", true);
  const pct = truthy(prop(d, "coeffsAsPercents", false));
  const lx0 = Math.max(x0, 0);
  const lx1 = Math.min(x1, c.width);
  for (const l of levels) {
    const col = levelColor(d, l.row, c.color);
    const parts: string[] = [];
    if (showCoeffs) parts.push(fibCoeffLabel(l.row.ratio, pct));
    if (showPrices) parts.push(showCoeffs ? `(${c.formatPrice(l.price)})` : c.formatPrice(l.price));
    if (parts.length) hLineLabel(c, parts.join(" "), lx0, lx1, l.y, horz, vert, col, size);
    if (prop(d, "showText", true) && l.row.text) {
      hLineText(c, l.row.text, lx0, lx1, l.y, prop(d, "horzTextAlign", "center"), prop(d, "vertTextAlign", "middle"), col, size);
    }
  }
}

/** Dashed trend polyline through the anchors (trendline.* props). */
export function drawTrend(c: DrawCtx, d: Drawing, pts: Point[], def: { width?: number; style?: string } = {}): void {
  if (!prop(d, "trendline_visible", true)) return;
  strokeLevel(c, prop(d, "trendline_color", "#808080"), undefined, Number(prop(d, "trendline_linewidth", def.width ?? 2)), prop(d, "trendline_linestyle", def.style ?? "dashed"));
  stroke(c, pts);
}

/** Text rows: the catalog's per-level text, for the wiring test of the text options. */
const withText = (d: Drawing): Drawing => ({
  ...d,
  props: { ...d.props, showText: true },
  style: { ...d.style, levels: EXTENSION_LEVELS.map((r, i) => ({ ...r, text: i === 1 ? "Target" : "" })) as FibRow[] },
});

export const fibExtension: DrawingToolDef = {
  type: "fibExtension",
  catalogType: "LineToolTrendBasedFibExtension",
  family: "fibonacci",
  label: "Trend-based fib extension",
  icon: "fibExtension",
  iconPath: "M4.5 22.5l6-13 5 7M13.5 6.5h11M13.5 11.5h11M13.5 16.5h11M13.5 21.5h11",
  iconFill: "M4.5 25a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM10.5 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM15.5 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 3,
  alert: "line",
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "add-alert", "lock", "remove", "more"],
  floatBindings: { "line-tool-color": oneColorBinding(EXTENSION_LEVELS), "line-tool-width": "props.levelsStyle_linewidth" },
  defaults: { levels: EXTENSION_LEVELS },
  defaultProps: {
    trendline_visible: true,
    trendline_linewidth: 2,
    trendline_linestyle: "dashed",
    trendline_color: "#808080",
    levelsStyle_linewidth: 2,
    levelsStyle_linestyle: "solid",
    extendLinesLeft: false,
    extendLines: false,
    fillBackground: true,
    transparency: 80,
    reverse: false,
    showPrices: true,
    showCoeffs: true,
    coeffsAsPercents: false,
    horzLabelsAlign: "left",
    vertLabelsAlign: "middle",
    showText: true,
    horzTextAlign: "center",
    vertTextAlign: "middle",
    labelFontSize: 12,
    fibLevelsBasedOnLogScale: false,
  },
  settings: {
    coordinates: "time-price",
    style: [
      ...trendlineFields(),
      { kind: "width", key: "props.levelsStyle_linewidth", label: "Levels line width", catalog: "levelsStyle.linewidth", default: 2 },
      { kind: "lineStyle", key: "props.levelsStyle_linestyle", label: "Levels line style", catalog: "levelsStyle.linestyle", default: "solid" },
      { kind: "checkbox", key: "props.extendLinesLeft", label: "Extend lines left", catalog: "extendLinesLeft", default: false },
      { kind: "checkbox", key: "props.extendLines", label: "Extend lines right", catalog: "extendLines", default: false },
      levelTable(() => EXTENSION_LEVELS, { catalogPrefix: "level" }),
      useOneColor,
      ...backgroundFields(true),
      { kind: "checkbox", key: "props.reverse", label: "Reverse", catalog: "reverse", default: false },
      { kind: "checkbox", key: "props.showPrices", label: "Prices", catalog: "showPrices", default: true },
      { kind: "checkbox", key: "props.showCoeffs", label: "Levels", catalog: "showCoeffs", default: true },
      {
        kind: "select",
        key: "props.coeffsAsPercents",
        label: "Levels as",
        catalog: "coeffsAsPercents",
        options: [
          { value: false, label: "Values" },
          { value: true, label: "Percents" },
        ],
        default: false,
      },
      { kind: "select", key: "props.horzLabelsAlign", label: "Labels horizontal", catalog: "horzLabelsAlign", options: HORZ_ALIGN, default: "left" },
      { kind: "select", key: "props.vertLabelsAlign", label: "Labels vertical", catalog: "vertLabelsAlign", options: VERT_ALIGN, default: "middle" },
      { kind: "checkbox", key: "props.showText", label: "Text", catalog: "showText", default: true, testWith: withText },
      { kind: "select", key: "props.horzTextAlign", label: "Text horizontal", catalog: "horzTextAlign", options: HORZ_ALIGN, default: "center", testWith: withText },
      { kind: "select", key: "props.vertTextAlign", label: "Text vertical", catalog: "vertTextAlign", options: VERT_ALIGN, default: "middle", testWith: withText },
      labelFontSizeField(12),
      { kind: "checkbox", key: "props.fibLevelsBasedOnLogScale", label: "Fib levels based on log scale", catalog: "fibLevelsBasedOnLogScale", default: false },
    ],
  },
  hitTest(d, g, x, y, tol) {
    const geo = extensionGeometry(d, g);
    if (!geo) return false;
    const polys = geo.levels.map((l) => [{ x: geo.x0, y: l.y }, { x: geo.x1, y: l.y }]);
    if (prop(d, "trendline_visible", true)) polys.push(geo.trend);
    return hitPolys(polys, x, y, tol);
  },
  render(c, d) {
    const geo = extensionGeometry(d, c);
    if (!geo) {
      drawTrend(c, d, d.anchors.map((a) => c.toPx(a)));
      return;
    }
    drawHorizontalLevels(c, d, geo.levels, geo.x0, geo.x1, Number(prop(d, "levelsStyle_linewidth", 2)), prop(d, "levelsStyle_linestyle", "solid"));
    drawTrend(c, d, geo.trend);
  },
  handles: anchorHandles,
};
