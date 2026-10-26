import { describe, expect, it } from "vitest";
import type { Anchor, Bar, Drawing } from "../src/types";
import {
  allAnchors,
  boundsOf,
  constrainPoint,
  magnetSnap,
  nudgeDrawing,
  rectFromPoints,
  rectsIntersect,
  rubberBandSelect,
  simplifyPath,
  translateDrawing,
} from "../src/drawings/edit";
import { applyTemplate, deleteTemplate, initialStyle, saveTemplate, setDefaultTemplate, templateOf } from "../src/drawings/templates";
import { intervalUnit, matchingPreset, unitOfInterval, visibilityPreset, visibleAt, visibleOnInterval } from "../src/visibility";
import { hitTestBody, hitTestDrawing } from "../src/drawings/geometry";

// Identity-ish projection: time = x, price = 1000 - y.
const toPx = (a: Anchor) => ({ x: a.time, y: 1000 - a.price });
const toData = (p: { x: number; y: number }): Anchor => ({ time: p.x, price: 1000 - p.y });

describe("simplifyPath (RDP)", () => {
  it("drops collinear points and keeps the ends", () => {
    const pts = Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0 }));
    expect(simplifyPath(pts)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  });
  it("keeps corners above epsilon", () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 0.5 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 100, y: 100 }];
    expect(simplifyPath(pts, 1)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
  });
  it("returns short inputs unchanged", () => {
    expect(simplifyPath([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
  });
});

describe("constrainPoint (Shift)", () => {
  const o = { x: 100, y: 100 };
  it("snaps to horizontal", () => expect(constrainPoint(o, { x: 200, y: 110 })).toEqual({ x: 200, y: 100 }));
  it("snaps to vertical", () => expect(constrainPoint(o, { x: 95, y: 20 })).toEqual({ x: 100, y: 20 }));
  it("snaps to 45 degrees", () => expect(constrainPoint(o, { x: 150, y: 60 })).toEqual({ x: 150, y: 50 }));
  it("same point stays", () => expect(constrainPoint(o, o)).toEqual(o));
});

describe("magnetSnap", () => {
  const bars: Bar[] = [{ time: 100, open: 500, high: 520, low: 490, close: 510, volume: 1 }];
  it("off leaves the anchor", () => expect(magnetSnap({ time: 103, price: 505 }, bars, toPx, "off")).toEqual({ time: 103, price: 505 }));
  it("strong always snaps to the nearest OHLC", () => expect(magnetSnap({ time: 160, price: 600 }, bars, toPx, "strong")).toEqual({ time: 100, price: 520 }));
  it("weak snaps only within 10 px", () => {
    expect(magnetSnap({ time: 104, price: 512 }, bars, toPx, "weak")).toEqual({ time: 100, price: 510 });
    expect(magnetSnap({ time: 160, price: 600 }, bars, toPx, "weak")).toEqual({ time: 160, price: 600 });
  });
});

describe("bounds and rubber band", () => {
  it("bounds of points", () => expect(boundsOf([{ x: 5, y: 9 }, { x: 1, y: 3 }])).toEqual({ x: 1, y: 3, width: 4, height: 6 }));
  it("intersection includes zero-height boxes (horizontal lines)", () => {
    const band = rectFromPoints({ x: 10, y: 10 }, { x: 50, y: 50 });
    expect(rectsIntersect(band, { x: 0, y: 30, width: 800, height: 0 })).toBe(true);
    expect(rectsIntersect(band, { x: 0, y: 60, width: 800, height: 0 })).toBe(false);
  });
  it("selects only intersecting items", () => {
    const band = rectFromPoints({ x: 50, y: 50 }, { x: 10, y: 10 });
    const items = [
      { id: "a", bounds: { x: 0, y: 0, width: 20, height: 20 } },
      { id: "b", bounds: { x: 60, y: 60, width: 5, height: 5 } },
      { id: "c", bounds: { x: 40, y: 45, width: 100, height: 1 } },
    ];
    expect(rubberBandSelect(band, items)).toEqual(["a", "c"]);
  });
});

describe("moving drawings", () => {
  const d: Drawing = { id: "x", type: "path", anchors: [], points: [{ time: 10, price: 900 }, { time: 20, price: 950 }] };
  it("allAnchors joins anchors and points", () => expect(allAnchors(d)).toHaveLength(2));
  it("translate moves points too", () => {
    const m = translateDrawing(d, 5, 10, toPx, toData);
    expect(m.points).toEqual([{ time: 15, price: 890 }, { time: 25, price: 940 }]);
    expect(d.points![0]).toEqual({ time: 10, price: 900 });
  });
  it("nudge by bars and pixels", () => {
    const t: Drawing = { id: "t", type: "trendline", anchors: [{ time: 10, price: 5 }] };
    const n = nudgeDrawing(t, 2, -1, (time, k) => time + k * 60, (_t, p, dy) => p - dy);
    expect(n.anchors).toEqual([{ time: 130, price: 6 }]);
  });
});

describe("hitTestBody matches hitTestDrawing bodies", () => {
  it("line body", () => {
    const d: Drawing = { id: "l", type: "trendline", anchors: [{ time: 0, price: 1000 }, { time: 100, price: 900 }] };
    expect(hitTestBody(d, toPx, 50, 50)).toBe(true);
    expect(hitTestDrawing(d, toPx, 50, 50)).toEqual({ hit: true, anchorIndex: null });
    expect(hitTestBody(d, toPx, 50, 90)).toBe(false);
    expect(hitTestBody({ ...d, type: "unknown-tool" }, toPx, 50, 50)).toBe(false);
  });
});

describe("interval visibility rules", () => {
  it("units from seconds", () => {
    expect(intervalUnit(900)).toEqual({ group: "minutes", n: 15 });
    expect(intervalUnit(7200)).toEqual({ group: "hours", n: 2 });
    expect(intervalUnit(86400)).toEqual({ group: "days", n: 1 });
    expect(intervalUnit(604800)).toEqual({ group: "weeks", n: 1 });
    expect(intervalUnit(2592000)).toEqual({ group: "months", n: 1 });
    expect(intervalUnit(30)).toEqual({ group: "seconds", n: 30 });
    expect(unitOfInterval("4h")).toEqual({ group: "hours", n: 4 });
  });
  it("old boolean form still works", () => {
    expect(visibleOnInterval({ minutes: false }, "15m")).toBe(false);
    expect(visibleOnInterval({ minutes: false }, "1h")).toBe(true);
    expect(visibleOnInterval(undefined, "1D")).toBe(true);
  });
  it("ranges limit the multiplier", () => {
    const v = { minutes: { min: 5, max: 30 } };
    expect(visibleAt(v, { group: "minutes", n: 15 })).toBe(true);
    expect(visibleAt(v, { group: "minutes", n: 1 })).toBe(false);
    expect(visibleAt(v, { group: "hours", n: 1 })).toBe(true);
  });
  it("presets relative to the current interval", () => {
    const u = { group: "minutes" as const, n: 15 };
    const above = visibilityPreset("above", u)!;
    expect(visibleAt(above, { group: "minutes", n: 5 })).toBe(false);
    expect(visibleAt(above, { group: "minutes", n: 30 })).toBe(true);
    expect(visibleAt(above, { group: "days", n: 1 })).toBe(true);
    expect(visibleAt(above, { group: "seconds", n: 30 })).toBe(false);
    const below = visibilityPreset("below", u)!;
    expect(visibleAt(below, { group: "minutes", n: 5 })).toBe(true);
    expect(visibleAt(below, { group: "hours", n: 1 })).toBe(false);
    const only = visibilityPreset("only", u)!;
    expect(visibleAt(only, u)).toBe(true);
    expect(visibleAt(only, { group: "minutes", n: 30 })).toBe(false);
    expect(visibleAt(only, { group: "days", n: 1 })).toBe(false);
    expect(visibilityPreset("all", u)).toBeUndefined();
    expect(matchingPreset(only, u)).toBe("only");
    expect(matchingPreset(undefined, u)).toBe("all");
    expect(matchingPreset({ weeks: false }, u)).toBeNull();
  });
});

describe("templates", () => {
  it("default template overlays tool defaults", () => {
    const doc = setDefaultTemplate({}, "trendline", { style: { color: "#ff0000", width: undefined }, props: { extendRight: true } });
    expect(initialStyle({ style: { width: 2, color: "#000000" } }, doc, "trendline")).toEqual({ style: { width: 2, color: "#ff0000" }, props: { extendRight: true } });
    expect(initialStyle({ style: { width: 2 } }, doc, "ray")).toEqual({ style: { width: 2 }, props: undefined });
    expect(initialStyle({}, null, "ray")).toEqual({ style: undefined, props: undefined });
  });
  it("save, replace, delete and apply", () => {
    const d: Drawing = { id: "a", type: "trendline", anchors: [], style: { color: "#00ff00", width: 3 }, props: { showStats: true } };
    let doc = saveTemplate({}, "trendline", templateOf(d, "Green"));
    doc = saveTemplate(doc, "trendline", { name: "Green", style: { color: "#00aa00" } });
    doc = saveTemplate(doc, "trendline", { name: "Blue", style: { color: "#0000ff" } });
    expect(doc.trendline.saved.map((s) => s.name)).toEqual(["Blue", "Green"]);
    const applied = applyTemplate(d, doc.trendline.saved[0]);
    expect(applied.style).toEqual({ color: "#0000ff" });
    expect(applied.props).toEqual({ showStats: true });
    expect(applied.templateName).toBe("Blue");
    expect(deleteTemplate(doc, "trendline", "Blue").trendline.saved.map((s) => s.name)).toEqual(["Green"]);
    expect(setDefaultTemplate(doc, "trendline", null).trendline.default).toBeUndefined();
  });
});
