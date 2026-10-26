// Shared definition of the two-anchor line tools (Trend line, Ray, Extended line): catalog fields
// (line color/width/style, extend left/right, line ends, middle point, price labels, stats,
// text), rendering and hit-testing. Each tool only differs in its extend defaults.

import { distanceToLine, distanceToRay, distanceToSegment, type Anchor, type Drawing } from "@qt/core";
import { formatPct, formatSigned } from "../../../format";
import { FONT_SIZES } from "../../schema";
import { arrowHead, drawText, extend, line, prop, textStyleOf } from "../../draw";
import type { DrawCtx, DrawingToolDef, FloatButton, SettingsField, ToolGeom } from "../../types";

const themeLine = (t: { drawing: string }) => t.drawing;
const ownLine = (t: { drawing: string }, d: Drawing) => d.style?.color ?? t.drawing;

export const STAT_KEYS = ["showPriceRange", "showPercentPriceRange", "showPipsPriceRange", "showBarsRange", "showDateTimeRange", "showDistance", "showAngle"] as const;
const STAT_LABELS: Record<(typeof STAT_KEYS)[number], string> = {
  showPriceRange: "Price range",
  showPercentPriceRange: "Percent change",
  showPipsPriceRange: "Change in pips",
  showBarsRange: "Bars range",
  showDateTimeRange: "Date/time range",
  showDistance: "Distance",
  showAngle: "Angle",
};

/** Vertical text alignment choices (stored value → label; values follow the catalog). */
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

const withStat = (d: Drawing): Drawing => ({ ...d, props: { ...d.props, showPriceRange: true } });

/** Text tab shared by the line tools (catalog keys textcolor, fontsize, bold, italic, text, aligns). */
export function lineTextFields(o: { size: number; vert: string; horz?: string }): SettingsField[] {
  return [
    { kind: "text", key: "text", label: "Text", catalog: "text (derived)", multiline: true, maxLength: 2000, default: "" },
    { kind: "color", key: "style.textColor", label: "Text color", catalog: "textcolor", default: ownLine },
    { kind: "fontSize", key: "style.textSize", label: "Font size", catalog: "fontsize", sizes: FONT_SIZES, default: o.size },
    { kind: "checkbox", key: "style.bold", label: "Bold", catalog: "bold", default: false },
    { kind: "checkbox", key: "style.italic", label: "Italic", catalog: "italic", default: false },
    { kind: "select", key: "props.vertLabelsAlign", label: "Text alignment (vertical)", catalog: "vertLabelsAlign", options: VERT_ALIGN, default: o.vert },
    { kind: "select", key: "props.horzLabelsAlign", label: "Text alignment (horizontal)", catalog: "horzLabelsAlign", options: HORZ_ALIGN, default: o.horz ?? "center" },
  ];
}

/** Line color / width / style (catalog linecolor, linewidth, linestyle). */
export function lineFields(colorLabel = "Line"): SettingsField[] {
  return [
    { kind: "color", key: "style.color", label: colorLabel, catalog: "linecolor", default: themeLine },
    { kind: "width", key: "style.width", label: "Width", catalog: "linewidth", default: 1 },
    { kind: "lineStyle", key: "style.lineStyle", label: "Line style", catalog: "linestyle", default: "solid" },
  ];
}

function styleTab(extendLeft: boolean, extendRight: boolean): SettingsField[] {
  return [
    ...lineFields(),
    { kind: "checkbox", key: "props.extendLeft", label: "Extend left line", catalog: "extendLeft", default: extendLeft },
    { kind: "select", key: "props.leftEnd", label: "Left end", catalog: "leftEnd", options: [{ value: 0, label: "Normal" }, { value: 1, label: "Arrow" }], default: 0 },
    { kind: "checkbox", key: "props.extendRight", label: "Extend right line", catalog: "extendRight", default: extendRight },
    { kind: "select", key: "props.rightEnd", label: "Right end", catalog: "rightEnd", options: [{ value: 0, label: "Normal" }, { value: 1, label: "Arrow" }], default: 0 },
    { kind: "checkbox", key: "props.showMiddlePoint", label: "Middle point", catalog: "showMiddlePoint", default: false },
    { kind: "checkbox", key: "props.showPriceLabels", label: "Price labels", catalog: "showPriceLabels", default: false },
    { kind: "section", label: "Stats" },
    ...STAT_KEYS.map((k): SettingsField => ({ kind: "checkbox", key: `props.${k}`, label: STAT_LABELS[k], catalog: k, default: false })),
    {
      kind: "select",
      key: "props.statsPosition",
      label: "Stats position",
      catalog: "statsPosition",
      options: [
        { value: 0, label: "Left" },
        { value: 1, label: "Center" },
        { value: 2, label: "Right" },
        { value: 3, label: "Auto" },
      ],
      default: 2,
      testWith: withStat,
    },
    { kind: "checkbox", key: "props.alwaysShowStats", label: "Always show stats", catalog: "alwaysShowStats", default: false, testWith: withStat },
  ];
}

/** Readout of a two-anchor line: the enabled stat parts. */
export function lineStats(d: Drawing, g: ToolGeom, decimals: number): string[] {
  const [a, b] = d.anchors;
  if (!a || !b) return [];
  const p = g.toPx(a);
  const q = g.toPx(b);
  const dp = b.price - a.price;
  const parts: string[] = [];
  const first: string[] = [];
  if (prop(d, "showPriceRange", false)) first.push(formatSigned(dp, decimals));
  if (prop(d, "showPercentPriceRange", false)) first.push(`(${formatPct(a.price ? (dp / Math.abs(a.price)) * 100 : 0)})`);
  if (prop(d, "showPipsPriceRange", false)) first.push(`${Math.round(dp * 10 ** Math.max(0, decimals - 1))} pips`);
  if (first.length) parts.push(first.join(" "));
  const second: string[] = [];
  const bars = g.intervalSec > 0 ? Math.round((b.time - a.time) / g.intervalSec) : 0;
  if (prop(d, "showBarsRange", false)) second.push(`${bars} bars`);
  if (prop(d, "showDateTimeRange", false)) {
    const sec = Math.abs(b.time - a.time);
    second.push(sec >= 86400 ? `${Math.round(sec / 86400)}d` : `${(sec / 3600).toFixed(1)}h`);
  }
  if (second.length) parts.push(second.join(", "));
  const third: string[] = [];
  if (prop(d, "showDistance", false)) third.push(`${Math.round(Math.hypot(q.x - p.x, q.y - p.y))} px`);
  if (prop(d, "showAngle", false)) third.push(`${Math.round((Math.atan2(p.y - q.y, q.x - p.x) * 180) / Math.PI)}°`);
  if (third.length) parts.push(third.join(", "));
  return parts;
}

/** Draws a stats readout box next to the line. */
function drawStats(c: DrawCtx, d: Drawing, p: { x: number; y: number }, q: { x: number; y: number }): void {
  const lines = lineStats(d, c, c.priceDecimals);
  if (!lines.length) return;
  const pos = prop(d, "statsPosition", 2);
  const anchor = pos === 0 ? p : pos === 1 ? { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } : q;
  const align: CanvasTextAlign = pos === 0 ? "right" : pos === 1 ? "center" : "left";
  drawText(c, lines.join("\n"), anchor.x + (pos === 0 ? -10 : pos === 1 ? 0 : 10), anchor.y + 10, {
    color: c.theme.text,
    size: 12,
    align,
    baseline: "top",
    background: c.theme.boxBg,
    border: c.color,
  });
}

/** Draws text along a segment (alignment props) — shared by the line tools. */
export function drawLineText(c: DrawCtx, d: Drawing, p: { x: number; y: number }, q: { x: number; y: number }, sizeFallback = 14): void {
  if (!d.text) return;
  const horz = prop(d, "horzLabelsAlign", "center");
  const vert = prop(d, "vertLabelsAlign", "bottom");
  const at = horz === "left" ? p : horz === "right" ? q : { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  const base: CanvasTextBaseline = vert === "bottom" ? "bottom" : vert === "top" ? "top" : "middle";
  drawText(c, d.text, at.x, at.y + (vert === "bottom" ? -4 : vert === "top" ? 4 : 0), {
    ...textStyleOf(d, c, sizeFallback),
    align: horz === "left" ? "left" : horz === "right" ? "right" : "center",
    baseline: base,
  });
}

/** Builds Trend line / Ray / Extended line. */
export function makeLineTool(o: {
  type: string;
  catalogType: string;
  label: string;
  menuName: string;
  icon: string;
  hotkey?: string;
  extendLeft: boolean;
  extendRight: boolean;
}): DrawingToolDef {
  const floatingToolbar: FloatButton[] = ["templates", "line-tool-color", "text-color", "line-tool-width", "style", "settings", "add-alert", "lock", "remove", "more"];
  const ext = (d: Drawing) => ({ left: prop(d, "extendLeft", o.extendLeft), right: prop(d, "extendRight", o.extendRight) });
  return {
    type: o.type,
    catalogType: o.catalogType,
    family: "lines",
    label: o.label,
    menuName: o.menuName,
    icon: o.icon,
    anchors: 2,
    hotkey: o.hotkey,
    defaults: { color: "#2962ff", width: 2, lineStyle: "solid", textColor: "#2962ff", textSize: 14, bold: false, italic: false },
    defaultProps: {
      extendLeft: o.extendLeft,
      extendRight: o.extendRight,
      leftEnd: 0,
      rightEnd: 0,
      showMiddlePoint: false,
      showPriceLabels: false,
      ...Object.fromEntries(STAT_KEYS.map((k) => [k, false])),
      statsPosition: 2,
      alwaysShowStats: false,
      vertLabelsAlign: "bottom",
      horzLabelsAlign: "center",
    },
    settings: { style: styleTab(o.extendLeft, o.extendRight), text: lineTextFields({ size: 14, vert: "bottom" }) },
    alert: "line",
    floatingToolbar,
    hitTest(d, g, x, y, tol) {
      const [a, b] = d.anchors;
      if (!a || !b) return false;
      const p = g.toPx(a);
      const q = g.toPx(b);
      const { left, right } = ext(d);
      if (left && right) return distanceToLine(x, y, p.x, p.y, q.x, q.y) <= tol;
      if (right) return distanceToRay(x, y, p.x, p.y, q.x, q.y) <= tol;
      if (left) return distanceToRay(x, y, q.x, q.y, p.x, p.y) <= tol;
      return distanceToSegment(x, y, p.x, p.y, q.x, q.y) <= tol;
    },
    render(c, d) {
      const [a, b] = d.anchors;
      if (!a || !b) return;
      const { ctx } = c;
      const p = c.toPx(a);
      const q = c.toPx(b);
      const { left, right } = ext(d);
      line(ctx, left ? extend(q, p) : p, right ? extend(p, q) : q);
      if (prop(d, "leftEnd", 0) === 1) arrowHead(ctx, q, p, 6 + ctx.lineWidth * 2);
      if (prop(d, "rightEnd", 0) === 1) arrowHead(ctx, p, q, 6 + ctx.lineWidth * 2);
      if (prop(d, "showMiddlePoint", false)) {
        ctx.save();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc((p.x + q.x) / 2, (p.y + q.y) / 2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (prop(d, "showPriceLabels", false)) {
        for (const [pt, an] of [
          [p, a],
          [q, b],
        ] as [{ x: number; y: number }, Anchor][]) {
          drawText(c, c.formatPrice(an.price), pt.x, pt.y - 6, { color: c.color, size: 11, align: "center", baseline: "bottom" });
        }
      }
      if (c.selected || c.hovered || prop(d, "alwaysShowStats", false)) drawStats(c, d, p, q);
      drawLineText(c, d, p, q);
    },
    handles: (d, g) => d.anchors.map((x) => g.toPx(x)),
    bounds(d, g) {
      const [a, b] = d.anchors;
      const p = g.toPx(a);
      const q = b ? g.toPx(b) : p;
      const { left, right } = ext(d);
      const e0 = left ? extend(q, p, 4000) : p;
      const e1 = right ? extend(p, q, 4000) : q;
      return { x: Math.min(e0.x, e1.x), y: Math.min(e0.y, e1.y), width: Math.abs(e1.x - e0.x), height: Math.abs(e1.y - e0.y) };
    },
    stats: (d, g) => lineStats(d, g, 2),
  };
}
