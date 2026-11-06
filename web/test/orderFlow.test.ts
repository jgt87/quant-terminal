import { describe, expect, it } from "vitest";
import { buildFootprint, type FootprintBar } from "@qt/core";
import { barIndexAt, flowIndicators, flowPaneOf, groupDelta, groupFootprints } from "../src/chart/orderFlow";
import { drawFootprints, drawVolumeBubbles, shortVolume } from "../src/chart/renderers/footprint";
import { PriceScale } from "../src/chart/PriceScale";
import { TimeScale } from "../src/chart/TimeScale";
import { chartTheme } from "../src/chart/theme";
import type { PaneRenderCtx } from "../src/chart/renderers/types";
import { tapeSummary } from "../src/panels/tape/tapeSummary";
import { isBinanceSymbol } from "../src/state/chartMenuFor";
import { chartMenu } from "../src/state/menus";
import { recordingContext } from "./drawings/recordingContext";

describe("order flow grouping", () => {
  const times = [0, 120, 240];

  it("finds the chart bar containing a time", () => {
    expect(barIndexAt(times, -1)).toBe(-1);
    expect(barIndexAt(times, 0)).toBe(0);
    expect(barIndexAt(times, 119)).toBe(0);
    expect(barIndexAt(times, 120)).toBe(1);
    expect(barIndexAt(times, 9999)).toBe(2);
  });

  it("sums provider bars into wider chart bars", () => {
    const d = groupDelta(times, [
      { time: 0, buy: 3, sell: 1 },
      { time: 60, buy: 1, sell: 4 },
      { time: 240, buy: 2, sell: 2 },
    ]);
    expect(d).toEqual([-1, null, 0]);
    const fp = groupFootprints(times, buildFootprint([
      { id: 1, time: 0, price: 10, qty: 1, buy: true },
      { id: 2, time: 61_000, price: 10, qty: 2, buy: false },
      { id: 3, time: 62_000, price: 11, qty: 5, buy: true },
    ], 60, 1));
    const b = fp.get(0)!;
    expect(b.levels).toEqual([{ price: 10, buy: 1, sell: 2 }, { price: 11, buy: 5, sell: 0 }]);
    expect(b).toMatchObject({ buy: 6, sell: 2, delta: 4, poc: 11, trades: 3 });
  });

  it("makes Delta and CVD pane items only for the parts switched on", () => {
    const items = flowIndicators([1, -2, null, 3], { delta: true, cvd: true }, 0);
    expect(items.map((c) => c.uid)).toEqual(["flow:delta", "flow:cvd"]);
    expect(items[1].series.cvd).toEqual([1, -1, null, 2]);
    expect(flowIndicators([1], { cvd: true }, 0).map((c) => flowPaneOf(c.uid))).toEqual(["cvd"]);
    expect(flowPaneOf("rsi-1")).toBeNull();
  });
});

describe("footprint rendering", () => {
  const bars: FootprintBar[] = buildFootprint(
    Array.from({ length: 200 }, (_, i) => ({ id: i, time: Math.floor(i / 40) * 60_000 + i, price: 100 + (i % 8) * 0.5, qty: 1 + (i % 5), buy: i % 3 !== 0 })),
    60,
    0.5,
  );
  const setup = (spacing: number) => {
    const ts = new TimeScale();
    ts.setTimes(bars.map((b) => b.time), 60);
    ts.setWidth(800);
    ts.barSpacing = spacing;
    ts.rightOffset = 1;
    const ps = new PriceScale();
    ps.setHeight(400);
    ps.fit(99, 105);
    const { ctx, calls } = recordingContext();
    const { from, to } = ts.visibleRange();
    const rc: PaneRenderCtx = { ctx, ts, ps, width: 800, height: 400, from, to, dpr: 1, theme: chartTheme("dark") };
    return { rc, calls, fp: new Map(bars.map((b, i) => [i, b])) };
  };

  it("draws cells with numbers when bars are wide, nothing when narrow", () => {
    const wide = setup(90);
    drawFootprints(wide.rc, wide.fp, 0.5);
    expect(wide.calls.filter((c) => c.op === "fillRect").length).toBeGreaterThan(bars.length * 4);
    expect(wide.calls.some((c) => c.op === "fillText")).toBe(true);
    const narrow = setup(10);
    drawFootprints(narrow.rc, narrow.fp, 0.5);
    expect(narrow.calls.filter((c) => c.op === "fillRect")).toHaveLength(0);
  });

  it("draws bubbles only on busy levels", () => {
    const s = setup(20);
    drawVolumeBubbles(s.rc, s.fp, 0.5);
    const arcs = s.calls.filter((c) => c.op === "fill").length;
    const levels = bars.reduce((n, b) => n + b.levels.length, 0);
    expect(arcs).toBeLessThan(levels);
  });

  it("short volume text", () => {
    expect(shortVolume(950)).toBe("950");
    expect(shortVolume(1234)).toBe("1.2K");
    expect(shortVolume(12_345_678)).toBe("12M");
    expect(shortVolume(2.5)).toBe("2.5");
    expect(shortVolume(0.0123)).toBe("0.012");
    expect(shortVolume(-1500)).toBe("-1.5K");
  });
});

describe("time and sales and menu", () => {
  it("totals buys and sells and flags large prints", () => {
    const s = tapeSummary([
      { id: 1, time: 0, price: 1, qty: 1, buy: true },
      { id: 2, time: 0, price: 1, qty: 1, buy: false },
      { id: 3, time: 0, price: 1, qty: 10, buy: true },
    ]);
    expect(s).toEqual({ buy: 11, sell: 1, large: 5 });
    expect(tapeSummary([]).large).toBe(Infinity);
  });

  it("knows Binance symbols and offers the order flow submenu", () => {
    expect(isBinanceSymbol("BINANCE:ETHBTC")).toBe(true);
    expect(isBinanceSymbol("btcusdt")).toBe(true);
    expect(isBinanceSymbol("AAPL")).toBe(false);
    const patches: unknown[] = [];
    const items = chartMenu(
      { chartType: "candles", logScale: false, drawingCount: 0, hiddenDrawings: 0, indicatorCount: 0, priceText: "1", orderFlow: { delta: true }, orderFlowAvailable: true },
      {
        resetView() {},
        copy() {},
        setChartType() {},
        setLog() {},
        removeDrawings() {},
        showHiddenDrawings() {},
        removeIndicators() {},
        openChartSettings() {},
        setOrderFlow: (p) => patches.push(p),
      },
    );
    const of = items.find((i) => "label" in i && i.label === "Order flow") as { submenu: { label?: string; checked?: boolean; onSelect?(): void }[] };
    expect(of.submenu.find((i) => i.label === "Delta")?.checked).toBe(true);
    of.submenu.find((i) => i.label === "Footprint")!.onSelect!();
    expect(patches).toEqual([{ footprint: true }]);
  });
});
