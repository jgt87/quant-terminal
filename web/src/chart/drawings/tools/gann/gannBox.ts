// Gann box (catalog LineToolGannSquare): a box between two corners with price levels
// (horizontal) and time levels (vertical) at coefficients 0..1, bands filled between neighbouring
// levels, coefficient labels on each side, optional angles (lines from the origin corner to every
// level on the far edges) and reverse (levels measured from the opposite corner).

import { gannBoxLevels, gannInsideBox, gannPolylineDistance, type Drawing, type Point } from "@qt/core";
import { catalogColor, checkbox, colorField, levelTable, numberField } from "../../builders";
import { prop } from "../../draw";
import type { DrawCtx, DrawingToolDef, LevelRow, SettingsField } from "../../types";
import { alphaOf, everyRow, fill, label, num, rowColor, rowsAt, seg } from "./common";

const C = catalogColor;
const COLORS = ["#808080", "#FF9800", "#00bcd4", "#4caf50", "#089981", "#2962FF", "#808080"];
const COEFFS = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1];
const rows = (): LevelRow[] => COEFFS.map((ratio, i) => ({ ratio, color: C(COLORS[i]), visible: true }));
const H = { path: "props.hlevels", factory: rows };
const V = { path: "props.vlevels", factory: rows };

const on = (key: string) => (d: Drawing): Drawing => ({ ...d, props: { ...d.props, [key]: true } });

const style: SettingsField[] = [
  { kind: "section", label: "Price levels" },
  levelTable(rows, { key: "props.hlevels", label: "Price levels", valueLabel: "Level", catalogPrefix: "hlevel" }),
  { ...checkbox("props.showLeftLabels", "Left labels", true), catalog: "showLeftLabels" },
  { ...checkbox("props.showRightLabels", "Right labels", true), catalog: "showRightLabels" },
  { ...checkbox("props.fillHorzBackground", "Background", true), catalog: "fillHorzBackground" },
  { ...numberField("props.horzTransparency", "Background opacity", 80, { min: 0, max: 100 }), catalog: "horzTransparency", testWith: on("fillHorzBackground"), testValue: 30 },
  { kind: "section", label: "Time levels" },
  levelTable(rows, { key: "props.vlevels", label: "Time levels", valueLabel: "Level", catalogPrefix: "vlevel" }),
  { ...checkbox("props.showTopLabels", "Top labels", true), catalog: "showTopLabels" },
  { ...checkbox("props.showBottomLabels", "Bottom labels", true), catalog: "showBottomLabels" },
  { ...checkbox("props.fillVertBackground", "Background", true), catalog: "fillVertBackground" },
  { ...numberField("props.vertTransparency", "Background opacity", 80, { min: 0, max: 100 }), catalog: "vertTransparency", testWith: on("fillVertBackground"), testValue: 30 },
  { kind: "section", label: "Other" },
  { ...colorField("props.linesColors", "Use one color", undefined), default: null, catalog: "linesColors (derived)", testValue: "#e91e63" },
  { ...checkbox("props.fans_visible", "Angles", false), catalog: "fans.visible" },
  { ...colorField("props.fans_color", "Angles color", C("#9C9C9C")), catalog: "fans.color", testWith: on("fans_visible") },
  { ...checkbox("props.reverse", "Reverse", false), catalog: "reverse" },
];

interface Geo {
  pa: Point;
  pb: Point;
  /** Pixel y of each price level row and x of each time level row (null: hidden). */
  ys: (number | null)[];
  xs: (number | null)[];
  h: LevelRow[];
  v: LevelRow[];
}

function geo(d: Drawing, toPx: DrawCtx["toPx"]): Geo | null {
  const [a, b] = d.anchors;
  if (!a || !b) return null;
  const h = rowsAt(d, H.path, H.factory);
  const v = rowsAt(d, V.path, V.factory);
  const lv = gannBoxLevels(a, b, h.map((r) => r.ratio), v.map((r) => r.ratio), d.props?.reverse === true);
  return {
    pa: toPx(a),
    pb: toPx(b),
    ys: h.map((r, i) => (r.visible === false ? null : toPx({ time: a.time, price: lv.prices[i] }).y)),
    xs: v.map((r, i) => (r.visible === false ? null : toPx({ time: lv.times[i], price: a.price }).x)),
    h,
    v,
  };
}

/** Lines of the angles: from the origin corner to every visible level on the far edges. */
function angleLines(d: Drawing, g: Geo): [Point, Point][] {
  const rev = d.props?.reverse === true;
  const org = { x: g.pa.x, y: rev ? g.pb.y : g.pa.y };
  const farX = g.pb.x;
  const farY = rev ? g.pa.y : g.pb.y;
  const out: [Point, Point][] = [];
  for (const y of g.ys) if (y != null) out.push([org, { x: farX, y }]);
  for (const x of g.xs) if (x != null) out.push([org, { x, y: farY }]);
  return out;
}

function bands(c: DrawCtx, d: Drawing, pos: (number | null)[], rws: LevelRow[], horizontal: boolean, alpha: number, g: Geo): void {
  const idx = pos.map((p, i) => ({ p, i })).filter((x): x is { p: number; i: number } => x.p != null).sort((m, n) => m.p - n.p);
  const x0 = Math.min(g.pa.x, g.pb.x);
  const x1 = Math.max(g.pa.x, g.pb.x);
  const y0 = Math.min(g.pa.y, g.pb.y);
  const y1 = Math.max(g.pa.y, g.pb.y);
  for (let k = 1; k < idx.length; k++) {
    const r = rws[idx[k].i];
    c.ctx.fillStyle = fill(rowColor(d, r, c.color), alpha);
    if (horizontal) c.ctx.fillRect(x0, idx[k - 1].p, x1 - x0, idx[k].p - idx[k - 1].p);
    else c.ctx.fillRect(idx[k - 1].p, y0, idx[k].p - idx[k - 1].p, y1 - y0);
  }
}

export const gannBox: DrawingToolDef = {
  type: "gannBox",
  catalogType: "LineToolGannSquare",
  family: "gann",
  label: "Gann box",
  icon: "gannBox",
  iconPath: "M4.5 6.5h19v15h-19zM4.5 10.5h19M4.5 14.5h19M4.5 17.5h19M9.5 6.5v15M14.5 6.5v15M18.5 6.5v15",
  iconFill: "M4.5 24a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM23.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 2,
  defaults: { color: C("rgba(21, 56, 153, 0.8)"), width: 2, lineStyle: "solid" },
  defaultProps: {
    hlevels: rows(),
    vlevels: rows(),
    showLeftLabels: true,
    showRightLabels: true,
    showTopLabels: true,
    showBottomLabels: true,
    fillHorzBackground: true,
    horzTransparency: 80,
    fillVertBackground: true,
    vertTransparency: 80,
    fans_visible: false,
    fans_color: C("#9C9C9C"),
    reverse: false,
  },
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "style", "settings", "lock", "remove", "more"],
  floatBindings: { "line-tool-color": everyRow([H, V], "color") },
  settings: { coordinates: "time-price", style },
  hitTest(d, g, x, y, tol) {
    const q = geo(d, g.toPx);
    if (!q || !gannInsideBox(x, y, q.pa, q.pb, tol)) return false;
    const near = (p: Point, r: Point) => gannPolylineDistance(x, y, [p, r]) <= tol;
    const x0 = Math.min(q.pa.x, q.pb.x);
    const x1 = Math.max(q.pa.x, q.pb.x);
    const y0 = Math.min(q.pa.y, q.pb.y);
    const y1 = Math.max(q.pa.y, q.pb.y);
    const edges: [Point, Point][] = [
      [{ x: x0, y: y0 }, { x: x1, y: y0 }],
      [{ x: x1, y: y0 }, { x: x1, y: y1 }],
      [{ x: x0, y: y1 }, { x: x1, y: y1 }],
      [{ x: x0, y: y0 }, { x: x0, y: y1 }],
    ];
    if (edges.some(([p, r]) => near(p, r))) return true;
    if (q.ys.some((yy) => yy != null && near({ x: x0, y: yy }, { x: x1, y: yy }))) return true;
    if (q.xs.some((xx) => xx != null && near({ x: xx, y: y0 }, { x: xx, y: y1 }))) return true;
    if (prop(d, "fans_visible", false) && angleLines(d, q).some(([p, r]) => near(p, r))) return true;
    return false;
  },
  render(c, d) {
    const q = geo(d, c.toPx);
    if (!q) return;
    const { ctx } = c;
    const width = d.style?.width ?? 2;
    if (prop(d, "fillHorzBackground", true)) bands(c, d, q.ys, q.h, true, alphaOf(d.props?.horzTransparency, 80), q);
    if (prop(d, "fillVertBackground", true)) bands(c, d, q.xs, q.v, false, alphaOf(d.props?.vertTransparency, 80), q);
    const x0 = Math.min(q.pa.x, q.pb.x);
    const x1 = Math.max(q.pa.x, q.pb.x);
    const y0 = Math.min(q.pa.y, q.pb.y);
    const y1 = Math.max(q.pa.y, q.pb.y);
    q.ys.forEach((y, i) => {
      if (y == null) return;
      const color = rowColor(d, q.h[i], c.color);
      seg(ctx, x0, y, x1, y, color, width);
      const t = num(q.h[i].ratio);
      if (prop(d, "showLeftLabels", true)) label(c, t, x0 - 4, y, color, "right", "middle");
      if (prop(d, "showRightLabels", true)) label(c, t, x1 + 4, y, color, "left", "middle");
    });
    q.xs.forEach((x, i) => {
      if (x == null) return;
      const color = rowColor(d, q.v[i], c.color);
      seg(ctx, x, y0, x, y1, color, width);
      const t = num(q.v[i].ratio);
      if (prop(d, "showTopLabels", true)) label(c, t, x, y0 - 3, color, "center", "bottom");
      if (prop(d, "showBottomLabels", true)) label(c, t, x, y1 + 3, color, "center", "top");
    });
    if (prop(d, "fans_visible", false)) {
      const color = prop(d, "fans_color", C("#9C9C9C"));
      for (const [p, r] of angleLines(d, q)) seg(ctx, p.x, p.y, r.x, r.y, color, 1);
    }
  },
  handles: (d, g) => d.anchors.map((a) => g.toPx(a)),
};
