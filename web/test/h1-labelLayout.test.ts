import { describe, expect, it } from "vitest";
import { layoutLabels, type AxisLabel } from "../src/chart/renderers/labelLayout";

const H = 18;
const lab = (id: string, pos: number, priority = 0, pin = false): AxisLabel => ({ id, pos, size: H, priority, pin });

/** Every pair of boxes (placed + collapsed) is separated by at least `gap`. */
function noOverlap(res: ReturnType<typeof layoutLabels>, gap = 1): boolean {
  const boxes = [...res.placed, ...res.collapsed].map((b) => [b.pos - b.size / 2, b.pos + b.size / 2]).sort((a, b) => a[0] - b[0]);
  return boxes.every((b, i) => i === 0 || b[0] >= boxes[i - 1][1] + gap - 1e-6);
}
const at = (res: ReturnType<typeof layoutLabels>, id: string) => res.placed.find((p) => p.id === id)?.pos;

describe("axis label layout", () => {
  it("leaves separated labels where they are", () => {
    const res = layoutLabels([lab("a", 50), lab("b", 100), lab("c", 200)], 0, 400);
    expect(res.placed.map((p) => p.pos).sort((a, b) => a - b)).toEqual([50, 100, 200]);
    expect(res.collapsed).toEqual([]);
  });

  it("spreads overlapping labels symmetrically around their wanted center (MACD macd/signal/hist)", () => {
    const res = layoutLabels([lab("macd", 100), lab("signal", 102), lab("hist", 104)], 0, 400);
    expect(noOverlap(res)).toBe(true);
    // Least total movement: the block stays centered on the mean wanted position.
    const mean = res.placed.reduce((s, p) => s + p.pos, 0) / 3;
    expect(mean).toBeCloseTo(102, 6);
    // Stable order along the axis follows the wanted order.
    expect(at(res, "macd")!).toBeLessThan(at(res, "signal")!);
    expect(at(res, "signal")!).toBeLessThan(at(res, "hist")!);
  });

  it("keeps the crosshair exactly in place and moves the last price only for the crosshair", () => {
    const res = layoutLabels([lab("ind", 100, 20), lab("last", 104, 50, true), lab("cross", 110, 100, true)], 0, 400);
    expect(noOverlap(res)).toBe(true);
    expect(at(res, "cross")).toBe(110);
    // The last price had to leave the crosshair's box: it goes to the nearest free side (above).
    expect(at(res, "last")).toBeCloseTo(110 - H - 1, 6);
    expect(at(res, "ind")!).toBeLessThan(at(res, "last")!);
  });

  it("pins the last price when no crosshair is present; others move around it", () => {
    const res = layoutLabels([lab("ind", 100, 20), lab("last", 101, 50, true)], 0, 400);
    expect(at(res, "last")).toBe(101);
    expect(noOverlap(res)).toBe(true);
    expect(Math.abs(at(res, "ind")! - 101)).toBeGreaterThanOrEqual(H + 1 - 1e-6);
  });

  it("stays inside the axis bounds", () => {
    const res = layoutLabels([lab("a", 2), lab("b", 3), lab("c", 398, 0), lab("d", 399)], 0, 400);
    for (const p of res.placed) {
      expect(p.pos - H / 2).toBeGreaterThanOrEqual(0);
      expect(p.pos + H / 2).toBeLessThanOrEqual(400);
    }
    expect(noOverlap(res)).toBe(true);
  });

  it("collapses labels that do not fit into one +n marker, keeping the highest priorities", () => {
    // 60 px fit 3 labels of 18 px (with 1 px gaps); 5 want the same spot.
    const labels = [lab("p1", 30, 1), lab("p5", 30, 5), lab("p3", 30, 3), lab("p4", 30, 4), lab("p2", 30, 2)];
    const res = layoutLabels(labels, 0, 60);
    expect(noOverlap(res)).toBe(true);
    expect(res.placed.map((p) => p.id).sort()).toEqual(["p4", "p5"]);
    expect(res.collapsed).toHaveLength(1);
    expect(res.collapsed[0].ids).toEqual(["p3", "p2", "p1"]);
  });

  it("is deterministic for equal positions (priority, then input order)", () => {
    const a = layoutLabels([lab("x", 50), lab("y", 50), lab("z", 50, 1)], 0, 200);
    const b = layoutLabels([lab("x", 50), lab("y", 50), lab("z", 50, 1)], 0, 200);
    expect(a).toEqual(b);
    const order = [...a.placed].sort((p, q) => p.pos - q.pos).map((p) => p.id);
    expect(order).toEqual(["z", "x", "y"]);
  });

  it("works on the time axis with different widths and a pinned crosshair label", () => {
    const res = layoutLabels(
      [
        { id: "e1", pos: 100, size: 16, priority: 0 },
        { id: "e2", pos: 108, size: 20, priority: 0 },
        { id: "time", pos: 104, size: 120, priority: 1, pin: true },
      ],
      0,
      800,
    );
    expect(at(res, "time")).toBe(104);
    expect(noOverlap(res)).toBe(true);
  });

  it("puts labels under a pinned label into the nearest free gap", () => {
    const res = layoutLabels([lab("a", 200), lab("cross", 200, 100, true)], 0, 400);
    expect(at(res, "cross")).toBe(200);
    expect(Math.abs(at(res, "a")! - 200)).toBeCloseTo(H + 1, 6);
  });
});
