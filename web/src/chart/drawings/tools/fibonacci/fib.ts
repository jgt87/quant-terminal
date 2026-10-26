// Fib retracement (catalog LineToolFibRetracement): level lines between the anchors' x-range
// (ratio 0 at the second anchor), filled bands between neighbouring levels, labels with ratio /
// percent and price, a dashed trend line a→b, extend, reverse, log-scale levels and a text.
// Old drawings (no props) keep the original look: labels "ratio  price" left of the levels,
// 7 default levels, 0.12 band opacity, a [3,3]-dashed diagonal in the line color.

import { FIB_RATIOS, fibLevels, hitTestBody, type Anchor, type Drawing, type FibLevel } from "@qt/core";
import { crisp } from "../../../canvas";
import { font, withAlpha, type ChartTheme } from "../../../theme";
import { levelTable } from "../../builders";
import { anchorHandles, drawText, line, prop, strokeWith } from "../../draw";
import type { DrawingToolDef, FloatBinding, LevelRow, SettingsField } from "../../types";
import { HORZ_ALIGN, VERT_ALIGN } from "../lines/lineTool";

/** Effective fib levels with colors: the drawing's own list, else the 7 legacy defaults on the fib palette. */
export function fibLevelStyles(d: Drawing, theme: ChartTheme): { ratio: number; color: string; visible: boolean }[] {
  const own = d.style?.levels;
  if (own?.length) return own.map((l, i) => ({ ratio: l.ratio, color: l.color ?? theme.fibPalette[i % theme.fibPalette.length], visible: l.visible !== false }));
  return FIB_RATIOS.map((ratio, i) => ({ ratio, color: theme.fibPalette[i % theme.fibPalette.length], visible: true }));
}

const COEFFS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236, 1.272, 1.414, 2.272, 2.414, 2, 3, 3.272, 3.414, 4, 4.272, 4.414, 4.618, 4.764];
const COLORS = ["#808080", "#f23645", "#ff9800", "#4caf50", "#089981", "#00bcd4", "#808080", "#2962ff", "#f23645", "#9c27b0", "#e91e63", "#ff9800", "#f23645", "#ff9800", "#4caf50", "#089981", "#00bcd4", "#808080", "#2962ff", "#f23645", "#9c27b0", "#e91e63", "#ff9800", "#089981"];

/** Factory level rows (catalog level1..level24; the first 11 visible). */
export const fibFactoryRows = (): LevelRow[] => COEFFS.map((ratio, i) => ({ ratio, color: COLORS[i], visible: i < 11 }));

/** Rows the settings window shows for a drawing without levels (the legacy 7). */
export const fibDefaultRows = (theme: ChartTheme): LevelRow[] =>
  FIB_RATIOS.map((ratio, i) => ({ ratio, color: theme.fibPalette[i % theme.fibPalette.length], visible: true }));

const own = (t: ChartTheme, d: Drawing) => d.style?.color ?? t.drawing;
const sel = (key: string, label: string, catalog: string, options: { value: string | number | boolean; label: string }[], def: unknown): SettingsField => ({
  kind: "select",
  key: `props.${key}`,
  label,
  catalog,
  options,
  default: def,
});
const chk = (key: string, label: string, catalog: string, def: boolean, testWith?: (d: Drawing) => Drawing): SettingsField => ({ kind: "checkbox", key: `props.${key}`, label, catalog, default: def, testWith });

const style: SettingsField[] = [
  chk("trendlineVisible", "Trend line", "trendline.visible", true),
  { kind: "color", key: "props.trendlineColor", label: "Trend line color", catalog: "trendline.color", default: own },
  { kind: "width", key: "props.trendlineWidth", label: "Trend line width", catalog: "trendline.linewidth", default: (_t: ChartTheme, d: Drawing) => d.style?.width ?? 1 },
  { kind: "lineStyle", key: "props.trendlineStyle", label: "Trend line style", catalog: "trendline.linestyle", default: "dashed" },
  { kind: "width", key: "props.levelsLineWidth", label: "Levels line width", catalog: "levelsStyle.linewidth", default: (_t: ChartTheme, d: Drawing) => d.style?.width ?? 1 },
  { kind: "lineStyle", key: "props.levelsLineStyle", label: "Levels line style", catalog: "levelsStyle.linestyle", default: (_t: ChartTheme, d: Drawing) => d.style?.lineStyle ?? "solid" },
  chk("extendLinesLeft", "Extend lines left", "extendLinesLeft", false),
  chk("extendLines", "Extend lines right", "extendLines", false),
  { kind: "section", label: "Levels" },
  levelTable(fibDefaultRows, { catalogPrefix: "level", valueLabel: "Ratio" }),
  { kind: "color", key: "props.linesColors", label: "Use one color", catalog: "linesColors (derived)", default: undefined },
  chk("fillBackground", "Background", "fillBackground", true),
  { kind: "number", key: "props.transparency", label: "Background transparency", catalog: "transparency", min: 0, max: 100, step: 1, default: (_t: ChartTheme, d: Drawing) => Math.round(100 - (d.style?.fillOpacity ?? 0.12) * 100) },
  chk("reverse", "Reverse", "reverse", false),
  chk("showPrices", "Prices", "showPrices", true),
  chk("showCoeffs", "Levels", "showCoeffs", true),
  sel("coeffsAsPercents", "Levels as", "coeffsAsPercents", [{ value: false, label: "Values" }, { value: true, label: "Percents" }], false),
  sel("horzLabelsAlign", "Labels horizontal", "horzLabelsAlign", HORZ_ALIGN, "left"),
  sel("vertLabelsAlign", "Labels vertical", "vertLabelsAlign", VERT_ALIGN, "middle"),
  sel("labelFontSize", "Labels font size", "labelFontSize", [8, 10, 11, 12, 14, 16, 18, 20, 22, 24].map((n) => ({ value: n, label: String(n) })), 10),
  chk("showText", "Text", "showText", true),
  sel("horzTextAlign", "Text horizontal", "horzTextAlign", HORZ_ALIGN, "center"),
  sel("vertTextAlign", "Text vertical", "vertTextAlign", VERT_ALIGN, "middle"),
  chk("fibLevelsBasedOnLogScale", "Fib levels based on log scale", "fibLevelsBasedOnLogScale", false),
  { kind: "text", key: "text", label: "Text", multiline: true, maxLength: 2000, default: "" },
];

/** Line color button: one color for every level ("Use one color"). */
const oneColor: FloatBinding = {
  get: (d, theme) => (d.props?.linesColors as string | undefined) ?? d.style?.color ?? theme.drawing,
  set: (d, v) => ({ ...d, props: { ...d.props, linesColors: v } }),
};

/** Level prices: linear between the anchors, or in log space. */
function levelPrices(a: Anchor, b: Anchor, ratios: number[], log: boolean): { ratio: number; price: number }[] {
  if (!log || a.price <= 0 || b.price <= 0) return fibLevels(a, b, ratios);
  const la = Math.log(a.price);
  const lb = Math.log(b.price);
  return ratios.map((ratio) => ({ ratio, price: Math.exp(lb + (la - lb) * ratio) }));
}

export const fib: DrawingToolDef = {
  type: "fib",
  catalogType: "LineToolFibRetracement",
  family: "fibonacci",
  label: "Fib retracement",
  menuName: "Fib retracement",
  icon: "fib",
  anchors: 2,
  hotkey: "Alt+F",
  defaults: { color: "#808080", width: 2, lineStyle: "solid", levels: fibFactoryRows() },
  defaultProps: {
    trendlineVisible: true,
    trendlineColor: "#808080",
    trendlineWidth: 2,
    trendlineStyle: "dashed",
    levelsLineWidth: 2,
    levelsLineStyle: "solid",
    extendLinesLeft: false,
    extendLines: false,
    fillBackground: true,
    transparency: 80,
    reverse: false,
    showPrices: true,
    showCoeffs: true,
    coeffsAsPercents: false,
    horzLabelsAlign: "left",
    vertLabelsAlign: "middle",
    labelFontSize: 12,
    showText: true,
    horzTextAlign: "center",
    vertTextAlign: "middle",
    fibLevelsBasedOnLogScale: false,
  },
  settings: { style },
  alert: "line",
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "add-alert", "lock", "remove", "more"],
  floatBindings: { "line-tool-color": oneColor, "line-tool-width": "props.levelsLineWidth" },
  hitTest: (d, g, x, y, tol) => hitTestBody(d, g.toPx, x, y, tol, g.viewport),
  render(c, d) {
    const { ctx, theme, dpr } = c;
    let [a, b] = d.anchors;
    if (!a || !b) return;
    const pa = c.toPx(a);
    const pb = c.toPx(b);
    if (prop(d, "reverse", false)) [a, b] = [b, a];
    let x0 = Math.min(pa.x, pb.x);
    let x1 = Math.max(pa.x, pb.x);
    const lx0 = x0;
    if (prop(d, "extendLinesLeft", false)) x0 = 0;
    if (prop(d, "extendLines", false)) x1 = c.width;
    if (d.style?.fibLevels !== false) {
      const one = d.props?.linesColors as string | undefined;
      const styles = fibLevelStyles(d, theme).filter((l) => l.visible);
      const levels = levelPrices(a, b, styles.map((l) => l.ratio), prop(d, "fibLevelsBasedOnLogScale", false));
      const fillA = d.props?.transparency !== undefined ? (100 - Number(d.props.transparency)) / 100 : (d.style?.fillOpacity ?? 0.12);
      const fillOn = prop(d, "fillBackground", true);
      const lw = d.props?.levelsLineWidth as number | undefined;
      const ls = d.props?.levelsLineStyle as string | undefined;
      const showPrices = prop(d, "showPrices", true);
      const showCoeffs = prop(d, "showCoeffs", true);
      const pct = prop(d, "coeffsAsPercents", false);
      const horz = prop(d, "horzLabelsAlign", "left");
      const vert = prop(d, "vertLabelsAlign", "middle");
      ctx.font = font(theme, prop(d, "labelFontSize", 10));
      ctx.textAlign = horz === "left" ? "right" : horz === "right" ? "left" : "center";
      ctx.textBaseline = vert === "bottom" ? "bottom" : vert === "top" ? "top" : "middle";
      let prevY: number | null = null;
      levels.forEach((lv, k) => {
        const lc = one ?? styles[k].color;
        const y = crisp(c.toPx({ time: a.time, price: lv.price }).y, dpr);
        if (prevY != null && fillOn) {
          ctx.fillStyle = withAlpha(lc, fillA);
          ctx.fillRect(x0, Math.min(prevY, y), x1 - x0, Math.abs(y - prevY));
        }
        ctx.save();
        if (lw !== undefined || ls !== undefined) strokeWith(ctx, lc, lw ?? ctx.lineWidth, ls);
        else ctx.strokeStyle = lc;
        line(ctx, { x: x0, y }, { x: x1, y });
        ctx.restore();
        const coeff = showCoeffs ? (pct ? `${Math.round(lv.ratio * 1000) / 10}%` : `${lv.ratio}`) : "";
        const price = showPrices ? c.formatPrice(lv.price) : "";
        const label = [coeff, price].filter(Boolean).join("  ");
        if (label) {
          ctx.fillStyle = lc;
          const lx = horz === "left" ? lx0 - 6 : horz === "right" ? x1 + 6 : (x0 + x1) / 2;
          ctx.fillText(label, lx, y + (vert === "bottom" ? -2 : vert === "top" ? 2 : 0));
        }
        prevY = y;
      });
    }
    if (prop(d, "trendlineVisible", true)) {
      ctx.save();
      const tw = d.props?.trendlineWidth as number | undefined;
      const ts = d.props?.trendlineStyle as string | undefined;
      const tc = (d.props?.trendlineColor as string | undefined) ?? c.color;
      if (tw === undefined && ts === undefined) {
        ctx.strokeStyle = tc;
        ctx.setLineDash([3, 3]);
      } else strokeWith(ctx, tc, tw ?? ctx.lineWidth, ts ?? "dashed");
      line(ctx, pa, pb);
      ctx.restore();
    }
    if (d.text && prop(d, "showText", true)) {
      const horz = prop(d, "horzTextAlign", "center");
      const vert = prop(d, "vertTextAlign", "middle");
      const ty = vert === "bottom" ? Math.min(pa.y, pb.y) - 4 : vert === "top" ? Math.max(pa.y, pb.y) + 4 : (pa.y + pb.y) / 2;
      const tx = horz === "left" ? x0 + 4 : horz === "right" ? x1 - 4 : (x0 + x1) / 2;
      drawText(c, d.text, tx, ty, {
        color: c.color,
        size: prop(d, "labelFontSize", 12),
        align: horz === "left" ? "left" : horz === "right" ? "right" : "center",
        baseline: vert === "bottom" ? "bottom" : vert === "top" ? "top" : "middle",
      });
    }
  },
  handles: anchorHandles,
};

export type { FibLevel };
