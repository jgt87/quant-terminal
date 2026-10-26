// Shared pieces of the chart-pattern tools: catalog Style fields, the renderer (filled
// triangles / areas, legs, dashed ratio connectors with ratio boxes, point labels above highs and
// below lows) and the hit-test. Each tool module passes its own spec; geometry lives in
// core/src/drawings/patterns.ts.

import {
  formatPatternRatio,
  necklineSegment,
  patternLabelSide,
  patternPointInPolygon,
  patternPointInTriangle,
  patternPolylineDistance,
  patternRatios,
  patternTriangles,
  trianglePatternSides,
  type Anchor,
  type Drawing,
  type PatternKind,
  type Point,
} from "@qt/core";
import { withAlpha } from "../../../theme";
import { catalogColor } from "../../builders";
import { anchorHandles, drawText, fillColor, polyline, prop, strokeWith, textStyleOf } from "../../draw";
import { FONT_SIZES } from "../../schema";
import type { DrawCtx, DrawingToolDef, FloatButton, SettingsField, ToolGeom } from "../../types";

/** Catalog fill transparency 85 → alpha 0.15 on the background color. */
export const PATTERN_FILL_ALPHA = 0.15;

/** Background color at the catalog's 85% transparency as "#rrggbbaa". */
export function patternFill(hex: string): string {
  const base = catalogColor(hex).slice(0, 7);
  return base + Math.round(PATTERN_FILL_ALPHA * 255).toString(16).padStart(2, "0");
}

/** Catalog background transparency (percent) of the tools whose color and transparency are separate. */
export const PATTERN_TRANSPARENCY = 85;

/**
 * Fill of a pattern drawing. Tools with a `transparency` fill key keep the alpha in the color;
 * tools with a `backgroundColor` key store the opaque catalog color and apply
 * `props.transparency` (85 %) when drawing. A color that already carries an alpha wins.
 */
function patternFillOf(spec: PatternSpec, d: Drawing, lineColor: string): string {
  const col = d.style?.fillColor;
  if (spec.fill !== "backgroundColor" || !col || !/^#[0-9a-f]{6}$/i.test(col)) return fillColor(d, lineColor);
  const t = Number(prop(d, "transparency", PATTERN_TRANSPARENCY));
  return withAlpha(col, Math.max(0, Math.min(1, 1 - t / 100)) * (d.style?.fillOpacity ?? 1));
}

const withFill = (d: Drawing): Drawing => ({ ...d, props: { ...d.props, fillBackground: true } });

/** Catalog Style tab: label text block, border width/color, optional background. */
export function patternStyleFields(o: { color: string; fill?: "transparency" | "backgroundColor" }): SettingsField[] {
  const out: SettingsField[] = [
    { kind: "color", key: "style.textColor", label: "Label / color", catalog: "textcolor", default: "#ffffff" },
    { kind: "fontSize", key: "style.textSize", label: "Label / font size", catalog: "fontsize", sizes: FONT_SIZES, default: 12 },
    { kind: "checkbox", key: "style.bold", label: "Label / Bold", catalog: "bold", default: false },
    { kind: "checkbox", key: "style.italic", label: "Label / Italic", catalog: "italic", default: false },
    { kind: "width", key: "style.width", label: "Border / width", catalog: "linewidth", default: 2 },
    { kind: "color", key: "style.color", label: "Border / color", catalog: "color", default: catalogColor(o.color) },
  ];
  if (o.fill) {
    out.push(
      { kind: "checkbox", key: "props.fillBackground", label: "Background (on/off)", catalog: "fillBackground", default: true },
      {
        kind: "color",
        key: "style.fillColor",
        label: "Background / color",
        catalog: o.fill,
        default: o.fill === "backgroundColor" ? catalogColor(o.color) : patternFill(o.color),
        testWith: withFill,
      },
    );
  }
  return out;
}

/** Point label of anchor i ("" = none). */
export type PointLabels = (i: number) => string;

export interface PatternSpec {
  type: string;
  catalogType: string;
  label: string;
  anchors: number;
  /** Catalog line (border) color. */
  color: string;
  fill?: "transparency" | "backgroundColor";
  /** Filled shapes: triangles of the pattern, or the triangle pattern's converging area. */
  shape: "xabcd" | "cypher" | "headAndShoulders" | "triangle" | "none";
  /** Ratio connectors. */
  ratios?: PatternKind;
  labels: PointLabels;
  iconPath: string;
  iconFill?: string;
}

const pxOf = (d: Drawing, toPx: (a: Anchor) => Point) => d.anchors.map((a) => toPx(a));

/** Closed areas that are filled (px), for render and hit-test. */
function areas(spec: PatternSpec, d: Drawing, toPx: (a: Anchor) => Point): Point[][] {
  if (spec.shape === "none") return [];
  if (spec.shape === "triangle") {
    const area = trianglePatternSides(d.anchors).area;
    return area ? [area.map(toPx)] : [];
  }
  const pts = pxOf(d, toPx);
  return patternTriangles(spec.shape, pts.length).map(([i, j, k]) => [pts[i], pts[j], pts[k]]);
}

/** Extra straight lines: H&S neckline, triangle pattern sides. */
function extraLines(spec: PatternSpec, d: Drawing): [Anchor, Anchor][] {
  if (spec.shape === "headAndShoulders") {
    const n = necklineSegment(d.anchors);
    return n ? [n] : [];
  }
  if (spec.shape === "triangle") {
    const s = trianglePatternSides(d.anchors);
    return [s.upper, s.lower].filter((x): x is [Anchor, Anchor] => x !== undefined);
  }
  return [];
}

function renderPattern(spec: PatternSpec, c: DrawCtx, d: Drawing): void {
  const { ctx } = c;
  const pts = pxOf(d, c.toPx);
  if (!pts.length) return;
  const width = (d.style?.width ?? 2) + (c.selected || c.hovered ? 0.5 : 0);
  // Background shapes.
  if (prop(d, "fillBackground", true)) {
    ctx.save();
    ctx.fillStyle = patternFillOf(spec, d, c.color);
    for (const poly of areas(spec, d, c.toPx)) {
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  // Legs (the live preview of the next leg is the last point following the pointer).
  strokeWith(ctx, c.color, width, "solid");
  polyline(ctx, pts);
  for (const [a, b] of extraLines(spec, d)) polyline(ctx, [c.toPx(a), c.toPx(b)]);
  const ts = textStyleOf(d, c, 12);
  // Ratio connectors.
  if (spec.ratios) {
    for (const r of patternRatios(spec.ratios, d.anchors)) {
      const p = pts[r.from];
      const q = pts[r.to];
      strokeWith(ctx, c.color, 1, "dashed");
      polyline(ctx, [p, q]);
      const txt = formatPatternRatio(r.value);
      if (txt) drawText(c, txt, (p.x + q.x) / 2, (p.y + q.y) / 2, { ...ts, align: "center", baseline: "middle", background: c.color });
    }
  }
  // Point labels: above highs, below lows.
  pts.forEach((p, i) => {
    const text = spec.labels(i);
    if (!text) return;
    const above = patternLabelSide(d.anchors, i) === "above";
    drawText(c, text, p.x, above ? p.y - 8 : p.y + 8, { ...ts, align: "center", baseline: above ? "bottom" : "top", background: c.color });
  });
  strokeWith(ctx, c.color, width, "solid");
}

function hitPattern(spec: PatternSpec, d: Drawing, g: ToolGeom, x: number, y: number, tol: number): boolean {
  const pts = pxOf(d, g.toPx);
  if (patternPolylineDistance(x, y, pts) <= tol) return true;
  for (const [a, b] of extraLines(spec, d)) if (patternPolylineDistance(x, y, [g.toPx(a), g.toPx(b)]) <= tol) return true;
  if (prop(d, "fillBackground", true)) {
    for (const poly of areas(spec, d, g.toPx)) {
      if (poly.length === 3 ? patternPointInTriangle(x, y, poly[0], poly[1], poly[2]) : patternPointInPolygon(x, y, poly)) return true;
    }
  }
  return false;
}

/** 2.5px anchor dot for icons. */
export const iconDot = (x: number, y: number): string => `M${x} ${y + 2.5}a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z`;

/** A chart-pattern tool definition from its spec (catalog defaults, fields, toolbar). */
export function patternTool(spec: PatternSpec): DrawingToolDef {
  const color = catalogColor(spec.color);
  const floatingToolbar: FloatButton[] = spec.fill
    ? ["templates", "line-tool-color", "background-color", "text-color", "line-tool-width", "settings", "lock", "remove", "more"]
    : ["templates", "line-tool-color", "text-color", "line-tool-width", "settings", "lock", "remove", "more"];
  return {
    type: spec.type,
    catalogType: spec.catalogType,
    family: "patterns",
    label: spec.label,
    icon: spec.type,
    iconPath: spec.iconPath,
    iconFill: spec.iconFill,
    anchors: spec.anchors,
    defaults: {
      textColor: "#ffffff",
      textSize: 12,
      bold: false,
      italic: false,
      width: 2,
      color,
      ...(spec.fill === "transparency" ? { fillColor: patternFill(spec.color) } : {}),
      ...(spec.fill === "backgroundColor" ? { fillColor: color } : {}),
    },
    defaultProps: spec.fill === "backgroundColor" ? { fillBackground: true, transparency: PATTERN_TRANSPARENCY } : spec.fill ? { fillBackground: true } : {},
    floatingToolbar,
    settings: { coordinates: "time-price", style: patternStyleFields({ color: spec.color, fill: spec.fill }) },
    hitTest: (d, g, x, y, tol) => hitPattern(spec, d, g, x, y, tol),
    render: (c, d) => renderPattern(spec, c, d),
    handles: anchorHandles,
  };
}

/** Labels from a fixed list (index → text). */
export const listLabels =
  (names: readonly string[]): PointLabels =>
  (i) =>
    names[i] ?? "";
