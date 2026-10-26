// Pure geometry for the chart drawing tools. Anchors live in data space
// ({ time, price }); callers pass a `toPx` projection so hit-testing works in
// screen pixels regardless of zoom, scale mode or timeframe.

import type { Anchor, Bar, Drawing } from "../types";

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface HitResult {
  hit: boolean;
  /** Index of the anchor whose handle was hit, or null for a hit on the body. */
  anchorIndex: number | null;
}

// ---------- Fibonacci ----------

export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

/**
 * Fibonacci retracement levels for a move from `a` (first click) to `b` (second click).
 * Convention: ratio 0 sits at b (the end of the move) and ratio 1 at a (its start),
 * so the levels measure how far price retraces from b back toward a:
 *   price(r) = b.price + (a.price − b.price) × r
 */
export function fibLevels(a: Anchor, b: Anchor, ratios: readonly number[] = FIB_RATIOS): { ratio: number; price: number }[] {
  return ratios.map((ratio) => ({ ratio, price: b.price + (a.price - b.price) * ratio }));
}

/** Ratios a fib drawing shows: its own visible level list, else the defaults. */
export function drawingFibRatios(d: Drawing): number[] {
  const levels = d.style?.levels;
  if (!levels?.length) return [...FIB_RATIOS];
  return levels.filter((l) => l.visible !== false).map((l) => l.ratio);
}

// ---------- Distances (pixels) ----------

function dist(px: number, py: number, x: number, y: number): number {
  return Math.hypot(px - x, py - y);
}

/**
 * Distance from (px,py) to the line through (x1,y1)-(x2,y2), with the projection
 * parameter t clamped to [tMin, tMax] (t = 0 at point 1, t = 1 at point 2).
 */
function distanceClamped(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tMin: number,
  tMax: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  if (t < tMin) t = tMin;
  if (t > tMax) t = tMax;
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}

/** Distance from a point to the segment (x1,y1)-(x2,y2). */
export function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  return distanceClamped(px, py, x1, y1, x2, y2, 0, 1);
}

/** Distance from a point to the ray starting at (x1,y1) and passing through (x2,y2). */
export function distanceToRay(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  return distanceClamped(px, py, x1, y1, x2, y2, 0, Infinity);
}

/** Distance from a point to the infinite line through (x1,y1) and (x2,y2). */
export function distanceToLine(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  return distanceClamped(px, py, x1, y1, x2, y2, -Infinity, Infinity);
}

// ---------- Channel ----------

/** Price of the line through a and b at the given time (a.price when the line is vertical). */
function priceOnLine(a: Anchor, b: Anchor, time: number): number {
  if (b.time === a.time) return a.price;
  return a.price + ((b.price - a.price) * (time - a.time)) / (b.time - a.time);
}

/**
 * Parallel channel: the base segment a→b, plus a parallel copy shifted so it passes
 * through c. The shift is vertical (in price) by c.price minus the base line's price
 * at c.time. For a vertical base line (a.time === b.time) the shift is horizontal (in time).
 */
export function channelLines(a: Anchor, b: Anchor, c: Anchor): [[Anchor, Anchor], [Anchor, Anchor]] {
  if (a.time === b.time) {
    const dt = c.time - a.time;
    return [
      [a, b],
      [
        { time: a.time + dt, price: a.price },
        { time: b.time + dt, price: b.price },
      ],
    ];
  }
  const dp = c.price - priceOnLine(a, b, c.time);
  return [
    [a, b],
    [
      { time: a.time, price: a.price + dp },
      { time: b.time, price: b.price + dp },
    ],
  ];
}

// ---------- Measure ----------

export interface MeasureStats {
  /** b.price − a.price. */
  priceChange: number;
  /** Change relative to a.price, in percent (0 when a.price is 0). */
  percentChange: number;
  /** Number of bars between the anchors (signed, rounded). */
  bars: number;
  /** b.time − a.time in seconds (signed). */
  durationSeconds: number;
}

export function measureStats(a: Anchor, b: Anchor, barSeconds: number): MeasureStats {
  const priceChange = b.price - a.price;
  const durationSeconds = b.time - a.time;
  return {
    priceChange,
    percentChange: a.price !== 0 ? (priceChange / Math.abs(a.price)) * 100 : 0,
    bars: barSeconds > 0 ? Math.round(durationSeconds / barSeconds) : 0,
    durationSeconds,
  };
}

// ---------- Text ----------

/** Approximate text-note box: the anchor is the top-left corner. Renderers should use the same box. */
export const TEXT_BOX = { charWidth: 7, minWidth: 24, height: 18, padding: 4 } as const;

export function textBox(text: string | undefined, p: Point): { x: number; y: number; width: number; height: number } {
  const len = (text ?? "").length;
  const width = Math.max(TEXT_BOX.minWidth, len * TEXT_BOX.charWidth + 2 * TEXT_BOX.padding);
  return { x: p.x, y: p.y, width, height: TEXT_BOX.height };
}

// ---------- Hit-testing ----------

function inRect(px: number, py: number, x1: number, y1: number, x2: number, y2: number, tol: number): boolean {
  return (
    px >= Math.min(x1, x2) - tol &&
    px <= Math.max(x1, x2) + tol &&
    py >= Math.min(y1, y2) - tol &&
    py <= Math.max(y1, y2) + tol
  );
}

function rectBorderDistance(px: number, py: number, p: Point, q: Point): number {
  return Math.min(
    distanceToSegment(px, py, p.x, p.y, q.x, p.y),
    distanceToSegment(px, py, q.x, p.y, q.x, q.y),
    distanceToSegment(px, py, q.x, q.y, p.x, q.y),
    distanceToSegment(px, py, p.x, q.y, p.x, p.y),
  );
}

/** True when x lies within the viewport width (or when no viewport is known). */
function withinWidth(x: number, tol: number, viewport?: Viewport): boolean {
  return !viewport || (x >= -tol && x <= viewport.width + tol);
}

function withinHeight(y: number, tol: number, viewport?: Viewport): boolean {
  return !viewport || (y >= -tol && y <= viewport.height + tol);
}

/**
 * Hit-tests a drawing at pixel (px, py). Anchor handles are tested first: the nearest
 * handle within `tolerance` wins and its index is returned. Otherwise the body is tested
 * and `anchorIndex` is null. Incomplete drawings (too few anchors) only test handles.
 *
 * Body rules per type:
 * - trendline: the segment; ray: from anchor 0 through anchor 1 onward; extended: the full line.
 * - hline: horizontal at the anchor price across the full width; hray: from the anchor rightward.
 * - vline: vertical at the anchor time across the full height.
 * - rectangle: its border only.
 * - channel: both parallel segments (see channelLines).
 * - fib: any level line between the anchors' x-range, plus the diagonal a→b.
 * - measure: anywhere inside the rectangle spanned by the anchors.
 * - text: the box from textBox().
 */
export function hitTestDrawing(
  d: Drawing,
  toPx: (a: Anchor) => Point,
  px: number,
  py: number,
  tolerance = 6,
  viewport?: Viewport,
): HitResult {
  const pts = d.anchors.map(toPx);
  const tol = tolerance;

  let best: number | null = null;
  let bestDist = Infinity;
  pts.forEach((p, i) => {
    const dd = dist(px, py, p.x, p.y);
    if (dd <= tol && dd < bestDist) {
      best = i;
      bestDist = dd;
    }
  });
  if (best !== null) return { hit: true, anchorIndex: best };
  return { hit: hitTestBody(d, toPx, px, py, tol, viewport), anchorIndex: null };
}

/**
 * Body hit-test of the built-in drawing types (no handles): the per-type rules listed on
 * hitTestDrawing. Unknown types never hit. Registry tools reuse it for the migrated types.
 */
export function hitTestBody(
  d: Drawing,
  toPx: (a: Anchor) => Point,
  px: number,
  py: number,
  tolerance = 6,
  viewport?: Viewport,
): boolean {
  const tol = tolerance;
  const pts = d.anchors.map(toPx);
  const body = (hit: boolean): boolean => hit;
  const [p0, p1, p2] = pts;

  switch (d.type) {
    case "hline":
      if (!p0) return body(false);
      return body(Math.abs(py - p0.y) <= tol && withinWidth(px, tol, viewport));
    case "hray":
      if (!p0) return body(false);
      return body(Math.abs(py - p0.y) <= tol && px >= p0.x - tol && withinWidth(px, tol, viewport));
    case "vline":
      if (!p0) return body(false);
      return body(Math.abs(px - p0.x) <= tol && withinHeight(py, tol, viewport));
    case "text": {
      if (!p0) return body(false);
      const r = textBox(d.text, p0);
      return body(inRect(px, py, r.x, r.y, r.x + r.width, r.y + r.height, tol));
    }
    case "trendline":
      if (!p0 || !p1) return body(false);
      return body(distanceToSegment(px, py, p0.x, p0.y, p1.x, p1.y) <= tol);
    case "ray":
      if (!p0 || !p1) return body(false);
      return body(distanceToRay(px, py, p0.x, p0.y, p1.x, p1.y) <= tol);
    case "extended":
      if (!p0 || !p1) return body(false);
      return body(distanceToLine(px, py, p0.x, p0.y, p1.x, p1.y) <= tol);
    case "rectangle":
      if (!p0 || !p1) return body(false);
      return body(rectBorderDistance(px, py, p0, p1) <= tol);
    case "measure":
      if (!p0 || !p1) return body(false);
      return body(inRect(px, py, p0.x, p0.y, p1.x, p1.y, tol));
    case "fib": {
      if (!p0 || !p1) return body(false);
      const a = d.anchors[0];
      const b = d.anchors[1];
      const xMin = Math.min(p0.x, p1.x);
      const xMax = Math.max(p0.x, p1.x);
      for (const lvl of d.style?.fibLevels === false ? [] : fibLevels(a, b, drawingFibRatios(d))) {
        const y = toPx({ time: a.time, price: lvl.price }).y;
        if (distanceToSegment(px, py, xMin, y, xMax, y) <= tol) return body(true);
      }
      return body(distanceToSegment(px, py, p0.x, p0.y, p1.x, p1.y) <= tol);
    }
    case "channel": {
      if (!p0 || !p1 || !p2) return body(false);
      const [base, par] = channelLines(d.anchors[0], d.anchors[1], d.anchors[2]);
      for (const [s, e] of [base, par]) {
        const sp = toPx(s);
        const ep = toPx(e);
        if (distanceToSegment(px, py, sp.x, sp.y, ep.x, ep.y) <= tol) return body(true);
      }
      return body(false);
    }
    case "vprofile":
      // Fixed-range profile: the band between the two anchor times (rectangle of the anchors).
      if (!p0 || !p1) return body(false);
      return body(inRect(px, py, p0.x, p0.y, p1.x, p1.y, tol));
    case "avprofile":
      // Anchored profile: its anchor line.
      if (!p0) return body(false);
      return body(Math.abs(px - p0.x) <= tol && withinHeight(py, tol, viewport));
    default:
      return body(false);
  }
}

// ---------- Magnet ----------

/** Index of the bar whose time is nearest to `time` (bars sorted by time). -1 when empty. */
export function nearestBarIndex(bars: readonly Bar[], time: number): number {
  if (bars.length === 0) return -1;
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(bars[lo - 1].time - time) <= Math.abs(bars[lo].time - time)) return lo - 1;
  return lo;
}

/**
 * Magnet helper: moves the anchor to the nearest bar's time and to whichever of that
 * bar's open/high/low/close is closest. With `toPx`, closeness is measured in screen
 * pixels (correct on log scales); otherwise in price. Returns the anchor unchanged
 * when there are no bars.
 */
export function snapToBar(anchor: Anchor, bars: readonly Bar[], toPx?: (a: Anchor) => Point): Anchor {
  const i = nearestBarIndex(bars, anchor.time);
  if (i < 0) return anchor;
  const bar = bars[i];
  const target = toPx ? toPx(anchor).y : anchor.price;
  let bestPrice = bar.close;
  let bestDist = Infinity;
  for (const price of [bar.open, bar.high, bar.low, bar.close]) {
    const v = toPx ? toPx({ time: bar.time, price }).y : price;
    const dd = Math.abs(v - target);
    if (dd < bestDist) {
      bestDist = dd;
      bestPrice = price;
    }
  }
  return { time: bar.time, price: bestPrice };
}
