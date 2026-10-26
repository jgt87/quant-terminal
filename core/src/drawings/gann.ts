// Pure geometry of the Gann drawing tools (box, square, square fixed, fan). Anchors are data-space
// { time, price }; screen helpers take pixel points. No DOM.
//
// Conventions:
// - A Gann ratio "P x T" moves P units of price per T units of time; 1x1 is the diagonal of the
//   unit square, so in a box from a to b the 1x1 line runs corner to corner.
// - Gann square / square fixed: the box from the origin corner is a 5 x 5 grid of units; grid
//   lines at 0..5 units, fan lines "PxT" from the origin, arcs centred on the origin with the
//   radius of the point (x, y) in units (1x0 = 1 unit, 1x1 = √2 units, ...).
// - reverse: the origin moves to the opposite price edge (the grid is mirrored vertically).

import type { Anchor } from "../types";
import { distanceToSegment, type Point } from "./geometry";

/** Number of grid units along each side of a Gann square. */
export const GANN_SQUARE_UNITS = 5;

/** Fan ratios of the Gann fan (price units per time unit), steep to shallow is 8 … 1/8. */
export const GANN_FAN_RATIOS = [1 / 8, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4, 8] as const;

/** Label of a price/time ratio: 2 → "2/1", 0.25 → "1/4" (`sep` "x" gives "2x1", "1x4"). */
export function gannRatioLabel(r: number, sep = "/"): string {
  if (!(r > 0)) return `0${sep}1`;
  if (r >= 1) return `${round(r)}${sep}1`;
  return `1${sep}${round(1 / r)}`;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Point of fan line `r` (price units per time unit) on the boundary of the box a→b, where the box
 * diagonal is the 1x1 line. r ≤ 1 ends on the far time edge, r > 1 on the far price edge.
 */
export function gannFanPoint(a: Anchor, b: Anchor, r: number): Anchor {
  const dt = b.time - a.time;
  const dp = b.price - a.price;
  if (r <= 1) return { time: a.time + dt, price: a.price + dp * r };
  return { time: a.time + dt / r, price: a.price + dp };
}

/** Slope (price per second) of fan line r for the box a→b. */
export function gannFanSlope(a: Anchor, b: Anchor, r: number): number {
  const dt = b.time - a.time;
  if (dt === 0) return 0;
  return ((b.price - a.price) / dt) * r;
}

/** Price per bar of the move a→b (bars = time span / bar seconds). */
export function gannPriceBarRatio(a: Anchor, b: Anchor, barSeconds: number): number {
  const bars = Math.abs(b.time - a.time) / Math.max(1, barSeconds);
  if (bars === 0) return 0;
  return Math.abs(b.price - a.price) / bars;
}

/**
 * Second anchor of a Gann square with a fixed price/bar ratio: keeps b's time and the direction
 * of the move, sets the price span to bars × ratio. A missing / non-positive ratio leaves b as is.
 */
export function gannConstrainRatio(a: Anchor, b: Anchor, ratio: number | null | undefined, barSeconds: number): Anchor {
  if (!ratio || !(ratio > 0)) return b;
  const bars = Math.abs(b.time - a.time) / Math.max(1, barSeconds);
  const dir = b.price < a.price ? -1 : 1;
  return { time: b.time, price: a.price + dir * bars * ratio };
}

/** Origin corner and unit vectors of a Gann square a→b (reverse mirrors the price axis). */
export interface GannFrame {
  origin: Anchor;
  /** Time / price of one grid unit (signed: towards the opposite corner). */
  unitTime: number;
  unitPrice: number;
}

export function gannSquareFrame(a: Anchor, b: Anchor, reverse = false, units = GANN_SQUARE_UNITS): GannFrame {
  const p0 = reverse ? b.price : a.price;
  const p1 = reverse ? a.price : b.price;
  return { origin: { time: a.time, price: p0 }, unitTime: (b.time - a.time) / units, unitPrice: (p1 - p0) / units };
}

/** Point at grid coordinates (u time units, v price units) of a frame. */
export function gannAt(f: GannFrame, u: number, v: number): Anchor {
  return { time: f.origin.time + u * f.unitTime, price: f.origin.price + v * f.unitPrice };
}

/**
 * Fan line "P x T" of a Gann square: from the origin to the box edge, P price units per T time
 * units. Returns the end point in grid units.
 */
export function gannSquareFanEnd(p: number, t: number, units = GANN_SQUARE_UNITS): { u: number; v: number } {
  if (p <= 0 && t <= 0) return { u: 0, v: 0 };
  const k = units / Math.max(p, t);
  return { u: t * k, v: p * k };
}

/** Arc radius (grid units) of the arc through grid point (x, y). */
export function gannArcRadius(x: number, y: number): number {
  return Math.hypot(x, y);
}

/**
 * Pixel polyline of a quarter ellipse centred at `c` with radii rx / ry, swept from the time
 * axis to the price axis towards (sx, sy) (each ±1), clipped to the box |dx| ≤ w, |dy| ≤ h.
 * Points outside the box are dropped, so the result may be split; the result is a list of runs.
 */
export function gannQuarterArc(c: Point, rx: number, ry: number, sx: number, sy: number, w: number, h: number, steps = 48): Point[][] {
  const runs: Point[][] = [];
  let run: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (Math.PI / 2);
    const dx = rx * Math.cos(t);
    const dy = ry * Math.sin(t);
    if (dx <= w + 0.5 && dy <= h + 0.5) run.push({ x: c.x + sx * dx, y: c.y + sy * dy });
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

/** Levels of a Gann box at coefficients (0..1) along price and time (reverse flips them). */
export function gannBoxLevels(a: Anchor, b: Anchor, priceCoeffs: readonly number[], timeCoeffs: readonly number[], reverse = false): { prices: number[]; times: number[] } {
  const k = (c: number) => (reverse ? 1 - c : c);
  return {
    prices: priceCoeffs.map((c) => a.price + (b.price - a.price) * k(c)),
    times: timeCoeffs.map((c) => a.time + (b.time - a.time) * k(c)),
  };
}

/**
 * Pixel corner of a Gann square fixed: the square keeps equal width and height on screen; its
 * side is the horizontal distance a→b and it opens towards b's side of a vertically.
 */
export function gannFixedCorner(pa: Point, pb: Point): Point {
  const side = Math.abs(pb.x - pa.x);
  const sy = pb.y < pa.y ? -1 : 1;
  return { x: pb.x, y: pa.y + sy * side };
}

/** Distance from a point to a pixel polyline. */
export function gannPolylineDistance(x: number, y: number, pts: readonly Point[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distanceToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y));
  if (pts.length === 1) best = Math.hypot(x - pts[0].x, y - pts[0].y);
  return best;
}

/** Point inside the axis-aligned pixel box spanned by p and q (inclusive, with a margin). */
export function gannInsideBox(x: number, y: number, p: Point, q: Point, margin = 0): boolean {
  return x >= Math.min(p.x, q.x) - margin && x <= Math.max(p.x, q.x) + margin && y >= Math.min(p.y, q.y) - margin && y <= Math.max(p.y, q.y) + margin;
}
