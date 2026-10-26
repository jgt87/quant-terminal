// Pure geometry of the Shapes family (rotated rectangle, path, circle, ellipse, polyline,
// triangle, arc, curve, double curve). Everything works in pixel space: callers project the
// anchors with the chart's toPx first. Names carry a `shape` prefix (core exports are flat).

import { distanceToSegment, type Point } from "./geometry";

// ---------- polygons and polylines ----------

/** Even-odd point-in-polygon test (closed ring; the last vertex connects to the first). */
export function shapePointInPolygon(x: number, y: number, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Shortest distance from (x, y) to a polyline (closed: also the last→first edge). */
export function shapeDistanceToPolyline(x: number, y: number, pts: readonly Point[], closed = false): number {
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return Math.hypot(x - pts[0].x, y - pts[0].y);
  let best = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const d = distanceToSegment(x, y, a.x, a.y, b.x, b.y);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Hit on a polygon/polyline outline within `tol`, or anywhere inside when `filled` (closed
 * outlines only: an open filled path is closed by its chord, like the canvas fill).
 */
export function shapeHitPolygon(x: number, y: number, pts: readonly Point[], tol: number, o: { closed: boolean; filled: boolean }): boolean {
  if (shapeDistanceToPolyline(x, y, pts, o.closed) <= tol) return true;
  return o.filled && pts.length >= 3 && shapePointInPolygon(x, y, pts);
}

// ---------- rotated rectangle ----------

/**
 * Rotated rectangle from three points: a→b is one side, c sets the other side's length (its
 * signed perpendicular distance from the line a-b, toward c). Corners in drawing order
 * a, b, b + h·n, a + h·n.
 */
export function shapeRotatedRect(a: Point, b: Point, c: Point): [Point, Point, Point, Point] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [a, b, { ...b }, { ...a }];
  const nx = -dy / len;
  const ny = dx / len;
  const h = (c.x - a.x) * nx + (c.y - a.y) * ny;
  return [a, b, { x: b.x + nx * h, y: b.y + ny * h }, { x: a.x + nx * h, y: a.y + ny * h }];
}

/** Handle of the rotated rectangle's width: the middle of the side opposite a→b. */
export function shapeRotatedRectWidthHandle(a: Point, b: Point, c: Point): Point {
  const r = shapeRotatedRect(a, b, c);
  return { x: (r[2].x + r[3].x) / 2, y: (r[2].y + r[3].y) / 2 };
}

// ---------- circle and ellipse ----------

export interface ShapeEllipse {
  cx: number;
  cy: number;
  /** Semi-axes in px. */
  rx: number;
  ry: number;
  /** Rotation of the rx axis (radians, canvas orientation). */
  rotation: number;
}

/** Circle: center a, b on the circumference. */
export function shapeCircle(center: Point, onCircle: Point): ShapeEllipse {
  const r = Math.hypot(onCircle.x - center.x, onCircle.y - center.y);
  return { cx: center.x, cy: center.y, rx: r, ry: r, rotation: 0 };
}

/**
 * Ellipse from three points: a and b are the ends of one axis (its diameter); c sets the other
 * semi-axis as its perpendicular distance from the line a-b.
 */
export function shapeEllipse3(a: Point, b: Point, c: Point): ShapeEllipse {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  if (len === 0) return { cx, cy, rx: 0, ry: Math.hypot(c.x - cx, c.y - cy), rotation: 0 };
  const ry = Math.abs((c.x - a.x) * (-dy / len) + (c.y - a.y) * (dx / len));
  return { cx, cy, rx: len / 2, ry, rotation: Math.atan2(dy, dx) };
}

/** Point of an ellipse at parameter angle t. */
export function shapeEllipsePoint(e: ShapeEllipse, t: number): Point {
  const cos = Math.cos(e.rotation);
  const sin = Math.sin(e.rotation);
  const u = e.rx * Math.cos(t);
  const v = e.ry * Math.sin(t);
  return { x: e.cx + u * cos - v * sin, y: e.cy + u * sin + v * cos };
}

/** Outline of an ellipse as a closed polygon of `n` vertices. */
export function shapeEllipsePoints(e: ShapeEllipse, n = 72): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < n; i++) out.push(shapeEllipsePoint(e, (i / n) * Math.PI * 2));
  return out;
}

/** Ellipse hit: within `tol` of the outline, or inside when filled. */
export function shapeHitEllipse(x: number, y: number, e: ShapeEllipse, tol: number, filled: boolean): boolean {
  const cos = Math.cos(-e.rotation);
  const sin = Math.sin(-e.rotation);
  const dx = x - e.cx;
  const dy = y - e.cy;
  const u = dx * cos - dy * sin;
  const v = dx * sin + dy * cos;
  if (e.rx === e.ry) {
    const r = Math.hypot(u, v);
    return Math.abs(r - e.rx) <= tol || (filled && r <= e.rx);
  }
  const inside = (u * u) / Math.max(1e-9, e.rx * e.rx) + (v * v) / Math.max(1e-9, e.ry * e.ry) <= 1;
  if (filled && inside) return true;
  return shapeDistanceToPolyline(x, y, shapeEllipsePoints(e, 96), true) <= tol;
}

// ---------- arc through three points ----------

export interface ShapeArc {
  cx: number;
  cy: number;
  r: number;
  /** Start / end angles (radians) from a to c through b, drawn anticlockwise when `ccw`. */
  start: number;
  end: number;
  ccw: boolean;
}

/** Circle through three points (null when they are collinear). */
export function shapeCircleThrough(a: Point, b: Point, c: Point): { cx: number; cy: number; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { cx, cy, r: Math.hypot(a.x - cx, a.y - cy) };
}

const TAU = Math.PI * 2;
const norm = (t: number) => ((t % TAU) + TAU) % TAU;

/** Clockwise (canvas, ccw = false) sweep from angle s to angle t, in [0, 2π). */
const sweepCw = (s: number, t: number) => norm(t - s);

/**
 * Arc from `start` to `end` that passes through `through` (null when collinear: the caller
 * draws the chord). Angles follow the canvas convention (y down).
 */
export function shapeArc3(start: Point, end: Point, through: Point): ShapeArc | null {
  const c = shapeCircleThrough(start, through, end);
  if (!c) return null;
  const s = Math.atan2(start.y - c.cy, start.x - c.cx);
  const e = Math.atan2(end.y - c.cy, end.x - c.cx);
  const m = Math.atan2(through.y - c.cy, through.x - c.cx);
  // Clockwise from s: does it meet m before e?
  const ccw = !(sweepCw(s, m) <= sweepCw(s, e));
  return { ...c, start: s, end: e, ccw };
}

/** True when angle t lies on the arc. */
export function shapeAngleOnArc(arc: ShapeArc, t: number): boolean {
  return arc.ccw ? sweepCw(arc.end, t) <= sweepCw(arc.end, arc.start) : sweepCw(arc.start, t) <= sweepCw(arc.start, arc.end);
}

/** Points along the arc (inclusive ends). */
export function shapeArcPoints(arc: ShapeArc, n = 48): Point[] {
  const span = arc.ccw ? -sweepCw(arc.end, arc.start) : sweepCw(arc.start, arc.end);
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = arc.start + (span * i) / n;
    out.push({ x: arc.cx + arc.r * Math.cos(t), y: arc.cy + arc.r * Math.sin(t) });
  }
  return out;
}

/** Distance from (x, y) to the arc curve (not the chord). */
export function shapeDistanceToArc(x: number, y: number, arc: ShapeArc): number {
  const t = Math.atan2(y - arc.cy, x - arc.cx);
  if (shapeAngleOnArc(arc, t)) return Math.abs(Math.hypot(x - arc.cx, y - arc.cy) - arc.r);
  const p = { x: arc.cx + arc.r * Math.cos(arc.start), y: arc.cy + arc.r * Math.sin(arc.start) };
  const q = { x: arc.cx + arc.r * Math.cos(arc.end), y: arc.cy + arc.r * Math.sin(arc.end) };
  return Math.min(Math.hypot(x - p.x, y - p.y), Math.hypot(x - q.x, y - q.y));
}

/** Arc hit: the curve within `tol`, or the segment (arc + chord) area when filled. */
export function shapeHitArc(x: number, y: number, start: Point, end: Point, through: Point, tol: number, filled: boolean): boolean {
  const arc = shapeArc3(start, end, through);
  if (!arc) return distanceToSegment(x, y, start.x, start.y, end.x, end.y) <= tol;
  if (shapeDistanceToArc(x, y, arc) <= tol) return true;
  return filled && shapePointInPolygon(x, y, shapeArcPoints(arc, 64));
}

// ---------- Bézier curves ----------

/** Quadratic Bézier at t (p0 start, c control, p1 end). */
export function shapeQuadPoint(p0: Point, c: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y };
}

/** Cubic Bézier at t (p0 start, c1 / c2 controls, p1 end). */
export function shapeCubicPoint(p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p1.x, y: a * p0.y + b * c1.y + c * c2.y + d * p1.y };
}

/** Samples a Bézier (2 controls = cubic, 1 = quadratic) into n+1 points. */
export function shapeBezierPoints(p0: Point, controls: readonly Point[], p1: Point, n = 48): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(controls.length >= 2 ? shapeCubicPoint(p0, controls[0], controls[1], p1, t) : shapeQuadPoint(p0, controls[0] ?? p0, p1, t));
  }
  return out;
}

/** Bézier hit by sampling: the curve within `tol`, or the curve + chord area when filled. */
export function shapeHitBezier(x: number, y: number, p0: Point, controls: readonly Point[], p1: Point, tol: number, filled = false): boolean {
  const pts = shapeBezierPoints(p0, controls, p1, 64);
  if (shapeDistanceToPolyline(x, y, pts) <= tol) return true;
  return filled && shapePointInPolygon(x, y, pts);
}

/**
 * Default control points of a curve created from two clicks: a bulge of a quarter of the chord
 * length (quadratic), or an S of two opposite bulges at one and two thirds (cubic).
 */
export function shapeDefaultControls(p0: Point, p1: Point, cubic: boolean): Point[] {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  // Normal pointing "up" on screen for a left-to-right chord.
  let nx = dy / len;
  let ny = -dx / len;
  if (ny > 0 || (ny === 0 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const h = len * 0.25;
  if (!cubic) return [{ x: (p0.x + p1.x) / 2 + nx * h, y: (p0.y + p1.y) / 2 + ny * h }];
  return [
    { x: p0.x + dx / 3 + nx * h, y: p0.y + dy / 3 + ny * h },
    { x: p0.x + (2 * dx) / 3 - nx * h, y: p0.y + (2 * dy) / 3 - ny * h },
  ];
}

/** Unit tangent direction leaving the curve at its start (backwards) or end (forwards). */
export function shapeEndTangent(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const l = Math.hypot(dx, dy);
  return l === 0 ? { x: 0, y: 0 } : { x: dx / l, y: dy / l };
}
