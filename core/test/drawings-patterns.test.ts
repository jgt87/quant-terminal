import { describe, expect, it } from "vitest";
import type { Anchor } from "../src/types";
import {
  abEqualsCd,
  formatPatternRatio,
  necklineSegment,
  patternLabelSide,
  patternLegRatio,
  patternPointInPolygon,
  patternPointInTriangle,
  patternPolylineDistance,
  patternRatios,
  patternTriangles,
  trianglePatternSides,
} from "../src/drawings/patterns";

const P = (time: number, price: number): Anchor => ({ time, price });

// A textbook bullish Gartley-like XABCD: XA = 100, AB = 61.8, BC = 38.2 (0.618 of AB), CD = 127.2.
const X = P(0, 100);
const A = P(10, 200);
const B = P(20, 138.2);
const C = P(30, 176.4);
const D = P(40, 49.2);

describe("pattern leg ratios", () => {
  it("leg ratio is the price length of one leg over another", () => {
    expect(patternLegRatio([A, B], [X, A])).toBeCloseTo(0.618, 6);
    expect(patternLegRatio([A, B], [X, X])).toBeNaN();
  });

  it("XABCD connectors: XB, AC, BD, XD", () => {
    const r = patternRatios("xabcd", [X, A, B, C, D]);
    expect(r.map((x) => [x.from, x.to])).toEqual([[0, 2], [1, 3], [2, 4], [0, 4]]);
    expect(r[0].value).toBeCloseTo(0.618, 6);
    expect(r[1].value).toBeCloseTo(38.2 / 61.8, 6);
    expect(r[2].value).toBeCloseTo(127.2 / 38.2, 6);
    expect(r[3].value).toBeCloseTo(150.8 / 100, 6);
  });

  it("only connectors whose points exist (pattern under construction)", () => {
    expect(patternRatios("xabcd", [X, A])).toEqual([]);
    expect(patternRatios("xabcd", [X, A, B]).map((x) => x.to)).toEqual([2]);
    expect(patternRatios("xabcd", [X, A, B, C]).length).toBe(2);
  });

  it("Cypher: C extends XA, D retraces XC", () => {
    const c = P(30, 230);
    const d = P(40, 230 - 0.786 * 130);
    const r = patternRatios("cypher", [X, A, B, c, d]);
    expect(r.map((x) => [x.from, x.to])).toEqual([[0, 2], [0, 3], [1, 4]]);
    expect(r[1].value).toBeCloseTo(1.3, 6);
    expect(r[2].value).toBeCloseTo(0.786, 6);
  });

  it("ABCD: AC and BD, and AB=CD symmetry", () => {
    const pts = [P(0, 100), P(10, 150), P(20, 125), P(30, 175)];
    const r = patternRatios("abcd", pts);
    expect(r.map((x) => x.value)).toEqual([0.5, 2]);
    expect(abEqualsCd(pts)).toBe(1);
    expect(abEqualsCd(pts.slice(0, 3))).toBeNaN();
  });

  it("three drives: each leg against the previous one", () => {
    const pts = [P(0, 100), P(1, 200), P(2, 150), P(3, 250), P(4, 200), P(5, 300), P(6, 250)];
    const r = patternRatios("threeDrives", pts);
    expect(r.map((x) => [x.from, x.to])).toEqual([[0, 2], [1, 3], [2, 4], [3, 5]]);
    expect(r.map((x) => x.value)).toEqual([0.5, 2, 0.5, 2]);
  });

  it("formats ratios with 3 decimals", () => {
    expect(formatPatternRatio(0.6180339)).toBe("0.618");
    expect(formatPatternRatio(NaN)).toBe("");
  });
});

describe("label placement", () => {
  it("highs above, lows below, ends against their neighbour", () => {
    const pts = [X, A, B, C, D];
    expect(pts.map((_, i) => patternLabelSide(pts, i))).toEqual(["below", "above", "below", "above", "below"]);
    expect(patternLabelSide([X], 0)).toBe("above");
  });
});

describe("pattern shapes", () => {
  it("triangles only for placed points", () => {
    expect(patternTriangles("xabcd", 5)).toEqual([[0, 1, 2], [2, 3, 4]]);
    expect(patternTriangles("xabcd", 4)).toEqual([[0, 1, 2]]);
    expect(patternTriangles("headAndShoulders", 7).length).toBe(3);
    expect(patternTriangles("headAndShoulders", 2)).toEqual([]);
  });

  it("neckline through the troughs spans the pattern", () => {
    const pts = [P(0, 90), P(1, 110), P(2, 100), P(3, 130), P(4, 102), P(5, 110), P(6, 90)];
    const n = necklineSegment(pts)!;
    expect(n[0]).toEqual(P(0, 98));
    expect(n[1]).toEqual(P(6, 104));
    expect(necklineSegment(pts.slice(0, 4))).toBeNull();
  });

  it("triangle pattern sides converge and enclose the area", () => {
    const s = trianglePatternSides([P(0, 200), P(1, 100), P(2, 180), P(3, 120)]);
    expect(s.upper).toEqual([P(0, 200), P(2, 180)]);
    expect(s.lower).toEqual([P(1, 100), P(3, 120)]);
    expect(s.area?.length).toBe(4);
    expect(trianglePatternSides([P(0, 1), P(1, 2)]).area).toBeUndefined();
  });

  it("polyline distance and point-in-shape tests", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(patternPolylineDistance(50, 3, pts)).toBe(3);
    expect(patternPolylineDistance(103, 50, pts)).toBe(3);
    expect(patternPolylineDistance(0, 0, [pts[0]])).toBe(Infinity);
    expect(patternPointInTriangle(70, 30, pts[0], pts[1], pts[2])).toBe(true);
    expect(patternPointInTriangle(30, 70, pts[0], pts[1], pts[2])).toBe(false);
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(patternPointInPolygon(5, 5, sq)).toBe(true);
    expect(patternPointInPolygon(15, 5, sq)).toBe(false);
  });
});
