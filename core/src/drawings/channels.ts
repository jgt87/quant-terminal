// Pure geometry of the Channels family tools added on the registry: Disjoint channel, Flat
// top/bottom and Regression trend (least squares of a price source between two times, with
// standard-deviation bands and Pearson's R).

import type { Anchor, Bar } from "../types";
import type { Point } from "./geometry";

/** Price of the line through a and b at `time` (a.price for a vertical line). */
export function priceAtTime(a: Anchor, b: Anchor, time: number): number {
  if (b.time === a.time) return a.price;
  return a.price + ((b.price - a.price) * (time - a.time)) / (b.time - a.time);
}

/**
 * Disjoint channel from three anchors: the first line a→b, and a second line with the mirrored
 * slope that starts at c's price on a's time and ends on b's time (c's time is ignored).
 */
export function disjointLines(a: Anchor, b: Anchor, c: Anchor): [[Anchor, Anchor], [Anchor, Anchor]] {
  const dp = b.price - a.price;
  return [
    [a, b],
    [
      { time: a.time, price: c.price },
      { time: b.time, price: c.price - dp },
    ],
  ];
}

/**
 * Flat top/bottom from three anchors: the trend line a→b and a horizontal line at c's price
 * over the same time span.
 */
export function flatLines(a: Anchor, b: Anchor, c: Anchor): [[Anchor, Anchor], [Anchor, Anchor]] {
  return [
    [a, b],
    [
      { time: a.time, price: c.price },
      { time: b.time, price: c.price },
    ],
  ];
}

/** Point-in-polygon (even-odd rule). */
export function pointInPolygon(x: number, y: number, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// ---------- Regression trend ----------

export type RegressionSource = "open" | "high" | "low" | "close" | "hl2" | "hlc3" | "ohlc4";

/** Value of a bar for a price source. */
export function barSourceValue(b: Bar, src: RegressionSource): number {
  switch (src) {
    case "open":
      return b.open;
    case "high":
      return b.high;
    case "low":
      return b.low;
    case "hl2":
      return (b.high + b.low) / 2;
    case "hlc3":
      return (b.high + b.low + b.close) / 3;
    case "ohlc4":
      return (b.open + b.high + b.low + b.close) / 4;
    default:
      return b.close;
  }
}

export interface LinearFit {
  slope: number;
  intercept: number;
  /** Population standard deviation of the residuals y − (intercept + slope·x). */
  stdDev: number;
  /** Pearson correlation coefficient of x and y (0 when either has no variance). */
  pearsonR: number;
  n: number;
}

/** Ordinary least squares fit y = intercept + slope·x. Needs at least one point. */
export function linearRegression(xs: readonly number[], ys: readonly number[]): LinearFit {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return { slope: 0, intercept: 0, stdDev: 0, pearsonR: 0, n: 0 };
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const slope = sxx ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i] - (intercept + slope * xs[i]);
    sse += r * r;
  }
  return { slope, intercept, stdDev: Math.sqrt(sse / n), pearsonR: sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0, n };
}

export interface RegressionChannel extends LinearFit {
  /** Times of the first and last bar used. */
  t0: number;
  t1: number;
  /** Regression line values at t0 / t1. */
  base: [number, number];
  /** Upper and lower band values at t0 / t1 (base + deviation × stdDev). */
  upper: [number, number];
  lower: [number, number];
}

/**
 * Linear regression of a bar source over the bars with t0 ≤ time ≤ t1 (anchor order does not
 * matter), x = bar index inside the range so gaps (weekends) do not bend the fit. Bands lie at
 * `upperDev` and `lowerDev` standard deviations from the line (lowerDev is usually negative).
 * Null with fewer than two bars in range.
 */
export function regressionChannel(
  bars: readonly Bar[],
  tA: number,
  tB: number,
  src: RegressionSource,
  upperDev: number,
  lowerDev: number,
): RegressionChannel | null {
  const lo = Math.min(tA, tB);
  const hi = Math.max(tA, tB);
  const xs: number[] = [];
  const ys: number[] = [];
  let t0 = 0;
  let t1 = 0;
  for (const b of bars) {
    if (b.time < lo || b.time > hi) continue;
    if (!xs.length) t0 = b.time;
    t1 = b.time;
    xs.push(xs.length);
    ys.push(barSourceValue(b, src));
  }
  if (xs.length < 2) return null;
  const fit = linearRegression(xs, ys);
  const last = xs.length - 1;
  const base: [number, number] = [fit.intercept, fit.intercept + fit.slope * last];
  return {
    ...fit,
    t0,
    t1,
    base,
    upper: [base[0] + upperDev * fit.stdDev, base[1] + upperDev * fit.stdDev],
    lower: [base[0] + lowerDev * fit.stdDev, base[1] + lowerDev * fit.stdDev],
  };
}
