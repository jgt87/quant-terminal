import { describe, expect, it } from "vitest";
import { TimeScale } from "../src/chart/TimeScale";
import { SeriesData } from "../src/chart/SeriesData";

const DAY = 86400;
const T0 = 1_700_006_400; // a UTC midnight

function times(n: number, start = T0, step = DAY): number[] {
  return Array.from({ length: n }, (_, i) => start + i * step);
}

function scale(n = 500, width = 1000): TimeScale {
  const ts = new TimeScale();
  ts.setTimes(times(n), DAY);
  ts.setWidth(width);
  return ts;
}

describe("TimeScale", () => {
  it("index <-> x round trip", () => {
    const ts = scale();
    for (const i of [0, 17, 250.5, 499, 503.25]) {
      expect(ts.xToIndex(ts.indexToX(i))).toBeCloseTo(i, 9);
    }
    for (const x of [0, 1, 333.3, 999]) {
      expect(ts.indexToX(ts.xToIndex(x))).toBeCloseTo(x, 9);
    }
  });

  it("last bar sits rightOffset bars from the right edge", () => {
    const ts = scale();
    ts.rightOffset = 3;
    expect(ts.indexToX(ts.lastIndex)).toBeCloseTo(1000 - 3.5 * ts.barSpacing, 9);
  });

  it("zoom keeps the bar under the cursor fixed", () => {
    for (const [factor, x] of [
      [1.5, 400],
      [0.5, 120],
      [3, 990],
      [0.2, 10],
    ] as const) {
      const ts = scale(5000);
      const before = ts.xToIndex(x);
      ts.zoom(factor, x);
      expect(ts.xToIndex(x)).toBeCloseTo(before, 6);
      // Repeated zooms around the same point keep it fixed too.
      ts.zoom(1.1, x);
      ts.zoom(1 / 1.3, x);
      expect(ts.xToIndex(x)).toBeCloseTo(before, 6);
    }
  });

  it("zoom respects spacing limits", () => {
    const ts = scale(5000);
    ts.zoom(1e6, 500);
    expect(ts.barSpacing).toBe(ts.opts.maxSpacing);
    ts.zoom(1e-9, 500);
    expect(ts.barSpacing).toBe(ts.opts.minSpacing);
  });

  it("pan moves by pixels and clamps so data stays visible", () => {
    const ts = scale();
    const before = ts.xToIndex(500);
    ts.pan(70);
    expect(ts.xToIndex(500)).toBeCloseTo(before - 70 / ts.barSpacing, 9);
    ts.pan(1e9);
    const { from, to } = ts.visibleRange();
    expect(to - from).toBeGreaterThanOrEqual(1);
    ts.pan(-1e9);
    expect(ts.visibleRange().to).toBe(ts.lastIndex);
  });

  it("maps times to indices, interpolating gaps and extrapolating the future", () => {
    const ts = new TimeScale();
    // Weekdays only: Fri -> Mon gap.
    const t = [T0, T0 + DAY, T0 + 4 * DAY, T0 + 5 * DAY];
    ts.setTimes(t, DAY);
    ts.setWidth(800);
    expect(ts.timeToIndex(t[2])).toBe(2);
    expect(ts.timeToIndex(T0 + 2.5 * DAY)).toBeCloseTo(1.5, 9);
    expect(ts.timeToIndex(t[3] + 3 * DAY)).toBeCloseTo(6, 9);
    expect(ts.timeToIndex(T0 - 2 * DAY)).toBeCloseTo(-2, 9);
    expect(ts.indexToTime(6)).toBe(t[3] + 3 * DAY);
    expect(ts.indexToTime(-1)).toBe(T0 - DAY);
    for (const i of [0, 1, 2, 3, 7, -3]) expect(ts.timeToIndex(ts.indexToTime(i))).toBeCloseTo(i, 9);
  });

  it("produces time ticks inside the plot", () => {
    const ts = scale(800);
    const ticks = ts.ticks();
    expect(ticks.length).toBeGreaterThan(2);
    for (const tk of ticks) {
      expect(tk.x).toBeGreaterThanOrEqual(-1);
      expect(tk.x).toBeLessThanOrEqual(1001);
      expect(tk.text.length).toBeGreaterThan(0);
    }
  });

  it("history prepend keeps the visible bars on screen", () => {
    const data = new SeriesData();
    const all = times(1500).map((t, i) => ({ time: t, open: i, high: i + 1, low: i - 1, close: i, volume: 1 }));
    data.set(all.slice(1000));
    const ts = new TimeScale();
    ts.setTimes(data.times, DAY);
    ts.setWidth(1000);
    ts.scrollBars(-200); // scrolled into history
    const x = 300;
    const timeUnder = ts.xToTime(x);
    const range = ts.visibleRange();
    const firstVisibleTime = data.times[range.from];

    const added = data.prepend(all.slice(0, 1000));
    expect(added).toBe(1000);
    ts.prependTimes(data.times);

    expect(ts.xToTime(x)).toBe(timeUnder);
    const after = ts.visibleRange();
    expect(after.from).toBe(range.from + 1000);
    expect(data.times[after.from]).toBe(firstVisibleTime);
  });

  it("appending at the live edge follows; scrolled back stays put", () => {
    const ts = scale(100);
    ts.rightOffset = 2;
    const all = times(101);
    ts.appendTimes(all, 1);
    expect(ts.rightOffset).toBe(2);
    const ts2 = scale(100);
    ts2.scrollBars(-30);
    expect(ts2.rightOffset).toBeLessThan(0);
    const t = ts2.xToTime(500);
    ts2.appendTimes(all, 1);
    expect(ts2.xToTime(500)).toBe(t);
  });
});

describe("TimeScale future ticks", () => {
  it("labels the empty space right of the last bar at projected times", () => {
    const ts = scale(200, 1000);
    ts.barSpacing = 6;
    ts.rightOffset = 80; // ~80 empty bar slots on the right
    const ticks = ts.ticks();
    const future = ticks.filter((t) => t.index > ts.lastIndex);
    expect(future.length).toBeGreaterThan(0);
    for (const t of future) expect(t.x).toBeLessThanOrEqual(ts.width + ts.barSpacing);
  });

  it("has no future ticks while scrolled into history", () => {
    const ts = scale(500, 1000);
    ts.rightOffset = -200;
    expect(ts.ticks().every((t) => t.index <= ts.lastIndex)).toBe(true);
  });
});
