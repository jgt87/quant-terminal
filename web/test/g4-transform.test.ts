import { describe, expect, it } from "vitest";
import { renko, type Bar, type TransformedBar } from "@qt/core";
import { TimeScale } from "../src/chart/TimeScale";
import { indexForSourceTime, pnfBoxSize, toIndexAxis, transformLabel, transformOf, transformSeries } from "../src/chart/transform";

const DAY = 86400;
const T0 = 1_700_006_400;

function el(time: number, open: number, close: number, dir: 1 | -1, sourceIndex: number): TransformedBar {
  return { time, open, close, high: Math.max(open, close), low: Math.min(open, close), volume: 1, dir, sourceIndex };
}

function trend(n: number, step = 1): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const c = 100 + i * step;
    return { time: T0 + i * DAY, open: c - step / 2, high: c + 0.2, low: c - step / 2 - 0.2, close: c, volume: 10 };
  });
}

describe("index axis for transformed series", () => {
  it("gives every element a unique, increasing time and keeps the completing time", () => {
    // Three bricks completed by the same source bar, then one later.
    const axis = toIndexAxis([el(T0, 1, 2, 1, 0), el(T0, 2, 3, 1, 0), el(T0, 3, 4, 1, 0), el(T0 + DAY, 4, 5, 1, 1)]);
    expect(axis.map((b) => b.time)).toEqual([T0, T0 + 1, T0 + 2, T0 + DAY]);
    expect(axis.map((b) => b.sourceTime)).toEqual([T0, T0, T0, T0 + DAY]);
    for (let i = 1; i < axis.length; i++) expect(axis[i].time).toBeGreaterThan(axis[i - 1].time);
  });

  it("maps element i to index i on the time scale (drawings and crosshair live in index space)", () => {
    const axis = toIndexAxis([el(T0, 1, 2, 1, 0), el(T0, 2, 3, 1, 0), el(T0 + 5 * DAY, 3, 2, -1, 5), el(T0 + 9 * DAY, 2, 1, -1, 9)]);
    const ts = new TimeScale();
    ts.setTimes(axis.map((b) => b.time), DAY);
    ts.setWidth(800);
    axis.forEach((b, i) => {
      expect(ts.timeToIndex(b.time)).toBe(i);
      expect(ts.indexToTime(i)).toBe(b.time);
      expect(ts.xToBar(ts.indexToX(i))).toBe(i);
    });
    // Elements are evenly spaced although their source times are not.
    expect(ts.indexToX(3) - ts.indexToX(2)).toBeCloseTo(ts.indexToX(1) - ts.indexToX(0), 9);
  });

  it("finds the element shown for a source time", () => {
    const axis = toIndexAxis([el(T0, 1, 2, 1, 0), el(T0 + 2 * DAY, 2, 3, 1, 2), el(T0 + 2 * DAY, 3, 4, 1, 2), el(T0 + 7 * DAY, 4, 3, -1, 7)]);
    expect(indexForSourceTime(axis, T0 - 1)).toBe(-1);
    expect(indexForSourceTime(axis, T0)).toBe(0);
    expect(indexForSourceTime(axis, T0 + DAY)).toBe(0);
    expect(indexForSourceTime(axis, T0 + 2 * DAY)).toBe(2);
    expect(indexForSourceTime(axis, T0 + 30 * DAY)).toBe(3);
  });

  it("matches the core renko transform element for element", () => {
    const bars = trend(40, 1);
    const core = renko(bars, { boxSize: 2 });
    const axis = transformSeries(bars, "renko", { renko: { boxSize: 2 } });
    expect(axis).toHaveLength(core.length);
    axis.forEach((b, i) => {
      expect(b.close).toBe(core[i].close);
      expect(b.sourceTime).toBe(core[i].time);
    });
  });

  it("knows which chart types are transforms and labels them", () => {
    expect(transformOf("renko")).toBe("renko");
    expect(transformOf("pnf")).toBe("pnf");
    expect(transformOf("candles")).toBeNull();
    expect(transformOf("baseline")).toBeNull();
    expect(transformLabel("renko", { renko: { boxSize: 2.5 } })).toBe("Renko · box 2.5");
    expect(transformLabel("kagi", undefined)).toBe("Kagi · reversal 4%");
    expect(transformLabel("linebreak", { linebreak: { lines: 2 } })).toBe("Line break · 2 lines");
    expect(transformLabel("pnf", { pnf: { boxSize: 1, reversal: 3 } })).toBe("Point & Figure · box 1 · reversal 3");
  });

  it("recovers the point & figure box from adjacent columns", () => {
    const cols = [
      { high: 110, low: 100, dir: 1 as const },
      { high: 108, low: 102, dir: -1 as const },
      { high: 112, low: 104, dir: 1 as const },
    ];
    expect(pnfBoxSize(cols, null)).toBe(2);
    expect(pnfBoxSize([cols[0]], 7)).toBe(7);
  });
});
