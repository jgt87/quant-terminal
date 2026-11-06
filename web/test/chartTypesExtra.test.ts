import { describe, expect, it } from "vitest";
import { getIndicator, type Bar } from "@qt/core";
import { PriceScale } from "../src/chart/PriceScale";
import { TimeScale } from "../src/chart/TimeScale";
import { chartTheme } from "../src/chart/theme";
import type { ComputedIndicator } from "../src/chart/IndicatorSet";
import { drawIndicator } from "../src/chart/renderers/indicators";
import { drawHighLow, drawHlcArea, drawLineMarkers, drawStepLine, drawVolumeCandles, volumeCandleWidth } from "../src/chart/renderers/chartTypesExtra";
import type { PaneRenderCtx } from "../src/chart/renderers/types";
import { recordingContext } from "./drawings/recordingContext";

const DAY = 86400;
const BARS: Bar[] = Array.from({ length: 120 }, (_, i) => {
  const c = 100 + 10 * Math.sin(i / 6);
  return { time: 1_700_006_400 + i * DAY, open: c - 0.5 * Math.cos(i), high: c + 2, low: c - 2, close: c, volume: 1000 + (i % 7) * 500 };
});

function setup(bars: readonly Bar[], rightOffset = 6) {
  const ts = new TimeScale();
  ts.setTimes(bars.map((b) => b.time), DAY);
  ts.setWidth(800);
  ts.barSpacing = 8;
  ts.rightOffset = rightOffset;
  const ps = new PriceScale();
  ps.setHeight(400);
  ps.fit(80, 120);
  const { ctx, calls } = recordingContext();
  const { from, to } = ts.visibleRange();
  const rc: PaneRenderCtx = { ctx, ts, ps, width: 800, height: 400, from, to, dpr: 1, theme: chartTheme("dark") };
  return { rc, calls, ts };
}

describe("extra chart types", () => {
  it("volume candle width grows with volume and stays inside the bar slot", () => {
    expect(volumeCandleWidth(0, 100, 10)).toBeCloseTo(1.5);
    expect(volumeCandleWidth(100, 100, 10)).toBeCloseTo(9.5);
    expect(volumeCandleWidth(50, 100, 10)).toBeCloseTo(5.5);
    expect(volumeCandleWidth(500, 100, 10)).toBeCloseTo(9.5);
    expect(volumeCandleWidth(NaN, 100, 10)).toBeCloseTo(1.5);
  });

  it("volume candles draw one body per visible bar with volume-dependent widths", () => {
    const { rc, calls } = setup(BARS);
    drawVolumeCandles(rc, BARS);
    const bodies = calls.filter((c) => c.op === "fillRect");
    expect(bodies.length).toBe(rc.to - rc.from + 1);
    const widths = new Set(bodies.map((c) => c.args[2]));
    expect(widths.size).toBeGreaterThan(1);
  });

  it("each renderer paints something and nothing for an empty range", () => {
    for (const fn of [drawVolumeCandles, drawHlcArea, drawHighLow, drawLineMarkers, drawStepLine]) {
      const { rc, calls } = setup(BARS);
      fn(rc, BARS);
      expect(calls.some((c) => c.op === "fill" || c.op === "stroke" || c.op === "fillRect"), fn.name).toBe(true);
      const empty = setup(BARS);
      fn({ ...empty.rc, from: 5, to: 4 }, BARS);
      expect(empty.calls.filter((c) => c.op !== "save" && c.op !== "restore").length, fn.name).toBe(0);
    }
  });

  it("step line is horizontal then vertical between bars", () => {
    const { rc, calls } = setup(BARS);
    drawStepLine(rc, BARS);
    const stroke = calls.find((c) => c.op === "stroke");
    expect(stroke?.path).toBeTruthy();
    // Every lineTo pair: first keeps the previous y, second keeps the x.
    const pts = [...(stroke!.path as string).matchAll(/lineTo\(([-\d.]+),([-\d.]+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(pts.length).toBeGreaterThan(4);
    for (let k = 0; k + 1 < pts.length; k += 2) expect(pts[k][0]).toBeCloseTo(pts[k + 1][0]);
  });
});

describe("Ichimoku cloud", () => {
  it("draws the leading spans past the last bar with an up and a down fill", () => {
    const def = getIndicator("ichimoku")!;
    const inputs = Object.fromEntries(def.inputs.map((i) => [i.key, i.default]));
    const ind: ComputedIndicator = { uid: "i1", def, inputs, visible: true, series: def.compute(BARS, inputs), ordinal: 0, pane: "overlay" };
    // Plenty of empty space right of the last bar.
    const { rc, calls, ts } = setup(BARS, 40);
    drawIndicator(rc, ind, BARS);
    const fills = calls.filter((c) => c.op === "fill");
    const styles = new Set(fills.map((c) => c.state.fillStyle));
    expect(styles.size).toBe(2);
    const lastX = ts.indexToX(BARS.length - 1);
    const xs = calls.filter((c) => c.op === "stroke").flatMap((c) => [...String(c.path).matchAll(/To\(([-\d.]+),/g)].map((m) => Number(m[1])));
    expect(Math.max(...xs)).toBeGreaterThan(lastX + 20 * ts.barSpacing);
  });
});
