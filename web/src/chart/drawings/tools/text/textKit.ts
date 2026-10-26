// Shared pieces of the Text-and-notes tools: the text-box measurement (canvas when rendering,
// the core approximation when hit-testing, with the last rendered box cached per drawing),
// box painting, and the screen "Anchor" mode (menu item, floating-toolbar toggle, handle drag).

import {
  translateDrawing,
  textApproxMeasure,
  textAnchoredPoint,
  textBoxLayout,
  textCopyAnchor,
  textPlaceOf,
  type Anchor,
  type Drawing,
  type Point,
  type TextAnchorPlace,
  type TextBoxLayout,
  type TextRect,
} from "@qt/core";
import type { MenuItem } from "../../../../components/menuTypes";
import { prop, textFont } from "../../draw";
import type { DrawCtx, DrawingToolDef, FloatBinding, InlineTextEdit, MenuExtrasCtx, ToolGeom } from "../../types";

// ---------- measurement ----------

export interface TextStyle {
  size: number;
  bold?: boolean;
  italic?: boolean;
}

const cache = new Map<string, { sig: string; layout: TextBoxLayout }>();

/**
 * Text box layout of a drawing. With a render context the canvas measures the text and the
 * result is remembered for hit-testing; without one (hit-test, bounds) the last rendered box is
 * reused when nothing changed, else the core approximation.
 */
export function measureBox(d: Drawing, text: string, st: TextStyle, o: { padding: number; wrap?: number; minWidth?: number; slot?: string }, c?: DrawCtx): TextBoxLayout {
  const sig = JSON.stringify([text, st.size, Boolean(st.bold), Boolean(st.italic), o.padding, o.wrap ?? 0, o.minWidth ?? 0]);
  const key = `${d.id}:${o.slot ?? ""}`;
  if (c) {
    const { ctx } = c;
    ctx.save();
    ctx.font = textFont(c.theme, st);
    const m = ctx.measureText("M");
    const real = typeof m?.width === "number" && m.width > 0;
    const measure = real ? (s: string) => ctx.measureText(s).width : textApproxMeasure(st.size, st.bold);
    const layout = textBoxLayout(text, { size: st.size, padding: o.padding, wrap: o.wrap, minWidth: o.minWidth }, measure);
    ctx.restore();
    if (real) cache.set(key, { sig, layout });
    return layout;
  }
  const hit = cache.get(key);
  if (hit && hit.sig === sig) return hit.layout;
  return textBoxLayout(text, { size: st.size, padding: o.padding, wrap: o.wrap, minWidth: o.minWidth }, textApproxMeasure(st.size, st.bold));
}

/** Text style of a drawing from the shared style keys. */
export function styleOf(d: Drawing, sizeFallback: number, boldFallback = false): TextStyle {
  return { size: d.style?.textSize ?? sizeFallback, bold: d.style?.bold ?? boldFallback, italic: d.style?.italic ?? false };
}

// ---------- painting ----------

/** Rounded-rectangle path. */
export function roundRect(ctx: CanvasRenderingContext2D, r: TextRect, radius: number): void {
  const k = Math.max(0, Math.min(radius, r.width / 2, r.height / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + k, r.y);
  ctx.lineTo(r.x + r.width - k, r.y);
  ctx.arcTo(r.x + r.width, r.y, r.x + r.width, r.y + k, k);
  ctx.lineTo(r.x + r.width, r.y + r.height - k);
  ctx.arcTo(r.x + r.width, r.y + r.height, r.x + r.width - k, r.y + r.height, k);
  ctx.lineTo(r.x + k, r.y + r.height);
  ctx.arcTo(r.x, r.y + r.height, r.x, r.y + r.height - k, k);
  ctx.lineTo(r.x, r.y + k);
  ctx.arcTo(r.x, r.y, r.x + k, r.y, k);
  ctx.closePath();
}

/** Fills and/or strokes the current path. */
export function paint(ctx: CanvasRenderingContext2D, fill?: string | null, stroke?: string | null, width = 1): void {
  ctx.save();
  ctx.setLineDash([]);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  ctx.restore();
}

/** Draws laid-out lines inside `box` (padding from the layout) with the given alignment. */
export function drawLines(c: DrawCtx, l: TextBoxLayout, box: TextRect, st: TextStyle & { color: string }, align: "left" | "center" | "right" = "left"): void {
  const { ctx } = c;
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = textFont(c.theme, st);
  ctx.fillStyle = st.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = align;
  const x = align === "left" ? box.x + l.padding : align === "right" ? box.x + box.width - l.padding : box.x + box.width / 2;
  const top = box.y + (box.height - l.textHeight) / 2;
  l.lines.forEach((line, i) => ctx.fillText(line, x, top + i * l.lineHeight + l.lineHeight / 2));
  ctx.restore();
}

/** Placeholder shown while a text tool has no text yet. */
export const PLACEHOLDER = "Add text";

// ---------- screen anchoring ----------

/** Whether the drawing is anchored to the pane (screen space). */
export function isAnchored(d: Drawing, def = false): boolean {
  return prop(d, "anchored", def) === true;
}

/**
 * Screen position of the drawing's first anchor: its projection, or for anchored drawings the
 * stored pane place (shifted by moves of the anchor since it was anchored).
 */
export function anchorPx(d: Drawing, g: Pick<ToolGeom, "toPx" | "viewport">, anchoredDefault = false): Point {
  const a = d.anchors[0];
  const cur = g.toPx(a);
  if (!isAnchored(d, anchoredDefault)) return cur;
  const place = d.props?.anchorPlace as TextAnchorPlace | undefined;
  const ref = d.props?.anchorRef as Anchor | undefined;
  return textAnchoredPoint(cur, place, ref ? g.toPx(ref) : undefined, g.viewport);
}

/**
 * Turns anchoring on (keeping the drawing where it is on screen) or off (moving the data anchor
 * under its current screen place).
 */
export function setAnchored(d: Drawing, on: boolean, g: Pick<ToolGeom, "toPx" | "toData" | "viewport"> | undefined, anchoredDefault = false): Drawing {
  const props = { ...d.props };
  const at = g && d.anchors[0] ? anchorPx(d, g, anchoredDefault) : null;
  props.anchored = on;
  if (on && g && at) {
    props.anchorPlace = textPlaceOf(at, g.viewport);
    props.anchorRef = textCopyAnchor(d.anchors[0]);
    return { ...d, props };
  }
  delete props.anchorPlace;
  delete props.anchorRef;
  if (!on && g && at) return { ...d, props, anchors: [g.toData(at), ...d.anchors.slice(1)] };
  return { ...d, props };
}

/** Handle drag of an anchorable drawing: the first handle repositions it (re-anchoring). */
export function dragAnchorable(d: Drawing, index: number, a: Anchor, g: ToolGeom, anchoredDefault = false): Drawing {
  const anchors = [...d.anchors];
  anchors[index] = a;
  const next = { ...d, anchors };
  if (index !== 0 || !isAnchored(d, anchoredDefault)) return next;
  return { ...next, props: { ...d.props, anchorPlace: textPlaceOf(g.toPx(a), g.viewport), anchorRef: textCopyAnchor(a) } };
}

/** The "Anchor" context-menu item (checkable). */
export function anchorMenu(anchoredDefault = false) {
  return (d: Drawing, ctx: MenuExtrasCtx): MenuItem[] => {
    const on = isAnchored(d, anchoredDefault);
    return [{ id: "anchor", label: "Anchor", checked: on, onSelect: () => ctx.update((k) => setAnchored(k, !on, ctx.geom, anchoredDefault)) }];
  };
}

/** Floating-toolbar binding of the anchor toggle. */
export function anchorBinding(anchoredDefault = false): FloatBinding {
  return {
    get: (d) => isAnchored(d, anchoredDefault),
    set: (d, v, g) => setAnchored(d, Boolean(v), g, anchoredDefault),
  };
}

/**
 * Creation and body-drag hooks of an anchorable tool. A drawing created anchored takes the screen
 * place where it was created; a body drag of an anchored drawing moves that place (pane
 * fractions), so it stays put after zooming or scrolling. Unanchored drawings move through the
 * projection as usual.
 */
export function anchorHooks(anchoredDefault = false): Pick<DrawingToolDef, "onCreate" | "onTranslate"> {
  return {
    onCreate(d, g) {
      const a = d.anchors[0];
      if (!a || !isAnchored(d, anchoredDefault)) return d;
      return { ...d, props: { ...d.props, anchored: true, anchorPlace: textPlaceOf(g.toPx(a), g.viewport), anchorRef: textCopyAnchor(a) } };
    },
    onTranslate(d, dx, dy, g) {
      const a = d.anchors[0];
      if (!a || !isAnchored(d, anchoredDefault)) return translateDrawing(d, dx, dy, g.toPx, g.toData);
      const at = anchorPx(d, g, anchoredDefault);
      // Reset the reference to the anchor so later anchor moves start from the new place.
      return { ...d, props: { ...d.props, anchorPlace: textPlaceOf({ x: at.x + dx, y: at.y + dy }, g.viewport), anchorRef: textCopyAnchor(a) } };
    },
  };
}

// ---------- inline editing ----------

/** Inline editor request over a text box (multi-line, the drawing's text style). */
export function textEdit(d: Drawing, rect: TextRect, o: { size?: number; color?: string; key?: "text" } = {}): InlineTextEdit {
  return {
    key: o.key ?? "text",
    rect: { x: rect.x, y: rect.y, width: Math.max(rect.width, 120), height: Math.max(rect.height, 28) },
    value: d.text ?? "",
    multiline: true,
    fontSize: o.size ?? d.style?.textSize ?? 14,
    color: o.color ?? d.style?.textColor,
  };
}
