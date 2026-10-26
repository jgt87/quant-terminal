// Tool hooks adopted by the families: inline text editing (creation, double-click, Enter, table
// cells), anchored tools keeping their screen place (onCreate / onTranslate), choosers on pick,
// tools kept out of the flyouts (toolbar: false) and the sector's two background buttons.
import { describe, expect, it } from "vitest";
import type { Anchor, Drawing } from "@qt/core";
import { DrawingController, type DrawingHost } from "../src/chart/drawings/DrawingController";
import { floatBinding, floatButtons } from "../src/chart/drawings/floatbar";
import { allTools, getTool, toolbarGroups } from "../src/chart/drawings/registry";
import { setField } from "../src/chart/drawings/schema";
import type { InlineTextEdit, ToolGeom } from "../src/chart/drawings/types";
import { anchorPx } from "../src/chart/drawings/tools/text/textKit";
import { tableCellAt, tableSetCell } from "../src/chart/drawings/tools/text/table";
import { pickerPatch } from "../src/chart/drawings/tools/icons/IconPicker";
import { THEME } from "../src/chart/theme";

// Projection with a zoom factor: time = x / k, price = 1000 - y.
function projection(k = 1) {
  return {
    toPx: (a: Anchor) => ({ x: a.time * k, y: 1000 - a.price }),
    toData: (p: { x: number; y: number }): Anchor => ({ time: Math.round(p.x / k), price: 1000 - p.y }),
  };
}
const VIEW = { width: 800, height: 600 };
const geom = (k = 1): ToolGeom => ({ ...projection(k), viewport: VIEW, bars: [], intervalSec: 60 });

function makeController() {
  const p = projection();
  const host: DrawingHost = { ...p, bars: () => [], viewport: () => VIEW, tolerance: 6, intervalSec: () => 60, shiftTime: (t, n) => t + n };
  const texts: string[] = [];
  const c = new DrawingController(host, { changed: () => undefined, tool: () => undefined, selection: () => undefined, textRequest: (id) => texts.push(id), redraw: () => undefined });
  const edits: { id: string; edit: InlineTextEdit }[] = [];
  c.events.on("inlineEdit", (e) => edits.push(e));
  return { c, edits, texts };
}

const TEXT_TOOLS = ["text", "textNote", "priceNote", "note", "noteAbsolute", "callout", "comment", "balloon", "signpost", "textAbsolute", "table"];

describe("inline text editing (editText)", () => {
  it("every text and note tool has an inline editor", () => {
    for (const t of TEXT_TOOLS) expect(getTool(t)?.editText, t).toBeTypeOf("function");
  });

  it("creation opens the multi-line editor; committing stores the text", () => {
    const { c, edits, texts } = makeController();
    c.setTool("text");
    c.pointerDown(50, 50);
    expect(texts).toEqual([]);
    expect(edits).toHaveLength(1);
    const e = edits[0];
    expect(e.id).toBe(c.drawings[0].id);
    expect(e.edit.key).toBe("text");
    expect(e.edit.multiline).toBe(true);
    expect(e.edit.value).toBe("Text");
    // What the chart does on commit (ChartView): default setField on the key.
    c.update(e.id, (d) => setField(d, e.edit.key, "Line 1\nLine 2"));
    expect(c.drawings[0].text).toBe("Line 1\nLine 2");
  });

  it("double-click and Enter on the selected text drawing open the editor", () => {
    const { c, edits } = makeController();
    c.setTool("callout");
    c.pointerDown(100, 200);
    c.pointerUp(100, 200);
    c.pointerDown(160, 140);
    c.pointerUp(160, 140);
    const d = c.drawings[0];
    expect(d.type).toBe("callout");
    edits.length = 0;
    const box = getTool("callout")!.editText!(d, geom())!.rect;
    expect(c.doubleClick(box.x + 5, box.y + 5)).toBe(true);
    expect(edits).toHaveLength(1);
    c.selectIds([d.id]);
    expect(c.keyDown({ key: "Enter" })).toBe(true);
    expect(edits).toHaveLength(2);
    // Locked drawings are not edited.
    c.update(d.id, (k) => ({ ...k, locked: true }));
    expect(c.keyDown({ key: "Enter" })).toBe(false);
  });

  it("table cells are edited in place: the double-clicked cell, stored in the content", () => {
    const table = getTool("table")!;
    const d: Drawing = { id: "t", type: "table", anchors: [{ time: 100, price: 900 }], props: { rows: 2, cols: 2, content: "a | b\nc | d" } };
    const g = geom();
    const origin = anchorPx(d, g);
    // A point inside the second row, second column.
    let hit: { row: number; col: number } | null = null;
    let at = { x: 0, y: 0 };
    for (let y = origin.y; y < origin.y + 120 && !hit; y += 2) {
      for (let x = origin.x; x < origin.x + 300; x += 2) {
        const h = tableCellAt(d, g, x, y);
        if (h && h.row === 1 && h.col === 1) {
          hit = h;
          at = { x, y };
          break;
        }
      }
    }
    expect(hit).toEqual({ row: 1, col: 1 });
    const edit = table.editText!(d, g, at.x, at.y)!;
    expect(edit.value).toBe("d");
    expect(edit.multiline).toBe(false);
    const next = edit.apply!(d, "new | value");
    expect(next.props?.content).toBe("a | b\nc | new / value");
    expect(tableSetCell(d, 0, 0, "x\ny").props?.content).toBe("x y | b\nc | d");
    expect(tableSetCell(d, 5, 0, "x")).toBe(d);
    // Outside every cell: no editor.
    expect(table.editText!(d, g, origin.x - 50, origin.y - 50)).toBeNull();
  });
});

describe("anchored tools keep their screen place (onCreate / onTranslate)", () => {
  for (const type of ["textAbsolute", "noteAbsolute"]) {
    it(`${type}: created at its screen place; body drag + zoom does not drift`, () => {
      const def = getTool(type)!;
      const base: Drawing = { id: "a", type, anchors: [{ time: 200, price: 700 }], props: { ...def.defaultProps } };
      const created = def.onCreate!(base, geom());
      expect(created.props?.anchorPlace).toEqual({ x: 200 / 800, y: 300 / 600 });
      // Drag the body by (40, 30) px.
      const moved = def.onTranslate!(created, 40, 30, geom());
      expect(anchorPx(moved, geom(), true)).toEqual({ x: 240, y: 330 });
      // Zoom (k = 3): the screen place stays.
      expect(anchorPx(moved, geom(3), true)).toEqual({ x: 240, y: 330 });
      // A second drag after zooming.
      const again = def.onTranslate!(moved, -20, 10, geom(3));
      expect(anchorPx(again, geom(1), true)).toEqual({ x: 220, y: 340 });
    });
  }

  it("unanchored drawings move through the projection", () => {
    const def = getTool("table")!;
    const d: Drawing = { id: "t", type: "table", anchors: [{ time: 100, price: 900 }], props: { anchored: false } };
    expect(def.onCreate!(d, geom())).toEqual(d);
    expect(def.onTranslate!(d, 10, 20, geom()).anchors[0]).toEqual({ time: 110, price: 880 });
  });

  it("the pinned Text tool moves its pinned place", () => {
    const def = getTool("text")!;
    const d: Drawing = { id: "x", type: "text", anchors: [{ time: 100, price: 900 }], props: { anchored: true, anchorPos: { x: 0.5, y: 0.5 } } };
    const m = def.onTranslate!(d, 80, -60, geom());
    expect(m.props?.anchorPos).toEqual({ x: 0.6, y: 0.4 });
    expect(m.anchors).toEqual(d.anchors);
  });
});

describe("tool choosers and toolbar visibility", () => {
  it("Icon, Emoji and Sticker open a chooser on pick; the choice is merged into the drawing", () => {
    for (const t of ["icon", "emoji", "sticker"]) expect(getTool(t)?.picker, t).toBeTypeOf("function");
    expect(pickerPatch("icon", "heart", "icon")).toEqual({ props: { icon: "heart" } });
    expect(pickerPatch("emoji", "🚀", "emoji")).toEqual({ props: { emoji: "🚀" } });
    expect(pickerPatch("sticker", "🚀", "emoji")).toEqual({ props: { sticker: "emoji:🚀" } });
  });

  it("tools outside the reference toolbar are registered but not in the flyouts", () => {
    const hidden = ["arrowMarkLeft", "arrowMarkRight", "textAbsolute", "noteAbsolute", "balloon"];
    const listed = toolbarGroups().flatMap((g) => g.tools.map((t) => t.type));
    for (const t of hidden) {
      expect(getTool(t)?.toolbar, t).toBe(false);
      expect(listed, t).not.toContain(t);
    }
    // Every other non-measure tool is listed.
    for (const t of allTools()) if (t.toolbar !== false && t.family !== "measure") expect(listed, t.type).toContain(t.type);
  });

  it("Sector: two background buttons, one per color", () => {
    const def = getTool("projectionSector")!;
    expect(floatButtons(def)).toContain("background-color-2");
    const d: Drawing = { id: "s", type: "projectionSector", anchors: [], props: { color1: "#111111", color2: "#222222" } };
    expect(floatBinding(def, "background-color", THEME)?.get(d, THEME)).toBe("#111111");
    expect(floatBinding(def, "background-color-2", THEME)?.get(d, THEME)).toBe("#222222");
    expect(floatBinding(def, "background-color-2", THEME)?.set(d, "#333333").props?.color2).toBe("#333333");
  });
});
