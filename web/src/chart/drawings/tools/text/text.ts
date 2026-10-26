// Text (catalog LineToolText): a text label whose top-left corner is the anchor, optional
// background and border, word wrap, and "Anchor" (pin to the screen instead of a price/time).
// Creation, double-click and Enter on the selected text open the inline (multi-line) editor. Old drawings (no props) keep the original boxed
// look (box background + border in the line color, 11px text).

import { textBox, translateDrawing, type Drawing } from "@qt/core";
import { font } from "../../../theme";
import { drawText, fillColor, prop } from "../../draw";
import { FONT_SIZES } from "../../schema";
import { textEdit } from "./textKit";
import type { DrawCtx, DrawingToolDef, FloatBinding, SettingsField, ToolGeom } from "../../types";

const own = (t: { drawing: string }, d: Drawing) => d.style?.color ?? t.drawing;

const textTab: SettingsField[] = [
  { kind: "text", key: "text", label: "Text", catalog: "text (derived)", multiline: true, maxLength: 2000, default: "" },
  { kind: "color", key: "style.textColor", label: "Text color", catalog: "color", default: own },
  { kind: "fontSize", key: "style.textSize", label: "Font size", catalog: "fontsize", sizes: FONT_SIZES, default: 11 },
  { kind: "checkbox", key: "style.bold", label: "Bold", catalog: "bold", default: false },
  { kind: "checkbox", key: "style.italic", label: "Italic", catalog: "italic", default: false },
  { kind: "checkbox", key: "props.fillBackground", label: "Background", catalog: "fillBackground", default: true },
  { kind: "color", key: "style.fillColor", label: "Background color", catalog: "backgroundColor", default: (t: { boxBg: string }) => t.boxBg, testWith: (d) => ({ ...d, props: { ...d.props, fillBackground: true } }) },
  { kind: "checkbox", key: "props.drawBorder", label: "Border", catalog: "drawBorder", default: true },
  { kind: "color", key: "props.borderColor", label: "Border color", catalog: "borderColor", default: own, testWith: (d) => ({ ...d, props: { ...d.props, drawBorder: true } }) },
  { kind: "checkbox", key: "props.wordWrap", label: "Text wrap", catalog: "wordWrap", default: false, testWith: (d) => ({ ...d, text: "A long line of text that wraps at the wrap width of the label" }) },
  { kind: "number", key: "props.wordWrapWidth", label: "Wrap width", min: 40, max: 2000, step: 10, default: 200, showIf: (d) => d.props?.wordWrap === true, testWith: (d) => ({ ...d, text: "A long line of text that wraps at the wrap width of the label", props: { ...d.props, wordWrap: true } }), testValue: 80 },
];

/** Screen position of the text: pinned (Anchor on) or the anchor's projection. */
export function textPos(d: Drawing, g: Pick<ToolGeom, "toPx" | "viewport">): { x: number; y: number } {
  const pin = d.props?.anchored ? (d.props.anchorPos as { x: number; y: number } | undefined) : undefined;
  if (pin) return { x: pin.x * g.viewport.width, y: pin.y * g.viewport.height };
  return g.toPx(d.anchors[0]);
}

/** Toggles "Anchor": pins the text at its current screen place (fractions of the viewport). */
export function toggleAnchored(d: Drawing, on: boolean, g?: ToolGeom): Drawing {
  const props = { ...d.props };
  if (on && g) {
    const p = g.toPx(d.anchors[0]);
    props.anchored = true;
    props.anchorPos = { x: p.x / Math.max(1, g.viewport.width), y: p.y / Math.max(1, g.viewport.height) };
  } else if (on) props.anchored = true;
  else {
    delete props.anchored;
    if (g && props.anchorPos) {
      const pin = props.anchorPos as { x: number; y: number };
      const a = g.toData({ x: pin.x * g.viewport.width, y: pin.y * g.viewport.height });
      delete props.anchorPos;
      return { ...d, anchors: [a], props };
    }
    delete props.anchorPos;
  }
  return { ...d, props };
}

const anchorBinding: FloatBinding = {
  get: (d) => Boolean(d.props?.anchored),
  set: (d, v, g) => toggleAnchored(d, Boolean(v), g),
};

/** Box of the text in px (hit-testing, selection bounds). */
function box(d: Drawing, g: Pick<ToolGeom, "toPx" | "viewport">): { x: number; y: number; width: number; height: number } {
  const p = textPos(d, g);
  const size = d.style?.textSize ?? 11;
  const k = size / 11;
  const lines = (d.text || "Text").split("\n");
  const wrap = d.props?.wordWrap ? Number(d.props.wordWrapWidth ?? 200) : 0;
  const longest = Math.max(...lines.map((l) => l.length));
  const r = textBox("x".repeat(longest), p);
  const width = wrap ? Math.min(r.width * k, wrap + 8) : r.width * k;
  const height = r.height * Math.max(1, k) * Math.max(lines.length, wrap ? Math.ceil((r.width * k) / Math.max(40, wrap)) : 1);
  return { x: p.x, y: p.y, width, height };
}

function render(c: DrawCtx, d: Drawing): void {
  if (!d.anchors[0]) return;
  const { ctx, theme } = c;
  const label = d.text || "Text";
  const size = d.style?.textSize ?? 11;
  const color = d.style?.textColor ?? c.color;
  const bg = prop(d, "fillBackground", true) ? (d.style?.fillColor ? fillColor(d, c.color) : theme.boxBg) : undefined;
  const border = prop(d, "drawBorder", true) ? prop(d, "borderColor", c.color) : undefined;
  const p = textPos(d, c);
  const wrap = d.props?.wordWrap ? Number(d.props.wordWrapWidth ?? 200) : undefined;
  if (!wrap && !label.includes("\n")) {
    // Single line: the original box geometry (core textBox scaled by the font size).
    const r = textBox(label, p);
    const k = size / 11;
    const w = r.width * k;
    const h = r.height * Math.max(1, k);
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(r.x, r.y, w, h);
    }
    ctx.setLineDash([]);
    if (border) {
      ctx.strokeStyle = border;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, w - 1, h - 1);
    }
    ctx.fillStyle = color;
    ctx.font = (d.style?.italic ? "italic " : "") + font(theme, size, d.style?.bold ? 700 : 500);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, r.x + 4 * k, r.y + h / 2 + 0.5);
    return;
  }
  drawText(c, label, p.x + 4, p.y + 4, { color, size, bold: d.style?.bold, italic: d.style?.italic, wrap, background: bg, border });
}

export const text: DrawingToolDef = {
  type: "text",
  catalogType: "LineToolText",
  family: "text",
  label: "Text",
  icon: "text",
  anchors: 1,
  defaults: { textColor: "#2962ff", textSize: 14, bold: false, italic: false, fillColor: "#2962ff40" },
  defaultProps: { fillBackground: false, drawBorder: false, borderColor: "#707070", wordWrap: false },
  defaultText: "Text",
  settings: { style: [], text: textTab, coordinates: false },
  floatingToolbar: ["templates", "text-color", "font-size", "settings", "lock", "toggle-anchor", "remove", "more"],
  floatBindings: { "toggle-anchor": anchorBinding },
  menuSection: (d, ctx) => [{ id: "anchor", label: "Anchor", checked: Boolean(d.props?.anchored), onSelect: () => ctx.update((k) => toggleAnchored(k, !k.props?.anchored, ctx.geom)) }],
  hitTest(d, g, x, y, tol) {
    if (!d.anchors[0]) return false;
    const r = box(d, g);
    return x >= r.x - tol && x <= r.x + r.width + tol && y >= r.y - tol && y <= r.y + r.height + tol;
  },
  render,
  handles: (d, g) => (d.anchors[0] ? [textPos(d, g)] : []),
  // Anchored (pinned) text: the handle and body drags move the pinned screen place.
  onAnchorDrag(d, i, a, g) {
    const pin = d.props?.anchored ? (d.props.anchorPos as { x: number; y: number } | undefined) : undefined;
    if (!pin) return { ...d, anchors: [a, ...d.anchors.slice(1)] };
    const p = g.toPx(a);
    return { ...d, props: { ...d.props, anchorPos: { x: p.x / Math.max(1, g.viewport.width), y: p.y / Math.max(1, g.viewport.height) } } };
  },
  onTranslate(d, dx, dy, g) {
    const pin = d.props?.anchored ? (d.props.anchorPos as { x: number; y: number } | undefined) : undefined;
    if (!pin) return translateDrawing(d, dx, dy, g.toPx, g.toData);
    return { ...d, props: { ...d.props, anchorPos: { x: pin.x + dx / Math.max(1, g.viewport.width), y: pin.y + dy / Math.max(1, g.viewport.height) } } };
  },
  editText: (d, g) => (d.anchors[0] ? textEdit(d, box(d, g), { size: d.style?.textSize ?? 11, color: d.style?.textColor ?? d.style?.color }) : null),
  bounds: (d, g) => box(d, g),
};
