// Pure editing helpers for the drawing tools: path simplification (freehand), Shift-constrain,
// magnet modes, bounding boxes / rubber-band selection, and moving drawings in pixel space.

import type { Anchor, Bar, Drawing } from "../types";
import { snapToBar, type Point } from "./geometry";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Every data point of a drawing: its anchors, then its path points (freehand / poly tools). */
export function allAnchors(d: Pick<Drawing, "anchors" | "points">): Anchor[] {
  return d.points?.length ? [...d.anchors, ...d.points] : d.anchors;
}

// ---------- Freehand simplification (Ramer–Douglas–Peucker) ----------

function perpendicular(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/**
 * Ramer–Douglas–Peucker: drops points closer than `epsilon` px to the simplified polyline.
 * Keeps the first and last point; returns the input when it has fewer than 3 points.
 */
export function simplifyPath<T extends Point>(points: readonly T[], epsilon = 1.5): T[] {
  if (points.length < 3) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const dd = perpendicular(points[i], points[s], points[e]);
      if (dd > maxD) {
        maxD = dd;
        idx = i;
      }
    }
    if (idx > 0 && maxD > epsilon) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

// ---------- Shift constrain ----------

/**
 * Shift-constrain: moves `to` onto the nearest of the horizontal, vertical or 45° directions
 * through `from` (projection keeps the pointer's distance along that direction).
 */
export function constrainPoint(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return { ...to };
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  const ux = Math.round(Math.cos(snapped) * 1e9) / 1e9;
  const uy = Math.round(Math.sin(snapped) * 1e9) / 1e9;
  if (uy === 0) return { x: to.x, y: from.y };
  if (ux === 0) return { x: from.x, y: to.y };
  // Diagonal: equal |dx| and |dy|, the larger component wins.
  const m = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: from.x + Math.sign(ux) * m, y: from.y + Math.sign(uy) * m };
}

// ---------- Magnet ----------

export type MagnetMode = "off" | "weak" | "strong";

/** Weak magnet radius in px. */
export const WEAK_MAGNET_PX = 10;

/**
 * Magnet: "strong" always snaps to the nearest bar's O/H/L/C; "weak" snaps only when that
 * price point is within WEAK_MAGNET_PX of the pointer; "off" returns the anchor unchanged.
 */
export function magnetSnap(anchor: Anchor, bars: readonly Bar[], toPx: (a: Anchor) => Point, mode: MagnetMode, radius = WEAK_MAGNET_PX): Anchor {
  if (mode === "off" || bars.length === 0) return anchor;
  const snapped = snapToBar(anchor, bars, toPx);
  if (mode === "strong") return snapped;
  const p = toPx(anchor);
  const q = toPx(snapped);
  return Math.hypot(p.x - q.x, p.y - q.y) <= radius ? snapped : anchor;
}

// ---------- Bounds and rubber-band selection ----------

/** Bounding box of pixel points (zero-size box at the origin when empty). */
export function boundsOf(points: readonly Point[]): Rect {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Rectangle spanned by two corners (any order). */
export function rectFromPoints(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** True when the rectangles overlap or touch (zero-size boxes such as horizontal lines count). */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

/** Ids whose bounds intersect the rubber band. */
export function rubberBandSelect(band: Rect, items: readonly { id: string; bounds: Rect }[]): string[] {
  return items.filter((it) => rectsIntersect(band, it.bounds)).map((it) => it.id);
}

// ---------- Moving ----------

/**
 * Moves every anchor and path point of a drawing by (dx, dy) pixels using the chart projection.
 * Returns a new drawing; the input is not changed.
 */
export function translateDrawing<D extends Drawing>(d: D, dx: number, dy: number, toPx: (a: Anchor) => Point, toData: (p: Point) => Anchor): D {
  const move = (a: Anchor): Anchor => {
    const p = toPx(a);
    return toData({ x: p.x + dx, y: p.y + dy });
  };
  const out = { ...d, anchors: d.anchors.map(move) };
  if (d.points) out.points = d.points.map(move);
  return out;
}

/**
 * Shifts a drawing by whole bars (time) and pixels (price): arrow-key nudging. `shiftTime`
 * moves a time by n bars; `shiftPrice` moves a price by dy pixels.
 */
export function nudgeDrawing<D extends Drawing>(d: D, bars: number, dy: number, shiftTime: (t: number, n: number) => number, shiftPrice: (time: number, price: number, dy: number) => number): D {
  const move = (a: Anchor): Anchor => ({
    time: bars ? shiftTime(a.time, bars) : a.time,
    price: dy ? shiftPrice(a.time, a.price, dy) : a.price,
  });
  const out = { ...d, anchors: d.anchors.map(move) };
  if (d.points) out.points = d.points.map(move);
  return out;
}
