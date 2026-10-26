// Text and notes family: text-box hit-tests, screen anchoring (menu item, floating toolbar,
// handle drag), note popup, table rows / columns, prompts on creation.

import { describe, expect, it } from "vitest";
import type { Anchor, Drawing } from "@qt/core";
import { floatBinding, floatButtons } from "../src/chart/drawings/floatbar";
import { getTool } from "../src/chart/drawings/registry";
import { TEXT } from "../src/chart/drawings/tools/text";
import type { MenuAction } from "../src/components/menuTypes";
import { factoryDrawing, geom, renderLog, theme } from "./drawings/harness";

const A = (x: number, y: number): Anchor => geom.toData({ x, y });
const make = (type: string, anchors: Anchor[], extra: Partial<Drawing> = {}): Drawing => ({ ...factoryDrawing(getTool(type)!), anchors, ...extra });
const hit = (d: Drawing, x: number, y: number) => getTool(d.type)!.hitTest(d, geom, x, y, 4);
const scrolled = { ...geom, toPx: (a: Anchor) => ({ x: a.time - 100, y: 1000 - a.price }), toData: (p: { x: number; y: number }) => ({ time: Math.round(p.x) + 100, price: 1000 - p.y }) };

describe("text registry", () => {
  it("registers the family in flyout order, plus the off-toolbar variants", () => {
    expect(TEXT.slice(1).map((t) => t.type)).toEqual([
      "textNote",
      "priceNote",
      "note",
      "table",
      "callout",
      "comment",
      "priceLabel",
      "signpost",
      "flagMark",
      "textAbsolute",
      "noteAbsolute",
      "balloon",
    ]);
    for (const t of ["callout", "comment", "note", "textNote", "textAbsolute", "noteAbsolute", "balloon", "signpost"]) expect(getTool(t)!.defaultText, t).toBe("");
  });
  it("text tools have text color / font size buttons per the catalog", () => {
    expect(floatButtons(getTool("callout")!)).toEqual(expect.arrayContaining(["text-color", "font-size", "background-color"]));
    expect(floatButtons(getTool("note")!)).toEqual(expect.arrayContaining(["text-color", "font-size", "toggle-anchor"]));
  });
});

describe("text boxes", () => {
  it("callout: bubble and tail, miss away", () => {
    const d = make("callout", [A(100, 400), A(300, 300)], { text: "Hello" });
    expect(hit(d, 300, 300)).toBe(true);
    expect(hit(d, 100, 300)).toBe(false);
    expect(hit(d, 105, 397)).toBe(true);
    expect(hit(d, 600, 100)).toBe(false);
  });
  it("comment / balloon sit above the anchor", () => {
    for (const type of ["comment", "balloon"]) {
      const d = make(type, [A(300, 300)], { text: "Hi" });
      expect(hit(d, 300, 280), type).toBe(true);
      expect(hit(d, 300, 340), type).toBe(false);
    }
  });
  it("price label, price note, note, signpost, flag", () => {
    expect(hit(make("priceLabel", [A(300, 300)]), 320, 290)).toBe(true);
    expect(hit(make("priceLabel", [A(300, 300)]), 260, 340)).toBe(false);
    const pn = make("priceNote", [A(100, 400), A(300, 300)]);
    expect(hit(pn, 200, 350)).toBe(true);
    expect(hit(pn, 300, 300)).toBe(true);
    expect(hit(pn, 100, 300)).toBe(false);
    const tn = make("textNote", [A(100, 400), A(300, 300)], { text: "Note" });
    expect(hit(tn, 300, 300)).toBe(true);
    expect(hit(tn, 200, 350)).toBe(true);
    expect(hit(make("signpost", [A(300, 300)], { text: "S" }), 300, 290)).toBe(true);
    expect(hit(make("flagMark", [A(300, 300)]), 308, 280)).toBe(true);
    expect(hit(make("flagMark", [A(300, 300)]), 280, 320)).toBe(false);
  });
  it("text box grows with wrapping off / shrinks in width with wrap on", () => {
    const long = "word ".repeat(40).trim();
    const def = getTool("textAbsolute")!;
    const plain = def.bounds!(make("textAbsolute", [A(100, 100)], { text: long }), geom);
    const wrapped = def.bounds!(make("textAbsolute", [A(100, 100)], { text: long, props: { ...def.defaultProps, wordWrap: true } }), geom);
    expect(wrapped.width).toBeLessThan(plain.width);
    expect(wrapped.height).toBeGreaterThan(plain.height);
  });
});

describe("pin note", () => {
  it("collapsed marker hit; popup only when hovered / selected", () => {
    const d = make("note", [A(300, 300)], { text: "Popup text" });
    expect(hit(d, 300, 290)).toBe(true);
    expect(hit(d, 300, 240)).toBe(false);
    const closed = JSON.stringify(renderLog(d));
    const open = JSON.stringify(renderLog(d, true));
    expect(closed).not.toContain("Popup text");
    expect(open).toContain("Popup text");
  });
});

describe("anchoring", () => {
  it("menu item is checkable and pins the drawing to the pane", () => {
    const def = getTool("note")!;
    let d = make("note", [A(300, 300)]);
    const [item] = def.menuSection!(d, { update: (fn) => (d = fn(d)), geom }) as MenuAction[];
    expect(item.label).toBe("Anchor");
    expect(item.checked).toBe(false);
    item.onSelect!();
    expect(d.props?.anchored).toBe(true);
    // Chart scrolls by 100 px: the anchored note stays where it was.
    expect(def.handles(d, scrolled)[0]).toEqual({ x: 300, y: 300 });
    const free = make("note", [A(300, 300)]);
    expect(def.handles(free, scrolled)[0]).toEqual({ x: 200, y: 300 });
  });
  it("floating-toolbar toggle and unanchoring keep the screen place", () => {
    const def = getTool("table")!;
    const b = floatBinding(def, "toggle-anchor", theme)!;
    const d0 = make("table", [A(300, 300)]);
    expect(b.get(d0, theme)).toBe(false);
    const on = b.set(d0, true, geom);
    expect(def.handles(on, scrolled)[0]).toEqual({ x: 300, y: 300 });
    const off = b.set(on, false, scrolled);
    expect(off.props?.anchored).toBe(false);
    expect(scrolled.toPx(off.anchors[0])).toEqual({ x: 300, y: 300 });
  });
  it("anchored text starts anchored; a handle drag re-anchors it", () => {
    const def = getTool("textAbsolute")!;
    const d = make("textAbsolute", [A(300, 300)]);
    expect((def.menuSection!(d, { update: () => undefined })[0] as MenuAction).checked).toBe(true);
    const moved = def.onAnchorDrag!(d, 0, A(400, 200), geom, {});
    expect(def.handles(moved, scrolled)[0]).toEqual({ x: 400, y: 200 });
  });
});

describe("table", () => {
  it("menu top items and toolbar buttons add a column / row", () => {
    const def = getTool("table")!;
    let d = make("table", [A(100, 100)]);
    const top = def.menuTop!(d, { update: (fn) => (d = fn(d)) }) as MenuAction[];
    expect(top.map((m) => m.label)).toEqual(["Add column to right", "Add row below"]);
    top[0].onSelect!();
    expect(d.props).toMatchObject({ rows: 2, cols: 3 });
    top[1].onSelect!();
    expect(d.props).toMatchObject({ rows: 3, cols: 3 });
    const row = floatBinding(def, "insert-row", theme)!.set(d, true);
    expect(row.props?.rows).toBe(4);
  });
  it("cells render and the box hit covers the grid", () => {
    const def = getTool("table")!;
    const d = make("table", [A(100, 100)], { props: { ...def.defaultProps, content: "Name | Value\nRSI | 61" } });
    expect(JSON.stringify(renderLog(d))).toContain("RSI");
    const b = def.bounds!(d, geom);
    expect(hit(d, b.x + b.width - 2, b.y + b.height - 2)).toBe(true);
    expect(hit(d, b.x + b.width + 20, b.y)).toBe(false);
  });
});
