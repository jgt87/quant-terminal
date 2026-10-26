// Pure geometry of the Icons family: the icon / emoji / sticker box around the anchor, its
// resize handle, and a small SVG path-data parser (absolute M/L/H/V/C/Q/Z and their relative
// forms) so the built-in icon set can be drawn with plain canvas calls. `icon` prefix.

import type { Point } from "./geometry";

/** Factory size (px) of an icon, emoji or sticker (catalog `size`). */
export const ICON_DEFAULT_SIZE = 72;
export const ICON_MIN_SIZE = 12;
export const ICON_MAX_SIZE = 400;

export interface IconRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Square box of `size` px centered on the anchor. */
export function iconBox(center: Point, size: number): IconRect {
  return { x: center.x - size / 2, y: center.y - size / 2, width: size, height: size };
}

/** Resize handle: the box's bottom-right corner. */
export function iconResizeHandle(center: Point, size: number): Point {
  return { x: center.x + size / 2, y: center.y + size / 2 };
}

/** Size after dragging the resize handle to `p` (the larger of the two half-extents, clamped). */
export function iconSizeFromHandle(center: Point, p: Point): number {
  const half = Math.max(Math.abs(p.x - center.x), Math.abs(p.y - center.y));
  return Math.round(Math.max(ICON_MIN_SIZE, Math.min(ICON_MAX_SIZE, half * 2)));
}

/** Box hit (grown by `tol`). Stickers are round: `round` tests the inscribed circle. */
export function iconHit(center: Point, size: number, x: number, y: number, tol: number, round = false): boolean {
  if (round) return Math.hypot(x - center.x, y - center.y) <= size / 2 + tol;
  return Math.abs(x - center.x) <= size / 2 + tol && Math.abs(y - center.y) <= size / 2 + tol;
}

export type IconPathCmd =
  | { c: "M" | "L"; x: number; y: number }
  | { c: "Q"; x1: number; y1: number; x: number; y: number }
  | { c: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { c: "Z" };

const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, Z: 0 };

/**
 * Parses SVG path data into absolute M/L/Q/C/Z commands (H/V become L, relative forms are
 * resolved, extra coordinate pairs after M are line-tos). Unsupported letters throw.
 */
export function iconParsePath(d: string): IconPathCmd[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const out: IconPathCmd[] = [];
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    let fresh = false;
    if (/[a-zA-Z]/.test(tokens[i])) {
      cmd = tokens[i++];
      fresh = true;
      if (ARGS[cmd.toUpperCase()] === undefined) throw new Error(`Unsupported path command ${cmd}`);
    } else if (!cmd) throw new Error("Path data must start with a command");
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    if (up === "Z") {
      if (!fresh) {
        i++; // stray number after Z
        continue;
      }
      out.push({ c: "Z" });
      x = sx;
      y = sy;
      continue;
    }
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    if (up === "M" || up === "L") {
      x = ox + num();
      y = oy + num();
      out.push({ c: up, x, y });
      if (up === "M") {
        sx = x;
        sy = y;
        cmd = rel ? "l" : "L";
      }
    } else if (up === "H") {
      x = ox + num();
      out.push({ c: "L", x, y });
    } else if (up === "V") {
      y = oy + num();
      out.push({ c: "L", x, y });
    } else if (up === "Q") {
      const x1 = ox + num();
      const y1 = oy + num();
      x = ox + num();
      y = oy + num();
      out.push({ c: "Q", x1, y1, x, y });
    } else if (up === "C") {
      const x1 = ox + num();
      const y1 = oy + num();
      const x2 = ox + num();
      const y2 = oy + num();
      x = ox + num();
      y = oy + num();
      out.push({ c: "C", x1, y1, x2, y2, x, y });
    }
  }
  return out;
}
