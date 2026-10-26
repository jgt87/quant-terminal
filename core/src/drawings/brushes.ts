// Pure geometry of the Brushes family: freehand stroke smoothing (after the controller's
// Ramer–Douglas–Peucker simplification), stroke hit-testing and the filled brush area.
// Pixel space; names carry a `brush` prefix.

import { distanceToSegment, type Point } from "./geometry";
import { simplifyPath } from "./edit";

/** Factory smoothing of the brush and highlighter (catalog `smooth`). */
export const BRUSH_DEFAULT_SMOOTH = 5;

/** Chaikin corner-cutting passes for a smoothing value (0 = none, capped at 4). */
export function brushSmoothPasses(smooth: number): number {
  return Math.max(0, Math.min(4, Math.floor(smooth / 2)));
}

/** One Chaikin pass: every segment is replaced by its 1/4 and 3/4 points; the ends are kept. */
export function brushChaikin(pts: readonly Point[]): Point[] {
  if (pts.length < 3) return [...pts];
  const out: Point[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    out.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y }, { x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Smoothed stroke: `brushSmoothPasses(smooth)` Chaikin passes (end points stay in place). */
export function brushSmooth(pts: readonly Point[], smooth = BRUSH_DEFAULT_SMOOTH): Point[] {
  let out = [...pts];
  for (let i = brushSmoothPasses(smooth); i > 0; i--) out = brushChaikin(out);
  return out;
}

/**
 * Pointer path → stored stroke: Ramer–Douglas–Peucker with an epsilon that grows with the
 * smoothing value (0.5 px per step, at least 1 px).
 */
export function brushSimplify<T extends Point>(pts: readonly T[], smooth = BRUSH_DEFAULT_SMOOTH): T[] {
  return simplifyPath(pts, Math.max(1, smooth * 0.5));
}

/** Distance from (x, y) to the stroke polyline. */
export function brushDistance(x: number, y: number, pts: readonly Point[]): number {
  if (!pts.length) return Infinity;
  if (pts.length === 1) return Math.hypot(x - pts[0].x, y - pts[0].y);
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distanceToSegment(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    if (d < best) best = d;
  }
  return best;
}

/** Point inside the area closed by the stroke (start joined to end), even-odd rule. */
export function brushInsideArea(x: number, y: number, pts: readonly Point[]): boolean {
  if (pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Stroke hit: within half the stroke width plus `tol` of the path, or inside the closed area
 * when the brush fills its background.
 */
export function brushHit(x: number, y: number, pts: readonly Point[], strokeWidth: number, tol: number, filled = false): boolean {
  if (brushDistance(x, y, pts) <= strokeWidth / 2 + tol) return true;
  return filled && brushInsideArea(x, y, pts);
}
