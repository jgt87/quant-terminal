import { describe, expect, it } from "vitest";
import type { Layout } from "@qt/core";
import { differsFrom, mergeLayouts } from "../src/state/layoutMerge";

const base: Layout = {
  id: "default", name: "Main", symbol: "AAPL", interval: "1D", chartType: "candles", logScale: false,
  indicators: [{ uid: "a", indicatorId: "ema", inputs: { length: 20 }, visible: true }],
  drawings: { AAPL: [{ id: "d1", type: "hline", anchors: [{ time: 1, price: 1 }] }] as never },
  updatedAt: 10,
};

describe("mergeLayouts", () => {
  it("re-applies a local simple field change on top of the remote", () => {
    const local = { ...base, interval: "15m" as const };
    const remote = { ...base, symbol: "MSFT", updatedAt: 20 };
    const m = mergeLayouts(base, local, remote);
    expect(m.symbol).toBe("MSFT");
    expect(m.interval).toBe("15m");
    expect(m.updatedAt).toBe(20);
    expect(differsFrom(m, remote)).toBe(true);
  });

  it("local wins on a simple field both sides changed (latest user action)", () => {
    const m = mergeLayouts(base, { ...base, symbol: "NVDA" }, { ...base, symbol: "MSFT", updatedAt: 20 });
    expect(m.symbol).toBe("NVDA");
  });

  it("adopts the remote indicator list when both sides changed it", () => {
    const local = { ...base, indicators: [] };
    const remote = { ...base, indicators: [...base.indicators, { uid: "b", indicatorId: "rsi", inputs: {}, visible: true }], updatedAt: 20 };
    expect(mergeLayouts(base, local, remote).indicators.map((i) => i.uid)).toEqual(["a", "b"]);
    // Only local changed: local kept.
    expect(mergeLayouts(base, local, { ...base, updatedAt: 20 }).indicators).toEqual([]);
  });

  it("merges drawings per symbol", () => {
    const local = { ...base, drawings: { ...base.drawings, MSFT: [] } };
    const remote = { ...base, drawings: { AAPL: [], NVDA: [] }, updatedAt: 20 };
    const m = mergeLayouts(base, local, remote);
    expect(Object.keys(m.drawings).sort()).toEqual(["AAPL", "MSFT", "NVDA"]);
    expect(m.drawings.AAPL).toEqual([]);
  });

  it("returns the remote unchanged when nothing changed locally", () => {
    const remote = { ...base, symbol: "MSFT", updatedAt: 20 };
    expect(differsFrom(mergeLayouts(base, base, remote), remote)).toBe(false);
  });
});
