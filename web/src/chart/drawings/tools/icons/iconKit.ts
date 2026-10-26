// Shared pieces of the Icons family: the built-in icon set (icons.json, our own 24×24 stroked
// paths) and the curated emoji list (emoji.json), canvas drawing of an icon without Path2D,
// the box hit-test and the resize handle.

import { iconBox, iconHit, iconParsePath, iconResizeHandle, iconSizeFromHandle, ICON_DEFAULT_SIZE, type Drawing, type IconPathCmd, type Point } from "@qt/core";
import { prop } from "../../draw";
import type { DrawingToolDef, ToolGeom, ValueField } from "../../types";
import emojiJson from "./emoji.json";
import iconsJson from "./icons.json";

export interface IconDef {
  id: string;
  label: string;
  d: string;
  fill: boolean;
}

export const ICON_SET = iconsJson as IconDef[];
export const EMOJI_SET = emojiJson as string[];

const parsed = new Map<string, IconPathCmd[]>();
function cmdsOf(id: string): IconPathCmd[] {
  let cmds = parsed.get(id);
  if (!cmds) {
    const def = ICON_SET.find((i) => i.id === id) ?? ICON_SET[0];
    cmds = iconParsePath(def.d);
    parsed.set(id, cmds);
  }
  return cmds;
}

/** Draws icon `id` centered at c with `size` px (24-unit grid scaled), stroked or filled. */
export function drawIcon(ctx: CanvasRenderingContext2D, id: string, c: Point, size: number, color: string): void {
  const def = ICON_SET.find((i) => i.id === id) ?? ICON_SET[0];
  const k = size / 24;
  const ox = c.x - size / 2;
  const oy = c.y - size / 2;
  const X = (x: number) => ox + x * k;
  const Y = (y: number) => oy + y * k;
  ctx.save();
  ctx.setLineDash([]);
  ctx.beginPath();
  for (const m of cmdsOf(def.id)) {
    if (m.c === "M") ctx.moveTo(X(m.x), Y(m.y));
    else if (m.c === "L") ctx.lineTo(X(m.x), Y(m.y));
    else if (m.c === "Q") ctx.quadraticCurveTo(X(m.x1), Y(m.y1), X(m.x), Y(m.y));
    else if (m.c === "C") ctx.bezierCurveTo(X(m.x1), Y(m.y1), X(m.x2), Y(m.y2), X(m.x), Y(m.y));
    else ctx.closePath();
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, 2 * k);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  if (def.fill) ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Draws an emoji centered at c, about `size` px tall. */
export function drawEmoji(ctx: CanvasRenderingContext2D, emoji: string, c: Point, size: number): void {
  ctx.save();
  ctx.font = `${Math.round(size * 0.82)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000000";
  ctx.fillText(emoji, c.x, c.y + size * 0.04);
  ctx.restore();
}

/** Size of an icon drawing (catalog `size`, default 72 px). */
export const sizeOf = (d: Drawing): number => prop(d, "size", ICON_DEFAULT_SIZE);

/** Size field (custom tab). */
export const SIZE_FIELD: ValueField = { kind: "number", key: "props.size", label: "Size", default: ICON_DEFAULT_SIZE, min: 12, max: 400, step: 4 };

/** Geometry shared by the three icon tools: box hit, center + resize handles, bounds. */
export function iconGeometry(round = false): Pick<DrawingToolDef, "hitTest" | "handles" | "onAnchorDrag" | "bounds"> {
  return {
    hitTest(d, g, x, y, tol) {
      const a = d.anchors[0];
      return a ? iconHit(g.toPx(a), sizeOf(d), x, y, tol, round) : false;
    },
    handles(d, g: ToolGeom) {
      const a = d.anchors[0];
      if (!a) return [];
      const p = g.toPx(a);
      return [p, iconResizeHandle(p, sizeOf(d))];
    },
    onAnchorDrag(d, index, a, g) {
      if (index === 0) return { ...d, anchors: [a, ...d.anchors.slice(1)] };
      return { ...d, props: { ...d.props, size: iconSizeFromHandle(g.toPx(d.anchors[0]), g.toPx(a)) } };
    },
    bounds(d, g) {
      return iconBox(g.toPx(d.anchors[0]), sizeOf(d));
    },
  };
}
