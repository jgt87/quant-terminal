import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PaperEngine, validateOrderBody } from "../src/paper/engine";
import {
  MAX_HISTORY, markAccount, netPosition, newAccount, processAccount, resetAccount, snapshot, triggerPrice,
  type SimAccount, type SimOrder,
} from "../src/paper/sim";
import type { MarketData } from "../src/providers";
import { Store } from "../src/store";

const prices = (o: Record<string, number>) => new Map(Object.entries(o));
let seq = 0;
const order = (o: Partial<SimOrder>): SimOrder => ({ id: `o${++seq}`, symbol: "AAPL", side: "buy", type: "market", qty: 1, status: "working", createdAt: seq, ...o });
const account = (o: Partial<SimAccount> = {}) => ({ ...newAccount("acc", { balance: 10_000 }, 0), ...o });

describe("fill rules", () => {
  it("market orders fill at last ± slippage", () => {
    expect(triggerPrice({ type: "market", side: "buy" }, 100, 10)).toBeCloseTo(100.1, 12);
    expect(triggerPrice({ type: "market", side: "sell" }, 100, 10)).toBeCloseTo(99.9, 12);
    expect(triggerPrice({ type: "market", side: "buy" }, 100, 0)).toBe(100);
  });

  it("limit orders fill at the limit or better, without slippage", () => {
    expect(triggerPrice({ type: "limit", side: "buy", price: 100 }, 101, 50)).toBeNull();
    expect(triggerPrice({ type: "limit", side: "buy", price: 100 }, 100, 50)).toBe(100);
    expect(triggerPrice({ type: "limit", side: "buy", price: 100 }, 95, 50)).toBe(95); // gapped through
    expect(triggerPrice({ type: "limit", side: "sell", price: 100 }, 99, 50)).toBeNull();
    expect(triggerPrice({ type: "limit", side: "sell", price: 100 }, 104, 50)).toBe(104);
  });

  it("stop orders trigger when crossed and fill like market orders", () => {
    expect(triggerPrice({ type: "stop", side: "buy", price: 100 }, 99.9, 0)).toBeNull();
    expect(triggerPrice({ type: "stop", side: "buy", price: 100 }, 100, 0)).toBe(100);
    expect(triggerPrice({ type: "stop", side: "buy", price: 100 }, 103, 100)).toBeCloseTo(103 * 1.01, 12);
    expect(triggerPrice({ type: "stop", side: "sell", price: 100 }, 100.1, 0)).toBeNull();
    expect(triggerPrice({ type: "stop", side: "sell", price: 100 }, 97, 100)).toBeCloseTo(97 * 0.99, 12);
  });

  it("no fill on invalid prices", () => {
    expect(triggerPrice({ type: "market", side: "buy" }, NaN, 0)).toBeNull();
    expect(triggerPrice({ type: "market", side: "buy" }, 0, 0)).toBeNull();
  });
});

describe("netting", () => {
  it("adds in the same direction with a weighted average", () => {
    expect(netPosition(undefined, 10, 100)).toEqual({ qty: 10, avgPrice: 100, realized: 0 });
    expect(netPosition({ qty: 10, avgPrice: 100 }, 10, 110)).toEqual({ qty: 20, avgPrice: 105, realized: 0 });
    expect(netPosition({ qty: -10, avgPrice: 100 }, -30, 80)).toEqual({ qty: -40, avgPrice: 85, realized: 0 });
  });

  it("reduces, closes and flips", () => {
    expect(netPosition({ qty: 10, avgPrice: 100 }, -4, 110)).toEqual({ qty: 6, avgPrice: 100, realized: 40 });
    expect(netPosition({ qty: 10, avgPrice: 100 }, -10, 90)).toEqual({ qty: 0, avgPrice: 0, realized: -100 });
    expect(netPosition({ qty: 10, avgPrice: 100 }, -15, 120)).toEqual({ qty: -5, avgPrice: 120, realized: 200 });
    expect(netPosition({ qty: -10, avgPrice: 100 }, 4, 90)).toEqual({ qty: -6, avgPrice: 100, realized: 40 }); // short profit
    expect(netPosition({ qty: -10, avgPrice: 100 }, 12, 110)).toEqual({ qty: 2, avgPrice: 110, realized: -100 });
  });
});

describe("processAccount", () => {
  it("fills market orders, charges commission, books realized P&L into the balance", () => {
    const acc = account({ commissionBps: 10 });
    acc.orders.push(order({ qty: 10 }));
    expect(processAccount(acc, prices({ AAPL: 100 }), 1000)).toBe(true);
    expect(acc.positions.AAPL).toEqual({ qty: 10, avgPrice: 100 });
    expect(acc.balance).toBeCloseTo(10_000 - 1, 12); // 10 bps of 1000
    expect(acc.orders[0]).toMatchObject({ status: "filled", fillPrice: 100, filledAt: 1000, commission: 1 });
    acc.orders.push(order({ side: "sell", qty: 10 }));
    processAccount(acc, prices({ AAPL: 110 }), 2000);
    expect(acc.positions.AAPL).toBeUndefined();
    expect(acc.realizedPnl).toBe(100);
    expect(acc.totalCommission).toBeCloseTo(2.1, 12);
    expect(acc.balance).toBeCloseTo(10_000 + 100 - 2.1, 12);
  });

  it("waits without a quote or while the trigger is not met", () => {
    const acc = account();
    acc.orders.push(order({ type: "limit", price: 90 }), order({ symbol: "MSFT" }));
    expect(processAccount(acc, prices({ AAPL: 95 }), 1)).toBe(false);
    expect(acc.orders.every((o) => o.status === "working")).toBe(true);
    expect(processAccount(acc, prices({ AAPL: 89 }), 2)).toBe(true);
    expect(acc.orders[0]).toMatchObject({ status: "filled", fillPrice: 89 });
    expect(acc.orders[1].status).toBe("working");
  });

  it("brackets: SL/TP become OCO children after the entry fills; one fill cancels the other", () => {
    const acc = account();
    acc.orders.push(order({ id: "entry", qty: 5, stopLoss: 90, takeProfit: 120 }));
    processAccount(acc, prices({ AAPL: 100 }), 10);
    const sl = acc.orders.find((o) => o.role === "stop-loss")!;
    const tp = acc.orders.find((o) => o.role === "take-profit")!;
    expect(sl).toMatchObject({ id: "entry-sl", side: "sell", type: "stop", price: 90, qty: 5, status: "working", parentId: "entry", ocoId: "entry" });
    expect(tp).toMatchObject({ id: "entry-tp", side: "sell", type: "limit", price: 120, qty: 5, status: "working", ocoId: "entry" });
    // children were created in this pass and wait for the next one
    expect(processAccount(acc, prices({ AAPL: 105 }), 20)).toBe(false);
    processAccount(acc, prices({ AAPL: 121 }), 30);
    expect(tp).toMatchObject({ status: "filled", fillPrice: 121 });
    expect(sl).toMatchObject({ status: "cancelled", cancelReason: "OCO sibling filled" });
    expect(acc.positions.AAPL).toBeUndefined();
    expect(acc.realizedPnl).toBe(105);
  });

  it("short bracket: stop above, target below", () => {
    const acc = account();
    acc.orders.push(order({ id: "s", side: "sell", qty: 2, stopLoss: 110, takeProfit: 80 }));
    processAccount(acc, prices({ AAPL: 100 }), 1);
    expect(acc.positions.AAPL).toEqual({ qty: -2, avgPrice: 100 });
    processAccount(acc, prices({ AAPL: 111 }), 2);
    expect(acc.orders.find((o) => o.role === "stop-loss")).toMatchObject({ side: "buy", status: "filled", fillPrice: 111 });
    expect(acc.orders.find((o) => o.role === "take-profit")!.status).toBe("cancelled");
    expect(acc.realizedPnl).toBe(-22);
  });

  it("bracket children are reduce-only", () => {
    const acc = account();
    acc.orders.push(order({ id: "e", qty: 5, stopLoss: 90 }));
    processAccount(acc, prices({ AAPL: 100 }), 1);
    acc.orders.push(order({ side: "sell", qty: 3 })); // manual partial close
    processAccount(acc, prices({ AAPL: 100 }), 2);
    processAccount(acc, prices({ AAPL: 89 }), 3);
    expect(acc.orders.find((o) => o.id === "e-sl")).toMatchObject({ status: "filled", qty: 2 });
    expect(acc.positions.AAPL).toBeUndefined();

    const flat = account();
    flat.orders.push(order({ id: "x", parentId: "gone", side: "sell", type: "stop", price: 90 }));
    processAccount(flat, prices({ AAPL: 80 }), 1);
    expect(flat.orders[0]).toMatchObject({ status: "cancelled", cancelReason: "No position to reduce" });
    expect(flat.positions).toEqual({});
  });
});

describe("marking, history and reset", () => {
  it("marks positions; equity = balance + unrealized", () => {
    const acc = account({ positions: { AAPL: { qty: 10, avgPrice: 100 }, MSFT: { qty: -2, avgPrice: 50 } } });
    const m = markAccount(acc, prices({ AAPL: 110, MSFT: 40 }));
    expect(m.positions.AAPL).toEqual({ qty: 10, avgPrice: 100, last: 110, marketValue: 1100, unrealizedPnl: 100 });
    expect(m.positions.MSFT.unrealizedPnl).toBe(20);
    expect(m.equity).toBe(10_120);
    const partial = markAccount(acc, prices({ AAPL: 110 }));
    expect(partial.missingQuotes).toEqual(["MSFT"]);
    expect(partial.equity).toBe(10_100);
  });

  it("history is capped", () => {
    const acc = account();
    for (let i = 0; i < MAX_HISTORY + 5; i++) snapshot(acc, new Map(), i);
    expect(acc.history).toHaveLength(MAX_HISTORY);
    expect(acc.history[0].time).toBe(5);
  });

  it("reset restores the starting balance and clears everything else", () => {
    const acc = account({ balance: 123, realizedPnl: 5, positions: { AAPL: { qty: 1, avgPrice: 1 } }, history: [{ time: 1, equity: 1 }] });
    acc.orders.push(order({}));
    const r = resetAccount(acc);
    expect(r).toMatchObject({ balance: 10_000, realizedPnl: 0, totalCommission: 0, positions: {}, orders: [], history: [] });
    expect(r.id).toBe("acc");
  });
});

describe("order validation", () => {
  it("accepts valid orders and rejects bad ones", () => {
    expect(validateOrderBody({ symbol: "aapl", side: "buy", qty: 1 }, 5)).toMatchObject({ symbol: "AAPL", type: "market", status: "working", createdAt: 5 });
    expect(validateOrderBody({ symbol: "AAPL", side: "buy", type: "limit", price: 100, qty: 1, stopLoss: 90, takeProfit: 120 }, 0).stopLoss).toBe(90);
    for (const bad of [
      { side: "buy", qty: 1 },
      { symbol: "A", side: "long", qty: 1 },
      { symbol: "A", side: "buy", qty: 0 },
      { symbol: "A", side: "buy", type: "limit", qty: 1 },
      { symbol: "A", side: "buy", type: "trailing", qty: 1 },
      { symbol: "A", side: "buy", qty: 1, stopLoss: 120, takeProfit: 100 },
      { symbol: "A", side: "sell", qty: 1, stopLoss: 90, takeProfit: 100 },
      { symbol: "A", side: "buy", type: "limit", price: 100, qty: 1, stopLoss: 101 },
      { symbol: "A", side: "sell", type: "stop", price: 100, qty: 1, takeProfit: 101 },
    ]) {
      expect(() => validateOrderBody(bad, 0), JSON.stringify(bad)).toThrow();
    }
  });
});

describe("PaperEngine (stubbed quotes)", () => {
  let dir: string;
  let engine: PaperEngine;
  const last = new Map<string, number>();
  const market = {
    async quotes(symbols: string[]) {
      return symbols.filter((s) => last.has(s)).map((s) => ({ symbol: s, last: last.get(s)!, change: 0, changePct: 0, time: 0 }));
    },
  } as unknown as MarketData;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "qt-paper-"));
    engine = new PaperEngine({ store: new Store(dir), market });
    last.clear();
    last.set("AAPL", 100);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("market buy then close, with the fill loop and equity snapshots", async () => {
    const acc = await engine.create({ name: "Test", balance: 50_000, commissionBps: 5 });
    expect(acc).toMatchObject({ name: "Test", balance: 50_000, initialBalance: 50_000, commissionBps: 5 });
    const placed = await engine.placeOrder(acc.id, { symbol: "AAPL", side: "buy", qty: 10 });
    expect(placed.order).toMatchObject({ status: "filled", fillPrice: 100 });
    expect(placed.account.positions.AAPL).toMatchObject({ qty: 10, last: 100 });

    const limit = await engine.placeOrder(acc.id, { symbol: "AAPL", side: "buy", type: "limit", price: 95, qty: 5 });
    expect(limit.order.status).toBe("working");
    last.set("AAPL", 94);
    expect(await engine.fillPass()).toBe(1);
    const after = await engine.get(acc.id);
    expect(after.positions.AAPL.qty).toBe(15);
    expect(after.orders.find((o) => o.id === limit.order.id)).toMatchObject({ status: "filled", fillPrice: 94 });

    const working = await engine.placeOrder(acc.id, { symbol: "AAPL", side: "sell", type: "limit", price: 200, qty: 1 });
    expect((await engine.cancelOrder(acc.id, working.order.id)).status).toBe("cancelled");
    await expect(engine.cancelOrder(acc.id, working.order.id)).rejects.toMatchObject({ status: 400 });

    await engine.snapshotPass();
    expect((await engine.get(acc.id)).history).toHaveLength(1);

    last.set("AAPL", 110);
    const closed = await engine.closePosition(acc.id, "aapl");
    expect(closed.order).toMatchObject({ side: "sell", qty: 15, status: "filled", role: "close" });
    expect(closed.account.positions).toEqual({});
    await expect(engine.closePosition(acc.id, "AAPL")).rejects.toMatchObject({ status: 404 });

    const reset = await engine.reset(acc.id);
    expect(reset).toMatchObject({ balance: 50_000, orders: [], positions: {} });
  });

  it("refuses orders without a quote and unknown accounts", async () => {
    const acc = await engine.create({});
    await expect(engine.placeOrder(acc.id, { symbol: "NOPE", side: "buy", qty: 1 })).rejects.toMatchObject({ status: 502 });
    await expect(engine.placeOrder("missing", { symbol: "AAPL", side: "buy", qty: 1 })).rejects.toMatchObject({ status: 404 });
    await expect(engine.create({ balance: -1 })).rejects.toMatchObject({ status: 400 });
  });

  it("closing cancels the position's bracket orders", async () => {
    const acc = await engine.create({});
    await engine.placeOrder(acc.id, { symbol: "AAPL", side: "buy", qty: 1, stopLoss: 90, takeProfit: 150 });
    const before = await engine.get(acc.id);
    expect(before.orders.filter((o) => o.status === "working")).toHaveLength(2);
    await engine.closePosition(acc.id, "AAPL");
    const after = await engine.get(acc.id);
    expect(after.orders.filter((o) => o.status === "working")).toHaveLength(0);
  });
});
