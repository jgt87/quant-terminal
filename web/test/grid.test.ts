import { describe, expect, it } from "vitest";
import { cellCount, cellRects, defaultSizes, dragSplitter, GRID_KINDS, gridSpec, normalizeSizes, splitters } from "../src/state/grid";

describe("grid geometry", () => {
  it("has the expected cell counts", () => {
    expect(GRID_KINDS.map(cellCount)).toEqual([1, 2, 2, 3, 4, 6, 8, 9, 12, 16]);
  });

  it("tiles the container exactly for every kind", () => {
    for (const k of GRID_KINDS) {
      const rects = cellRects(k);
      const area = rects.reduce((s, r) => s + r.width * r.height, 0);
      expect(area).toBeCloseTo(1, 9);
      for (const r of rects) {
        expect(r.left + r.width).toBeLessThanOrEqual(1 + 1e-9);
        expect(r.top + r.height).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("lays out 2h side by side and 2v stacked", () => {
    expect(cellRects("2h")).toEqual([
      { left: 0, top: 0, width: 0.5, height: 1 },
      { left: 0.5, top: 0, width: 0.5, height: 1 },
    ]);
    expect(cellRects("2v")[1]).toEqual({ left: 0, top: 0.5, width: 1, height: 0.5 });
  });

  it("grid 3 has a full-height left cell and a row splitter only on the right", () => {
    const r = cellRects("3", [0.6, 0.4, 0.3, 0.7]);
    expect(r[0]).toMatchObject({ left: 0, top: 0, height: 1 });
    expect(r[0].width).toBeCloseTo(0.6);
    expect(r[2].top).toBeCloseTo(0.3);
    const s = splitters("3", [0.6, 0.4, 0.3, 0.7]);
    expect(s).toHaveLength(2);
    const row = s.find((x) => x.axis === "row")!;
    expect(row.start).toBeCloseTo(0.6);
    expect(row.end).toBeCloseTo(1);
    expect(row.pos).toBeCloseTo(0.3);
  });

  it("emits one splitter per inner boundary on regular grids", () => {
    expect(splitters("16")).toHaveLength(6);
    expect(splitters("1")).toHaveLength(0);
    expect(splitters("6").filter((s) => s.axis === "col").map((s) => s.pos)).toEqual([1 / 3, 2 / 3]);
  });

  it("normalizes stored sizes and rejects mismatches", () => {
    expect(normalizeSizes("4", [1, 3, 2, 2])).toEqual([0.25, 0.75, 0.5, 0.5]);
    expect(normalizeSizes("4", [1, 2])).toEqual(defaultSizes("4"));
    expect(normalizeSizes("4", [1, -1, 1, 1])).toEqual(defaultSizes("4"));
  });

  it("drags a splitter between two tracks, clamped to the minimum", () => {
    const s = dragSplitter("6", undefined, "col", 1, 0.1);
    expect(s[0]).toBeCloseTo(1 / 3 + 0.1);
    expect(s[1]).toBeCloseTo(1 / 3 - 0.1);
    expect(s[2]).toBeCloseTo(1 / 3);
    const clamped = dragSplitter("2h", undefined, "col", 1, 5);
    expect(clamped[1]).toBeCloseTo(0.08);
    expect(clamped[0] + clamped[1]).toBeCloseTo(1);
    const rows = dragSplitter("4", undefined, "row", 1, -0.2);
    expect(rows.slice(2)).toEqual([expect.closeTo(0.3), expect.closeTo(0.7)]);
    expect(dragSplitter("4", undefined, "row", 3, 0.1)).toEqual(defaultSizes("4"));
  });

  it("describes every cell inside the track count", () => {
    for (const k of GRID_KINDS) {
      const g = gridSpec(k);
      for (const c of g.cells) {
        expect(c.col + c.colSpan).toBeLessThanOrEqual(g.cols);
        expect(c.row + c.rowSpan).toBeLessThanOrEqual(g.rows);
      }
    }
  });
});
