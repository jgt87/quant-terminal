// Pure geometry of the Lines family tools added on the registry: Info line (stats readout),
// Trend angle (screen angle of the segment) and Cross line. Pixel-space math takes points the
// caller projected with the chart's toPx; data-space math takes anchors.

import type { Anchor } from "../types";
import { distanceToLine, distanceToRay, distanceToSegment, type Point } from "./geometry";

/**
 * Distance from (x, y) to the segment p→q, optionally extended beyond p (left) and/or beyond q
 * (right): both → infinite line, one side → ray, none → segment.
 */
export function distanceToExtendedSegment(x: number, y: number, p: Point, q: Point, extendLeft: boolean, extendRight: boolean): number {
  if (extendLeft && extendRight) return distanceToLine(x, y, p.x, p.y, q.x, q.y);
  if (extendRight) return distanceToRay(x, y, p.x, p.y, q.x, q.y);
  if (extendLeft) return distanceToRay(x, y, q.x, q.y, p.x, p.y);
  return distanceToSegment(x, y, p.x, p.y, q.x, q.y);
}

/**
 * Screen angle of p→q in degrees, counter-clockwise from the positive x axis (screen y grows
 * downwards, so a line rising to the right has a positive angle). Range (-180, 180].
 */
export function screenAngleDeg(p: Point, q: Point): number {
  const deg = (Math.atan2(p.y - q.y, q.x - p.x) * 180) / Math.PI;
  return deg === -180 ? 180 : deg;
}

/**
 * Trend angle of a→b from the chart scales: the angle the segment makes on screen with
 * `pxPerSecond` horizontal pixels per second of time and `pxPerPrice` vertical pixels per price
 * unit (linear price scale). Equals screenAngleDeg of the projected anchors.
 */
export function trendAngleDeg(a: Anchor, b: Anchor, pxPerSecond: number, pxPerPrice: number): number {
  const dx = (b.time - a.time) * pxPerSecond;
  const dy = (b.price - a.price) * pxPerPrice;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return deg === -180 ? 180 : deg;
}

/** Distance from (x, y) to a cross line at p (a horizontal and a vertical line through p). */
export function distanceToCross(x: number, y: number, p: Point): number {
  return Math.min(Math.abs(y - p.y), Math.abs(x - p.x));
}

export interface InfoLineStats {
  /** b.price − a.price. */
  priceChange: number;
  /** Change in percent of |a.price| (0 when a.price is 0). */
  percentChange: number;
  /** Change in pips (pipSize price units per pip). */
  pips: number;
  /** Signed bars between the anchors (time difference / bar seconds, rounded). */
  bars: number;
  /** Signed seconds between the anchors. */
  seconds: number;
  /** Pixel length of the segment on screen. */
  distancePx: number;
  /** Screen angle in degrees (see screenAngleDeg). */
  angleDeg: number;
}

/** Everything the Info line readout shows, from the anchors and their projected points. */
export function infoLineStats(a: Anchor, b: Anchor, pa: Point, pb: Point, barSeconds: number, pipSize: number): InfoLineStats {
  const priceChange = b.price - a.price;
  const seconds = b.time - a.time;
  return {
    priceChange,
    percentChange: a.price ? (priceChange / Math.abs(a.price)) * 100 : 0,
    pips: pipSize > 0 ? Math.round(priceChange / pipSize) : 0,
    bars: barSeconds > 0 ? Math.round(seconds / barSeconds) : 0,
    seconds,
    distancePx: Math.hypot(pb.x - pa.x, pb.y - pa.y),
    angleDeg: screenAngleDeg(pa, pb),
  };
}

/** Pip size for a price shown with `decimals` decimals (10 points per pip; 1 for integer prices). */
export function pipSizeFor(decimals: number): number {
  return decimals > 0 ? 10 ** -(decimals - 1) : 1;
}

/** Compact duration: "3d 4h", "5h 30m", "45m", "20s" (sign dropped). */
export function formatSpan(seconds: number): string {
  const s = Math.abs(Math.round(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s % 60}s`;
}
