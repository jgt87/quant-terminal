// Cycle tools geometry (pixel space, pure): cyclic line positions, time-cycle arcs and the sine
// line through two anchors.
//
// Cyclic lines / time cycles start at anchor a and repeat every |x(b) - x(a)| px in the
// direction of b (nothing is drawn on the other side of a).

import { distanceToSegment, type Point } from "./geometry";

/**
 * x positions x0 + k·step (k = 0, 1, 2, …; step may be negative) that lie inside [from, to].
 * At most `max` positions; an empty list when step is 0.
 */
export function cyclePositions(x0: number, step: number, from: number, to: number, max = 2000): number[] {
  if (!Number.isFinite(step) || Math.abs(step) < 1e-9) return x0 >= from && x0 <= to ? [x0] : [];
  const out: number[] = [];
  let k = 0;
  // Skip ahead to the first position inside the range.
  if (step > 0 && x0 < from) k = Math.ceil((from - x0) / step);
  if (step < 0 && x0 > to) k = Math.ceil((x0 - to) / -step);
  for (; out.length < max; k++) {
    const x = x0 + k * step;
    if (step > 0 ? x > to : x < from) break;
    if (x >= from && x <= to) out.push(x);
  }
  return out;
}

/** Vertical cyclic lines between anchor pixels a and b, clipped to [0, width]. */
export function cyclicLineXs(a: Point, b: Point, width: number): number[] {
  return cyclePositions(a.x, b.x - a.x, 0, width);
}

/** One time-cycle arc: half ellipse on the baseline y = cy between cx - rx and cx + rx. */
export interface CycleArc {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** true: the arc bulges upward (smaller y). */
  up: boolean;
}

/**
 * Time cycles: half ellipses sitting on a's price, one per period |x(b) - x(a)|, repeating in
 * b's direction across [0, width]. Height = |y(b) - y(a)| (half the period when b is level with
 * a, i.e. half circles); b above a bulges up, below bulges down.
 */
export function timeCycleArcs(a: Point, b: Point, width: number): CycleArc[] {
  const step = b.x - a.x;
  if (Math.abs(step) < 1e-9) return [];
  const rx = Math.abs(step) / 2;
  const dy = a.y - b.y;
  const ry = Math.abs(dy) < 1 ? rx : Math.abs(dy);
  const up = dy >= 0 || Math.abs(dy) < 1;
  const lo = step > 0 ? -Math.abs(step) : 0;
  const hi = step > 0 ? width : width + Math.abs(step);
  return cyclePositions(a.x, step, lo, hi).map((x) => ({ cx: x + step / 2, cy: a.y, rx, ry, up }));
}

/** Points of a half-ellipse arc (n segments), left to right. */
export function cycleArcPoints(arc: CycleArc, n = 32): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = Math.PI - (Math.PI * i) / n;
    out.push({ x: arc.cx + arc.rx * Math.cos(t), y: arc.cy + (arc.up ? -1 : 1) * arc.ry * Math.sin(t) });
  }
  return out;
}

/** Distance from (x, y) to an arc (sampled). */
export function distanceToCycleArc(arc: CycleArc, x: number, y: number): number {
  const pts = cycleArcPoints(arc, 48);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distanceToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y));
  return best;
}

/**
 * Sine line through a and b: a is an extreme (peak or trough), b the next opposite extreme half
 * a period later. y(x) = mid + amp·cos(π (x − a.x) / (b.x − a.x)), mid = (a.y + b.y) / 2,
 * amp = (a.y − b.y) / 2. null when a and b share x.
 */
export function sineY(a: Point, b: Point, x: number): number | null {
  const half = b.x - a.x;
  if (Math.abs(half) < 1e-9) return null;
  const mid = (a.y + b.y) / 2;
  const amp = (a.y - b.y) / 2;
  return mid + amp * Math.cos((Math.PI * (x - a.x)) / half);
}

/** Sampled sine points across [from, to] (step px, at least 16 samples per half period). */
export function sinePoints(a: Point, b: Point, from: number, to: number, step = 2): Point[] {
  const half = Math.abs(b.x - a.x);
  if (half < 1e-9) return [];
  const s = Math.max(0.25, Math.min(step, half / 16));
  const out: Point[] = [];
  const n = Math.min(20000, Math.ceil((to - from) / s));
  for (let i = 0; i <= n; i++) {
    const x = from + i * s;
    out.push({ x, y: sineY(a, b, x)! });
  }
  return out;
}

/** Distance from (x, y) to the sine line (sampled near x). */
export function distanceToSine(a: Point, b: Point, x: number, y: number): number {
  const half = Math.abs(b.x - a.x);
  if (half < 1e-9) return Math.abs(x - a.x);
  const span = Math.max(20, Math.abs(a.y - b.y) + 20);
  const pts = sinePoints(a, b, x - span, x + span, 1);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distanceToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y));
  return best;
}
