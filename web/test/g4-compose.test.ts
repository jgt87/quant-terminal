import { describe, expect, it } from "vitest";
import type { Bar } from "@qt/core";
import { composeSeries, mergeBars, planSeries, prependBars } from "../src/data/compose";

const H = 3600;
const b = (time: number, close: number, volume = 1): Bar => ({ time, open: close, high: close + 1, low: close - 1, close, volume });

describe("expression loader leg merge", () => {
  it("plans legs for plain symbols and formulas", () => {
    expect(planSeries("AAPL", 86400, 86400)).toMatchObject({ legs: ["AAPL"], expr: null });
    const p = planSeries("BINANCE:BTCUSDT-BINANCE:ETHUSDT*20", 3600, 3600);
    expect(p.legs).toEqual(["BINANCE:BTCUSDT", "BINANCE:ETHUSDT"]);
    expect(p.expr).not.toBeNull();
  });

  it("joins legs on common times and evaluates the formula per field", () => {
    const plan = planSeries("A/B", H, H);
    const out = composeSeries(plan, {
      A: [b(0, 10), b(H, 12), b(2 * H, 14), b(3 * H, 16)],
      B: [b(H, 4), b(2 * H, 7), b(3 * H, 8), b(4 * H, 9)],
    });
    expect(out.map((x) => x.time)).toEqual([H, 2 * H, 3 * H]);
    expect(out.map((x) => x.close)).toEqual([3, 2, 2]);
    for (const x of out) {
      expect(x.high).toBeGreaterThanOrEqual(Math.max(x.open, x.close));
      expect(x.low).toBeLessThanOrEqual(Math.min(x.open, x.close));
    }
  });

  it("resamples each leg to the custom interval before joining", () => {
    const plan = planSeries("A - B", H, 2 * H);
    const legA = [b(0, 10, 1), b(H, 11, 2), b(2 * H, 12, 3), b(3 * H, 13, 4)];
    const legB = [b(0, 1, 1), b(H, 2, 1), b(2 * H, 3, 1), b(3 * H, 4, 1)];
    const out = composeSeries(plan, { A: legA, B: legB });
    expect(out.map((x) => x.time)).toEqual([0, 2 * H]);
    expect(out.map((x) => x.close)).toEqual([11 - 2, 13 - 4]);
    expect(out.map((x) => x.volume)).toEqual([0, 0]); // formulas over several symbols carry no volume
  });

  it("returns a plain series unchanged and resamples a plain custom interval", () => {
    const leg = [b(0, 1), b(H, 2), b(2 * H, 3)];
    expect(composeSeries(planSeries("A", H, H), { A: leg })).toBe(leg);
    const r = composeSeries(planSeries("A", H, 2 * H), { A: leg });
    expect(r.map((x) => [x.time, x.open, x.close, x.volume])).toEqual([
      [0, 1, 2, 2],
      [2 * H, 3, 3, 1],
    ]);
  });

  it("merges live bars and prepends history into a leg", () => {
    const leg = [b(H, 1), b(2 * H, 2)];
    expect(mergeBars(leg, [b(2 * H, 5), b(3 * H, 6)]).map((x) => x.close)).toEqual([1, 5, 6]);
    expect(mergeBars(leg, [b(1.5 * H, 9)]).map((x) => x.time)).toEqual([H, 1.5 * H, 2 * H]);
    expect(prependBars(leg, [b(0, 0), b(H, 99)]).map((x) => x.close)).toEqual([0, 1, 2]);
  });
});
