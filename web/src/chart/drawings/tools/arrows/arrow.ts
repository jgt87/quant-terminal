// Arrow (catalog LineToolArrow): a trend-line-like segment with an arrow head at the end by
// default, optional extensions, middle point, price labels, stats readout and text.

import { arrowLineDistance, type Anchor, type Drawing, type Point } from "@qt/core";
import { formatPct, formatSigned } from "../../../format";
import { arrowHead, drawText, extend, line, prop, textStyleOf } from "../../draw";
import type { DrawCtx, DrawingToolDef, SettingsField, ToolGeom } from "../../types";
import { applyStroke, both, F, header, HORZ_ALIGN, LINE_END, VERT_ALIGN, withProps, withText } from "../shapes/kit";

const STATS = [
  ["showPriceRange", "Price range"],
  ["showPercentPriceRange", "Percent change"],
  ["showPipsPriceRange", "Change in pips"],
  ["showBarsRange", "Bars range"],
  ["showDateTimeRange", "Date/time range"],
  ["showDistance", "Distance"],
  ["showAngle", "Angle"],
] as const;

const statsVisible = withProps({ alwaysShowStats: true });
const oneStat = withProps({ showPriceRange: true });

/** Stats readout lines of the arrow (enabled parts only). */
export function arrowStats(d: Drawing, g: Pick<ToolGeom, "toPx" | "intervalSec">, decimals: number): string[] {
  const [a, b] = d.anchors;
  if (!a || !b) return [];
  const p = g.toPx(a);
  const q = g.toPx(b);
  const dp = b.price - a.price;
  const out: string[] = [];
  const first: string[] = [];
  if (prop(d, "showPriceRange", false)) first.push(formatSigned(dp, decimals));
  if (prop(d, "showPercentPriceRange", false)) first.push(`(${formatPct(a.price ? (dp / Math.abs(a.price)) * 100 : 0)})`);
  if (prop(d, "showPipsPriceRange", false)) first.push(`${Math.round(dp * 10 ** Math.max(0, decimals - 1))} pips`);
  if (first.length) out.push(first.join(" "));
  const second: string[] = [];
  if (prop(d, "showBarsRange", false)) second.push(`${g.intervalSec > 0 ? Math.round((b.time - a.time) / g.intervalSec) : 0} bars`);
  if (prop(d, "showDateTimeRange", false)) {
    const sec = Math.abs(b.time - a.time);
    second.push(sec >= 86400 ? `${Math.round(sec / 86400)}d` : `${(sec / 3600).toFixed(1)}h`);
  }
  if (second.length) out.push(second.join(", "));
  const third: string[] = [];
  if (prop(d, "showDistance", false)) third.push(`${Math.round(Math.hypot(q.x - p.x, q.y - p.y))} px`);
  if (prop(d, "showAngle", false)) third.push(`${Math.round((Math.atan2(p.y - q.y, q.x - p.x) * 180) / Math.PI)}°`);
  if (third.length) out.push(third.join(", "));
  return out;
}

const style: SettingsField[] = [
  F.color("style.color", "Line", "linecolor", "#2962ff"),
  F.width("style.width", "Width", "linewidth", 2),
  F.lineStyle("style.lineStyle", "Line style", "linestyle", "solid"),
  F.check("props.extendLeft", "Extend left line", "extendLeft", false),
  F.select("props.leftEnd", "Left end", "leftEnd", LINE_END, 0),
  F.check("props.extendRight", "Extend right line", "extendRight", false),
  F.select("props.rightEnd", "Right end", "rightEnd", LINE_END, 1),
  F.check("props.showMiddlePoint", "Middle point", "showMiddlePoint", false),
  F.check("props.showPriceLabels", "Price labels", "showPriceLabels", false),
  header("Stats"),
  ...STATS.map(([k, label]) => F.check(`props.${k}`, label, k, false, { testWith: statsVisible })),
  header("Info"),
  F.select(
    "props.statsPosition",
    "Stats position",
    "statsPosition",
    [
      { value: 0, label: "Left" },
      { value: 1, label: "Center" },
      { value: 2, label: "Right" },
      { value: 3, label: "Auto" },
    ],
    2,
    { testWith: both(statsVisible, oneStat) },
  ),
  F.check("props.alwaysShowStats", "Always show stats", "alwaysShowStats", false, { testWith: oneStat }),
];

const text: SettingsField[] = [
  F.text("Text"),
  F.color("style.textColor", "Text color", "textcolor", "#2962ff", { testWith: withText }),
  F.font("style.textSize", "Font size", "fontsize", 14, { testWith: withText }),
  F.check("style.bold", "Bold", "bold", false, { testWith: withText }),
  F.check("style.italic", "Italic", "italic", false, { testWith: withText }),
  F.select("props.vertLabelsAlign", "Text alignment (vertical)", "vertLabelsAlign", VERT_ALIGN, "bottom", { testWith: withText }),
  F.select("props.horzLabelsAlign", "Text alignment (horizontal)", "horzLabelsAlign", HORZ_ALIGN, "center", { testWith: withText }),
];

function drawStats(c: DrawCtx, d: Drawing, p: Point, q: Point): void {
  const lines = arrowStats(d, c, c.priceDecimals);
  if (!lines.length) return;
  let pos = prop(d, "statsPosition", 2);
  if (pos === 3) pos = q.x >= p.x ? 2 : 0;
  const at = pos === 0 ? p : pos === 1 ? { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } : q;
  drawText(c, lines.join("\n"), at.x + (pos === 0 ? -10 : pos === 1 ? 0 : 10), at.y + 10, {
    color: c.theme.text,
    size: 12,
    align: pos === 0 ? "right" : pos === 1 ? "center" : "left",
    baseline: "top",
    background: c.theme.boxBg,
    border: c.color,
  });
}

function drawLabel(c: DrawCtx, d: Drawing, p: Point, q: Point): void {
  if (!d.text) return;
  const horz = prop(d, "horzLabelsAlign", "center");
  const vert = prop(d, "vertLabelsAlign", "bottom");
  const at = horz === "left" ? p : horz === "right" ? q : { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  drawText(c, d.text, at.x, at.y + (vert === "bottom" ? -4 : vert === "top" ? 4 : 0), {
    ...textStyleOf(d, c, 14),
    align: horz === "left" ? "left" : horz === "right" ? "right" : "center",
    baseline: vert === "bottom" ? "bottom" : vert === "top" ? "top" : "middle",
  });
}

export const arrow: DrawingToolDef = {
  type: "arrow",
  catalogType: "LineToolArrow",
  family: "arrows",
  label: "Arrow",
  icon: "arrowLine",
  iconPath: "M5.5 22.5L20.5 7.5",
  iconFill: "M23.5 4.5l-2.1 8.2-6.1-6.1z",
  anchors: 2,
  alert: "line",
  defaults: { width: 2, lineStyle: "solid", color: "#2962ff", textColor: "#2962ff", textSize: 14, bold: false, italic: false },
  defaultProps: {
    extendLeft: false,
    leftEnd: 0,
    extendRight: false,
    rightEnd: 1,
    showMiddlePoint: false,
    showPriceLabels: false,
    ...Object.fromEntries(STATS.map(([k]) => [k, false])),
    statsPosition: 2,
    alwaysShowStats: false,
    vertLabelsAlign: "bottom",
    horzLabelsAlign: "center",
  },
  floatingToolbar: ["templates", "line-tool-color", "text-color", "line-tool-width", "style", "settings", "add-alert", "lock", "remove", "more"],
  settings: { coordinates: "time-price", style, text },
  hitTest(d, g, x, y, tol) {
    const [a, b] = d.anchors;
    if (!a || !b) return false;
    return arrowLineDistance(x, y, g.toPx(a), g.toPx(b), prop(d, "extendLeft", false), prop(d, "extendRight", false)) <= tol;
  },
  render(c, d) {
    const [a, b] = d.anchors;
    if (!a || !b) return;
    const { ctx } = c;
    applyStroke(c, d);
    const p = c.toPx(a);
    const q = c.toPx(b);
    line(ctx, prop(d, "extendLeft", false) ? extend(q, p) : p, prop(d, "extendRight", false) ? extend(p, q) : q);
    const head = 6 + ctx.lineWidth * 2;
    if (prop(d, "leftEnd", 0) === 1) arrowHead(ctx, q, p, head);
    if (prop(d, "rightEnd", 1) === 1) arrowHead(ctx, p, q, head);
    if (prop(d, "showMiddlePoint", false)) {
      ctx.save();
      ctx.setLineDash([]);
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc((p.x + q.x) / 2, (p.y + q.y) / 2, 3, 0, Math.PI * 2);
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
    if (c.selected || c.hovered || prop(d, "alwaysShowStats", false)) drawStats(c, d, p, q);
    drawLabel(c, d, p, q);
  },
  handles: (d, g) => d.anchors.map((x) => g.toPx(x)),
  bounds(d, g) {
    const [a, b] = d.anchors;
    const p = g.toPx(a);
    const q = b ? g.toPx(b) : p;
    const e0 = prop(d, "extendLeft", false) ? extend(q, p, 4000) : p;
    const e1 = prop(d, "extendRight", false) ? extend(p, q, 4000) : q;
    return { x: Math.min(e0.x, e1.x), y: Math.min(e0.y, e1.y), width: Math.abs(e1.x - e0.x), height: Math.abs(e1.y - e0.y) };
  },
  stats: (d, g) => arrowStats(d, g, 2),
};
