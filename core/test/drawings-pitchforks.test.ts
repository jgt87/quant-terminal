import { describe, expect, it } from "vitest";
import { distanceToLine } from "../src/drawings/geometry";
import { hitTestPitchfork, pitchforkBand, pitchforkFrame, pitchforkLevelLines, pitchforkMedian, pitchforkOrigin, PITCHFORK_VARIANT } from "../src/drawings/pitchforks";

// A on the left, B above-right, C below-right: M = (200, 200).
const A = { x: 0, y: 300 };
const B = { x: 200, y: 100 };
const C = { x: 200, y: 300 };
const V = PITCHFORK_VARIANT;

const parallel = (u: { x: number; y: number }, v: { x: number; y: number }) => Math.abs(u.x * v.y - u.y * v.x) < 1e-9;
const vec = (l: [{ x: number; y: number }, { x: number; y: number }]) => ({ x: l[1].x - l[0].x, y: l[1].y - l[0].y });

describe("pitchfork construction", () => {
  it("original: median from A through the midpoint of B–C; level 1 tines through B and C", () => {
    const f = pitchforkFrame(A, B, C, V.original);
    expect(f.origin).toEqual(A);
    expect(f.mid).toEqual({ x: 200, y: 200 });
    const [m0, m1] = pitchforkMedian(f);
    expect(m0).toEqual(A);
    expect(m1).toEqual({ x: 400, y: 100 });
    const [cSide, bSide] = pitchforkLevelLines(f, 1);
    expect(cSide[0]).toEqual(C);
    expect(bSide[0]).toEqual(B);
    expect(parallel(vec(cSide), f.dir)).toBe(true);
    expect(parallel(vec(bSide), f.dir)).toBe(true);
    // Ends lie on a front parallel to B–C, through M + dir.
    expect(cSide[1]).toEqual({ x: 400, y: 200 });
    expect(bSide[1]).toEqual({ x: 400, y: 0 });
  });
  it("level k sits k half-widths from the median", () => {
    const f = pitchforkFrame(A, B, C, V.original);
    const [m0, m1] = pitchforkMedian(f);
    const [u] = pitchforkLevelLines(f, 0.5);
    const d1 = distanceToLine(u[0].x, u[0].y, m0.x, m0.y, m1.x, m1.y);
    const [u1] = pitchforkLevelLines(f, 1);
    const d2 = distanceToLine(u1[0].x, u1[0].y, m0.x, m0.y, m1.x, m1.y);
    expect(d1 / d2).toBeCloseTo(0.5);
  });
  it("Schiff: origin at A's x, halfway between A and B in price", () => {
    expect(pitchforkOrigin(A, B, V.schiff)).toEqual({ x: 0, y: 200 });
    const f = pitchforkFrame(A, B, C, V.schiff);
    expect(f.dir).toEqual({ x: 200, y: 0 });
    const [, bSide] = pitchforkLevelLines(f, 1);
    expect(bSide).toEqual([B, { x: 400, y: 100 }]);
  });
  it("Modified Schiff: origin at the midpoint of A–B", () => {
    expect(pitchforkOrigin(A, B, V.modifiedSchiff)).toEqual({ x: 100, y: 200 });
    const f = pitchforkFrame(A, B, C, V.modifiedSchiff);
    expect(f.dir).toEqual({ x: 100, y: 0 });
    expect(pitchforkMedian(f)[1]).toEqual({ x: 300, y: 200 });
  });
  it("Inside: half-width fork starting halfway between A and M (tines through mid A–B and mid A–C)", () => {
    const f = pitchforkFrame(A, B, C, V.inside);
    expect(f.origin).toEqual(A);
    expect(f.center).toEqual({ x: 100, y: 250 });
    const [cSide, bSide] = pitchforkLevelLines(f, 1);
    expect(cSide[0]).toEqual({ x: 100, y: 300 }); // midpoint of A and C
    expect(bSide[0]).toEqual({ x: 100, y: 200 }); // midpoint of A and B
    expect(parallel(vec(cSide), f.dir)).toBe(true);
    // Same front as the median's end.
    expect(cSide[1].x - bSide[1].x).toBeCloseTo(0);
    expect(pitchforkMedian(f)[1]).toEqual({ x: 400, y: 100 });
  });
  it("extended lines run far along the median direction", () => {
    const f = pitchforkFrame(A, B, C, V.original);
    const [, e] = pitchforkMedian(f, true, 1000);
    expect(Math.hypot(e.x - A.x, e.y - A.y)).toBeCloseTo(1000);
    expect(parallel({ x: e.x - A.x, y: e.y - A.y }, f.dir)).toBe(true);
  });
  it("bands are quadrilaterals between two levels on one side", () => {
    const f = pitchforkFrame(A, B, C, V.original);
    const band = pitchforkBand(f, 0, 1, 1);
    expect(band).toEqual([f.mid, { x: 400, y: 100 }, { x: 400, y: 200 }, C]);
  });
});

describe("pitchfork hit-test", () => {
  const coeffs = [0.5, 1];
  it("hits the median, a tine, the base and inside the fill; misses outside", () => {
    expect(hitTestPitchfork(100, 251, A, B, C, V.original, coeffs, false, false, 4)).toBe(true); // median
    expect(hitTestPitchfork(300, 251, A, B, C, V.original, coeffs, false, false, 4)).toBe(true); // tine at C side (y = 300 − (x−200)/2)
    expect(hitTestPitchfork(201, 150, A, B, C, V.original, coeffs, false, false, 4)).toBe(true); // base B–C
    expect(hitTestPitchfork(330, 180, A, B, C, V.original, coeffs, false, false, 4)).toBe(false);
    expect(hitTestPitchfork(330, 180, A, B, C, V.original, coeffs, false, true, 4)).toBe(true); // inside fill
    expect(hitTestPitchfork(700, 700, A, B, C, V.original, coeffs, false, true, 4)).toBe(false);
  });
  it("extended lines are hit beyond the front only when extended", () => {
    // Median continues to (600, 0)…; x = 600 → y = 300 − 600/2 = 0.
    expect(hitTestPitchfork(600, 0, A, B, C, V.original, coeffs, false, false, 4)).toBe(false);
    expect(hitTestPitchfork(600, 0, A, B, C, V.original, coeffs, true, false, 4)).toBe(true);
  });
  it("variants move the median", () => {
    // Schiff median is horizontal at y = 200.
    expect(hitTestPitchfork(50, 200, A, B, C, V.schiff, [], false, false, 3)).toBe(true);
    expect(hitTestPitchfork(50, 200, A, B, C, V.original, [], false, false, 3)).toBe(false);
  });
});
