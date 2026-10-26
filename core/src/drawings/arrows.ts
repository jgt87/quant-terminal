// Pure geometry of the Arrows family: the arrow line (segment with optional extensions), the
// arrow marker (a solid block arrow from tail to tip) and the one-anchor arrow marks
// (up / down / left / right glyphs pointing at their anchor). Pixel space; `arrow` prefix.

import { distanceToLine, distanceToRay, distanceToSegment, type Point } from "./geometry";

/** Distance from (x, y) to the arrow line a→b with optional extensions past a (left) / b (right). */
export function arrowLineDistance(x: number, y: number, a: Point, b: Point, extendLeft: boolean, extendRight: boolean): number {
  if (extendLeft && extendRight) return distanceToLine(x, y, a.x, a.y, b.x, b.y);
  if (extendRight) return distanceToRay(x, y, a.x, a.y, b.x, b.y);
  if (extendLeft) return distanceToRay(x, y, b.x, b.y, a.x, a.y);
  return distanceToSegment(x, y, a.x, a.y, b.x, b.y);
}

/**
 * Block arrow from `tail` to `tip` (arrow marker): a shaft and a triangular head. Widths scale
 * with the length and are clamped so short and long markers stay readable. Returns the
 * 7-vertex outline (tip first).
 */
export function arrowMarkerPolygon(tail: Point, tip: Point): Point[] {
  const dx = tip.x - tail.x;
  const dy = tip.y - tail.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [tip];
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const headLen = Math.min(len * 0.45, Math.max(10, len * 0.3));
  const headHalf = Math.max(8, Math.min(28, len * 0.18));
  const shaftHalf = headHalf * 0.45;
  const bx = tip.x - ux * headLen;
  const by = tip.y - uy * headLen;
  return [
    { x: tip.x, y: tip.y },
    { x: bx + nx * headHalf, y: by + ny * headHalf },
    { x: bx + nx * shaftHalf, y: by + ny * shaftHalf },
    { x: tail.x + nx * shaftHalf, y: tail.y + ny * shaftHalf },
    { x: tail.x - nx * shaftHalf, y: tail.y - ny * shaftHalf },
    { x: bx - nx * shaftHalf, y: by - ny * shaftHalf },
    { x: bx - nx * headHalf, y: by - ny * headHalf },
  ];
}

export type ArrowMarkDir = "up" | "down" | "left" | "right";

/** Size of an arrow mark glyph in px. */
export const ARROW_MARK = { length: 22, headHalf: 9, shaftHalf: 4, gap: 2 } as const;

/**
 * Arrow mark glyph pointing at the anchor `p` (its tip sits `gap` px from p): an up mark lies
 * below the anchor and points up, a down mark above pointing down, a left mark to the right
 * pointing left, a right mark to the left pointing right.
 */
export function arrowMarkPolygon(p: Point, dir: ArrowMarkDir): Point[] {
  const { length, gap } = ARROW_MARK;
  const v = dir === "up" ? { x: 0, y: -1 } : dir === "down" ? { x: 0, y: 1 } : dir === "left" ? { x: -1, y: 0 } : { x: 1, y: 0 };
  const tip = { x: p.x - v.x * gap, y: p.y - v.y * gap };
  const tail = { x: tip.x - v.x * length, y: tip.y - v.y * length };
  const nx = -v.y;
  const ny = v.x;
  const headLen = length * 0.5;
  const { headHalf, shaftHalf } = ARROW_MARK;
  const bx = tip.x - v.x * headLen;
  const by = tip.y - v.y * headLen;
  return [
    tip,
    { x: bx + nx * headHalf, y: by + ny * headHalf },
    { x: bx + nx * shaftHalf, y: by + ny * shaftHalf },
    { x: tail.x + nx * shaftHalf, y: tail.y + ny * shaftHalf },
    { x: tail.x - nx * shaftHalf, y: tail.y - ny * shaftHalf },
    { x: bx - nx * shaftHalf, y: by - ny * shaftHalf },
    { x: bx - nx * headHalf, y: by - ny * headHalf },
  ];
}

/** Where an arrow mark's label goes: past the tail, with the text alignment to use. */
export function arrowMarkLabelAt(p: Point, dir: ArrowMarkDir): { x: number; y: number; align: "left" | "center" | "right"; baseline: "top" | "middle" | "bottom" } {
  const off = ARROW_MARK.length + ARROW_MARK.gap + 4;
  if (dir === "up") return { x: p.x, y: p.y + off, align: "center", baseline: "top" };
  if (dir === "down") return { x: p.x, y: p.y - off, align: "center", baseline: "bottom" };
  if (dir === "left") return { x: p.x + off, y: p.y, align: "left", baseline: "middle" };
  return { x: p.x - off, y: p.y, align: "right", baseline: "middle" };
}

/** Even-odd point-in-polygon (arrow outlines). */
export function arrowPointInPolygon(x: number, y: number, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Hit on a solid arrow outline: inside, or within `tol` of an edge. */
export function arrowHitPolygon(x: number, y: number, poly: readonly Point[], tol: number): boolean {
  if (arrowPointInPolygon(x, y, poly)) return true;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (distanceToSegment(x, y, a.x, a.y, b.x, b.y) <= tol) return true;
  }
  return false;
}
