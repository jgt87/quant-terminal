import { describe, expect, it } from "vitest";
import {
  tableAddColumn,
  tableAddRow,
  tableCellAt,
  tableCellRect,
  tableLayout,
  tableParse,
  tableSerialize,
  textAnchoredPoint,
  textApproxMeasure,
  textBalloonBox,
  textBoxLayout,
  textCalloutOutline,
  textInRect,
  textLineHeight,
  textPlaceBox,
  textPlaceOf,
  textPointInPolygon,
  textWrapLines,
} from "../src/drawings/text";

const m10 = (s: string) => s.length * 10;

describe("text box measurement contract", () => {
  it("approximation: 0.6 em per glyph (0.65 bold), 1.3 em lines", () => {
    expect(textApproxMeasure(10)("abcd")).toBe(24);
    expect(textApproxMeasure(10, true)("ab")).toBe(13);
    expect(textLineHeight(14)).toBe(18);
  });
  it("box = widest line + padding, lines × line height", () => {
    const l = textBoxLayout("ab\nabcd", { size: 10, padding: 4 }, m10);
    expect(l.lines).toEqual(["ab", "abcd"]);
    expect(l.width).toBe(48);
    expect(l.height).toBe(2 * 13 + 8);
    expect(textBoxLayout("", { size: 10, padding: 4, minWidth: 30 }, m10).width).toBe(30);
  });
  it("word wrap", () => {
    expect(textWrapLines("aa bb cc", m10, 50)).toEqual(["aa bb", "cc"]);
    expect(textWrapLines("aa bb cc", m10)).toEqual(["aa bb cc"]);
    expect(textWrapLines("verylongword x", m10, 30)).toEqual(["verylongword", "x"]);
  });
  it("placement and rect hit", () => {
    expect(textPlaceBox({ x: 100, y: 100 }, 40, 20, "center", "middle")).toEqual({ x: 80, y: 90, width: 40, height: 20 });
    expect(textPlaceBox({ x: 100, y: 100 }, 40, 20, "right", "bottom")).toEqual({ x: 60, y: 80, width: 40, height: 20 });
    expect(textInRect(85, 95, { x: 80, y: 90, width: 40, height: 20 })).toBe(true);
    expect(textInRect(78, 95, { x: 80, y: 90, width: 40, height: 20 }, 1)).toBe(false);
  });
});

describe("callout and balloon", () => {
  const box = { x: 100, y: 100, width: 80, height: 40 };
  it("tail reaches the tip from the facing side", () => {
    const below = textCalloutOutline(box, { x: 140, y: 200 });
    expect(below).toContainEqual({ x: 140, y: 200 });
    expect(textPointInPolygon(140, 170, below)).toBe(true);
    const left = textCalloutOutline(box, { x: 20, y: 120 });
    expect(textPointInPolygon(60, 120, left)).toBe(true);
    expect(textPointInPolygon(60, 105, left)).toBe(false);
    expect(textCalloutOutline(box, { x: 120, y: 120 })).toHaveLength(4);
  });
  it("balloon box sits above the point", () => {
    expect(textBalloonBox({ x: 50, y: 100 }, 40, 20, 10)).toEqual({ x: 30, y: 70, width: 40, height: 20 });
  });
});

describe("screen anchoring", () => {
  const vp = { width: 800, height: 600 };
  it("keeps the pane place and follows anchor moves", () => {
    const place = textPlaceOf({ x: 200, y: 150 }, vp);
    expect(place).toEqual({ x: 0.25, y: 0.25 });
    // Chart scrolled: anchor and reference moved alike -> same place.
    expect(textAnchoredPoint({ x: 100, y: 150 }, place, { x: 100, y: 150 }, vp)).toEqual({ x: 200, y: 150 });
    // Drawing moved by 10 px.
    expect(textAnchoredPoint({ x: 110, y: 150 }, place, { x: 100, y: 150 }, vp)).toEqual({ x: 210, y: 150 });
    expect(textAnchoredPoint({ x: 5, y: 6 }, undefined, undefined, vp)).toEqual({ x: 5, y: 6 });
    expect(textAnchoredPoint({ x: 5, y: 6 }, place, undefined, { width: 400, height: 300 })).toEqual({ x: 100, y: 75 });
  });
});

describe("table cells", () => {
  it("parse / serialize / grow", () => {
    expect(tableParse("a | b\nc", 2, 3)).toEqual([
      ["a", "b", ""],
      ["c", "", ""],
    ]);
    expect(tableSerialize([["a", "b"], ["c", ""]])).toBe("a | b\nc | ");
    expect(tableAddColumn("a | b", 1, 2)).toEqual({ content: "a | b | ", rows: 1, cols: 3 });
    const r = tableAddRow("a | b", 1, 2);
    expect(r.rows).toBe(2);
    expect(tableParse(r.content, 2, 2)[1]).toEqual(["", ""]);
  });
  it("layout: column widths from the widest cell, fixed row height", () => {
    const l = tableLayout(
      [
        ["abcd", "a"],
        ["ab", ""],
      ],
      { size: 10, padding: 5, minCell: 20 },
      m10,
    );
    expect(l.colWidths).toEqual([50, 30]);
    expect(l.rowHeight).toBe(23);
    expect(l.width).toBe(80);
    expect(l.height).toBe(46);
    expect(tableCellRect(l, { x: 0, y: 0 }, 1, 1)).toEqual({ x: 50, y: 23, width: 30, height: 23 });
    expect(tableCellAt(l, { x: 0, y: 0 }, 60, 30)).toEqual({ row: 1, col: 1 });
    expect(tableCellAt(l, { x: 0, y: 0 }, 10, 5)).toEqual({ row: 0, col: 0 });
    expect(tableCellAt(l, { x: 0, y: 0 }, 90, 5)).toBeNull();
  });
});
