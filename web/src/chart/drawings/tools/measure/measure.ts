// Measure (toolbar bottom button): shaded box between two anchors with guides and a readout (price
// change, percent, pips, bars, time span, volume), optional border, label colors/background,
// custom text — the same fields as the catalog's date and price range (the registered
// "dateAndPriceRange" tool implements that catalog entry). Old drawings (no props) keep the
// original two-line readout.

import { hitTestBody, measureStats, type Drawing } from "@qt/core";
import { formatCompact, formatPct, formatSigned } from "../../../format";
import { font } from "../../../theme";
import { anchorHandles, drawText, fillColor, line, prop, statsBox } from "../../draw";
import { FONT_SIZES } from "../../schema";
import type { DrawCtx, DrawingToolDef, SettingsField } from "../../types";

const own = (t: { drawing: string }, d: Drawing) => d.style?.color ?? t.drawing;
const STATS: [string, string, boolean][] = [
  ["showPriceRange", "Price range", true],
  ["showPercentPriceRange", "Percent change", true],
  ["showPipsPriceRange", "Change in pips", false],
  ["showBarsRange", "Bars range", true],
  ["showDateTimeRange", "Date/time range", true],
  ["showVolume", "Volume", false],
];

const style: SettingsField[] = [
  { kind: "color", key: "style.color", label: "Line", catalog: "linecolor", default: (t: { drawing: string }) => t.drawing },
  { kind: "width", key: "style.width", label: "Line width", catalog: "linewidth", default: 1 },
  { kind: "checkbox", key: "props.drawBorder", label: "Border", catalog: "drawBorder", default: false },
  { kind: "color", key: "props.borderColor", label: "Border color", catalog: "borderColor", default: own, testWith: (d) => ({ ...d, props: { ...d.props, drawBorder: true } }) },
  { kind: "width", key: "props.borderWidth", label: "Border width", catalog: "borderWidth", default: 1, testWith: (d) => ({ ...d, props: { ...d.props, drawBorder: true } }) },
  { kind: "checkbox", key: "props.fillBackground", label: "Background", catalog: "fillBackground", default: true },
  { kind: "color", key: "style.fillColor", label: "Background color", catalog: "backgroundColor", default: own },
  { kind: "section", label: "Stats" },
  ...STATS.map(([k, label, def]): SettingsField => ({ kind: "checkbox", key: `props.${k}`, label, catalog: k, default: def })),
  { kind: "section", label: "Label" },
  { kind: "color", key: "props.labelTextColor", label: "Label color", catalog: "textcolor", default: (t: { text: string }) => t.text },
  { kind: "fontSize", key: "props.labelFontSize", label: "Label font size", catalog: "fontsize", sizes: FONT_SIZES, default: 11 },
  { kind: "checkbox", key: "props.fillLabelBackground", label: "Label background", catalog: "fillLabelBackground", default: true },
  { kind: "color", key: "props.labelBackgroundColor", label: "Label background color", catalog: "labelBackgroundColor", default: (t: { boxBg: string }) => t.boxBg },
];

const text: SettingsField[] = [
  { kind: "text", key: "text", label: "Text", catalog: "customText.text (derived)", multiline: true, maxLength: 2000, default: "" },
  { kind: "color", key: "props.customTextColor", label: "Text color", catalog: "customText.color", default: own },
  { kind: "fontSize", key: "props.customTextSize", label: "Font size", catalog: "customText.fontsize", sizes: FONT_SIZES, default: 12 },
  { kind: "checkbox", key: "props.customTextBold", label: "Bold", catalog: "customText.bold", default: false },
  { kind: "checkbox", key: "props.customTextItalic", label: "Italic", catalog: "customText.italic", default: false },
];

/** Readout lines from the enabled stats (old drawings: the original two lines). */
function readout(d: Drawing, c: { intervalSec: number; bars: readonly { time: number; volume: number }[] }, decimals: number): string[] {
  const [a, b] = d.anchors;
  if (!a || !b) return [];
  const st = measureStats(a, b, c.intervalSec);
  const days = Math.abs(st.durationSeconds) / 86400;
  const span = days >= 1 ? `${days.toFixed(days >= 10 ? 0 : 1)}d` : `${(Math.abs(st.durationSeconds) / 3600).toFixed(1)}h`;
  const on = (k: string, def: boolean) => prop(d, k, def);
  const first = [
    on("showPriceRange", true) ? formatSigned(st.priceChange, decimals) : "",
    on("showPercentPriceRange", true) ? `(${formatPct(st.percentChange)})` : "",
    on("showPipsPriceRange", false) ? `${Math.round(st.priceChange * 10 ** Math.max(0, decimals - 1))} pips` : "",
  ].filter(Boolean);
  const second = [on("showBarsRange", true) ? `${st.bars} bars` : "", on("showDateTimeRange", true) ? span : ""].filter(Boolean);
  const out = [first.join("  "), second.join(", ")].filter(Boolean);
  if (on("showVolume", false)) {
    const t0 = Math.min(a.time, b.time);
    const t1 = Math.max(a.time, b.time);
    const vol = c.bars.filter((x) => x.time >= t0 && x.time <= t1).reduce((s, x) => s + x.volume, 0);
    out.push(`Vol ${formatCompact(vol)}`);
  }
  return out;
}

function label(c: DrawCtx, d: Drawing, lines: string[], cx: number, yTop: number, yBottom: number, below: boolean): void {
  const legacy = d.props?.labelTextColor === undefined && d.props?.labelFontSize === undefined && d.props?.fillLabelBackground === undefined && d.props?.labelBackgroundColor === undefined;
  if (legacy) return statsBox(c, lines, cx, yTop, yBottom, below, c.color, c.theme);
  const { ctx } = c;
  const size = prop(d, "labelFontSize", 11);
  ctx.font = font(c.theme, size, 500);
  const h = 8 + lines.length * Math.round(size * 1.3);
  drawText(c, lines.join("\n"), cx, below ? yBottom + 6 : yTop - 6 - h + 4, {
    color: prop(d, "labelTextColor", c.theme.text),
    size,
    align: "center",
    baseline: "top",
    background: prop(d, "fillLabelBackground", true) ? prop(d, "labelBackgroundColor", c.theme.boxBg) : undefined,
  });
}

export const measure: DrawingToolDef = {
  type: "measure",
  family: "measure",
  label: "Measure",
  icon: "measure",
  anchors: 2,
  defaults: { color: "#2962ff", width: 2, fillColor: "#2962ff26" },
  defaultProps: {
    drawBorder: false,
    borderWidth: 1,
    borderColor: "#2962ff",
    fillBackground: true,
    ...Object.fromEntries(STATS.map(([k]) => [k, true])),
    labelTextColor: "#ffffff",
    labelFontSize: 12,
    fillLabelBackground: true,
    labelBackgroundColor: "#2e2e2e",
    customTextColor: "#2962ff",
    customTextSize: 12,
    customTextBold: false,
    customTextItalic: false,
  },
  settings: { style, text },
  floatingToolbar: ["templates", "line-tool-color", "background-color", "text-color", "line-tool-width", "settings", "lock", "remove", "more"],
  floatBindings: { "text-color": "props.labelTextColor" },
  hitTest: (d, g, x, y, tol) => hitTestBody(d, g.toPx, x, y, tol, g.viewport),
  stats: (d, g) => readout(d, g, 2),
  render(c, d) {
    const { ctx } = c;
    const [a, b] = d.anchors;
    if (!a || !b) return;
    const pa = c.toPx(a);
    const pb = c.toPx(b);
    const x = Math.min(pa.x, pb.x);
    const y = Math.min(pa.y, pb.y);
    const w = Math.abs(pb.x - pa.x);
    const h = Math.abs(pb.y - pa.y);
    if (prop(d, "fillBackground", true)) {
      ctx.fillStyle = fillColor(d, c.color);
      ctx.fillRect(x, y, w, h);
    }
    if (prop(d, "drawBorder", false)) {
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = prop(d, "borderColor", c.color);
      ctx.lineWidth = prop(d, "borderWidth", 1);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }
    const mx = (pa.x + pb.x) / 2;
    const my = (pa.y + pb.y) / 2;
    ctx.setLineDash([3, 3]);
    line(ctx, { x: mx, y: pa.y }, { x: mx, y: pb.y });
    line(ctx, { x: pa.x, y: my }, { x: pb.x, y: my });
    ctx.setLineDash([]);
    label(c, d, readout(d, c, c.priceDecimals), mx, y, y + h, pb.y >= pa.y);
    if (d.text) {
      drawText(c, d.text, mx, pb.y >= pa.y ? y - 6 : y + h + 6, {
        color: prop(d, "customTextColor", c.color),
        size: prop(d, "customTextSize", 12),
        bold: prop(d, "customTextBold", false),
        italic: prop(d, "customTextItalic", false),
        align: "center",
        baseline: pb.y >= pa.y ? "bottom" : "top",
      });
    }
  },
  handles: anchorHandles,
};
