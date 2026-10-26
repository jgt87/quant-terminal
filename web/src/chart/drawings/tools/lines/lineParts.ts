// Shared parts of the Info line and Trend angle tools: catalog-tagged Style / Text fields, the
// stats readout (price range, percent, pips, bars, date/time range, distance, angle) and text
// along the segment.

import { formatSpan, infoLineStats, pipSizeFor, type Anchor, type Drawing, type Point } from "@qt/core";
import { formatPct, formatSigned } from "../../../format";
import { FONT_SIZES } from "../../schema";
import { arrowHead, drawText, extend, line, prop, textStyleOf } from "../../draw";
import type { DrawCtx, SettingsField, ToolGeom } from "../../types";

export const LINE_ENDS = [
  { value: 0, label: "Normal" },
  { value: 1, label: "Arrow" },
];

export const STATS_POSITIONS = [
  { value: 0, label: "Left" },
  { value: 1, label: "Center" },
  { value: 2, label: "Right" },
  { value: 3, label: "Auto" },
];

/** Vertical text alignment (stored catalog value → label). */
export const VERT_LABELS = [
  { value: "bottom", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "top", label: "Bottom" },
];
export const HORZ_LABELS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

export type StatKey =
  | "showPriceRange"
  | "showPercentPriceRange"
  | "showPipsPriceRange"
  | "showBarsRange"
  | "showDateTimeRange"
  | "showDistance"
  | "showAngle";

const STAT_LABELS: Record<StatKey, string> = {
  showPriceRange: "Price range",
  showPercentPriceRange: "Percent change",
  showPipsPriceRange: "Change in pips",
  showBarsRange: "Bars range",
  showDateTimeRange: "Date/time range",
  showDistance: "Distance",
  showAngle: "Angle",
};

/** Line color / width / style rows (catalog linecolor, linewidth, linestyle). */
export function lineRows(color: string): SettingsField[] {
  return [
    { kind: "color", key: "style.color", label: "Line", catalog: "linecolor", default: color },
    { kind: "width", key: "style.width", label: "Width", catalog: "linewidth", default: 2 },
    { kind: "lineStyle", key: "style.lineStyle", label: "Line style", catalog: "linestyle", default: "solid" },
  ];
}

/** Extend left / right checkboxes, optionally with the left / right end selects. */
export function extendRows(ends: boolean): SettingsField[] {
  const out: SettingsField[] = [{ kind: "checkbox", key: "props.extendLeft", label: "Extend left line", catalog: "extendLeft", default: false }];
  if (ends) out.push({ kind: "select", key: "props.leftEnd", label: "Left end", catalog: "leftEnd", options: LINE_ENDS, default: 0 });
  out.push({ kind: "checkbox", key: "props.extendRight", label: "Extend right line", catalog: "extendRight", default: false });
  if (ends) out.push({ kind: "select", key: "props.rightEnd", label: "Right end", catalog: "rightEnd", options: LINE_ENDS, default: 0 });
  return out;
}

/** Stats block: one checkbox per stat, then Stats position and Always show stats. */
export function statsRows(keys: StatKey[], def: boolean, position: number, always: boolean): SettingsField[] {
  // The stats only render when shown (always, or while selected): the wiring test turns them on.
  const shown = (d: Drawing): Drawing => ({ ...d, props: { ...d.props, alwaysShowStats: true } });
  const withStat = (d: Drawing): Drawing => ({ ...d, props: { ...d.props, alwaysShowStats: true, showPriceRange: true } });
  return [
    { kind: "section", label: "Stats" },
    ...keys.map((k): SettingsField => ({ kind: "checkbox", key: `props.${k}`, label: STAT_LABELS[k], catalog: k, default: def, testWith: shown })),
    { kind: "section", label: "Info" },
    { kind: "select", key: "props.statsPosition", label: "Stats position", catalog: "statsPosition", options: STATS_POSITIONS, default: position, testWith: withStat },
    {
      kind: "checkbox",
      key: "props.alwaysShowStats",
      label: "Always show stats",
      catalog: "alwaysShowStats",
      default: always,
      testWith: (d) => ({ ...d, props: { ...d.props, showPriceRange: true } }),
    },
  ];
}

/** Text tab of the line tools (catalog textcolor, fontsize, bold, italic, text, aligns). */
export function lineTextRows(color: string, size: number): SettingsField[] {
  const withText = (d: Drawing): Drawing => ({ ...d, text: d.text || "Text" });
  return [
    { kind: "text", key: "text", label: "Text", catalog: "text (derived)", multiline: true, maxLength: 2000, default: "" },
    { kind: "color", key: "style.textColor", label: "Text color", catalog: "textcolor", default: color, testWith: withText },
    { kind: "fontSize", key: "style.textSize", label: "Font size", catalog: "fontsize", sizes: FONT_SIZES, default: size, testWith: withText },
    { kind: "checkbox", key: "style.bold", label: "Bold", catalog: "bold", default: false, testWith: withText },
    { kind: "checkbox", key: "style.italic", label: "Italic", catalog: "italic", default: false, testWith: withText },
    { kind: "select", key: "props.vertLabelsAlign", label: "Text alignment (vertical)", catalog: "vertLabelsAlign", options: VERT_LABELS, default: "bottom", testWith: withText },
    { kind: "select", key: "props.horzLabelsAlign", label: "Text alignment (horizontal)", catalog: "horzLabelsAlign", options: HORZ_LABELS, default: "center", testWith: withText },
  ];
}

/** Readout lines of a two-anchor line for the enabled stats (`defaults`: fallback per stat). */
export function statLines(d: Drawing, g: ToolGeom, decimals: number, def: boolean): string[] {
  const [a, b] = d.anchors;
  if (!a || !b) return [];
  const s = infoLineStats(a, b, g.toPx(a), g.toPx(b), g.intervalSec, pipSizeFor(decimals));
  const on = (k: StatKey) => prop(d, k, def) === true;
  const out: string[] = [];
  const l1: string[] = [];
  if (on("showPriceRange")) l1.push(formatSigned(s.priceChange, decimals));
  if (on("showPercentPriceRange")) l1.push(`(${formatPct(s.percentChange)})`);
  if (on("showPipsPriceRange")) l1.push(`${s.pips} pips`);
  if (l1.length) out.push(l1.join(" "));
  const l2: string[] = [];
  if (on("showBarsRange")) l2.push(`${s.bars} bars`);
  if (on("showDateTimeRange")) l2.push(formatSpan(s.seconds));
  if (l2.length) out.push(l2.join(", "));
  const l3: string[] = [];
  if (on("showDistance")) l3.push(`${Math.round(s.distancePx)} px`);
  if (on("showAngle")) l3.push(`${s.angleDeg.toFixed(1)}°`);
  if (l3.length) out.push(l3.join(", "));
  return out;
}

/** Stats box at the catalog stats position (0 left end, 1 center, 2 right end, 3 auto). */
export function drawStatsBox(c: DrawCtx, d: Drawing, p: Point, q: Point, lines: string[], posDefault: number): void {
  if (!lines.length) return;
  const [l, r] = p.x <= q.x ? [p, q] : [q, p];
  let pos = prop(d, "statsPosition", posDefault);
  if (pos === 3) pos = r.x + 160 < c.width ? 2 : l.x - 160 > 0 ? 0 : 1;
  const at = pos === 0 ? l : pos === 1 ? { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } : r;
  const align: CanvasTextAlign = pos === 0 ? "right" : pos === 1 ? "center" : "left";
  drawText(c, lines.join("\n"), at.x + (pos === 0 ? -12 : pos === 1 ? 0 : 12), at.y + 12, {
    color: c.theme.text,
    size: 12,
    align,
    baseline: "top",
    background: c.theme.boxBg,
    border: c.color,
  });
}

/** Line body with extends, arrow ends, middle point and price labels. */
export function drawLineBody(c: DrawCtx, d: Drawing, a: Anchor, b: Anchor, p: Point, q: Point): void {
  const { ctx } = c;
  const left = prop(d, "extendLeft", false);
  const right = prop(d, "extendRight", false);
  // Extend left = beyond the first anchor, extend right = beyond the second.
  line(ctx, left ? extend(q, p) : p, right ? extend(p, q) : q);
  if (prop(d, "leftEnd", 0) === 1) arrowHead(ctx, q, p, 6 + ctx.lineWidth * 2);
  if (prop(d, "rightEnd", 0) === 1) arrowHead(ctx, p, q, 6 + ctx.lineWidth * 2);
  if (prop(d, "showMiddlePoint", false)) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc((p.x + q.x) / 2, (p.y + q.y) / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (prop(d, "showPriceLabels", false)) {
    for (const [pt, an] of [
      [p, a],
      [q, b],
    ] as [Point, Anchor][]) {
      drawText(c, c.formatPrice(an.price), pt.x, pt.y - 6, { color: c.color, size: 11, align: "center", baseline: "bottom" });
    }
  }
}

/** User text along the segment at the catalog alignments. */
export function drawSegmentText(c: DrawCtx, d: Drawing, p: Point, q: Point, size: number): void {
  if (!d.text) return;
  const horz = prop(d, "horzLabelsAlign", "center");
  const vert = prop(d, "vertLabelsAlign", "bottom");
  const [l, r] = p.x <= q.x ? [p, q] : [q, p];
  const at = horz === "left" ? l : horz === "right" ? r : { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  const baseline: CanvasTextBaseline = vert === "bottom" ? "bottom" : vert === "top" ? "top" : "middle";
  drawText(c, d.text, at.x, at.y + (vert === "bottom" ? -5 : vert === "top" ? 5 : 0), {
    ...textStyleOf(d, c, size),
    align: horz === "left" ? "left" : horz === "right" ? "right" : "center",
    baseline,
  });
}

/** Rubber-band box of a segment with its extends. */
export function segmentBounds(d: Drawing, g: ToolGeom): { x: number; y: number; width: number; height: number } {
  const [a, b] = d.anchors;
  const p = g.toPx(a);
  const q = b ? g.toPx(b) : p;
  const e0 = prop(d, "extendLeft", false) ? extend(q, p, 4000) : p;
  const e1 = prop(d, "extendRight", false) ? extend(p, q, 4000) : q;
  return { x: Math.min(e0.x, e1.x), y: Math.min(e0.y, e1.y), width: Math.abs(e1.x - e0.x), height: Math.abs(e1.y - e0.y) };
}
