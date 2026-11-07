import { describe, expect, it } from "vitest";
import { priceAxes } from "../src/chart/ChartEngine";
import { indicatorMenu, priceAxisMenu, type IndicatorMenuActions, type PriceAxisActions } from "../src/state/menus";

type Item = { label?: string; checked?: boolean; onSelect?(): void; submenu?: Item[] };

describe("price scale placement", () => {
  it("shows the main axis on its side and a second axis for both or left-scale indicators", () => {
    expect(priceAxes(undefined, false)).toEqual({ right: true, left: false });
    expect(priceAxes("left", false)).toEqual({ right: false, left: true });
    expect(priceAxes("both", false)).toEqual({ right: true, left: true });
    expect(priceAxes("right", true)).toEqual({ right: true, left: true });
    expect(priceAxes("left", true)).toEqual({ right: false, left: true });
  });

  it("offers the scale position on the price axis menu", () => {
    const got: string[] = [];
    const a = { setAuto() {}, setLog() {}, setPercent() {}, setIndexed() {}, setInverted() {}, reset() {}, setLastPriceLabel() {}, toggleMaximized() {}, toggleCollapsed() {}, setPlacement: (p: string) => got.push(p) } as PriceAxisActions;
    const menu = priceAxisMenu({ main: true, autoScale: true, log: false, percent: false, indexed: false, inverted: false, lastPriceLabel: true, maximized: false, collapsed: false, placement: "both" }, a) as Item[];
    const pos = menu.find((m) => m.label === "Scale position")!;
    expect(pos.submenu!.find((m) => m.checked)?.label).toBe("Left and right");
    pos.submenu!.find((m) => m.label === "Left")!.onSelect!();
    expect(got).toEqual(["left"]);
  });

  it("offers Left scale for an indicator", () => {
    const calls: unknown[] = [];
    const a = { settings() {}, toggleVisible() {}, movePane() {}, setOwnScale: (on: boolean) => calls.push(["own", on]), setLeftScale: (on: boolean) => calls.push(["left", on]), toggleMaximized() {}, toggleCollapsed() {}, remove() {} } as IndicatorMenuActions;
    const menu = indicatorMenu({ uid: "r", indicatorId: "rsi", inputs: {}, visible: true }, "separate", a, { panes: [], ownScale: false, leftScale: true, maximized: false, collapsed: false }) as Item[];
    const scale = menu.find((m) => m.label === "Scale")!;
    expect(scale.submenu!.map((m) => [m.label, Boolean(m.checked)])).toEqual([["Pane scale", false], ["Left scale", true], ["Own scale (no axis)", false]]);
    scale.submenu![0].onSelect!();
    expect(calls).toEqual([["own", false]]);
  });
});

describe("large values on a price scale", async () => {
  const { PriceScale } = await import("../src/chart/PriceScale");
  it("abbreviates ticks and labels from one million", () => {
    const ps = new PriceScale();
    ps.setHeight(200);
    ps.fit(3.0e9, 3.6e9);
    expect(ps.ticks().every((t) => /^[\d.]+B$/.test(t.text))).toBe(true);
    expect(ps.format(3.38e9)).toBe("3.38B");
    ps.fit(100, 200);
    expect(ps.format(150)).toBe("150.00");
  });
});
