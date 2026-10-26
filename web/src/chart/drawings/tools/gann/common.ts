// Shared pieces of the Gann tools: level rows stored in props / style, "use one color",
// floating-toolbar bindings that act on every row, and transparency → alpha.

import type { Drawing } from "@qt/core";
import { withAlpha } from "../../../theme";
import { textFont } from "../../draw";
import type { DrawCtx, FloatBinding, LevelRow } from "../../types";

/** Level rows at `path` ("style.levels" or "props.<key>"), else the factory rows. */
export function rowsAt(d: Drawing, path: string, factory: () => LevelRow[]): LevelRow[] {
  const [bag, key] = path.split(".") as ["style" | "props", string];
  const v = (d[bag] as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) && v.length ? (v as LevelRow[]) : factory();
}

/** Returns the drawing with the rows at `path` replaced. */
export function withRows(d: Drawing, path: string, rows: LevelRow[]): Drawing {
  const [bag, key] = path.split(".") as ["style" | "props", string];
  return { ...d, [bag]: { ...((d[bag] as Record<string, unknown> | undefined) ?? {}), [key]: rows } } as Drawing;
}

/** "Use one color": props.linesColors overrides every row color when set. */
export function oneColor(d: Drawing): string | null {
  const v = d.props?.linesColors;
  return typeof v === "string" && v ? v : null;
}

/** Row color with the one-color override. */
export const rowColor = (d: Drawing, r: LevelRow, fallback: string): string => oneColor(d) ?? r.color ?? fallback;

/** Catalog transparency (0..100, 100 = invisible) → fill alpha. */
export const alphaOf = (transparency: unknown, fallback = 80): number => {
  const t = typeof transparency === "number" && Number.isFinite(transparency) ? transparency : fallback;
  return Math.max(0, Math.min(1, 1 - t / 100));
};

export const fill = (color: string, alpha: number): string => withAlpha(color, alpha);

/** Floating-toolbar binding that reads the first visible row and writes every row (color / width). */
export function everyRow(paths: { path: string; factory: () => LevelRow[] }[], field: "color" | "width"): FloatBinding {
  return {
    get: (d, theme) => {
      for (const p of paths) {
        const r = rowsAt(d, p.path, p.factory).find((x) => x.visible !== false);
        if (r && r[field] !== undefined) return r[field];
      }
      return field === "color" ? (d.style?.color ?? theme.drawing) : (d.style?.width ?? 1);
    },
    set: (d, v) => {
      let out: Drawing = { ...d, style: { ...d.style, [field]: v } };
      for (const p of paths) out = withRows(out, p.path, rowsAt(d, p.path, p.factory).map((r) => ({ ...r, [field]: v })));
      if (field === "color" && out.props?.linesColors) out = { ...out, props: { ...out.props, linesColors: v } };
      return out;
    },
  };
}

/** Label text in a level color at (x, y). */
export function label(c: DrawCtx, text: string, x: number, y: number, color: string, align: CanvasTextAlign, baseline: CanvasTextBaseline, size = 11, bold = false, italic = false): void {
  const { ctx, theme } = c;
  ctx.save();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.font = textFont(theme, { size, bold, italic });
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Stroke one segment with a color / width (dash already on the context). */
export function seg(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** Short number text (no trailing zeros). */
export const num = (v: number): string => String(Math.round(v * 1000) / 1000);
