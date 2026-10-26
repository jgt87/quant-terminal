// Pure geometry of the Fibonacci drawing family (everything except the retracement, which lives
// in geometry.ts): extension levels from three anchors, channel offsets, time zones (Fibonacci
// sequence) and trend-based time offsets, speed-resistance fan rays, the aspect-preserving
// ellipses of circles / arcs / wedge, the golden spiral and pitchfan rays.
//
// Shapes are computed in any linear plane (data space with x = bar index, or the projected pixel
// plane). Every construction is affine-covariant: projecting the anchors and constructing equals
// constructing in data space and projecting, so the shapes follow the current scales exactly.

import type { Anchor } from "../types";
import type { Point } from "./geometry";
import { distanceToRay, distanceToSegment } from "./geometry";

/** Golden ratio. */
export const FIB_PHI = (1 + Math.sqrt(5)) / 2;

/** Fibonacci numbers used as time-zone offsets: 0, 1, 2, 3, 5, 8, 13, … (n values). */
export function fibonacciOffsets(n: number): number[] {
  const out: number[] = [];
  let a = 1;
  let b = 2;
  if (n > 0) out.push(0);
  if (n > 1) out.push(1);
  while (out.length < n) {
    out.push(b);
    [a, b] = [b, a + b];
  }
  return out;
}

/** Level coefficient after "reverse" (0 and 1 ends swapped). */
export function fibReverseCoeff(coeff: number, reverse: boolean): number {
  return reverse ? 1 - coeff : coeff;
}

/** base + coeff × span, linear or (log scale) multiplicative between positive prices. */
export function fibLevelPrice(base: number, from: number, to: number, coeff: number, log = false): number {
  if (log && base > 0 && from > 0 && to > 0) return Math.exp(Math.log(base) + coeff * (Math.log(to) - Math.log(from)));
  return base + coeff * (to - from);
}

/**
 * Trend-based fib extension: levels projected from the third anchor by the A→B move,
 * price(k) = C + k × (B − A) (log scale: C × (B/A)^k). `reverse` swaps the 0 and 1 ends.
 */
export function fibExtensionLevels(
  a: Anchor,
  b: Anchor,
  c: Anchor,
  coeffs: readonly number[],
  o: { reverse?: boolean; log?: boolean } = {},
): { coeff: number; price: number }[] {
  return coeffs.map((coeff) => ({ coeff, price: fibLevelPrice(c.price, a.price, b.price, fibReverseCoeff(coeff, !!o.reverse), o.log) }));
}

/**
 * Fib channel: lines parallel to A→B, offset towards C by k × (C's vertical distance to line AB).
 * Returns each level's two end points (at A's and B's x).
 */
export function fibChannelLevels(a: Point, b: Point, c: Point, coeffs: readonly number[], reverse = false): { coeff: number; p0: Point; p1: Point }[] {
  const off = fibChannelOffset(a, b, c);
  return coeffs.map((coeff) => {
    const k = fibReverseCoeff(coeff, reverse) * off;
    return { coeff, p0: { x: a.x, y: a.y + k }, p1: { x: b.x, y: b.y + k } };
  });
}

/** Vertical distance from line AB to point C (at C's x). */
export function fibChannelOffset(a: Point, b: Point, c: Point): number {
  const dx = b.x - a.x;
  const yAt = dx === 0 ? a.y : a.y + ((c.x - a.x) * (b.y - a.y)) / dx;
  return c.y - yAt;
}

/** Fib time zone: x positions x_a + k × (x_b − x_a) (k = Fibonacci numbers by default). */
export function fibTimeZoneXs(xa: number, xb: number, coeffs: readonly number[]): number[] {
  return coeffs.map((k) => xa + k * (xb - xa));
}

/** Trend-based fib time: x positions x_c + k × (x_b − x_a). */
export function fibTrendTimeXs(xa: number, xb: number, xc: number, coeffs: readonly number[]): number[] {
  return coeffs.map((k) => xc + k * (xb - xa));
}

/** Bar offsets from the first anchor of time-based levels (rounded to whole bars). */
export function fibBarOffsets(barSpan: number, coeffs: readonly number[]): number[] {
  return coeffs.map((k) => Math.round(k * barSpan));
}

export interface FibFanRay {
  kind: "price" | "time";
  coeff: number;
  /** Fan origin. */
  from: Point;
  /** Point on the far box edge the ray passes through. */
  to: Point;
}

/** Box of the speed-resistance fan: origin corner and opposite corner (reverse mirrors vertically). */
export function fibFanBox(a: Point, b: Point, reverse = false): { o: Point; q: Point } {
  return reverse ? { o: { x: a.x, y: b.y }, q: { x: b.x, y: a.y } } : { o: a, q: b };
}

/**
 * Fib speed resistance fan: price rays from the origin to the far vertical edge at k of the
 * height, time rays to the far horizontal edge at k of the width.
 */
export function fibSpeedFanRays(a: Point, b: Point, priceCoeffs: readonly number[], timeCoeffs: readonly number[], reverse = false): FibFanRay[] {
  const { o, q } = fibFanBox(a, b, reverse);
  return [
    ...priceCoeffs.map((coeff): FibFanRay => ({ kind: "price", coeff, from: o, to: { x: q.x, y: o.y + coeff * (q.y - o.y) } })),
    ...timeCoeffs.map((coeff): FibFanRay => ({ kind: "time", coeff, from: o, to: { x: o.x + coeff * (q.x - o.x), y: q.y } })),
  ];
}

/** Slope (dy/dx) of a fan ray; Infinity for vertical rays. */
export function fibRaySlope(r: { from: Point; to: Point }): number {
  const dx = r.to.x - r.from.x;
  return dx === 0 ? Infinity : (r.to.y - r.from.y) / dx;
}

/**
 * Per-axis unit lengths that define the aspect of round Fibonacci shapes from an anchor vector:
 * |dx| and |dy|; a zero component borrows the other one (a true circle), both zero gives 1.
 */
export function fibAspectScales(dx: number, dy: number): { sx: number; sy: number } {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > 0 && ay > 0) return { sx: ax, sy: ay };
  const s = ax || ay || 1;
  return { sx: s, sy: s };
}

export interface FibEllipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * Axis-aligned ellipse centered at `center` whose level-1 member passes through `through`, its
 * axes in the ratio of the anchor vector (|dx| : |dy|), scaled by `coeff`.
 */
export function fibLevelEllipse(center: Point, through: Point, coeff: number): FibEllipse {
  const dx = through.x - center.x;
  const dy = through.y - center.y;
  const { sx, sy } = fibAspectScales(dx, dy);
  const r = Math.hypot(dx / sx, dy / sy);
  return { cx: center.x, cy: center.y, rx: coeff * r * sx, ry: coeff * r * sy };
}

/** Fib circles: ellipses centered at the first anchor, level 1 through the second. */
export function fibCircleLevels(a: Point, b: Point, coeffs: readonly number[]): (FibEllipse & { coeff: number })[] {
  return coeffs.map((coeff) => ({ coeff, ...fibLevelEllipse(a, b, coeff) }));
}

/**
 * Fib speed resistance arcs: ellipses centered at the second anchor, level 1 through the first;
 * half arcs open towards the first anchor (t range in ellipse parameter space).
 */
export function fibArcLevels(a: Point, b: Point, coeffs: readonly number[], full = false): (FibEllipse & { coeff: number; t0: number; t1: number })[] {
  const down = a.y >= b.y;
  const [t0, t1] = full ? [0, 2 * Math.PI] : down ? [0, Math.PI] : [Math.PI, 2 * Math.PI];
  return coeffs.map((coeff) => ({ coeff, ...fibLevelEllipse(b, a, coeff), t0, t1 }));
}

/** Point on an ellipse at parameter t. */
export function fibEllipsePoint(e: FibEllipse, t: number): Point {
  return { x: e.cx + e.rx * Math.cos(t), y: e.cy + e.ry * Math.sin(t) };
}

/** Polyline approximation of an elliptic arc from t0 to t1. */
export function fibEllipsePoints(e: FibEllipse, t0 = 0, t1 = 2 * Math.PI, steps = 96): Point[] {
  const n = Math.max(2, Math.ceil((steps * Math.abs(t1 - t0)) / (2 * Math.PI)));
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) out.push(fibEllipsePoint(e, t0 + ((t1 - t0) * i) / n));
  return out;
}

/** Distance from (px, py) to a polyline. */
export function fibDistanceToPolyline(px: number, py: number, pts: readonly Point[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distanceToSegment(px, py, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y));
  return best;
}

/** Distance from (px, py) to an elliptic arc (full ellipse by default). */
export function fibDistanceToEllipse(px: number, py: number, e: FibEllipse, t0 = 0, t1 = 2 * Math.PI): number {
  return fibDistanceToPolyline(px, py, fibEllipsePoints(e, t0, t1, 256));
}

/**
 * Golden spiral centered at the first anchor through the second: the radius grows by φ every
 * quarter turn, in the anchors' aspect (see fibAspectScales). Clockwise on screen (y down) unless
 * `counterclockwise`. Sampled from radius `minR` to `maxR` (plane units).
 */
export function goldenSpiral(a: Point, b: Point, counterclockwise = false, o: { minR?: number; maxR?: number; perQuarter?: number } = {}): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const { sx, sy } = fibAspectScales(dx, dy);
  const u = dx / sx;
  const v = dy / sy;
  const r0 = Math.hypot(u, v);
  if (r0 === 0) return [];
  const th0 = Math.atan2(v, u);
  const dir = counterclockwise ? -1 : 1;
  const scale = Math.max(sx, sy) * r0;
  const minR = o.minR ?? 0.5;
  const maxR = o.maxR ?? 5000;
  const sMin = Math.min(0, Math.log(minR / scale) / Math.log(FIB_PHI));
  const sMax = Math.max(0, Math.min(60, Math.log(maxR / scale) / Math.log(FIB_PHI)));
  const per = o.perQuarter ?? 24;
  const out: Point[] = [];
  // Whole steps of 1/per quarter turn, so the start point (s = 0, the second anchor) is a sample.
  for (let k = Math.floor(sMin * per); k <= Math.ceil(sMax * per); k++) {
    const s = k / per;
    const r = r0 * FIB_PHI ** s;
    const th = th0 + dir * s * (Math.PI / 2);
    out.push({ x: a.x + r * Math.cos(th) * sx, y: a.y + r * Math.sin(th) * sy });
  }
  return out;
}

/** Radius of the golden spiral after `quarters` quarter turns, relative to its start radius. */
export function fibSpiralRadius(r0: number, quarters: number): number {
  return r0 * FIB_PHI ** quarters;
}

/**
 * Fib wedge: apex at the first anchor, rays through the second and third; level k is the
 * elliptic arc (aspect of A→B) at k × |AB| between the two rays (the shorter way round).
 */
export function fibWedgeLevels(a: Point, b: Point, c: Point, coeffs: readonly number[]): (FibEllipse & { coeff: number; t0: number; t1: number })[] {
  const { sx, sy } = fibAspectScales(b.x - a.x, b.y - a.y);
  const tb = Math.atan2((b.y - a.y) / sy, (b.x - a.x) / sx);
  const tc = Math.atan2((c.y - a.y) / sy, (c.x - a.x) / sx);
  let d = tc - tb;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return coeffs.map((coeff) => ({ coeff, ...fibLevelEllipse(a, b, coeff), t0: tb, t1: tb + d }));
}

/**
 * Pitchfan: median from the first anchor through the midpoint M of B–C; level k rays from A
 * through M ± k × (C − M) (k = 1 passes through B and C).
 */
export function fibPitchfanRays(a: Point, b: Point, c: Point, coeffs: readonly number[]): { median: [Point, Point]; rays: { coeff: number; side: 1 | -1; through: Point }[] } {
  const m = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
  const hx = c.x - m.x;
  const hy = c.y - m.y;
  const rays: { coeff: number; side: 1 | -1; through: Point }[] = [];
  for (const coeff of coeffs) {
    rays.push({ coeff, side: 1, through: { x: m.x + coeff * hx, y: m.y + coeff * hy } });
    rays.push({ coeff, side: -1, through: { x: m.x - coeff * hx, y: m.y - coeff * hy } });
  }
  return { median: [a, m], rays };
}

/** Distance to the ray from `from` through `to` (the segment when they coincide). */
export function fibDistanceToRay(px: number, py: number, from: Point, to: Point): number {
  if (from.x === to.x && from.y === to.y) return Math.hypot(px - from.x, py - from.y);
  return distanceToRay(px, py, from.x, from.y, to.x, to.y);
}

/** Label of a level coefficient: value ("0.618") or percent ("61.8%"). */
export function fibCoeffLabel(coeff: number, percents = false): string {
  if (percents) return `${Math.round(coeff * 1000) / 10}%`;
  return String(Math.round(coeff * 1000) / 1000);
}
