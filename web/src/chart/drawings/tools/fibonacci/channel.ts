// Fib channel (3 anchors): A→B is the base line, C sets the channel width; levels are parallels at
// k × width, bands between neighbouring levels, labels at the chosen end.

import { fibChannelLevels, fibChannelOffset, fibCoeffLabel, type Drawing, type Point } from "@qt/core";
import { levelTable } from "../../builders";
import { anchorHandles, prop } from "../../draw";
import type { DrawingToolDef, ToolGeom } from "../../types";
import {
  HORZ_ALIGN,
  VERT_ALIGN,
  backgroundFields,
  bandFill,
  far,
  fillAlpha,
  fillPoly,
  hitPolys,
  label,
  labelFontSizeField,
  levelColor,
  levelsOf,
  oneColorBinding,
  px,
  rows,
  stroke,
  strokeLevel,
  truthy,
  useOneColor,
  type FibRow,
} from "./common";
import { EXTENSION_LEVELS } from "./extension";

/** Same factory table as the extension (catalog). */
export const CHANNEL_LEVELS: FibRow[] = rows(EXTENSION_LEVELS.map((r) => [r.ratio, r.color!, r.visible !== false]));

export function channelGeometry(d: Drawing, g: ToolGeom): { row: FibRow; p0: Point; p1: Point; price: number }[] | null {
  const p = px(d, g, 3);
  if (!p) return null;
  const [pa, pb, pc] = p;
  const vis = levelsOf(d, CHANNEL_LEVELS).filter((r) => r.visible !== false);
  const lv = fibChannelLevels(pa, pb, pc, vis.map((r) => r.ratio));
  const [a, b, c] = d.anchors;
  // prices at A's time, in data space (labels)
  const off = fibChannelOffset({ x: a.time, y: a.price }, { x: b.time, y: b.price }, { x: c.time, y: c.price });
  const left = prop(d, "extendLeft", false);
  const right = prop(d, "extendRight", false);
  return vis
    .map((row, i) => {
      let { p0, p1 } = lv[i];
      const l = p0.x <= p1.x;
      // extend left / right along the level's slope
      if (left) l ? (p0 = far(p1, p0)) : (p1 = far(p0, p1));
      if (right) l ? (p1 = far(p0, p1)) : (p0 = far(p1, p0));
      return { row, p0, p1, price: a.price + row.ratio * off };
    })
    .sort((u, v) => u.row.ratio - v.row.ratio);
}

export const fibChannel: DrawingToolDef = {
  type: "fibChannel",
  catalogType: "LineToolFibChannel",
  family: "fibonacci",
  label: "Fib channel",
  icon: "fibChannel",
  iconPath: "M5.5 15.5l16-10M5.5 19.5l16-10M5.5 23.5l16-10",
  iconFill: "M5.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM21.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM13.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 3,
  floatingToolbar: ["templates", "line-tool-color", "settings", "lock", "remove", "more"],
  floatBindings: { "line-tool-color": oneColorBinding(CHANNEL_LEVELS) },
  defaults: { levels: CHANNEL_LEVELS },
  defaultProps: {
    levelsStyle_linewidth: 2,
    levelsStyle_linestyle: "solid",
    extendLeft: false,
    extendRight: false,
    fillBackground: true,
    transparency: 80,
    showPrices: true,
    showCoeffs: true,
    coeffsAsPercents: false,
    horzLabelsAlign: "left",
    vertLabelsAlign: "middle",
    labelFontSize: 12,
  },
  settings: {
    coordinates: "time-price",
    style: [
      { kind: "width", key: "props.levelsStyle_linewidth", label: "Levels line width", catalog: "levelsStyle.linewidth", default: 2 },
      { kind: "lineStyle", key: "props.levelsStyle_linestyle", label: "Levels line style", catalog: "levelsStyle.linestyle", default: "solid" },
      { kind: "checkbox", key: "props.extendLeft", label: "Extend left", catalog: "extendLeft", default: false },
      { kind: "checkbox", key: "props.extendRight", label: "Extend right", catalog: "extendRight", default: false },
      levelTable(() => CHANNEL_LEVELS, { catalogPrefix: "level" }),
      useOneColor,
      ...backgroundFields(true),
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
      labelFontSizeField(12),
    ],
  },
  hitTest(d, g, x, y, tol) {
    const geo = channelGeometry(d, g);
    return !!geo && hitPolys(geo.map((l) => [l.p0, l.p1]), x, y, tol);
  },
  render(c, d) {
    const geo = channelGeometry(d, c);
    if (!geo) {
      const p = d.anchors.map((a) => c.toPx(a));
      if (p.length === 2) stroke(c, p);
      return;
    }
    const alpha = fillAlpha(d);
    if (alpha > 0) for (let i = 1; i < geo.length; i++) fillPoly(c, [geo[i - 1].p0, geo[i - 1].p1, geo[i].p1, geo[i].p0], bandFill(levelColor(d, geo[i].row, c.color), alpha));
    const lw = Number(prop(d, "levelsStyle_linewidth", 2));
    const ls = prop(d, "levelsStyle_linestyle", "solid");
    for (const l of geo) {
      strokeLevel(c, levelColor(d, l.row, c.color), undefined, lw, ls);
      stroke(c, [l.p0, l.p1]);
    }
    const showCoeffs = prop(d, "showCoeffs", true);
    const showPrices = prop(d, "showPrices", true);
    const pct = truthy(prop(d, "coeffsAsPercents", false));
    const horz = prop(d, "horzLabelsAlign", "left");
    const vert = prop(d, "vertLabelsAlign", "middle");
    const size = Number(prop(d, "labelFontSize", 12));
    const [pa, pb] = d.anchors.slice(0, 2).map((a) => c.toPx(a));
    for (const l of geo) {
      const parts: string[] = [];
      if (showCoeffs) parts.push(fibCoeffLabel(l.row.ratio, pct));
      if (showPrices) parts.push(showCoeffs ? `(${c.formatPrice(l.price)})` : c.formatPrice(l.price));
      if (!parts.length) continue;
      // label at the base anchors' x (left / right end of the unextended level) or the middle
      const leftIsA = pa.x <= pb.x;
      const base = horz === "center" ? 0.5 : (horz === "left") === leftIsA ? 0 : 1;
      const k = l.row.ratio;
      const [q0, q1] = channelEnds(pa, pb, d, c, k);
      const at = { x: q0.x + base * (q1.x - q0.x), y: q0.y + base * (q1.y - q0.y) };
      const dx = horz === "left" ? -4 : horz === "right" ? 4 : 0;
      const align: CanvasTextAlign = horz === "left" ? "right" : horz === "right" ? "left" : "center";
      const baseline: CanvasTextBaseline = vert === "bottom" ? "bottom" : vert === "top" ? "top" : "middle";
      label(c, parts.join(" "), at.x + dx, at.y + (vert === "bottom" ? -2 : vert === "top" ? 2 : 0), levelColor(d, l.row, c.color), size, align, baseline);
    }
  },
  handles: anchorHandles,
};

/** Unextended ends of level k (at A's and B's x). */
function channelEnds(pa: Point, pb: Point, d: Drawing, g: ToolGeom, k: number): [Point, Point] {
  const pc = g.toPx(d.anchors[2]);
  const l = fibChannelLevels(pa, pb, pc, [k])[0];
  return [l.p0, l.p1];
}
