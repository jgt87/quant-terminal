import { describe, expect, it } from "vitest";
import { supportResistance } from "../src/analysis";
import { deleteIndicatorTemplate, instantiateTemplate, saveIndicatorTemplate } from "../src/indicatorTemplates";
import type { Bar, IndicatorInstance } from "../src/types";

const bar = (i: number, low: number, high: number): Bar => ({ time: i * 3600, open: (low + high) / 2, high, low, close: (low + high) / 2, volume: 1 });

/** Price swinging between about 100 and 110, `cycles` times, ending mid-range. */
function swings(cycles: number): Bar[] {
  const out: Bar[] = [];
  const path = [101, 103, 105, 107, 109, 107, 105, 103];
  for (let c = 0; c < cycles; c++) for (const p of path) out.push(bar(out.length, p - 1, p + 1));
  out.push(bar(out.length, 104, 106));
  return out;
}

describe("auto support and resistance", () => {
  it("groups swing highs and lows at the same price into levels on the right side of the close", () => {
    const levels = supportResistance(swings(5), { strength: 2, tolerance: 0.5, minTouches: 2, lookback: 0 });
    expect(levels).toHaveLength(2);
    const [r, s] = levels;
    expect(r).toMatchObject({ kind: "resistance", price: 110 });
    expect(s).toMatchObject({ kind: "support", price: 100 });
    expect(r.touches).toBeGreaterThanOrEqual(4);
    expect(s.firstIndex).toBeLessThan(s.lastIndex);
  });

  it("keeps only levels with enough touches, the strongest first when capped", () => {
    expect(supportResistance(swings(5), { strength: 2, minTouches: 50 })).toEqual([]);
    expect(supportResistance(swings(5), { strength: 2, maxLevels: 1 })).toHaveLength(1);
    expect(supportResistance([], {})).toEqual([]);
  });

  it("looks only at the last bars when a lookback is set", () => {
    const bars = swings(5);
    const all = supportResistance(bars, { strength: 2, lookback: 0 })[0].touches;
    const recent = supportResistance(bars, { strength: 2, lookback: 20 })[0].touches;
    expect(recent).toBeLessThan(all);
  });
});

describe("indicator templates", () => {
  const ind = (uid: string, extra: Partial<IndicatorInstance> = {}): IndicatorInstance => ({ uid, indicatorId: "sma", inputs: { length: 20 }, visible: true, ...extra });

  it("saves under a name, replaces the same name, keeps names sorted and deletes", () => {
    let doc = saveIndicatorTemplate({ saved: [] }, " Trend ", [ind("a")]);
    doc = saveIndicatorTemplate(doc, "Momentum", [ind("b")]);
    doc = saveIndicatorTemplate(doc, "Trend", [ind("a"), ind("c")]);
    expect(doc.saved.map((t) => [t.name, t.indicators.length])).toEqual([["Momentum", 1], ["Trend", 2]]);
    expect(saveIndicatorTemplate(doc, "  ", [ind("x")])).toBe(doc);
    expect(deleteIndicatorTemplate(doc, "Trend").saved.map((t) => t.name)).toEqual(["Momentum"]);
  });

  it("stores copies, so later edits on the chart do not change the template", () => {
    const list = [ind("a")];
    const doc = saveIndicatorTemplate({ saved: [] }, "T", list);
    list[0].inputs.length = 99;
    expect(doc.saved[0].indicators[0].inputs.length).toBe(20);
  });

  it("applies with new uids and moves pane sharing to the new uids", () => {
    let n = 0;
    const t = { name: "T", indicators: [ind("a"), ind("b", { paneWith: "a" }), ind("c", { paneWith: "gone" })] };
    const out = instantiateTemplate(t, () => `n${++n}`);
    expect(out.map((i) => i.uid)).toEqual(["n1", "n2", "n3"]);
    expect(out[1].paneWith).toBe("n1");
    expect(out[2].paneWith).toBeUndefined();
    expect(t.indicators[1].uid).toBe("b");
  });
});
