// Chart-pattern geometry (XABCD, Cypher, ABCD, Triangle, Head and shoulders, Three drives):
// leg ratios between pattern points, which side of a point its label goes, and hit-test helpers
// for polylines and filled triangles/polygons. Pure functions, no DOM.

import type { Anchor } from "../types";
import { distanceToSegment, type Point } from "./geometry";

/** Price length of the leg a→b (absolute). */
export function patternLegLength(a: Anchor, b: Anchor): number {
  return Math.abs(b.price - a.price);
}

/**
 * Ratio of leg `num` to leg `den` in price (e.g. AB/XA retracement = patternLegRatio([A, B], [X, A])).
 * NaN when the reference leg is flat.
 */
export function patternLegRatio(num: [Anchor, Anchor], den: [Anchor, Anchor]): number {
  const d = patternLegLength(den[0], den[1]);
  if (d === 0) return NaN;
  return patternLegLength(num[0], num[1]) / d;
}

/** Ratio text with 3 decimals ("" for NaN / infinite). */
export function formatPatternRatio(r: number): string {
  return Number.isFinite(r) ? r.toFixed(3) : "";
}

/** One dashed connector between two pattern points with its ratio label. */
export interface PatternRatio {
  /** Indices of the connected points. */
  from: number;
  to: number;
  /** The ratio shown at the connector's midpoint. */
  value: number;
}

/** Pattern kinds with ratio connectors. */
export type PatternKind = "xabcd" | "cypher" | "abcd" | "threeDrives";

/**
 * Ratio connectors of a pattern for the points placed so far (connectors whose points are
 * missing are left out, so a pattern under construction shows the ratios it already has).
 * - XABCD: XB = AB/XA, AC = BC/AB, BD = CD/BC, XD = AD/XA.
 * - Cypher: XB = AB/XA, XC = XC/XA (C extends XA), XD = CD/XC (D retraces XC).
 * - ABCD: AC = BC/AB, BD = CD/BC.
 * - Three drives (points 0..6): 0→2 = |1-2|/|0-1|, 1→3 = |2-3|/|1-2|, 2→4 = |3-4|/|2-3|,
 *   3→5 = |4-5|/|3-4|.
 */
export function patternRatios(kind: PatternKind, p: readonly Anchor[]): PatternRatio[] {
  const out: PatternRatio[] = [];
  const add = (from: number, to: number, value: () => number, need: number) => {
    if (p.length > need) out.push({ from, to, value: value() });
  };
  if (kind === "xabcd") {
    const [X, A, B, C, D] = p;
    add(0, 2, () => patternLegRatio([A, B], [X, A]), 2);
    add(1, 3, () => patternLegRatio([B, C], [A, B]), 3);
    add(2, 4, () => patternLegRatio([C, D], [B, C]), 4);
    add(0, 4, () => patternLegRatio([A, D], [X, A]), 4);
  } else if (kind === "cypher") {
    const [X, A, B, C, D] = p;
    add(0, 2, () => patternLegRatio([A, B], [X, A]), 2);
    add(0, 3, () => patternLegRatio([X, C], [X, A]), 3);
    add(1, 4, () => patternLegRatio([C, D], [X, C]), 4);
  } else if (kind === "abcd") {
    const [A, B, C, D] = p;
    add(0, 2, () => patternLegRatio([B, C], [A, B]), 2);
    add(1, 3, () => patternLegRatio([C, D], [B, C]), 3);
  } else {
    for (let i = 2; i <= 5; i++) {
      const k = i;
      add(k - 2, k, () => patternLegRatio([p[k - 1], p[k]], [p[k - 2], p[k - 1]]), k);
    }
  }
  return out;
}

/** ABCD symmetry: CD length over AB length (1 = AB=CD). NaN when AB is flat. */
export function abEqualsCd(p: readonly Anchor[]): number {
  const [A, B, C, D] = p;
  if (!A || !B || !C || !D) return NaN;
  return patternLegRatio([C, D], [A, B]);
}

/**
 * Where the label of point i goes: "above" when the point is a local high (not lower than its
 * neighbours), "below" when it is a local low. End points compare with their one neighbour;
 * a single point goes above.
 */
export function patternLabelSide(p: readonly Anchor[], i: number): "above" | "below" {
  const cur = p[i];
  const prev = p[i - 1];
  const next = p[i + 1];
  if (!cur) return "above";
  const ref = [prev, next].filter((x): x is Anchor => x !== undefined);
  if (!ref.length) return "above";
  const avg = ref.reduce((s, a) => s + a.price, 0) / ref.length;
  return cur.price >= avg ? "above" : "below";
}

/** Shortest distance from (x, y) to an open polyline. Infinity for fewer than 2 points. */
export function patternPolylineDistance(x: number, y: number, pts: readonly Point[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distanceToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y));
  return best;
}

/** Point inside triangle abc (edges included). */
export function patternPointInTriangle(x: number, y: number, a: Point, b: Point, c: Point): boolean {
  const s = (p1: Point, p2: Point) => (x - p2.x) * (p1.y - p2.y) - (p1.x - p2.x) * (y - p2.y);
  const d1 = s(a, b);
  const d2 = s(b, c);
  const d3 = s(c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Point inside a closed polygon (even-odd rule). */
export function patternPointInPolygon(x: number, y: number, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Filled triangles of a pattern as point-index triples (only those whose points exist). */
export function patternTriangles(kind: "xabcd" | "cypher" | "headAndShoulders", n: number): [number, number, number][] {
  const tris: [number, number, number][] = kind === "headAndShoulders" ? [[0, 1, 2], [2, 3, 4], [4, 5, 6]] : [[0, 1, 2], [2, 3, 4]];
  return tris.filter((t) => Math.max(...t) < n);
}

/**
 * Head and shoulders neckline: the line through points 2 and 4 (the two troughs), clipped to the
 * time span of points 0..6 placed so far. Null before point 4 exists.
 */
export function necklineSegment(p: readonly Anchor[]): [Anchor, Anchor] | null {
  const a = p[2];
  const b = p[4];
  if (!a || !b) return null;
  const t0 = p[0].time;
  const t1 = p[p.length - 1].time;
  const at = (t: number): Anchor => ({ time: t, price: a.time === b.time ? a.price : a.price + ((b.price - a.price) * (t - a.time)) / (b.time - a.time) });
  return [at(Math.min(t0, a.time)), at(Math.max(t1, b.time))];
}

/**
 * Triangle pattern: the two converging sides (A→C and B→D) and the filled area A, C, D, B.
 * Sides missing points are left out.
 */
export function trianglePatternSides(p: readonly Anchor[]): { upper?: [Anchor, Anchor]; lower?: [Anchor, Anchor]; area?: Anchor[] } {
  const [A, B, C, D] = p;
  return {
    upper: A && C ? [A, C] : undefined,
    lower: B && D ? [B, D] : undefined,
    area: A && B && C && D ? [A, C, D, B] : A && B && C ? [A, C, B] : undefined,
  };
}
