import { describe, expect, it } from "vitest";
import type { DepthFrame } from "@qt/core";
import { asCanvasContext, SvgContext } from "../src/chart/export/svgContext";
import { drawHeatmap, heatColors, heatLevel, quantileSize } from "../src/chart/renderers/heatmap";
import { PriceScale } from "../src/chart/PriceScale";
import { TimeScale } from "../src/chart/TimeScale";
import { chartTheme } from "../src/chart/theme";
import { chartMenu, type ChartMenuActions, type ChartMenuState } from "../src/state/menus";

const frame = (time: number, qty: number[], base = 100): DepthFrame => ({ time, step: 1, base, qty, bid: base + 4, ask: base + 5 });

describe("liquidity heatmap", () => {
  it("builds a color ramp per theme and maps sizes to levels", () => {
    const c = heatColors("dark", 5);
    expect(c).toHaveLength(5);
    expect(c[0]).toMatch(/^rgba\(11,29,74,0\.\d+\)$/);
    expect(c[4]).toBe("rgba(255,255,255,0.850)");
    expect(heatColors("light", 3)[0]).not.toBe(heatColors("dark", 3)[0]);
    expect(heatLevel(0, 10)).toBe(-1);
    expect(heatLevel(0.1, 10)).toBe(-1); // below the minimum share
    expect(heatLevel(10, 10, 14)).toBe(13);
    expect(heatLevel(50, 10, 14)).toBe(13);
    expect(heatLevel(2, 10, 14)).toBeGreaterThan(0);
    expect(quantileSize([frame(0, [0, 1, 2, 3, 100])], 0.5)).toBe(2);
    expect(quantileSize([])).toBe(0);
  });

  it("draws one path per color level plus the bid / ask lines, only for visible frames", () => {
    const ts = new TimeScale();
    const times = Array.from({ length: 10 }, (_, i) => 1_000_000 + i * 60);
    ts.setTimes(times, 60);
    ts.setWidth(400);
    ts.barSpacing = 40;
    const ps = new PriceScale();
    ps.setHeight(200);
    ps.fit(100, 110);
    const frames: DepthFrame[] = [];
    for (let s = 0; s < 600; s += 10) frames.push(frame((times[0] + s) * 1000, [1, 2, 5, 9, 3, 0, 0, 1, 4, 8]));
    frames.push(frame((times[0] - 100_000) * 1000, [50])); // far off-screen
    frames.sort((a, b) => a.time - b.time);
    const svg = new SvgContext(400, 200);
    drawHeatmap({ ctx: asCanvasContext(svg), ts, ps, width: 400, height: 200, from: 0, to: 9, dpr: 1, theme: chartTheme("dark") }, frames);
    const out = svg.toSvg();
    const fills = out.match(/fill="rgba\(/g) ?? [];
    expect(fills.length).toBeGreaterThan(3);
    expect(fills.length).toBeLessThanOrEqual(14);
    expect(out).toContain('stroke="#26a69a"');
    expect(out).toContain('stroke="#ef5350"');
  });

  it("offers the heatmap and recording in the order flow menu", () => {
    const state: ChartMenuState = { chartType: "candles", logScale: false, drawingCount: 0, hiddenDrawings: 0, indicatorCount: 0, priceText: "1", orderFlow: { heatmap: true }, orderFlowAvailable: true, depthRecording: false };
    const calls: unknown[] = [];
    const actions = {
      resetView() {},
      copy() {},
      setChartType() {},
      setLog() {},
      removeDrawings() {},
      showHiddenDrawings() {},
      removeIndicators() {},
      openChartSettings() {},
      setOrderFlow: (p: unknown) => calls.push(p),
      setDepthRecording: (on: boolean) => calls.push(on),
    } as ChartMenuActions;
    const flow = chartMenu(state, actions).find((m) => "label" in m && m.label === "Order flow") as { submenu: { label?: string; checked?: boolean; onSelect?(): void }[] };
    const heat = flow.submenu.find((m) => m.label === "Liquidity heatmap")!;
    expect(heat.checked).toBe(true);
    heat.onSelect!();
    flow.submenu.find((m) => m.label === "Record order book")!.onSelect!();
    expect(calls).toEqual([{ heatmap: false }, true]);
  });
});

describe("order flow signal markers and alert operand", async () => {
  const { drawFlowEvents, isBullish } = await import("../src/chart/renderers/flowEvents");
  const { buildAlert, draftFromAlert, newDraft, orderFlowCondition, emptyOperand } = await import("../src/panels/alerts/alertModel");

  it("draws one badge per visible signal, colored by direction", () => {
    const ts = new TimeScale();
    ts.setTimes([0, 60, 120], 60);
    ts.setWidth(300);
    ts.barSpacing = 30;
    const ps = new PriceScale();
    ps.setHeight(200);
    ps.fit(90, 110);
    const svg = new SvgContext(300, 200);
    const theme = chartTheme("dark");
    drawFlowEvents({ ctx: asCanvasContext(svg), ts, ps, width: 300, height: 200, from: 0, to: 2, dpr: 1, theme }, [
      { kind: "absorption-bid", time: 60, price: 95, size: 1 },
      { kind: "iceberg-ask", time: 130, price: 105, size: 1 },
      { kind: "stop-run-up", time: 60, price: 500, size: 1 }, // off the pane
    ]);
    const out = svg.toSvg();
    expect((out.match(/<text /g) ?? []).length).toBe(2);
    expect(out).toContain(`fill="${theme.up}"`);
    expect(out).toContain(`fill="${theme.down}"`);
    expect(isBullish("stop-run-down")).toBe(true);
  });

  it("builds and reads back an order flow alert condition", () => {
    const d = newDraft("BINANCE:BTCUSDT", "1m");
    d.conditions[0] = orderFlowCondition(d.conditions[0], { ...emptyOperand("orderflow"), event: "iceberg-bid" });
    const { alert, errors } = buildAlert(d);
    expect(errors).toEqual([]);
    expect(alert!.conditions[0]).toEqual({ left: { kind: "orderflow", event: "iceberg-bid" }, op: "greater", right: { kind: "value", value: 0 } });
    const back = draftFromAlert({ ...alert!, id: "x", createdAt: 0 });
    expect(back.conditions[0].left.kind).toBe("orderflow");
    expect(back.conditions[0].left.event).toBe("iceberg-bid");
  });
});
