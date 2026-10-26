import { beforeEach, describe, expect, it } from "vitest";
import type { Anchor, Drawing, Layout } from "@qt/core";
import { clearClipboard, clipboardCount, copyDrawings, pasteDrawings } from "../src/chart/drawings/clipboard";
import { creationDoubleClick, creationDown, creationKey, creationMove, creationPreview, creationUp, IDLE, type CreationState } from "../src/chart/drawings/creation";
import { DrawingController, replaceAnchor, type DrawingHost } from "../src/chart/drawings/DrawingController";
import { History } from "../src/chart/drawings/history";
import { allTools, anchorCount, comboOf, comboOfEvent, familiesWithTools, getTool, hotkeyMap, registerTool, toolbarGroups, toolLabel, unregisterTool } from "../src/chart/drawings/registry";
import { getField, setField } from "../src/chart/drawings/schema";
import { anchorHandles } from "../src/chart/drawings/draw";
import { setTemplatesForTest } from "../src/chart/drawings/templateStore";
import type { DrawingToolDef } from "../src/chart/drawings/types";
import { settingsTabs } from "../src/components/drawing/settingsTabs";
import { customizeMenu, dialogTemplateMenu, drawingMenuFor, floatTemplateMenu, genericDrawingMenu, groupMenu, multiDrawingMenu, tidySeparators, type DrawingMenuActions, type DrawingMenuState } from "../src/state/drawingMenu";
import { chartMenu } from "../src/state/menus";
import { buildObjectTree } from "../src/panels/objects/objectTreeModel";
import { isAction, SEP, type MenuItem } from "../src/components/menuTypes";

// Projection: time = x, price = 1000 - y (one "bar" per pixel).
const toPx = (a: Anchor) => ({ x: a.time, y: 1000 - a.price });
const toData = (p: { x: number; y: number }): Anchor => ({ time: Math.round(p.x), price: 1000 - p.y });
const A = (x: number, y: number): Anchor => toData({ x, y });

function makeController() {
  const changes: Drawing[][] = [];
  const texts: string[] = [];
  const host: DrawingHost = {
    toPx,
    toData,
    bars: () => [],
    viewport: () => ({ width: 800, height: 600 }),
    tolerance: 6,
    intervalSec: () => 60,
    shiftTime: (t, n) => t + n,
  };
  const c = new DrawingController(host, {
    changed: (l) => changes.push(l),
    tool: () => undefined,
    selection: () => undefined,
    textRequest: (id) => texts.push(id),
    redraw: () => undefined,
  });
  return { c, changes, texts };
}

const labels = (items: MenuItem[]) => items.map((m) => (isAction(m) ? m.label : m.type === "header" ? `#${m.label}` : "—"));

describe("tool registry", () => {
  it("migrates every pre-registry drawing type", () => {
    for (const t of ["trendline", "ray", "extended", "hline", "hray", "vline", "rectangle", "channel", "fib", "measure", "text", "vprofile", "avprofile"]) {
      const def = getTool(t);
      expect(def, t).toBeDefined();
      expect(typeof def!.render).toBe("function");
      expect(typeof def!.hitTest).toBe("function");
      expect(typeof def!.handles).toBe("function");
    }
    expect(anchorCount("channel")).toBe(3);
    expect(anchorCount("hline")).toBe(1);
    expect(getTool("nope")).toBeUndefined();
    expect(toolLabel("nope")).toBe("nope");
  });

  it("types are unique and families with tools are listed in toolbar order", () => {
    const types = allTools().map((t) => t.type);
    expect(new Set(types).size).toBe(types.length);
    // Families register tools over time: assert a subset and the order of the migrated lines.
    const fams = familiesWithTools().map((f) => f.id);
    for (const f of ["lines", "channels", "fibonacci", "projection", "shapes", "text"]) expect(fams).toContain(f);
    const lines = familiesWithTools()[0].tools.map((t) => t.type);
    expect(lines.slice(0, 6)).toEqual(["trendline", "ray", "extended", "hline", "hray", "vline"]);
    // Left toolbar: reference groups, sections in reference order, registered tools only.
    const trend = toolbarGroups().find((g) => g.id === "trend")!;
    expect(trend.label).toBe("Trend tools");
    expect(trend.sections[0].title).toBe("Lines");
    expect(trend.sections[0].tools.slice(0, 2).map((t) => t.type)).toEqual(["trendline", "ray"]);
  });

  it("hotkeys come from the tool definitions", () => {
    const hk = hotkeyMap();
    expect(hk["alt+t"]).toEqual({ type: "trendline", action: "select" });
    expect(hk["alt+f"]).toEqual({ type: "fib", action: "select" });
    expect(hk["alt+shift+r"]).toEqual({ type: "rectangle", action: "select" });
    expect(hk["alt+h"]).toEqual({ type: "hline", action: "draw-at-cursor" });
    expect(hk["alt+j"]).toEqual({ type: "hray", action: "draw-at-cursor" });
    expect(hk["alt+v"]).toEqual({ type: "vline", action: "draw-at-cursor" });
    expect(comboOf("Alt + Shift + R")).toBe("alt+shift+r");
    expect(comboOfEvent({ code: "KeyR", key: "R", ctrlKey: false, altKey: true, shiftKey: true })).toBe("alt+shift+r");
  });

  it("registerTool rejects duplicates and unregisterTool removes", () => {
    const def = { ...getTool("ray")!, type: "test-tool" };
    registerTool(def);
    expect(() => registerTool(def)).toThrow();
    unregisterTool("test-tool");
    expect(getTool("test-tool")).toBeUndefined();
  });

  it("every migrated tool hits its body and misses far away", () => {
    const g = { toPx, toData, viewport: { width: 800, height: 600 }, bars: [], intervalSec: 60 };
    const cases: Record<string, Anchor[]> = {
      trendline: [A(100, 400), A(300, 200)],
      ray: [A(100, 400), A(300, 200)],
      extended: [A(100, 400), A(300, 200)],
      hline: [A(200, 300)],
      hray: [A(200, 300)],
      vline: [A(200, 300)],
      rectangle: [A(100, 400), A(300, 200)],
      channel: [A(100, 400), A(300, 200), A(200, 250)],
      fib: [A(100, 400), A(300, 200)],
      measure: [A(100, 400), A(300, 200)],
      text: [A(200, 300)],
      vprofile: [A(100, 400), A(300, 200)],
      avprofile: [A(200, 300)],
    };
    const hits: Record<string, [number, number]> = {
      trendline: [200, 300],
      ray: [400, 100],
      extended: [50, 450],
      hline: [600, 300],
      hray: [500, 300],
      vline: [200, 50],
      rectangle: [200, 400],
      channel: [200, 300],
      fib: [200, 300],
      measure: [150, 300],
      text: [210, 305],
      vprofile: [150, 300],
      avprofile: [200, 500],
    };
    for (const [type, anchors] of Object.entries(cases)) {
      const d: Drawing = { id: type, type, anchors, text: "Note" };
      const def = getTool(type)!;
      expect(def.hitTest(d, g, ...hits[type], 6), `${type} hit`).toBe(true);
      expect(def.hitTest(d, g, 760, 580, 6), `${type} miss`).toBe(false);
    }
  });

  it("trendline props extend the hit line", () => {
    const g = { toPx, toData, viewport: { width: 800, height: 600 }, bars: [], intervalSec: 60 };
    const d: Drawing = { id: "t", type: "trendline", anchors: [A(100, 400), A(200, 300)] };
    const def = getTool("trendline")!;
    expect(def.hitTest(d, g, 300, 200, 4)).toBe(false);
    expect(def.hitTest({ ...d, props: { extendRight: true } }, g, 300, 200, 4)).toBe(true);
    expect(def.hitTest({ ...d, props: { extendLeft: true } }, g, 0, 500, 4)).toBe(true);
  });
});

describe("creation state machine", () => {
  const two = { type: "trendline", anchors: 2 as const };
  const p = (x: number, y: number) => ({ x, y });

  it("click-per-anchor with rubber band", () => {
    let r = creationDown(IDLE, two, A(10, 10), p(10, 10));
    expect(r.done).toBeUndefined();
    r = creationUp(r.state, A(10, 10), p(10, 10));
    r = creationMove(r.state, A(50, 60), p(50, 60));
    expect(creationPreview(r.state)?.anchors).toEqual([A(10, 10), A(50, 60)]);
    r = creationDown(r.state, two, A(60, 70), p(60, 70));
    expect(r.done?.anchors).toEqual([A(10, 10), A(60, 70)]);
    expect(r.state).toBe(IDLE);
  });

  it("drag-to-create places both anchors in one gesture", () => {
    let r = creationDown(IDLE, two, A(10, 10), p(10, 10));
    r = creationMove(r.state, A(40, 40), p(40, 40));
    expect((r.state as Extract<CreationState, { kind: "click" }>).dragging).toBe(true);
    r = creationUp(r.state, A(80, 90), p(80, 90));
    expect(r.done?.anchors).toEqual([A(10, 10), A(80, 90)]);
  });

  it("a small wobble is still a click", () => {
    let r = creationDown(IDLE, two, A(10, 10), p(10, 10));
    r = creationMove(r.state, A(12, 11), p(12, 11));
    r = creationUp(r.state, A(12, 11), p(12, 11));
    expect(r.done).toBeUndefined();
  });

  it("drag on a 3-anchor tool places two anchors then waits for the third", () => {
    const three = { type: "channel", anchors: 3 as const };
    let r = creationDown(IDLE, three, A(0, 0), p(0, 0));
    r = creationMove(r.state, A(30, 30), p(30, 30));
    r = creationUp(r.state, A(50, 50), p(50, 50));
    expect(r.done).toBeUndefined();
    r = creationDown(r.state, three, A(50, 80), p(50, 80));
    expect(r.done?.anchors).toHaveLength(3);
  });

  it("1-anchor tools finish on press", () => {
    expect(creationDown(IDLE, { type: "hline", anchors: 1 }, A(1, 1), p(1, 1)).done?.anchors).toEqual([A(1, 1)]);
  });

  it("freehand simplifies the pointer path", () => {
    const tool = { type: "brush", anchors: "freehand" as const };
    let r = creationDown(IDLE, tool, A(0, 0), p(0, 0));
    for (let x = 5; x <= 100; x += 5) r = creationMove(r.state, A(x, 0), p(x, 0));
    r = creationUp(r.state, A(100, 50), p(100, 50));
    expect(r.done?.points).toEqual([A(0, 0), A(100, 0), A(100, 50)]);
    expect(r.done?.anchors).toEqual([]);
  });

  it("poly: clicks add vertices, Esc removes the last, Enter finishes, double click finishes", () => {
    const tool = { type: "path", anchors: "poly" as const };
    let r = creationDown(IDLE, tool, A(0, 0), p(0, 0));
    r = creationDown(r.state, tool, A(50, 0), p(50, 0));
    r = creationDown(r.state, tool, A(50, 50), p(50, 50));
    r = creationKey(r.state, "Escape")!;
    expect((r.state as Extract<CreationState, { kind: "poly" }>).points).toHaveLength(2);
    const done = creationKey(r.state, "Enter")!;
    expect(done.done?.points).toEqual([A(0, 0), A(50, 0)]);
    // A double click lands two presses on the same spot: deduplicated.
    r = creationDown(r.state, tool, A(90, 90), p(90, 90));
    r = creationDown(r.state, tool, A(90, 90), p(90, 90));
    expect(creationDoubleClick(r.state).done?.points).toEqual([A(0, 0), A(50, 0), A(90, 90)]);
  });

  it("Esc cancels a click placement and a one-point poly", () => {
    const r = creationDown(IDLE, two, A(1, 1), p(1, 1));
    expect(creationKey(r.state, "Escape")).toEqual({ state: IDLE, cancelled: true });
    const poly = creationDown(IDLE, { type: "path", anchors: "poly" }, A(1, 1), p(1, 1));
    expect(creationKey(poly.state, "Escape")?.cancelled).toBe(true);
    expect(creationKey(IDLE, "Enter")).toBeNull();
  });
});

describe("history", () => {
  it("undo / redo with a limit and merge keys", () => {
    const h = new History<number>(3);
    h.record(0);
    h.record(1);
    h.record(2);
    h.record(3);
    expect(h.size).toBe(3);
    expect(h.undo(4)).toBe(3);
    expect(h.redo(3)).toBe(4);
    h.record(10, "k");
    h.record(11, "k");
    expect(h.undo(12)).toBe(10);
    h.seal();
    expect(h.canRedo).toBe(true);
    h.record(5);
    expect(h.canRedo).toBe(false);
  });
});

describe("clipboard", () => {
  beforeEach(() => clearClipboard());
  it("copies deep, pastes with new ids and without group/lock/hidden", () => {
    const d: Drawing = { id: "a", type: "trendline", anchors: [A(1, 1)], groupId: "g", locked: true, hidden: true, style: { color: "#ff0000" } };
    copyDrawings([d]);
    d.style!.color = "#000000";
    expect(clipboardCount()).toBe(1);
    let n = 0;
    const [p] = pasteDrawings(() => `n${++n}`);
    expect(p).toMatchObject({ id: "n1", type: "trendline", style: { color: "#ff0000" } });
    expect(p.groupId).toBeUndefined();
    expect(p.locked).toBeUndefined();
    expect(p.hidden).toBeUndefined();
  });
});

describe("DrawingController", () => {
  beforeEach(() => {
    clearClipboard();
    setTemplatesForTest({});
  });
  const line = (id: string, x0: number, y0: number, x1: number, y1: number, extra: Partial<Drawing> = {}): Drawing => ({ id, type: "trendline", anchors: [A(x0, y0), A(x1, y1)], ...extra });

  it("drag-to-create a trend line, then undo / redo", () => {
    const { c, changes } = makeController();
    c.setTool("trendline");
    c.pointerDown(100, 100);
    c.pointerMove(150, 150);
    c.pointerMove(200, 200);
    c.pointerUp(200, 200);
    expect(c.drawings).toHaveLength(1);
    expect(c.drawings[0].anchors).toEqual([A(100, 100), A(200, 200)]);
    expect(c.tool).toBe("cursor");
    expect(c.selectedIds).toEqual([c.drawings[0].id]);
    expect(c.keyDown({ key: "z", ctrl: true })).toBe(true);
    expect(c.drawings).toHaveLength(0);
    c.keyDown({ key: "y", ctrl: true });
    expect(c.drawings).toHaveLength(1);
    c.keyDown({ key: "Z", ctrl: true, shift: true });
    expect(changes.length).toBeGreaterThanOrEqual(3);
  });

  it("stay in drawing mode keeps the tool; new drawings use the default template", () => {
    const { c } = makeController();
    setTemplatesForTest({ hline: { default: { style: { color: "#123456" } }, saved: [] } });
    c.setFlags({ stayInDrawingMode: true });
    c.setTool("hline");
    c.pointerDown(10, 10);
    c.pointerUp(10, 10);
    c.pointerDown(10, 50);
    expect(c.drawings).toHaveLength(2);
    expect(c.tool).toBe("hline");
    expect(c.drawings[0].style?.color).toBe("#123456");
  });

  it("Shift constrains the second anchor to horizontal", () => {
    const { c } = makeController();
    c.setTool("trendline");
    c.pointerDown(100, 100);
    c.pointerUp(100, 100);
    c.pointerDown(300, 108, { shift: true });
    expect(c.drawings[0].anchors[1]).toEqual(A(300, 100));
  });

  it("Ctrl+click multi-select, group move as one undo step", () => {
    const { c } = makeController();
    c.setDrawings([line("a", 100, 100, 200, 100), line("b", 100, 300, 200, 300)], "SYM");
    c.pointerDown(150, 100);
    c.pointerUp(150, 100);
    c.pointerDown(150, 300, { ctrl: true });
    c.pointerUp(150, 300);
    expect(c.selectedIds).toEqual(["a", "b"]);
    c.pointerDown(150, 100);
    c.pointerMove(160, 130);
    c.pointerMove(170, 150);
    c.pointerUp(170, 150);
    expect(c.drawings.map((d) => d.anchors[0])).toEqual([A(120, 150), A(120, 350)]);
    c.undo();
    expect(c.drawings.map((d) => d.anchors[0])).toEqual([A(100, 100), A(100, 300)]);
  });

  it("Ctrl+drag rubber band selects intersecting drawings", () => {
    const { c } = makeController();
    c.setDrawings([line("a", 100, 100, 200, 100), line("b", 100, 300, 200, 300), { id: "h", type: "hline", anchors: [A(10, 500)] }]);
    c.pointerDown(50, 50, { ctrl: true });
    c.pointerMove(400, 520);
    expect(c.band).not.toBeNull();
    c.pointerUp(400, 520, { ctrl: true });
    expect(c.selectedIds.sort()).toEqual(["a", "b", "h"]);
    c.pointerDown(5, 5);
    c.pointerDown(50, 50, { ctrl: true });
    c.pointerUp(250, 150);
    expect(c.selectedIds).toEqual(["a"]);
  });

  it("Alt+drag clones and moves the clone", () => {
    const { c } = makeController();
    c.setDrawings([line("a", 100, 100, 200, 100)]);
    c.pointerDown(150, 100, { alt: true });
    c.pointerMove(150, 140, { alt: true });
    c.pointerUp(150, 140);
    expect(c.drawings).toHaveLength(2);
    expect(c.drawings[0].anchors[0]).toEqual(A(100, 100));
    expect(c.drawings[1].anchors[0]).toEqual(A(100, 140));
    expect(c.selectedIds).toEqual([c.drawings[1].id]);
    c.undo();
    expect(c.drawings).toHaveLength(1);
  });

  it("locked and lock-all drawings do not move; hide all hides from hit-testing", () => {
    const { c } = makeController();
    c.setDrawings([line("a", 100, 100, 200, 100, { locked: true }), line("b", 100, 300, 200, 300)]);
    c.pointerDown(150, 100);
    c.pointerMove(150, 160);
    c.pointerUp(150, 160);
    expect(c.drawings[0].anchors[0]).toEqual(A(100, 100));
    c.setFlags({ lockAll: true });
    c.pointerDown(150, 300);
    c.pointerMove(150, 360);
    c.pointerUp(150, 360);
    expect(c.drawings[1].anchors[0]).toEqual(A(100, 300));
    c.setFlags({ lockAll: false, hideAll: true });
    expect(c.hitTest(150, 300)).toBeNull();
  });

  it("handle drag edits one anchor; Esc during a drag reverts", () => {
    const { c } = makeController();
    c.setDrawings([line("a", 100, 100, 200, 100)]);
    c.pointerDown(200, 100);
    c.pointerMove(250, 50);
    c.pointerUp(250, 50);
    expect(c.drawings[0].anchors).toEqual([A(100, 100), A(250, 50)]);
    c.pointerDown(100, 100);
    c.pointerMove(130, 130);
    c.cancel();
    expect(c.drawings[0].anchors[0]).toEqual(A(100, 100));
  });

  it("arrow keys nudge by bars and pixels; Delete removes the selection", () => {
    const { c } = makeController();
    c.setDrawings([line("a", 100, 100, 200, 100)]);
    c.selectIds(["a"]);
    c.keyDown({ key: "ArrowRight" });
    c.keyDown({ key: "ArrowUp", shift: true });
    expect(c.drawings[0].anchors[0]).toEqual(A(101, 90));
    expect(c.keyDown({ key: "Delete" })).toBe(true);
    expect(c.drawings).toHaveLength(0);
    expect(c.keyDown({ key: "ArrowLeft" })).toBe(false);
  });

  it("Ctrl+C / Ctrl+V duplicates across controllers (other chart)", () => {
    const one = makeController().c;
    const two = makeController().c;
    one.setDrawings([line("a", 100, 100, 200, 100)]);
    one.selectIds(["a"]);
    expect(one.keyDown({ key: "c", ctrl: true })).toBe(true);
    expect(one.keyDown({ key: "v", ctrl: true })).toBe(true);
    expect(one.drawings).toHaveLength(2);
    expect(one.drawings[1].anchors).toEqual(one.drawings[0].anchors);
    expect(two.paste()).toBe(true);
    expect(two.drawings).toHaveLength(1);
  });

  it("visual order and per-symbol histories", () => {
    const { c } = makeController();
    c.setDrawings([line("a", 0, 0, 1, 1), line("b", 0, 0, 1, 1), line("c", 0, 0, 1, 1)], "X");
    c.reorder("a", "forward");
    expect(c.drawings.map((d) => d.id)).toEqual(["b", "a", "c"]);
    c.reorder("c", "back");
    expect(c.drawings.map((d) => d.id)).toEqual(["c", "b", "a"]);
    c.reorder("c", "front");
    c.reorder(["a"], "backward");
    expect(c.drawings.map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(c.canUndo).toBe(true);
    c.setDrawings([], "Y");
    expect(c.canUndo).toBe(false);
    c.setDrawings(c.drawings, "X");
    expect(c.canUndo).toBe(true);
  });

  it("settings edits with one merge key are one undo step", () => {
    const { c } = makeController();
    c.setDrawings([line("a", 0, 0, 1, 1)]);
    c.update("a", (d) => ({ ...d, style: { color: "#111111" } }), "settings:a");
    c.update("a", (d) => ({ ...d, style: { color: "#222222" } }), "settings:a");
    c.sealHistory();
    c.undo();
    expect(c.drawings[0].style).toBeUndefined();
  });

  it("text tools open the inline editor on creation; eraser removes on click", () => {
    const { c, texts } = makeController();
    const edits: string[] = [];
    c.events.on("inlineEdit", (e) => edits.push(e.id));
    c.setTool("text");
    c.pointerDown(50, 50);
    expect(c.drawings[0].text).toBe("Text");
    expect(edits).toEqual([c.drawings[0].id]);
    expect(texts).toEqual([]);
    c.setTool("eraser");
    c.pointerDown(55, 55);
    expect(c.drawings).toHaveLength(0);
  });

  it("zoom tool reports the dragged x range", () => {
    let zoomed: number[] = [];
    const { c } = makeController();
    (c as unknown as { host: DrawingHost }).host.zoomTo = (a, b) => (zoomed = [a, b]);
    c.setTool("zoom");
    c.pointerDown(100, 10);
    c.pointerMove(300, 200);
    c.pointerUp(300, 200);
    expect(zoomed).toEqual([100, 300]);
    expect(c.tool).toBe("cursor");
  });

  it("poly and freehand tools through the controller (registered test tools)", () => {
    const base = getTool("trendline")!;
    const brush: DrawingToolDef = { ...base, type: "t-brush", family: "brushes", anchors: "freehand", hitTest: () => false, handles: anchorHandles };
    const path: DrawingToolDef = { ...base, type: "t-path", family: "shapes", anchors: "poly", hitTest: () => false, handles: anchorHandles };
    registerTool(brush);
    registerTool(path);
    try {
      const { c } = makeController();
      c.setTool("t-brush");
      c.pointerDown(0, 0);
      for (let x = 2; x <= 60; x += 2) c.pointerMove(x, x < 30 ? 0 : x - 30);
      c.pointerUp(60, 30);
      expect(c.drawings[0].points!.length).toBeGreaterThanOrEqual(3);
      expect(c.drawings[0].points!.length).toBeLessThan(10);
      c.setTool("t-path");
      c.pointerDown(0, 0);
      c.pointerUp(0, 0);
      c.pointerDown(40, 0);
      c.pointerUp(40, 0);
      c.pointerDown(40, 40);
      c.pointerUp(40, 40);
      expect(c.keyDown({ key: "Enter" })).toBe(true);
      expect(c.drawings[1].points).toEqual([A(0, 0), A(40, 0), A(40, 40)]);
      // Handle 1 of a poly drawing edits points[1]; moving translates every point.
      expect(replaceAnchor(c.drawings[1], 1, A(45, 5)).points![1]).toEqual(A(45, 5));
    } finally {
      unregisterTool("t-brush");
      unregisterTool("t-path");
    }
  });
});

describe("old layouts load and keep rendering through the registry", () => {
  // A layout saved before the registry, with every drawing type that existed then.
  const old: Layout = {
    id: "old",
    name: "Old",
    symbol: "AAPL",
    interval: "1D",
    chartType: "candles",
    logScale: false,
    indicators: [],
    updatedAt: 1,
    drawings: {
      AAPL: [
        { id: "1", type: "trendline", anchors: [{ time: 100, price: 10 }, { time: 200, price: 20 }], style: { color: "#ff0000", width: 2, lineStyle: "dashed" } },
        { id: "2", type: "ray", anchors: [{ time: 100, price: 10 }, { time: 200, price: 20 }] },
        { id: "3", type: "extended", anchors: [{ time: 100, price: 10 }, { time: 200, price: 20 }], locked: true },
        { id: "4", type: "hline", anchors: [{ time: 100, price: 15 }], hidden: true },
        { id: "5", type: "hray", anchors: [{ time: 100, price: 15 }] },
        { id: "6", type: "vline", anchors: [{ time: 150, price: 15 }], visibility: { minutes: false } },
        { id: "7", type: "rectangle", anchors: [{ time: 100, price: 10 }, { time: 200, price: 20 }], style: { fillOpacity: 0.3 } },
        { id: "8", type: "channel", anchors: [{ time: 100, price: 10 }, { time: 200, price: 20 }, { time: 150, price: 12 }] },
        { id: "9", type: "fib", anchors: [{ time: 100, price: 10 }, { time: 200, price: 20 }], style: { levels: [{ ratio: 0.5, color: "#00ff00" }], fibLevels: true } },
        { id: "10", type: "measure", anchors: [{ time: 100, price: 10 }, { time: 200, price: 20 }] },
        { id: "11", type: "text", anchors: [{ time: 100, price: 10 }], text: "hello", style: { textSize: 14, bold: true } },
        { id: "12", type: "vprofile", anchors: [{ time: 100, price: 10 }, { time: 200, price: 20 }] },
        { id: "13", type: "avprofile", anchors: [{ time: 100, price: 10 }] },
      ],
    },
  };

  it("every old drawing has a tool, keeps its fields, and gets a settings window", () => {
    const list = structuredClone(old).drawings.AAPL;
    const { c } = makeController();
    c.setDrawings(list, "AAPL");
    expect(c.drawings).toEqual(old.drawings.AAPL);
    for (const d of list) {
      expect(getTool(d.type), d.type).toBeDefined();
      expect(settingsTabs(d.type).length, d.type).toBeGreaterThan(0);
    }
    // Text follows the catalog: Text and Visibility tabs only.
    expect(settingsTabs("text").map((t) => t.label)).toEqual(["Text", "Visibility"]);
    expect(settingsTabs("hline").map((t) => t.label)).toEqual(["Style", "Text", "Coordinates", "Visibility"]);
    // Hidden drawings stay out of hit-testing; locked ones are still selectable.
    expect(c.hitTest(50, 1000 - 15)).toBeNull();
  });

  it("an unknown type (tool not in this build) survives a save round trip untouched", () => {
    const { c, changes } = makeController();
    const future: Drawing = { id: "f", type: "future-tool", anchors: [], points: [{ time: 1, price: 2 }], props: { x: 1 } };
    c.setDrawings([future, ...old.drawings.AAPL.slice(0, 1)]);
    c.remove("1");
    expect(changes.at(-1)).toEqual([future]);
  });
});

describe("settings schema paths", () => {
  const d: Drawing = { id: "a", type: "trendline", anchors: [] };
  it("get/set style, props and top-level fields", () => {
    let n = setField(d, "style.color", "#ff0000");
    n = setField(n, "props.extendLeft", true);
    n = setField(n, "text", "x");
    expect(getField(n, "style.color")).toBe("#ff0000");
    expect(getField(n, "props.extendLeft")).toBe(true);
    expect(n.text).toBe("x");
    n = setField(n, "props.extendLeft", undefined);
    expect(n.props).toBeUndefined();
    expect(setField({ ...d, style: { dash: [2, 2] } }, "style.lineStyle", "dotted").style).toEqual({ lineStyle: "dotted" });
  });
});

describe("drawing menus", () => {
  const calls: string[] = [];
  const log = (name: string) => (...args: unknown[]) => void calls.push(`${name}:${JSON.stringify(args[0])}`);
  const a: DrawingMenuActions = {
    settings: log("settings"),
    alert: log("alert"),
    clone: log("clone"),
    copy: log("copy"),
    order: log("order"),
    setLocked: log("lock"),
    setHidden: log("hide"),
    objectTree: log("objectTree"),
    remove: log("remove"),
    visibility: log("visibility"),
    groupNew: log("groupNew"),
    groupAdd: log("groupAdd"),
    groupRemove: log("groupRemove"),
    update: log("update"),
    template: { saveAs: log("saveAs"), saveDefault: log("saveDefault"), applyDefault: log("applyDefault"), apply: log("apply"), reset: log("reset") },
  };
  const d1: Drawing = { id: "a", type: "trendline", anchors: [], groupId: "g1" };
  const d2: Drawing = { id: "b", type: "vline", anchors: [] };
  const s: DrawingMenuState = {
    groups: [{ id: "g1", name: "Group 1", symbol: "X" }],
    templates: { trendline: { saved: [{ name: "Red", style: { color: "#f00" } }] } },
    unit: { group: "days", n: 1 },
    drawings: [d1, d2],
  };

  it("generic menu order per the reference", () => {
    expect(labels(genericDrawingMenu(d1, s, a))).toEqual([
      "Add alert on trendline…",
      "—",
      "Template",
      "Visual order",
      "Visibility on intervals",
      "Object tree",
      "—",
      "Clone",
      "Copy",
      "—",
      "Lock",
      "Hide",
      "Remove",
      "—",
      "Settings…",
    ]);
    // Tools without alerts start with Template.
    expect(labels(genericDrawingMenu({ id: "m", type: "measure", anchors: [] }, s, a))[0]).toBe("Template");
  });

  it("submenus: visual order, template, visibility, group", () => {
    const m = genericDrawingMenu(d1, s, a);
    const sub = (label: string) => (m.find((x) => isAction(x) && x.label === label) as { submenu: MenuItem[] }).submenu;
    expect(labels(sub("Visual order"))).toEqual(["Bring to front", "Send to back", "Bring forward", "Send backward"]);
    expect(labels(sub("Template"))).toEqual(["Save as…", "Apply default", "—", "Red"]);
    expect(labels(sub("Visibility on intervals"))).toEqual(["Current interval and above", "Current interval and below", "Current interval only", "All intervals"]);
    expect((sub("Visibility on intervals")[3] as { checked?: boolean }).checked).toBe(true);
    expect(labels(groupMenu(["a"], s, a))).toEqual(["Add to new group", "Add to Group 1", "—", "Remove from group"]);
    expect(labels(dialogTemplateMenu(d1, s.templates, a))).toEqual(["Save as…", "Save as default", "Apply default", "—", "Red", "—", "Reset settings"]);
  });

  it("multi-selection menu", () => {
    expect(labels(multiDrawingMenu(["a", "b"], s, a))).toEqual(["Object tree", "Visual order", "Visibility on intervals", "—", "Clone", "Copy", "—", "Lock", "Hide", "Remove", "—", "Settings…"]);
    expect(labels(drawingMenuFor(d1, ["a", "b"], s, a))[0]).toBe("Object tree");
    expect(labels(drawingMenuFor(d1, ["a"], s, a))[0]).toBe("Add alert on trendline…");
  });

  it("tool menu hooks: menuSection between Copy and Lock, menuTop first; contextMenu with omit / insertAfter", () => {
    const def = getTool("vline")!;
    const before = { section: def.menuSection, top: def.menuTop, menu: def.contextMenu };
    def.menuSection = () => [{ label: "Anchor", checked: false }];
    def.menuTop = () => [{ label: "Add column to right" }];
    try {
      const m = labels(drawingMenuFor(d2, ["b"], s, a));
      expect(m.slice(0, 2)).toEqual(["Add column to right", "—"]);
      const copy = m.indexOf("Copy");
      expect(m.slice(copy, copy + 4)).toEqual(["Copy", "—", "Anchor", "—"]);
      def.contextMenu = (d, ctx) => [{ id: "x", label: "Tool item", onSelect: () => ctx.update((k) => k) }, SEP, ...ctx.generic({ omit: ["clone", "copy"] })];
      const m2 = labels(drawingMenuFor(d2, ["b"], s, a));
      expect(m2[0]).toBe("Tool item");
      expect(m2).not.toContain("Clone");
      expect(m2.filter((x, i) => x === "—" && m2[i + 1] === "—")).toEqual([]);
    } finally {
      def.menuSection = before.section;
      def.menuTop = before.top;
      def.contextMenu = before.menu;
    }
    const custom = customizeMenu(genericDrawingMenu(d2, s, a), { insertAfter: [{ id: "hide", items: [{ label: "Extra" }] }] });
    expect(labels(custom).indexOf("Extra")).toBe(labels(custom).indexOf("Hide") + 1);
    expect(labels(tidySeparators([SEP, { label: "a" }, SEP, SEP, { label: "b" }, SEP]))).toEqual(["a", "—", "b"]);
  });

  it("template menu actions call through", () => {
    calls.length = 0;
    for (const it of dialogTemplateMenu(d1, s.templates, a)) if (isAction(it)) it.onSelect?.();
    expect(calls.map((c) => c.split(":")[0])).toEqual(["saveAs", "saveDefault", "applyDefault", "apply", "reset"]);
    expect(labels(floatTemplateMenu(d1, s.templates, a)).slice(0, 2)).toEqual(["Save Drawing Template As…", "Apply Default Drawing Template"]);
  });

  it("chart background menu: paste, hide all, lock all, sync", () => {
    const items = chartMenu(
      { chartType: "candles", logScale: false, drawingCount: 2, hiddenDrawings: 0, indicatorCount: 0, priceText: "1", clipboard: 1, hideAllDrawings: true },
      {
        resetView: () => undefined,
        copy: () => undefined,
        setChartType: () => undefined,
        setLog: () => undefined,
        removeDrawings: () => undefined,
        showHiddenDrawings: () => undefined,
        removeIndicators: () => undefined,
        openChartSettings: () => undefined,
        paste: () => undefined,
        setHideAllDrawings: () => undefined,
        setLockAllDrawings: () => undefined,
        setSyncDrawings: () => undefined,
      },
    );
    const l = labels(items);
    expect(l).toContain("Paste");
    expect(l).toContain("Hide all drawings");
    expect(l).toContain("Lock all drawings");
    expect(l).toContain("Sync drawings across charts");
    expect((items.find((m) => isAction(m) && m.label === "Hide all drawings") as { checked: boolean }).checked).toBe(true);
  });
});

describe("object tree model", () => {
  const drawings: Drawing[] = [
    { id: "a", type: "trendline", anchors: [], groupId: "g1" },
    { id: "b", type: "hline", anchors: [], hidden: true, name: "Support" },
    { id: "c", type: "fib", anchors: [], locked: true },
  ];
  const input = {
    symbol: "AAPL",
    panes: [
      { id: "main", main: true, uids: ["i1"] },
      { id: "pane-i2", main: false, uids: ["i2"] },
    ],
    drawings,
    groups: [{ id: "g1", name: "Swing", symbol: "AAPL" }],
    selected: ["c"],
    indicators: [
      { uid: "i1", name: "SMA", visible: true },
      { uid: "i2", name: "RSI", visible: false },
    ],
    label: toolLabel,
  };

  it("panes, groups, drawings (newest first) and indicators", () => {
    const t = buildObjectTree(input);
    expect(t[0].groups[0]).toMatchObject({ name: "Swing", items: [{ id: "a", name: "Trend line" }] });
    expect(t[0].drawings.map((d) => [d.id, d.name, d.hidden, d.locked, d.selected])).toEqual([
      ["c", "Fib retracement", false, true, true],
      ["b", "Support", true, false, false],
    ]);
    expect(t[0].indicators.map((i) => i.name)).toEqual(["SMA"]);
    expect(t[1]).toMatchObject({ main: false, name: "RSI", indicators: [{ uid: "i2", hidden: true }] });
  });

  it("filter keeps matches and groups holding matches", () => {
    const t = buildObjectTree(input, "trend");
    expect(t[0].groups.map((g) => g.items.map((d) => d.id))).toEqual([["a"]]);
    expect(t[0].drawings).toEqual([]);
    expect(t[0].indicators).toEqual([]);
    expect(buildObjectTree(input, "swing")[0].groups[0].items).toHaveLength(1);
    expect(buildObjectTree(input, "rsi")[1].indicators).toHaveLength(1);
  });
});
