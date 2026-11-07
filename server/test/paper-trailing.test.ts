import { describe, expect, it } from "vitest";
import { applyOrderPatch, validateOrderBody } from "../src/paper/engine";
import { newAccount, processAccount, trailStop, type SimOrder } from "../src/paper/sim";

const prices = (o: Record<string, number>) => new Map(Object.entries(o));
const order = (o: Partial<SimOrder>): SimOrder => ({ id: "x", symbol: "AAPL", side: "sell", type: "trailing-stop", qty: 1, status: "working", createdAt: 1, ...o });

describe("trailing stop orders", () => {
  it("need exactly one trail, in range, and no brackets", () => {
    const base = { symbol: "AAPL", side: "sell", type: "trailing-stop", qty: 1 };
    expect(() => validateOrderBody(base, 0)).toThrow(/trailAmount or trailPercent/);
    expect(() => validateOrderBody({ ...base, trailAmount: 1, trailPercent: 2 }, 0)).toThrow(/trailAmount or trailPercent/);
    expect(() => validateOrderBody({ ...base, trailPercent: 100 }, 0)).toThrow(/between 0 and 100/);
    expect(() => validateOrderBody({ ...base, trailAmount: -1 }, 0)).toThrow(/trailAmount/);
    expect(() => validateOrderBody({ ...base, trailAmount: 1, stopLoss: 90 }, 0)).toThrow(/stop loss/);
    const pct = validateOrderBody({ ...base, trailPercent: 2 }, 0);
    expect(pct).toMatchObject({ type: "trailing-stop", trailPercent: 2 });
    expect(pct.price).toBeUndefined();
    expect(validateOrderBody({ ...base, trailAmount: 1.5, price: 98 }, 0)).toMatchObject({ trailAmount: 1.5, price: 98 });
  });

  it("a sell stop follows the price up, never down, and fills when the price falls back", () => {
    const acc = newAccount("a", { balance: 10_000 }, 0);
    acc.positions.AAPL = { qty: 1, avgPrice: 100 };
    const o = order({ trailAmount: 2 });
    acc.orders.push(o);
    expect(processAccount(acc, prices({ AAPL: 100 }), 1)).toBe(true);
    expect(o.price).toBe(98);
    processAccount(acc, prices({ AAPL: 105 }), 2);
    expect(o.price).toBe(103);
    expect(processAccount(acc, prices({ AAPL: 104 }), 3)).toBe(false); // a dip does not loosen it
    expect(o).toMatchObject({ price: 103, status: "working" });
    processAccount(acc, prices({ AAPL: 102.5 }), 4);
    expect(o).toMatchObject({ status: "filled", fillPrice: 102.5 });
    expect(acc.positions.AAPL).toBeUndefined();
  });

  it("a buy stop follows the price down by a percent", () => {
    const o = order({ side: "buy", trailPercent: 10 });
    expect(trailStop(o, 100)).toBe(true);
    expect(o.price).toBeCloseTo(110);
    expect(trailStop(o, 90)).toBe(true);
    expect(o.price).toBeCloseTo(99);
    expect(trailStop(o, 95)).toBe(false);
    expect(o.price).toBeCloseTo(99);
  });

  it("keeps a starting stop until the trail gives a tighter one", () => {
    const o = order({ trailAmount: 5, price: 97 });
    expect(trailStop(o, 100)).toBe(false);
    expect(trailStop(o, 103)).toBe(true);
    expect(o.price).toBe(98);
  });

  it("can switch the trail between an amount and a percent", () => {
    const o = order({ trailAmount: 2, price: 98 });
    applyOrderPatch(o, { trailPercent: 5 }, 0);
    expect(o).toMatchObject({ trailPercent: 5, trailAmount: undefined, price: 98 });
    expect(() => applyOrderPatch(order({ type: "stop", price: 90 }), { trailAmount: 1 }, 0)).toThrow(/Only trailing stops/);
  });
});
