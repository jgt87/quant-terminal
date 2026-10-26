// Shared pieces of the shape / arrow / brush / text / icon tool modules: catalog field
// constructors, stroke setup from the drawing's style, line-end arrows and a canvas path
// helper. Tool modules stay small and declarative on top of these.

import type { Drawing, Point } from "@qt/core";
import { dashFor } from "../../../theme";
import { arrowHead, prop } from "../../draw";
import { FONT_SIZES } from "../../schema";
import type { DrawCtx, FieldKey, SettingsField, ValueField } from "../../types";

/** Catalog field constructors (key, label, catalog key, factory default). */
export const F = {
  width: (key: FieldKey, label: string, catalog: string, def: number): ValueField => ({ kind: "width", key, label, catalog, default: def }),
  lineStyle: (key: FieldKey, label: string, catalog: string, def: string): ValueField => ({ kind: "lineStyle", key, label, catalog, default: def }),
  color: (key: FieldKey, label: string, catalog: string, def: string, extra: Partial<ValueField> = {}): ValueField =>
    ({ kind: "color", key, label, catalog, default: def, ...extra }) as ValueField,
  check: (key: FieldKey, label: string, catalog: string, def: boolean, extra: Partial<ValueField> = {}): ValueField =>
    ({ kind: "checkbox", key, label, catalog, default: def, ...extra }) as ValueField,
  font: (key: FieldKey, label: string, catalog: string, def: number, extra: Partial<ValueField> = {}): ValueField =>
    ({ kind: "fontSize", key, label, catalog, sizes: FONT_SIZES, default: def, ...extra }) as ValueField,
  select: (key: FieldKey, label: string, catalog: string, options: { value: string | number | boolean; label: string }[], def: string | number, extra: Partial<ValueField> = {}): ValueField =>
    ({ kind: "select", key, label, catalog, options, default: def, ...extra }) as ValueField,
  number: (key: FieldKey, label: string, catalog: string | undefined, def: number, o: { min?: number; max?: number; step?: number } = {}, extra: Partial<ValueField> = {}): ValueField =>
    ({ kind: "number", key, label, catalog, default: def, ...o, ...extra }) as ValueField,
  text: (label = "Text", extra: Partial<ValueField> = {}): ValueField =>
    ({ kind: "text", key: "text", label, catalog: "text (derived)", multiline: true, maxLength: 2000, default: "", ...extra }) as ValueField,
};

/** Line-end choices (catalog leftEnd / rightEnd). */
export const LINE_END = [
  { value: 0, label: "Normal" },
  { value: 1, label: "Arrow" },
];

/** Vertical / horizontal text alignment choices (stored values follow the catalog). */
export const VERT_ALIGN = [
  { value: "bottom", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "top", label: "Bottom" },
];
export const HORZ_ALIGN = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

/** Wiring-test state helpers: a drawing with some text / a prop set. */
export const withText = (d: Drawing): Drawing => ({ ...d, text: d.text || "Sample text" });
export const withProps =
  (p: Record<string, unknown>) =>
  (d: Drawing): Drawing => ({ ...d, props: { ...d.props, ...p } });
export const both =
  (...fns: ((d: Drawing) => Drawing)[]) =>
  (d: Drawing): Drawing =>
    fns.reduce((acc, fn) => fn(acc), d);

/** Applies the drawing's stroke: color, width (thicker when selected/hovered) and line style. */
export function applyStroke(c: DrawCtx, d: Drawing, o: { color?: string; width?: number; style?: string } = {}): void {
  const { ctx } = c;
  const w = o.width ?? d.style?.width ?? 1;
  ctx.strokeStyle = o.color ?? c.color;
  ctx.lineWidth = c.selected || c.hovered ? w + 0.5 : w;
  ctx.setLineDash(dashFor((o.style ?? d.style?.lineStyle) as "solid" | "dashed" | "dotted" | undefined, w));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

/** Traces a polyline as the current path (no stroke / fill). */
export function tracePath(ctx: CanvasRenderingContext2D, pts: readonly Point[], close = false): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  if (close) ctx.closePath();
}

/** Arrow heads at the path ends per props.leftEnd / props.rightEnd (1 = arrow). */
export function lineEnds(c: DrawCtx, d: Drawing, pts: readonly Point[], defaults: { left: number; right: number } = { left: 0, right: 0 }): void {
  if (pts.length < 2) return;
  const size = 6 + c.ctx.lineWidth * 2;
  if (prop(d, "leftEnd", defaults.left) === 1) arrowHead(c.ctx, pts[1], pts[0], size);
  if (prop(d, "rightEnd", defaults.right) === 1) arrowHead(c.ctx, pts[pts.length - 2], pts[pts.length - 1], size);
}

/** Section header helper. */
export const header = (label: string): SettingsField => ({ kind: "section", label });
