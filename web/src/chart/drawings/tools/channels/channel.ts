// Parallel channel (catalog LineToolParallelChannel): base line a→b and a parallel copy through c.
// Level lines sit at coefficients between them (0 = base, 1 = parallel, 0.5 = middle), each with
// its own color, width and style; background between the outer visible levels; extend
// left/right; a text label. Old drawings without levels keep the original look (base,
// parallel, dashed middle).

import { channelLines, hitTestBody, type Anchor, type Drawing, type FibLevel } from "@qt/core";
import { levelTable } from "../../builders";
import { anchorHandles, drawText, extend, fillColor, line, prop, strokeWith } from "../../draw";
import { FONT_SIZES } from "../../schema";
import type { DrawCtx, DrawingToolDef, FloatBinding, SettingsField } from "../../types";
import { HORZ_ALIGN } from "../lines/lineTool";

const BLUE = "#2962ff";

/** Factory level rows (catalog level1..level7). */
export const channelRows = (): FibLevel[] => [
  { ratio: -0.25, color: BLUE, visible: false, width: 1, lineStyle: "solid" },
  { ratio: 0, color: BLUE, visible: true, width: 2, lineStyle: "solid" },
  { ratio: 0.25, color: BLUE, visible: false, width: 1, lineStyle: "solid" },
  { ratio: 0.5, color: BLUE, visible: true, width: 1, lineStyle: "dashed" },
  { ratio: 0.75, color: BLUE, visible: false, width: 1, lineStyle: "solid" },
  { ratio: 1, color: BLUE, visible: true, width: 2, lineStyle: "solid" },
  { ratio: 1.25, color: BLUE, visible: false, width: 1, lineStyle: "solid" },
];

const ownLine = (t: { drawing: string }, d: Drawing) => d.style?.color ?? t.drawing;

const style: SettingsField[] = [
  levelTable(() => channelRows(), { catalogPrefix: "level", lineColumns: true, valueLabel: "Level" }),
  { kind: "section", label: "Extend" },
  { kind: "checkbox", key: "props.extendLeft", label: "Extend left line", catalog: "extendLeft", default: false },
  { kind: "checkbox", key: "props.extendRight", label: "Extend right line", catalog: "extendRight", default: false },
  { kind: "checkbox", key: "props.fillBackground", label: "Background", catalog: "fillBackground", default: true },
  { kind: "color", key: "style.fillColor", label: "Background color", catalog: "backgroundColor", default: ownLine },
];

const text: SettingsField[] = [
  { kind: "text", key: "text", label: "Text", catalog: "labelText (derived)", multiline: true, maxLength: 2000, default: "" },
  { kind: "color", key: "style.textColor", label: "Text color", catalog: "labelTextColor", default: ownLine },
  { kind: "fontSize", key: "style.textSize", label: "Font size", catalog: "labelFontSize", sizes: FONT_SIZES, default: 14 },
  { kind: "checkbox", key: "style.bold", label: "Bold", catalog: "labelBold", default: false },
  { kind: "checkbox", key: "style.italic", label: "Italic", catalog: "labelItalic", default: false },
  {
    kind: "select",
    key: "props.labelVertAlign",
    label: "Text alignment (vertical)",
    catalog: "labelVertAlign",
    options: [
      { value: "bottom", label: "Top" },
      { value: "middle", label: "Inside" },
      { value: "top", label: "Bottom" },
    ],
    default: "bottom",
  },
  { kind: "select", key: "props.labelHorzAlign", label: "Text alignment (horizontal)", catalog: "labelHorzAlign", options: HORZ_ALIGN, default: "left" },
];

/** The level line at coefficient k: base (k = 0) shifted toward the parallel (k = 1). */
function levelLine(base: [Anchor, Anchor], par: [Anchor, Anchor], k: number): [Anchor, Anchor] {
  const at = (i: 0 | 1): Anchor => ({ time: base[i].time + (par[i].time - base[i].time) * k, price: base[i].price + (par[i].price - base[i].price) * k });
  return [at(0), at(1)];
}

/** Line color button / width button act on every level (one color / one width). */
const allLevels = (field: "color" | "width"): FloatBinding => ({
  get: (d, theme) => (d.style?.levels?.find((l) => l.visible !== false)?.[field] ?? (field === "color" ? (d.style?.color ?? theme.drawing) : (d.style?.width ?? 1))),
  set: (d, v) => {
    const rows = d.style?.levels ?? null;
    if (!rows) return { ...d, style: { ...d.style, [field]: v } };
    return { ...d, style: { ...d.style, [field]: v, levels: rows.map((l) => ({ ...l, [field]: v })) } };
  },
});

function renderLegacy(c: DrawCtx, d: Drawing): void {
  const { ctx } = c;
  const [a, b, third] = d.anchors;
  const complete = third != null;
  const [base, par] = channelLines(a, b, complete ? third : a);
  const b0 = c.toPx(base[0]);
  const b1 = c.toPx(base[1]);
  const q0 = c.toPx(par[0]);
  const q1 = c.toPx(par[1]);
  if (complete) {
    ctx.save();
    ctx.fillStyle = fillColor(d, c.color);
    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.lineTo(q1.x, q1.y);
    ctx.lineTo(q0.x, q0.y);
    ctx.closePath();
    ctx.fill();
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha *= 0.6;
    line(ctx, { x: (b0.x + q0.x) / 2, y: (b0.y + q0.y) / 2 }, { x: (b1.x + q1.x) / 2, y: (b1.y + q1.y) / 2 });
    ctx.restore();
    line(ctx, q0, q1);
  }
  line(ctx, b0, b1);
}

export const channel: DrawingToolDef = {
  type: "channel",
  catalogType: "LineToolParallelChannel",
  family: "channels",
  label: "Parallel channel",
  icon: "channel",
  anchors: 3,
  defaults: { fillColor: "#2962ff33", levels: channelRows(), textColor: BLUE, textSize: 14, bold: false, italic: false },
  defaultProps: { extendLeft: false, extendRight: false, fillBackground: true, labelVertAlign: "bottom", labelHorzAlign: "left" },
  settings: { style, text },
  alert: "band",
  floatingToolbar: ["templates", "line-tool-color", "background-color", "text-color", "line-tool-width", "settings", "add-alert", "lock", "remove", "more"],
  floatBindings: { "line-tool-color": allLevels("color"), "line-tool-width": allLevels("width") },
  hitTest: (d, g, x, y, tol) => hitTestBody(d, g.toPx, x, y, tol, g.viewport),
  render(c, d) {
    const [a, b, third] = d.anchors;
    if (!a || !b) return;
    const rows = d.style?.levels;
    if (!rows || !third) return renderLegacy(c, d);
    const { ctx } = c;
    const [base, par] = channelLines(a, b, third);
    const left = prop(d, "extendLeft", false);
    const right = prop(d, "extendRight", false);
    const px = (seg: [Anchor, Anchor]) => {
      const p = c.toPx(seg[0]);
      const q = c.toPx(seg[1]);
      return [left ? extend(q, p) : p, right ? extend(p, q) : q] as const;
    };
    const shown = rows.filter((l) => l.visible !== false);
    if (prop(d, "fillBackground", true) && shown.length >= 2) {
      const ks = shown.map((l) => l.ratio);
      const [lo0, lo1] = px(levelLine(base, par, Math.min(...ks)));
      const [hi0, hi1] = px(levelLine(base, par, Math.max(...ks)));
      ctx.save();
      ctx.fillStyle = fillColor(d, c.color);
      ctx.beginPath();
      ctx.moveTo(lo0.x, lo0.y);
      ctx.lineTo(lo1.x, lo1.y);
      ctx.lineTo(hi1.x, hi1.y);
      ctx.lineTo(hi0.x, hi0.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    for (const l of shown) {
      const [p, q] = px(levelLine(base, par, l.ratio));
      ctx.save();
      strokeWith(ctx, l.color ?? c.color, l.width ?? 1, l.lineStyle);
      line(ctx, p, q);
      ctx.restore();
    }
    if (d.text) {
      const vert = prop(d, "labelVertAlign", "bottom");
      const horz = prop(d, "labelHorzAlign", "left");
      const ks = shown.length ? shown.map((l) => l.ratio) : [0, 1];
      const k = vert === "bottom" ? Math.max(...ks) : vert === "top" ? Math.min(...ks) : (Math.max(...ks) + Math.min(...ks)) / 2;
      const [p, q] = levelLine(base, par, k).map((x) => c.toPx(x));
      const at = horz === "left" ? p : horz === "right" ? q : { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      drawText(c, d.text, at.x, at.y + (vert === "bottom" ? -4 : vert === "top" ? 4 : 0), {
        color: d.style?.textColor ?? c.color,
        size: d.style?.textSize ?? 14,
        bold: d.style?.bold,
        italic: d.style?.italic,
        align: horz === "left" ? "left" : horz === "right" ? "right" : "center",
        baseline: vert === "bottom" ? "bottom" : vert === "top" ? "top" : "middle",
      });
    }
  },
  handles: anchorHandles,
};
