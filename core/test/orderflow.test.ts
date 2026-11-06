import { describe, expect, it } from "vitest";
import { alignDelta, binPrice, buildFootprint, cumulativeDelta, footprintTick, imbalances, niceFlowStep, type FlowTrade } from "../src/orderflow";

const tr = (id: number, sec: number, price: number, qty: number, buy: boolean): FlowTrade => ({ id, time: sec * 1000, price, qty, buy });

describe("order flow", () => {
  it("bins prices to the lower edge without float drift", () => {
    expect(binPrice(100.37, 0.25)).toBe(100.25);
    expect(binPrice(0.3, 0.1)).toBe(0.3);
    expect(binPrice(-1.2, 1)).toBe(-2);
    expect(niceFlowStep(0.37)).toBe(0.5);
    expect(niceFlowStep(23)).toBe(25);
    expect(footprintTick([12, 24, 36], 12)).toBe(2);
    expect(footprintTick([])).toBe(1);
  });

  it("builds footprint bars with per-level buy / sell, delta and point of control", () => {
    const trades = [tr(1, 0, 100.1, 1, true), tr(2, 10, 100.6, 2, false), tr(3, 59, 100.2, 4, true), tr(4, 60, 101, 1, false)];
    const fp = buildFootprint(trades, 60, 0.5);
    expect(fp).toHaveLength(2);
    const [a, b] = fp;
    expect(a.time).toBe(0);
    expect(a.levels).toEqual([
      { price: 100, buy: 5, sell: 0 },
      { price: 100.5, buy: 0, sell: 2 },
    ]);
    expect(a).toMatchObject({ buy: 5, sell: 2, delta: 3, poc: 100, trades: 3 });
    expect(b).toMatchObject({ time: 60, buy: 0, sell: 1, delta: -1, poc: 101 });
  });

  it("finds diagonal imbalances", () => {
    const levels = [
      { price: 1, buy: 1, sell: 2 },
      { price: 2, buy: 9, sell: 1 },
      { price: 3, buy: 1, sell: 12 },
    ];
    const im = imbalances(levels, 3);
    // Buy 9 at 2 vs sell 2 at 1 → 4.5×; sell 12 at 3 has no level above (no imbalance).
    expect(im.buy).toEqual([false, true, false]);
    expect(im.sell).toEqual([false, false, false]);
    expect(imbalances([{ price: 1, buy: 0, sell: 9 }, { price: 2, buy: 2, sell: 0 }]).sell).toEqual([true, false]);
  });

  it("aligns delta to bar times and accumulates it", () => {
    const d = alignDelta([0, 60, 120, 180], [{ time: 0, buy: 5, sell: 2 }, { time: 120, buy: 1, sell: 4 }, { time: 180, buy: 2, sell: 2 }]);
    expect(d).toEqual([3, null, -3, 0]);
    expect(cumulativeDelta(d)).toEqual([3, null, 0, 0]);
  });
});
