// Shared body of the Gann square and Gann square fixed: a 5 x 5 unit grid from the origin corner
// with level lines (0..5 units), fan lines "P x T" from the origin and quarter arcs around the
// origin (radius of the grid point x, y), arc bands filled between neighbouring visible arcs.

import {
  GANN_SQUARE_UNITS,
  gannArcRadius,
  gannInsideBox,
  gannPolylineDistance,
  gannQuarterArc,
  gannRatioLabel,
  gannSquareFanEnd,
  type Drawing,
  type Point,
} from "@qt/core";
import { catalogColor, checkbox, colorField, levelTable, numberField } from "../../builders";
import type { DrawCtx, LevelRow, SettingsField } from "../../types";
import { alphaOf, fill, rowColor, rowsAt, seg } from "./common";

const C = catalogColor;

/** Factory grid levels 0..5 (catalog levels.0..5). */
export const squareLevelRows = (): LevelRow[] =>
  ["#808080", "#FF9800", "#00bcd4", "#4caf50", "#089981", "#808080"].map((color, i) => ({ ratio: i, color: C(color), visible: true, width: 2 }));

/** Factory fan lines (catalog fanlines.0..10): ratio = price units per time unit. */
export const FANLINES: { p: number; t: number; color: string; visible: boolean }[] = [
  { p: 8, t: 1, color: "#B39DDB", visible: false },
  { p: 5, t: 1, color: "#F23645", visible: false },
  { p: 4, t: 1, color: "#808080", visible: false },
  { p: 3, t: 1, color: "#FF9800", visible: false },
  { p: 2, t: 1, color: "#00bcd4", visible: true },
  { p: 1, t: 1, color: "#4caf50", visible: true },
  { p: 1, t: 2, color: "#089981", visible: true },
  { p: 1, t: 3, color: "#089981", visible: false },
  { p: 1, t: 4, color: "#2962FF", visible: false },
  { p: 1, t: 5, color: "#9575cd", visible: false },
  { p: 1, t: 8, color: "#B39DDB", visible: false },
];
export const squareFanRows = (): LevelRow[] => FANLINES.map((f) => ({ ratio: f.p / f.t, color: C(f.color), visible: f.visible, width: 2 }));

/** Factory arcs (catalog arcs.0..10): ratio = radius in grid units of the point (x, y). */
export const ARCS: { x: number; y: number; color: string }[] = [
  { x: 1, y: 0, color: "#FF9800" },
  { x: 1, y: 1, color: "#FF9800" },
  { x: 1.5, y: 0, color: "#FF9800" },
  { x: 2, y: 0, color: "#00bcd4" },
  { x: 2, y: 1, color: "#00bcd4" },
  { x: 3, y: 0, color: "#4caf50" },
  { x: 3, y: 1, color: "#4caf50" },
  { x: 4, y: 0, color: "#089981" },
  { x: 4, y: 1, color: "#089981" },
  { x: 5, y: 0, color: "#2962FF" },
  { x: 5, y: 1, color: "#2962FF" },
];
export const squareArcRows = (): LevelRow[] => ARCS.map((a) => ({ ratio: Math.round(gannArcRadius(a.x, a.y) * 10000) / 10000, color: C(a.color), visible: true, width: 2 }));

export const LEVELS = { path: "props.levels", factory: squareLevelRows };
export const FANS = { path: "props.fanlines", factory: squareFanRows };
export const ARCROWS = { path: "props.arcs", factory: squareArcRows };

/** Factory props shared by both squares. */
export const squareDefaultProps = (): Record<string, unknown> => ({
  levels: squareLevelRows(),
  fanlines: squareFanRows(),
  arcs: squareArcRows(),
  arcsBackground_fillBackground: true,
  arcsBackground_transparency: 80,
  reverse: false,
});

const withFill = (d: Drawing): Drawing => ({ ...d, props: { ...d.props, arcsBackground_fillBackground: true } });

/** Style-tab fields shared by both squares (levels, fans, arcs, one color, background, reverse). */
export function squareStyleFields(): SettingsField[] {
  return [
    { kind: "section", label: "Levels" },
    levelTable(squareLevelRows, { key: "props.levels", label: "Levels", valueLabel: "Level", catalogPrefix: "levels." }),
    { kind: "section", label: "Fans" },
    levelTable(squareFanRows, { key: "props.fanlines", label: "Fans", valueLabel: "Price/time", catalogPrefix: "fanlines." }),
    { kind: "section", label: "Arcs" },
    levelTable(squareArcRows, { key: "props.arcs", label: "Arcs", valueLabel: "Radius", catalogPrefix: "arcs." }),
    { ...colorField("props.linesColors", "Use one color", undefined), default: null, catalog: "linesColors (derived)", testValue: "#e91e63" },
    { ...checkbox("props.arcsBackground_fillBackground", "Background", true), catalog: "arcsBackground.fillBackground" },
    {
      ...numberField("props.arcsBackground_transparency", "Background opacity", 80, { min: 0, max: 100, step: 1 }),
      catalog: "arcsBackground.transparency",
      testWith: withFill,
      testValue: 30,
    },
    { ...checkbox("props.reverse", "Reverse", false), catalog: "reverse" },
  ];
}

/** Arc / fan label of a row value. */
export function arcLabel(r: number): string {
  const hit = ARCS.find((a) => Math.abs(gannArcRadius(a.x, a.y) - r) < 1e-3);
  return hit ? `${hit.x}x${hit.y}` : String(r);
}

/** Pixel frame of a square between the corners pa and pb (reverse mirrors vertically). */
export interface SquareFrame {
  org: Point;
  opp: Point;
  ux: number;
  uy: number;
}

export function squareFrame(pa: Point, pb: Point, reverse: boolean): SquareFrame {
  const org = { x: pa.x, y: reverse ? pb.y : pa.y };
  const opp = { x: pb.x, y: reverse ? pa.y : pb.y };
  return { org, opp, ux: (opp.x - org.x) / GANN_SQUARE_UNITS, uy: (opp.y - org.y) / GANN_SQUARE_UNITS };
}

const at = (f: SquareFrame, u: number, v: number): Point => ({ x: f.org.x + u * f.ux, y: f.org.y + v * f.uy });

/** Pixel polylines of the visible arcs (for hit-testing). */
function arcRuns(f: SquareFrame, r: number): Point[][] {
  const w = Math.abs(f.opp.x - f.org.x);
  const h = Math.abs(f.opp.y - f.org.y);
  return gannQuarterArc(f.org, r * Math.abs(f.ux), r * Math.abs(f.uy), Math.sign(f.ux) || 1, Math.sign(f.uy) || 1, w, h);
}

const fanEnd = (r: number) => (r >= 1 ? gannSquareFanEnd(r, 1) : gannSquareFanEnd(1, 1 / r));

/** Draws the grid, fans, arcs and arc bands of a square. */
export function renderSquare(c: DrawCtx, d: Drawing, pa: Point, pb: Point): SquareFrame {
  const { ctx } = c;
  const f = squareFrame(pa, pb, d.props?.reverse === true);
  const left = Math.min(pa.x, pb.x);
  const top = Math.min(pa.y, pb.y);
  const w = Math.abs(pb.x - pa.x);
  const h = Math.abs(pb.y - pa.y);
  const levels = rowsAt(d, LEVELS.path, LEVELS.factory);
  const fans = rowsAt(d, FANS.path, FANS.factory);
  const arcs = rowsAt(d, ARCROWS.path, ARCROWS.factory)
    .filter((r) => r.visible !== false)
    .sort((x, y) => x.ratio - y.ratio);
  const rx = (r: number) => r * Math.abs(f.ux);
  const ry = (r: number) => r * Math.abs(f.uy);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, w, h);
  ctx.clip();
  // Arc bands.
  if (d.props?.arcsBackground_fillBackground !== false && w > 0 && h > 0) {
    const alpha = alphaOf(d.props?.arcsBackground_transparency, 80);
    let inner = 0;
    for (const r of arcs) {
      ctx.beginPath();
      ctx.ellipse(f.org.x, f.org.y, rx(r.ratio), ry(r.ratio), 0, 0, Math.PI * 2);
      if (inner > 0) ctx.ellipse(f.org.x, f.org.y, rx(inner), ry(inner), 0, 0, Math.PI * 2);
      ctx.fillStyle = fill(rowColor(d, r, c.color), alpha);
      ctx.fill("evenodd");
      inner = r.ratio;
    }
  }
  // Arcs.
  for (const r of arcs) {
    if (rx(r.ratio) <= 0 || ry(r.ratio) <= 0) continue;
    ctx.strokeStyle = rowColor(d, r, c.color);
    ctx.lineWidth = r.width ?? 1;
    ctx.beginPath();
    ctx.ellipse(f.org.x, f.org.y, rx(r.ratio), ry(r.ratio), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  // Grid levels.
  for (const r of levels) {
    if (r.visible === false) continue;
    const color = rowColor(d, r, c.color);
    const width = r.width ?? 1;
    const x = f.org.x + r.ratio * f.ux;
    const y = f.org.y + r.ratio * f.uy;
    seg(ctx, x, f.org.y, x, f.opp.y, color, width);
    seg(ctx, f.org.x, y, f.opp.x, y, color, width);
  }
  // Fans.
  for (const r of fans) {
    if (r.visible === false || !(r.ratio > 0)) continue;
    const e = fanEnd(r.ratio);
    const q = at(f, e.u, e.v);
    seg(ctx, f.org.x, f.org.y, q.x, q.y, rowColor(d, r, c.color), r.width ?? 1);
  }
  return f;
}

/** Stroke hit on the grid, fan lines or arcs of a square. */
export function hitSquare(d: Drawing, pa: Point, pb: Point, x: number, y: number, tol: number): boolean {
  if (!gannInsideBox(x, y, pa, pb, tol)) return false;
  const f = squareFrame(pa, pb, d.props?.reverse === true);
  const near = (pts: Point[]) => gannPolylineDistance(x, y, pts) <= tol;
  // Box border.
  const corners = [pa, { x: pb.x, y: pa.y }, pb, { x: pa.x, y: pb.y }, pa];
  if (near(corners)) return true;
  for (const r of rowsAt(d, LEVELS.path, LEVELS.factory)) {
    if (r.visible === false) continue;
    const gx = f.org.x + r.ratio * f.ux;
    const gy = f.org.y + r.ratio * f.uy;
    if (near([{ x: gx, y: f.org.y }, { x: gx, y: f.opp.y }]) || near([{ x: f.org.x, y: gy }, { x: f.opp.x, y: gy }])) return true;
  }
  for (const r of rowsAt(d, FANS.path, FANS.factory)) {
    if (r.visible === false || !(r.ratio > 0)) continue;
    const e = fanEnd(r.ratio);
    if (near([f.org, at(f, e.u, e.v)])) return true;
  }
  for (const r of rowsAt(d, ARCROWS.path, ARCROWS.factory)) {
    if (r.visible === false) continue;
    if (arcRuns(f, r.ratio).some(near)) return true;
  }
  return false;
}

export { gannRatioLabel };
