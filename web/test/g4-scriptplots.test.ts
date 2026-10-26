import { describe, expect, it } from "vitest";
import { IndicatorSet, computedLabel } from "../src/chart/IndicatorSet";
import { isScriptUid, scriptIndicators } from "../src/chart/scriptPlots";

describe("script plots receiver", () => {
  const plots = [
    { key: "fast", title: "Fast", style: "line" as const, color: "#ff0000", pane: "overlay" as const },
    { key: "slow", title: "Slow", style: "line" as const, pane: "overlay" as const },
    { key: "osc", title: "Osc", style: "histogram" as const, pane: "separate" as const },
    { key: "missing", title: "Missing", style: "dots" as const, pane: "separate" as const },
  ];
  const outputs = { fast: [1, 2, 3], slow: [null, 2, 2.5], osc: [-1, 0, 1] };

  it("groups plots into one overlay item and one separate-pane item", () => {
    const items = scriptIndicators(plots, outputs, 2);
    expect(items.map((c) => [c.uid, c.pane])).toEqual([
      ["script:overlay", "overlay"],
      ["script:separate", "separate"],
    ]);
    expect(items[0].def.outputs.map((o) => o.key)).toEqual(["fast", "slow"]);
    expect(items[0].style?.outputs?.fast?.color).toBe("#ff0000");
    expect(items[1].def.outputs.map((o) => [o.key, o.style])).toEqual([["osc", "histogram"]]);
    expect(items[1].series.osc).toEqual([-1, 0, 1]);
    expect(items.every((c) => c.external && isScriptUid(c.uid))).toBe(true);
    expect(computedLabel(items[0])).toBe("Script (Fast, Slow)");
  });

  it("lives next to the layout indicators and survives their recompute", () => {
    const set = new IndicatorSet();
    set.setInstances([{ uid: "e", indicatorId: "ema", inputs: { length: 3 }, visible: true }]);
    set.setExternal(scriptIndicators(plots, outputs, 1));
    set.computeAll([1, 2, 3].map((i) => ({ time: i, open: i, high: i, low: i, close: i, volume: 1 })));
    expect(set.items.map((c) => c.uid)).toEqual(["e", "script:overlay", "script:separate"]);
    expect(set.separates().map((c) => c.uid)).toEqual(["script:separate"]);
    expect(set.get("script:overlay")?.series.fast).toEqual([1, 2, 3]);
    set.setInstances([]);
    expect(set.items.map((c) => c.uid)).toEqual(["script:overlay", "script:separate"]);
    set.setExternal([]);
    expect(set.items).toEqual([]);
  });
});
