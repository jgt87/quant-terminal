// Shared pieces of the Fibonacci family (everything but the retracement in fib.ts): catalog level
// rows, "use one color", background transparency, label placement, trend-line fields, floating
// toolbar bindings that act on every level, and polyline hit-testing.

import { fibDistanceToPolyline, type Drawing, type FibLevel, type Point } from "@qt/core";
import { font, withAlpha } from "../../../theme";
import { CATALOG_LINESTYLE, catalogColor } from "../../builders";
import { prop, strokeWith } from "../../draw";
import type { DrawCtx, FloatBinding, LevelRow, SettingsField, ToolGeom } from "../../types";

/** Level row with an optional label text (catalog `levelN.text`). */
export type FibRow = LevelRow & { text?: string };

/** Catalog level list → factory rows: [coeff, color, visible, linewidth?, linestyle?]. */
export function rows(list: [number, string, boolean, number?, number?][]): FibRow[] {
  return list.map(([ratio, color, visible, width, style]) => {
    const r: FibRow = { ratio, color: catalogColor(color), visible };
    if (width !== undefined) r.width = width;
    if (style !== undefined) r.lineStyle = CATALOG_LINESTYLE[style];
    return r;
  });
}

/** Levels of a drawing (its own table, else the factory rows). */
export function levelsOf(d: Drawing, factory: readonly FibRow[], key: "levels" | "vlevels" = "levels"): FibRow[] {
  const own = key === "levels" ? d.style?.levels : (d.props?.vlevels as FibLevel[] | undefined);
  return (own?.length ? own : factory) as FibRow[];
}

/** Effective color of a level: "use one color" wins over the row color. */
export function levelColor(d: Drawing, r: FibRow, fallback: string): string {
  const one = d.props?.linesColors;
  return typeof one === "string" && one ? one : (r.color ?? fallback);
}

/** Background alpha (0..1) from the catalog transparency (percent), 0 when the fill is off. */
export function fillAlpha(d: Drawing, fillDefault = true): number {
  if (!prop(d, "fillBackground", fillDefault)) return 0;
  const t = Number(prop(d, "transparency", 80));
  return Math.max(0, Math.min(1, (100 - (Number.isFinite(t) ? t : 80)) / 100));
}

/** Fill style of the band of a level. */
export function bandFill(color: string, alpha: number): string {
  return withAlpha(color, alpha);
}

/** Truthy select values: selects may store booleans as strings. */
export function truthy(v: unknown): boolean {
  return v === true || v === "true" || v === 1;
}

/** Stroke one level line (row width/style, else the given defaults). */
export function strokeLevel(c: DrawCtx, color: string, r: FibRow | undefined, width: number, style: string | undefined): void {
  strokeWith(c.ctx, color, r?.width ?? width, r?.lineStyle ?? style);
}

// ---------- settings fields ----------

export const VERT_ALIGN = [
  { value: "bottom", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "top", label: "Bottom" },
];
/** Vertical position of labels on vertical (time) lines. */
export const VERT_POS = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" },
];
export const HORZ_ALIGN = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];
export const LABEL_SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 22, 24];

/** Trend line (on/off) · width · style · color (catalog trendline.*). */
export function trendlineFields(o: { width?: number; style?: "solid" | "dashed" | "dotted" | null; color?: string } = {}): SettingsField[] {
  const out: SettingsField[] = [
    { kind: "checkbox", key: "props.trendline_visible", label: "Trend line", catalog: "trendline.visible", default: true },
    { kind: "width", key: "props.trendline_linewidth", label: "Trend line width", catalog: "trendline.linewidth", default: o.width ?? 2 },
  ];
  if (o.style !== null) out.push({ kind: "lineStyle", key: "props.trendline_linestyle", label: "Trend line style", catalog: "trendline.linestyle", default: o.style ?? "dashed" });
  out.push({ kind: "color", key: "props.trendline_color", label: "Trend line color", catalog: "trendline.color", default: o.color ?? "#808080" });
  return out;
}

/** "Use one color": one color for every level (empty = the row colors). */
export const useOneColor: SettingsField = {
  kind: "color",
  key: "props.linesColors",
  label: "Use one color",
  catalog: "linesColors (derived)",
  default: null,
  testValue: "#e91e63",
};

/** Background (on/off) + opacity as catalog transparency %. */
export function backgroundFields(fill = true): SettingsField[] {
  return [
    { kind: "checkbox", key: "props.fillBackground", label: "Background", catalog: "fillBackground", default: fill },
    {
      kind: "number",
      key: "props.transparency",
      label: "Background transparency %",
      catalog: "transparency",
      default: 80,
      min: 0,
      max: 100,
      step: 1,
      testValue: 30,
      testWith: (d) => ({ ...d, props: { ...d.props, fillBackground: true } }),
    },
  ];
}

export function labelFontSizeField(def = 12): SettingsField {
  return {
    kind: "select",
    key: "props.labelFontSize",
    label: "Font size",
    catalog: "labelFontSize",
    options: LABEL_SIZES.map((s) => ({ value: s, label: String(s) })),
    default: def,
  };
}

// ---------- floating toolbar ----------

/** Line-tool color button: reads the first level color, writes "use one color". */
export function oneColorBinding(factory: readonly FibRow[]): FloatBinding {
  return {
    get: (d) => (d.props?.linesColors as string | undefined) ?? levelsOf(d, factory).find((r) => r.visible !== false)?.color ?? factory[0]?.color,
    set: (d, v) => ({ ...d, props: { ...d.props, linesColors: v } }),
  };
}

/** Width / style buttons that set every level row. */
export function allLevelsBinding(factory: readonly FibRow[], part: "width" | "lineStyle", fallback: unknown, key: "levels" | "vlevels" = "levels"): FloatBinding {
  return {
    get: (d) => levelsOf(d, factory, key)[0]?.[part] ?? fallback,
    set: (d, v) => {
      const next = levelsOf(d, factory, key).map((r) => ({ ...r, [part]: v }));
      return key === "levels" ? { ...d, style: { ...d.style, levels: next } } : { ...d, props: { ...d.props, vlevels: next } };
    },
  };
}

// ---------- labels ----------

/** Text drawn with the family's label font; returns nothing. */
export function label(c: DrawCtx, text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign, baseline: CanvasTextBaseline): void {
  const { ctx } = c;
  ctx.save();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.font = font(c.theme, size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Label of a horizontal level line from x0 to x1: horizontal position + catalog vertical value. */
export function hLineLabel(c: DrawCtx, text: string, x0: number, x1: number, y: number, horz: string, vert: string, color: string, size: number): void {
  const x = horz === "right" ? x1 + 4 : horz === "center" ? (x0 + x1) / 2 : x0 - 4;
  const align: CanvasTextAlign = horz === "right" ? "left" : horz === "center" ? "center" : "right";
  const baseline: CanvasTextBaseline = vert === "bottom" ? "bottom" : vert === "top" ? "top" : "middle";
  label(c, text, x, vert === "bottom" ? y - 2 : vert === "top" ? y + 2 : y, color, size, align, baseline);
}

/** Text inside a horizontal level line (level row text). */
export function hLineText(c: DrawCtx, text: string, x0: number, x1: number, y: number, horz: string, vert: string, color: string, size: number): void {
  const x = horz === "right" ? x1 - 4 : horz === "center" ? (x0 + x1) / 2 : x0 + 4;
  const align: CanvasTextAlign = horz === "right" ? "right" : horz === "center" ? "center" : "left";
  const baseline: CanvasTextBaseline = vert === "bottom" ? "bottom" : vert === "top" ? "top" : "middle";
  label(c, text, x, vert === "bottom" ? y - 2 : vert === "top" ? y + 2 : y, color, size, align, baseline);
}

/** Label of a vertical (time) line: horizontal side + vertical position in the pane. */
export function vLineLabel(c: DrawCtx, text: string, x: number, horz: string, vert: string, color: string, size: number): void {
  const lx = horz === "left" ? x - 4 : horz === "center" ? x : x + 4;
  const align: CanvasTextAlign = horz === "left" ? "right" : horz === "center" ? "center" : "left";
  const y = vert === "top" ? 4 : vert === "middle" ? c.height / 2 : c.height - 4;
  label(c, text, lx, y, color, size, align, vert === "top" ? "top" : vert === "middle" ? "middle" : "bottom");
}

// ---------- geometry helpers ----------

export function stroke(c: DrawCtx, pts: readonly Point[]): void {
  if (pts.length < 2) return;
  const { ctx } = c;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

export function fillPoly(c: DrawCtx, pts: readonly Point[], style: string): void {
  if (pts.length < 3) return;
  const { ctx } = c;
  ctx.save();
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** True when (x, y) is within tol of any polyline. */
export function hitPolys(polys: readonly (readonly Point[])[], x: number, y: number, tol: number): boolean {
  return polys.some((p) => p.length > 1 && fibDistanceToPolyline(x, y, p) <= tol);
}

/** Projected anchors (null when the drawing is incomplete). */
export function px(d: Drawing, g: ToolGeom, n: number): Point[] | null {
  if (d.anchors.length < n) return null;
  return d.anchors.slice(0, n).map((a) => g.toPx(a));
}

/** Point `len` px beyond b along a→b (b itself when a = b). */
export function far(a: Point, b: Point, len = 1e4): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l === 0) return b;
  return { x: b.x + (dx / l) * len, y: b.y + (dy / l) * len };
}
