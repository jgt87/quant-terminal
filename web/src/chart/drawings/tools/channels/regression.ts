// Regression trend (catalog LineToolRegressionTrend): least-squares line of a price source over
// the bars between two anchor times, with upper / lower deviation bands (multiples of the
// residuals' standard deviation) and Pearson's R. Anchor prices are not used: the line follows
// the data. The catalog has no harvested fields for this tool; the settings follow
// docs/DRAWING-TOOLS.md §3 (source, upper/lower deviation, use upper/lower, Pearson's R).

import { distanceToRay, distanceToSegment, pointInPolygon, regressionChannel, type Drawing, type Point, type RegressionChannel, type RegressionSource } from "@qt/core";
import { font } from "../../../theme";
import { extend, fillColor, line, prop, strokeWith } from "../../draw";
import type { DrawCtx, DrawingToolDef, SettingsField, ToolGeom } from "../../types";

const LINE_STYLES = ["solid", "dashed", "dotted"];

/** Fit of the drawing on the chart's bars (null with fewer than two bars between the anchors). */
export function regressionOf(d: Drawing, g: ToolGeom): RegressionChannel | null {
  const [a, b] = d.anchors;
  if (!a || !b) return null;
  return regressionChannel(
    g.bars,
    a.time,
    b.time,
    prop(d, "source", "close") as RegressionSource,
    Number(prop(d, "upperDeviation", 2)),
    Number(prop(d, "lowerDeviation", -2)),
  );
}

interface Lines {
  base: [Point, Point];
  upper?: [Point, Point];
  lower?: [Point, Point];
}

function pxLines(d: Drawing, g: ToolGeom, r: RegressionChannel): Lines {
  const seg = (v: [number, number]): [Point, Point] => [g.toPx({ time: r.t0, price: v[0] }), g.toPx({ time: r.t1, price: v[1] })];
  return {
    base: seg(r.base),
    upper: prop(d, "useUpperDeviation", true) ? seg(r.upper) : undefined,
    lower: prop(d, "useLowerDeviation", true) ? seg(r.lower) : undefined,
  };
}

const ext = (d: Drawing, l: [Point, Point], far?: number): [Point, Point] => [l[0], prop(d, "extendLines", false) ? extend(l[0], l[1], far) : l[1]];

const lineRows = (prefix: string, label: string, color: string, width: number, style: string): SettingsField[] => [
  { kind: "color", key: `props.${prefix}_color`, label: `${label} color`, default: color },
  { kind: "width", key: `props.${prefix}_linewidth`, label: `${label} width`, default: width },
  { kind: "lineStyle", key: `props.${prefix}_linestyle`, label: `${label} style`, default: style },
];

export const regressionTrend: DrawingToolDef = {
  type: "regressionTrend",
  catalogType: "LineToolRegressionTrend",
  family: "channels",
  label: "Regression trend",
  icon: "regressionTrend",
  // Fitted line between two parallel band lines, with scattered points around it.
  iconPath: "M4.5 18.5L23.5 9.5M4.5 13.5L23.5 4.5M4.5 23.5L23.5 14.5",
  iconFill: "M9 17.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM14 17.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM19 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  anchors: 2,
  floatingToolbar: ["templates", "line-tool-color", "background-color", "line-tool-width", "style", "settings", "lock", "remove", "more"],
  defaults: { color: "#f23645", width: 1, lineStyle: "dashed", fillColor: "#2962ff1a" },
  defaultProps: {
    source: "close",
    upperDeviation: 2,
    lowerDeviation: -2,
    useUpperDeviation: true,
    useLowerDeviation: true,
    up_color: "#2962ff",
    up_linewidth: 2,
    up_linestyle: "solid",
    down_color: "#2962ff",
    down_linewidth: 2,
    down_linestyle: "solid",
    extendLines: false,
    showPearsons: true,
    fillBackground: true,
  },
  settings: {
    inputs: [
      {
        kind: "select",
        key: "props.source",
        label: "Source",
        default: "close",
        options: ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"].map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) })),
      },
      { kind: "number", key: "props.upperDeviation", label: "Upper deviation", default: 2, min: -50, max: 50, step: 0.1 },
      { kind: "number", key: "props.lowerDeviation", label: "Lower deviation", default: -2, min: -50, max: 50, step: 0.1 },
      { kind: "checkbox", key: "props.useUpperDeviation", label: "Use upper deviation", default: true },
      { kind: "checkbox", key: "props.useLowerDeviation", label: "Use lower deviation", default: true },
    ],
    style: [
      { kind: "section", label: "Base line" },
      { kind: "color", key: "style.color", label: "Base color", default: "#f23645" },
      { kind: "width", key: "style.width", label: "Base width", default: 1 },
      { kind: "lineStyle", key: "style.lineStyle", label: "Base style", default: "dashed" },
      { kind: "section", label: "Upper line" },
      ...lineRows("up", "Upper", "#2962ff", 2, "solid"),
      { kind: "section", label: "Lower line" },
      ...lineRows("down", "Lower", "#2962ff", 2, "solid"),
      { kind: "checkbox", key: "props.extendLines", label: "Extend lines", default: false },
      { kind: "checkbox", key: "props.showPearsons", label: "Pearson's R", default: true },
      { kind: "checkbox", key: "props.fillBackground", label: "Background", default: true },
      { kind: "color", key: "style.fillColor", label: "Background color", default: "#2962ff1a", showIf: (d) => prop(d, "fillBackground", true) },
    ],
    coordinates: "time",
    tabOrder: ["inputs", "style", "coordinates", "visibility"],
  },
  hitTest(d, g, x, y, tol) {
    const r = regressionOf(d, g);
    if (!r) return false;
    const ls = pxLines(d, g, r);
    const far = prop(d, "extendLines", false);
    const near = (l?: [Point, Point]) => !!l && (far ? distanceToRay(x, y, l[0].x, l[0].y, l[1].x, l[1].y) : distanceToSegment(x, y, l[0].x, l[0].y, l[1].x, l[1].y)) <= tol;
    if (near(ls.base) || near(ls.upper) || near(ls.lower)) return true;
    if (!prop(d, "fillBackground", true)) return false;
    const top = ext(d, ls.upper ?? ls.base, 4000);
    const bottom = ext(d, ls.lower ?? ls.base, 4000);
    return pointInPolygon(x, y, [top[0], top[1], bottom[1], bottom[0]]);
  },
  render(c, d) {
    const r = regressionOf(d, c);
    const [a, b] = d.anchors;
    const { ctx } = c;
    if (!r) {
      // Not enough bars yet (creation preview / empty range): the line between the anchors.
      if (a && b) line(ctx, c.toPx(a), c.toPx(b));
      return;
    }
    const ls = pxLines(d, c, r);
    if (prop(d, "fillBackground", true) && (ls.upper || ls.lower)) {
      const top = ext(d, ls.upper ?? ls.base);
      const bottom = ext(d, ls.lower ?? ls.base);
      ctx.save();
      ctx.fillStyle = fillColor(d, c.color);
      ctx.beginPath();
      ctx.moveTo(top[0].x, top[0].y);
      ctx.lineTo(top[1].x, top[1].y);
      ctx.lineTo(bottom[1].x, bottom[1].y);
      ctx.lineTo(bottom[0].x, bottom[0].y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    for (const [l, prefix] of [
      [ls.upper, "up"],
      [ls.lower, "down"],
    ] as const) {
      if (!l) continue;
      ctx.save();
      const st = String(prop(d, `${prefix}_linestyle`, "solid"));
      strokeWith(ctx, prop(d, `${prefix}_color`, "#2962ff"), Number(prop(d, `${prefix}_linewidth`, 2)), LINE_STYLES.includes(st) ? st : "solid");
      const [p, q] = ext(d, l);
      line(ctx, p, q);
      ctx.restore();
    }
    const [p, q] = ext(d, ls.base);
    line(ctx, p, q);
    if (prop(d, "showPearsons", true)) drawPearson(c, r, ls);
  },
  handles(d, g) {
    const r = regressionOf(d, g);
    if (!r) return d.anchors.map((a) => g.toPx(a));
    const [a, b] = d.anchors;
    const first = a.time <= b.time;
    const at = (start: boolean) => g.toPx({ time: start ? r.t0 : r.t1, price: start ? r.base[0] : r.base[1] });
    return [at(first), at(!first)];
  },
  onAnchorDrag(d, i, to) {
    const anchors = [...d.anchors];
    anchors[i] = to;
    return { ...d, anchors };
  },
  bounds(d, g) {
    const r = regressionOf(d, g);
    const pts = r ? Object.values(pxLines(d, g, r)).flatMap((l) => (l ? [...l] : [])) : d.anchors.map((a) => g.toPx(a));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  },
  stats(d, g) {
    const r = regressionOf(d, g);
    return r ? [`Pearson's R ${r.pearsonR.toFixed(4)}`, `Std. deviation ${r.stdDev.toFixed(4)}`, `${r.n} bars`] : [];
  },
};

/** Pearson's R under the start of the lowest line. */
function drawPearson(c: DrawCtx, r: RegressionChannel, ls: Lines): void {
  const l = ls.lower ?? ls.base;
  const { ctx } = c;
  ctx.save();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.font = font(c.theme, 12, 500);
  ctx.fillStyle = c.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(r.pearsonR.toFixed(4), l[0].x + 2, Math.max(l[0].y, ls.upper?.[0].y ?? -Infinity, ls.base[0].y) + 8);
  ctx.restore();
}
