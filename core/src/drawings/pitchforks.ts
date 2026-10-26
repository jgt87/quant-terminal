// Pure geometry of the Pitchforks family (Andrews' pitchfork and its variants). Works on any
// linear 2D space (pixels after projection, or {x: time, y: price}).
//
// Three anchors A (handle), B and C (the fork's base). M is the midpoint of B–C.
//  - Original:        the median starts at A and passes through M.
//  - Schiff:          the median starts at A's x, halfway between A and B in y.
//  - Modified Schiff: the median starts at the midpoint of A–B (halfway in x and y).
//  - Inside:          the median starts at A through M; the fork is half as wide and starts
//                     halfway between A and M (its tines pass through the midpoints of A–B
//                     and A–C).
// A level k is a pair of lines parallel to the median, starting on the base at center ± k·half
// (k = 1 passes through B and C for the non-inside variants). All lines end on a common front
// parallel to the base: the median's end is M + (M − origin).

import { distanceToRay, distanceToSegment, type Point } from "./geometry";
import { pointInPolygon } from "./channels";

/** Variant ids as stored in props.style (catalog values). */
export const PITCHFORK_VARIANT = { original: 0, modifiedSchiff: 1, inside: 2, schiff: 3 } as const;
export type PitchforkVariant = 0 | 1 | 2 | 3;

export interface PitchforkFrame {
  /** Start of the median. */
  origin: Point;
  /** Midpoint of B–C (the median passes through it). */
  mid: Point;
  /** Median direction (mid − origin). */
  dir: Point;
  /** Center of the fork's base (mid, or halfway A–mid for Inside). */
  center: Point;
  /** Offset from the center to the k = 1 line on the C side. */
  half: Point;
  /** Vector from a line's start on the base to its end on the front. */
  reach: Point;
}

const add = (p: Point, q: Point): Point => ({ x: p.x + q.x, y: p.y + q.y });
const sub = (p: Point, q: Point): Point => ({ x: p.x - q.x, y: p.y - q.y });
const mul = (p: Point, k: number): Point => ({ x: p.x * k, y: p.y * k });
const midpoint = (p: Point, q: Point): Point => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });

/** Median origin of a variant. */
export function pitchforkOrigin(a: Point, b: Point, variant: number): Point {
  if (variant === PITCHFORK_VARIANT.schiff) return { x: a.x, y: (a.y + b.y) / 2 };
  if (variant === PITCHFORK_VARIANT.modifiedSchiff) return midpoint(a, b);
  return a;
}

/** Frame of a pitchfork from its anchors (see the header for the variants). */
export function pitchforkFrame(a: Point, b: Point, c: Point, variant: number): PitchforkFrame {
  const mid = midpoint(b, c);
  const origin = pitchforkOrigin(a, b, variant);
  const dir = sub(mid, origin);
  const inside = variant === PITCHFORK_VARIANT.inside;
  const center = inside ? midpoint(a, mid) : mid;
  const half = inside ? mul(sub(c, mid), 0.5) : sub(c, mid);
  const reach = sub(add(mid, dir), center);
  return { origin, mid, dir, center, half, reach };
}

/** The median line: origin → front (or a far point along it when extended). */
export function pitchforkMedian(f: PitchforkFrame, extend = false, far = 1e5): [Point, Point] {
  return [f.origin, extend ? farAlong(f.origin, f.dir, far) : add(f.mid, f.dir)];
}

/** The two lines of level k: [C side, B side], each [start on the base, end]. */
export function pitchforkLevelLines(f: PitchforkFrame, k: number, extend = false, far = 1e5): [[Point, Point], [Point, Point]] {
  const one = (s: Point): [Point, Point] => [s, extend ? farAlong(s, f.dir, far) : add(s, f.reach)];
  return [one(add(f.center, mul(f.half, k))), one(sub(f.center, mul(f.half, k)))];
}

function farAlong(p: Point, dir: Point, far: number): Point {
  const l = Math.hypot(dir.x, dir.y);
  return l === 0 ? p : { x: p.x + (dir.x / l) * far, y: p.y + (dir.y / l) * far };
}

/**
 * Band between levels k0 < k1 on one side (+1: C side, −1: B side) as a polygon
 * (start k0, end k0, end k1, start k1). k0 = 0 is the median's own line through the center.
 */
export function pitchforkBand(f: PitchforkFrame, k0: number, k1: number, side: 1 | -1, extend = false, far = 1e5): Point[] {
  const line = (k: number): [Point, Point] => {
    const s = add(f.center, mul(f.half, side * k));
    return [s, extend ? farAlong(s, f.dir, far) : add(s, f.reach)];
  };
  const [s0, e0] = line(k0);
  const [s1, e1] = line(k1);
  return [s0, e0, e1, s1];
}

/**
 * Body hit: the median, the A→origin handle segment (non-original variants), the base B–C and
 * both lines of every level in `coeffs`; inside the outermost level when `filled`.
 */
export function hitTestPitchfork(
  x: number,
  y: number,
  a: Point,
  b: Point,
  c: Point,
  variant: number,
  coeffs: readonly number[],
  extend: boolean,
  filled: boolean,
  tol: number,
): boolean {
  const f = pitchforkFrame(a, b, c, variant);
  const seg = (p: Point, q: Point) => distanceToSegment(x, y, p.x, p.y, q.x, q.y) <= tol;
  const lineHit = ([s, e]: [Point, Point]) => (extend ? distanceToRay(x, y, s.x, s.y, e.x, e.y) <= tol : seg(s, e));
  if (lineHit(pitchforkMedian(f))) return true;
  if (seg(b, c)) return true;
  for (const k of coeffs) {
    const [u, l] = pitchforkLevelLines(f, k);
    if (lineHit(u) || lineHit(l)) return true;
  }
  if (filled && coeffs.length) {
    const kMax = Math.max(...coeffs.map(Math.abs));
    if (kMax > 0) {
      const [u, l] = pitchforkLevelLines(f, kMax, extend, 4000);
      if (pointInPolygon(x, y, [u[0], u[1], l[1], l[0]])) return true;
    }
  }
  return false;
}
