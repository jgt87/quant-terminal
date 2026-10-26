// Pure layout of the Text-and-notes family: the text-box measurement contract shared by
// rendering and hit-testing, word wrap, table cell layout and editing, callout / balloon
// outlines and screen-anchored placement. Pixel space; names carry a `text`/`table` prefix.

import type { Anchor } from "../types";
import type { Point } from "./geometry";

/** Measures the advance width of a string in px at the current font. */
export type TextMeasure = (s: string) => number;

/**
 * Measurement contract: renderers pass the canvas `measureText`; hit-tests (no canvas) use
 * this approximation, which renderers' boxes are checked against. Average glyph advance is
 * 0.6 em (0.65 em bold).
 */
export function textApproxMeasure(size: number, bold = false): TextMeasure {
  const k = bold ? 0.65 : 0.6;
  return (s: string) => [...s].length * size * k;
}

/** Line height for a font size (1.3 em, rounded). */
export function textLineHeight(size: number): number {
  return Math.round(size * 1.3);
}

/** Splits text into lines at newlines and, with `wrap` > 0, at spaces before `wrap` px. */
export function textWrapLines(text: string, measure: TextMeasure, wrap?: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!wrap || wrap <= 0) {
      out.push(para);
      continue;
    }
    let cur = "";
    for (const word of para.split(" ")) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && measure(next) > wrap) {
        out.push(cur);
        cur = word;
      } else cur = next;
    }
    out.push(cur);
  }
  return out;
}

export interface TextBoxLayout {
  lines: string[];
  lineHeight: number;
  /** Text block size (without padding). */
  textWidth: number;
  textHeight: number;
  /** Box size including padding on every side. */
  width: number;
  height: number;
  padding: number;
}

/**
 * Text box measurement: lines (wrapped at `wrap` px when given), the widest line, line height
 * 1.3 em and `padding` around the block. Minimum box width `minWidth` (default 0).
 */
export function textBoxLayout(text: string, o: { size: number; padding: number; wrap?: number; minWidth?: number }, measure: TextMeasure): TextBoxLayout {
  const lines = textWrapLines(text, measure, o.wrap);
  const lineHeight = textLineHeight(o.size);
  const textWidth = Math.max(0, ...lines.map((l) => measure(l)));
  const textHeight = lineHeight * lines.length;
  const width = Math.max(o.minWidth ?? 0, textWidth + 2 * o.padding);
  return { lines, lineHeight, textWidth, textHeight, width, height: textHeight + 2 * o.padding, padding: o.padding };
}

export interface TextRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** True when (x, y) lies inside the rectangle grown by `tol`. */
export function textInRect(x: number, y: number, r: TextRect, tol = 0): boolean {
  return x >= r.x - tol && x <= r.x + r.width + tol && y >= r.y - tol && y <= r.y + r.height + tol;
}

/** Box of size w×h placed at p by horizontal / vertical alignment of p within the box. */
export function textPlaceBox(p: Point, w: number, h: number, horz: "left" | "center" | "right", vert: "top" | "middle" | "bottom"): TextRect {
  const x = horz === "left" ? p.x : horz === "right" ? p.x - w : p.x - w / 2;
  const y = vert === "top" ? p.y : vert === "bottom" ? p.y - h : p.y - h / 2;
  return { x, y, width: w, height: h };
}

// ---------- callout and balloon ----------

/**
 * Speech-bubble outline: the box with a tail from its nearest side to `tip`. The tail base is
 * `base` px wide (clamped to the side). Returns the outline polygon clockwise.
 */
export function textCalloutOutline(box: TextRect, tip: Point, base = 16): Point[] {
  const { x, y, width: w, height: h } = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const inside = textInRect(tip.x, tip.y, box);
  const tl = { x, y };
  const tr = { x: x + w, y };
  const br = { x: x + w, y: y + h };
  const bl = { x, y: y + h };
  if (inside) return [tl, tr, br, bl];
  // Side facing the tip, judged by the box aspect.
  const dx = (tip.x - cx) / Math.max(1, w / 2);
  const dy = (tip.y - cy) / Math.max(1, h / 2);
  const half = (len: number) => Math.min(base / 2, Math.max(2, len / 2 - 4));
  if (Math.abs(dy) >= Math.abs(dx)) {
    const hb = half(w);
    const bx = Math.min(x + w - hb - 2, Math.max(x + hb + 2, tip.x));
    if (dy > 0) return [tl, tr, br, { x: bx + hb, y: y + h }, tip, { x: bx - hb, y: y + h }, bl];
    return [tl, { x: bx - hb, y }, tip, { x: bx + hb, y }, tr, br, bl];
  }
  const hb = half(h);
  const by = Math.min(y + h - hb - 2, Math.max(y + hb + 2, tip.y));
  if (dx > 0) return [tl, tr, { x: x + w, y: by - hb }, tip, { x: x + w, y: by + hb }, br, bl];
  return [tl, tr, br, bl, { x, y: by + hb }, tip, { x, y: by - hb }];
}

/** Balloon: a box above `p` with a short tail pointing down at p. */
export function textBalloonBox(p: Point, w: number, h: number, tail = 10): TextRect {
  return { x: p.x - w / 2, y: p.y - tail - h, width: w, height: h };
}

/** Even-odd point-in-polygon (bubble outlines). */
export function textPointInPolygon(x: number, y: number, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// ---------- screen-anchored placement ----------

/** Stored screen place of an anchored drawing: fractions of the pane plus the data reference. */
export interface TextAnchorPlace {
  /** Position as fractions (0..1) of the pane width / height. */
  x: number;
  y: number;
}

/**
 * Screen position of a drawing that may be anchored to the pane: `cur` is the projected anchor,
 * `ref` the projected data reference stored when it was anchored. Anchored drawings keep
 * `place` on screen (scrolling moves `cur` and `ref` alike) and follow moves of their anchor.
 */
export function textAnchoredPoint(cur: Point, place: TextAnchorPlace | undefined, ref: Point | undefined, viewport: { width: number; height: number }): Point {
  if (!place) return cur;
  const base = { x: place.x * viewport.width, y: place.y * viewport.height };
  if (!ref) return base;
  return { x: base.x + cur.x - ref.x, y: base.y + cur.y - ref.y };
}

/** Place of a screen point as pane fractions. */
export function textPlaceOf(p: Point, viewport: { width: number; height: number }): TextAnchorPlace {
  return { x: viewport.width ? p.x / viewport.width : 0, y: viewport.height ? p.y / viewport.height : 0 };
}

/** Copies an anchor (stored as the reference of an anchored drawing). */
export function textCopyAnchor(a: Anchor): Anchor {
  return { time: a.time, price: a.price };
}

// ---------- tables ----------

/** Cell separator of the table content text (one row per line). */
export const TABLE_SEPARATOR = "|";

/** Parses table content ("a | b\nc | d") into rows × cols cells (padded with ""). */
export function tableParse(content: string, rows: number, cols: number): string[][] {
  const lines = content.split("\n");
  const out: string[][] = [];
  for (let r = 0; r < rows; r++) {
    const cells = (lines[r] ?? "").split(TABLE_SEPARATOR).map((s) => s.trim());
    const row: string[] = [];
    for (let c = 0; c < cols; c++) row.push(cells[c] ?? "");
    out.push(row);
  }
  return out;
}

/** Serializes cells back to content text. */
export function tableSerialize(cells: readonly (readonly string[])[]): string {
  return cells.map((row) => row.join(` ${TABLE_SEPARATOR} `)).join("\n");
}

/** Table with one more column on the right (cells keep their place). */
export function tableAddColumn(content: string, rows: number, cols: number): { content: string; rows: number; cols: number } {
  const cells = tableParse(content, rows, cols).map((r) => [...r, ""]);
  return { content: tableSerialize(cells), rows, cols: cols + 1 };
}

/** Table with one more row at the bottom. */
export function tableAddRow(content: string, rows: number, cols: number): { content: string; rows: number; cols: number } {
  const cells = tableParse(content, rows, cols);
  cells.push(Array.from({ length: cols }, () => ""));
  return { content: tableSerialize(cells), rows: rows + 1, cols };
}

export interface TableLayout {
  colWidths: number[];
  rowHeight: number;
  width: number;
  height: number;
  padding: number;
}

/**
 * Cell layout: each column as wide as its widest cell (at least `minCell` px) plus padding on
 * both sides; every row one line high plus padding.
 */
export function tableLayout(cells: readonly (readonly string[])[], o: { size: number; padding: number; minCell: number }, measure: TextMeasure): TableLayout {
  const cols = cells[0]?.length ?? 0;
  const colWidths: number[] = [];
  for (let c = 0; c < cols; c++) {
    const w = Math.max(o.minCell, ...cells.map((row) => measure(row[c] ?? "")));
    colWidths.push(w + 2 * o.padding);
  }
  const rowHeight = textLineHeight(o.size) + 2 * o.padding;
  return { colWidths, rowHeight, width: colWidths.reduce((s, w) => s + w, 0), height: rowHeight * cells.length, padding: o.padding };
}

/** Rectangle of cell (r, c) for a table whose top-left corner is `origin`. */
export function tableCellRect(l: TableLayout, origin: Point, r: number, c: number): TextRect {
  let x = origin.x;
  for (let i = 0; i < c; i++) x += l.colWidths[i];
  return { x, y: origin.y + r * l.rowHeight, width: l.colWidths[c] ?? 0, height: l.rowHeight };
}

/** Cell under (x, y), or null outside the table. */
export function tableCellAt(l: TableLayout, origin: Point, x: number, y: number): { row: number; col: number } | null {
  if (x < origin.x || y < origin.y || x > origin.x + l.width || y > origin.y + l.height) return null;
  const row = Math.min(Math.floor((y - origin.y) / l.rowHeight), Math.round(l.height / l.rowHeight) - 1);
  let acc = origin.x;
  for (let col = 0; col < l.colWidths.length; col++) {
    acc += l.colWidths[col];
    if (x <= acc) return { row, col };
  }
  return { row, col: l.colWidths.length - 1 };
}
