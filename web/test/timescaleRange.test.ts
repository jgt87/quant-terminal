import { describe, expect, it } from "vitest";
import { TimeScale } from "../src/chart/TimeScale";

const DAY = 86400;
const T0 = 1_700_006_400;

function scale(n = 500, width = 1000, step = DAY, start = T0): TimeScale {
  const ts = new TimeScale();
  ts.setTimes(
    Array.from({ length: n }, (_, i) => start + i * step),
    step,
  );
  ts.setWidth(width);
  return ts;
}

describe("visible time range (link groups)", () => {
  it("shows exactly the requested index range", () => {
    const ts = scale();
    ts.setVisibleRange(100, 200);
    expect(ts.xToIndex(0)).toBeCloseTo(100);
    expect(ts.xToIndex(1000)).toBeCloseTo(200);
  });

  it("round-trips a time range between charts of different intervals by time", () => {
    const daily = scale(500, 1000, DAY);
    daily.setVisibleRange(300, 360);
    const from = daily.xToTime(0);
    const to = daily.xToTime(1000);
    const hourly = scale(5000, 800, 3600, T0 + 250 * DAY);
    hourly.setVisibleRange(hourly.timeToIndex(from), hourly.timeToIndex(to));
    expect(hourly.xToTime(0)).toBeCloseTo(from, -2);
    expect(hourly.xToTime(800)).toBeCloseTo(to, -2);
  });

  it("ignores empty or inverted ranges", () => {
    const ts = scale();
    const before = [ts.barSpacing, ts.rightOffset];
    ts.setVisibleRange(50, 50);
    ts.setVisibleRange(60, 10);
    expect([ts.barSpacing, ts.rightOffset]).toEqual(before);
  });
});
