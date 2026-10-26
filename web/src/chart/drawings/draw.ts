// Canvas helpers shared by the tool renderers.

import type { Anchor, Drawing, Point } from "@qt/core";
import { allAnchors } from "@qt/core";
import { hairline } from "../canvas";
import { font, withAlpha, type ChartTheme } from "../theme";
import type { DrawCtx, ToolGeom } from "./types";

/** Distance used to draw "infinite" lines and rays. */
export const FAR = 1e5;

export function line(ctx: CanvasRenderingContext2D, a: Point, b: Point): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/** Point `len` px beyond b along a→b. */
export function extend(a: Point, b: Point, len = FAR): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l === 0) return b;
  return { x: b.x + (dx / l) * len, y: b.y + (dy / l) * len };
}

/** Open or closed polyline through pixel points. */
export function polyline(ctx: CanvasRenderingContext2D, pts: readonly Point[], close = false): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
  ctx.stroke();
}

/**
 * Fill color of area drawings: style.fillColor with its own alpha (× style.fillOpacity when set),
 * else (old drawings) the line color at style.fillOpacity (default 0.12).
 */
export function fillColor(d: Drawing, lineColor: string): string {
  if (d.style?.fillColor) return withAlpha(d.style.fillColor, d.style.fillOpacity ?? 1);
  return withAlpha(lineColor, d.style?.fillOpacity ?? 0.12);
}

/** Text color of a drawing: style.textColor, else the line color. */
export function textColor(d: Drawing, lineColor: string): string {
  return d.style?.textColor ?? lineColor;
}

/** Selection / hover handles. */
export function drawHandles(ctx: CanvasRenderingContext2D, pts: readonly Point[], fill: string, stroke: string, dpr: number): void {
  ctx.save();
  ctx.lineWidth = hairline(dpr, 1.5);
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Small price label at the right edge, above y. */
export function priceTag(c: DrawCtx, y: number, text: string, color: string): void {
  const { ctx, width, theme } = c;
  ctx.font = font(theme, 10);
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = color;
  ctx.fillText(text, width - 6, y - 3);
}

/** A boxed multi-line readout centered at x, placed above or below a y range. */
export function statsBox(c: DrawCtx, lines: string[], cx: number, yTop: number, yBottom: number, below: boolean, border: string, theme: ChartTheme): void {
  const { ctx } = c;
  if (!lines.length) return;
  ctx.save();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.font = font(theme, 11, 500);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14;
  const h = 8 + lines.length * 14;
  const bx = cx - w / 2;
  const by = below ? yBottom + 6 : yTop - h - 6;
  ctx.fillStyle = theme.boxBg;
  ctx.fillRect(bx, by, w, h);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => {
    ctx.fillStyle = i === 0 ? theme.text : theme.axisText;
    ctx.fillText(l, cx, by + 11 + i * 14);
  });
  ctx.restore();
}

/** Default handles: every anchor and path point projected to px. */
export function anchorHandles(d: Drawing, g: ToolGeom): Point[] {
  return allAnchors(d).map((a: Anchor) => g.toPx(a));
}

// ---------- shared pieces of the catalog-driven tools ----------

/** A prop with its fallback (old drawings have no props). */
export function prop<T>(d: Drawing, key: string, fallback: T): Widen<T> {
  const v = d.props?.[key];
  return (v === undefined ? fallback : v) as Widen<T>;
}

/** Literal types widened (prop(d, "x", 2) is a number, not 2). */
export type Widen<T> = T extends string ? string : T extends number ? number : T extends boolean ? boolean : T;

/** Stroke settings for one line: color, width, line style. */
export function strokeWith(ctx: CanvasRenderingContext2D, color: string, width: number, style: string | undefined): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(style === "dashed" ? [6 * Math.max(1, width * 0.75), 4] : style === "dotted" ? [Math.max(1, width), Math.max(2, width * 2)] : []);
}

/** Filled arrow head at `tip`, pointing away from `from`. */
export function arrowHead(ctx: CanvasRenderingContext2D, from: Point, tip: Point, size = 8): void {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - size * Math.cos(ang - 0.45), tip.y - size * Math.sin(ang - 0.45));
  ctx.lineTo(tip.x - size * Math.cos(ang + 0.45), tip.y - size * Math.sin(ang + 0.45));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export interface TextOpts {
  color: string;
  size: number;
  bold?: boolean;
  italic?: boolean;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** Box behind the text. */
  background?: string;
  border?: string;
  /** Wrap at this width (px). */
  wrap?: number;
  rotate?: number;
}

/** Font string of a text style. */
export function textFont(theme: ChartTheme, o: Pick<TextOpts, "size" | "bold" | "italic">): string {
  return (o.italic ? "italic " : "") + font(theme, o.size, o.bold ? 700 : 400);
}

/** Splits text into lines (newlines, and word wrap at `wrap` px when given). */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, wrap?: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!wrap) {
      out.push(para);
      continue;
    }
    let cur = "";
    for (const word of para.split(" ")) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && ctx.measureText(next).width > wrap) {
        out.push(cur);
        cur = word;
      } else cur = next;
    }
    out.push(cur);
  }
  return out;
}

/** Draws (multi-line) text at (x, y) with the given style; returns its box. */
export function drawText(c: DrawCtx, text: string, x: number, y: number, o: TextOpts): { x: number; y: number; width: number; height: number } {
  const { ctx, theme } = c;
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = textFont(theme, o);
  const lines = wrapLines(ctx, text, o.wrap);
  const lh = Math.round(o.size * 1.3);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const h = lh * lines.length;
  const align = o.align ?? "left";
  const base = o.baseline ?? "top";
  const left = align === "left" ? x : align === "right" ? x - w : x - w / 2;
  const top = base === "top" ? y : base === "bottom" ? y - h : y - h / 2;
  if (o.rotate) {
    ctx.translate(x, y);
    ctx.rotate(o.rotate);
    ctx.translate(-x, -y);
  }
  if (o.background || o.border) {
    const pad = 4;
    if (o.background) {
      ctx.fillStyle = o.background;
      ctx.fillRect(left - pad, top - pad, w + 2 * pad, h + 2 * pad);
    }
    if (o.border) {
      ctx.strokeStyle = o.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(left - pad + 0.5, top - pad + 0.5, w + 2 * pad - 1, h + 2 * pad - 1);
    }
  }
  ctx.fillStyle = o.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, left, top + i * lh + (lh - o.size) / 2));
  ctx.restore();
  return { x: left, y: top, width: w, height: h };
}

/** Text style of a drawing from the common style keys (textColor, textSize, bold, italic). */
export function textStyleOf(d: Drawing, c: DrawCtx, sizeFallback = 11): Pick<TextOpts, "color" | "size" | "bold" | "italic"> {
  return { color: d.style?.textColor ?? c.color, size: d.style?.textSize ?? sizeFallback, bold: d.style?.bold, italic: d.style?.italic };
}
