import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyOrderPatch, PaperEngine, validateOrderBody, validateOrderPatch } from "../src/paper/engine";
import { newAccount, processAccount, type SimOrder } from "../src/paper/sim";
import type { MarketData } from "../src/providers";
import { Store } from "../src/store";

const prices = (o: Record<string, number>) => new Map(Object.entries(o));
const order = (o: Partial<SimOrder>): SimOrder => ({ id: "x", symbol: "AAPL", side: "buy", type: "market", qty: 1, status: "working", createdAt: 1, ...o });

describe("stop-limit orders", () => {
  it("need a stop price and a limit price", () => {
    expect(() => validateOrderBody({ symbol: "AAPL", side: "buy", type: "stop-limit", qty: 1, price: 101 }, 0)).toThrow(/stopPrice/);
    expect(validateOrderBody({ symbol: "AAPL", side: "buy", type: "stop-limit", qty: 1, price: 101, stopPrice: 100 }, 0)).toMatchObject({ type: "stop-limit", price: 101, stopPrice: 100 });
  });

  it("wait for the stop, then fill as a limit", () => {
    const acc = newAccount("a", { balance: 10_000 }, 0);
    const o = order({ type: "stop-limit", stopPrice: 105, price: 106 });
    acc.orders.push(o);
    expect(processAccount(acc, prices({ AAPL: 104 }), 1)).toBe(false);
    expect(o.triggered).toBeUndefined();
    // Gap through stop and limit: triggered, but 107 is above the limit.
    expect(processAccount(acc, prices({ AAPL: 107 }), 2)).toBe(true);
    expect(o).toMatchObject({ triggered: true, status: "working" });
    processAccount(acc, prices({ AAPL: 105.5 }), 3);
    expect(o).toMatchObject({ status: "filled", fillPrice: 105.5 });
  });

  it("a sell stop-limit triggers on the way down", () => {
    const acc = newAccount("a", { balance: 10_000 }, 0);
    const o = order({ side: "sell", type: "stop-limit", stopPrice: 95, price: 94 });
    acc.orders.push(o);
    processAccount(acc, prices({ AAPL: 94.5 }), 1);
    expect(o).toMatchObject({ status: "filled", fillPrice: 94.5 });
  });
});

describe("order patches", () => {
  it("validates patches", () => {
    expect(() => validateOrderPatch({})).toThrow(/Nothing/);
    expect(() => validateOrderPatch({ price: -1 })).toThrow(/price/);
    expect(validateOrderPatch({ stopLoss: null, price: 3 })).toEqual({ stopLoss: null, price: 3 });
  });

  it("moves a limit and its brackets, keeping them on the right sides", () => {
    const o = order({ type: "limit", price: 100, stopLoss: 95, takeProfit: 110 });
    applyOrderPatch(o, { price: 98 }, 0);
    expect(o.price).toBe(98);
    expect(() => applyOrderPatch(o, { price: 94 }, 0)).toThrow(/stopLoss/);
    applyOrderPatch(o, { stopLoss: null }, 0);
    expect(o.stopLoss).toBeUndefined();
    expect(() => applyOrderPatch(order({}), { price: 1 }, 0)).toThrow(/Market/);
    expect(() => applyOrderPatch(order({ status: "filled", type: "limit", price: 1 }), { price: 2 }, 0)).toThrow(/filled/);
  });

  it("bracket children only move their price", () => {
    const child = order({ type: "stop", side: "sell", price: 95, parentId: "p", role: "stop-loss" });
    applyOrderPatch(child, { price: 97 }, 0);
    expect(child.price).toBe(97);
    expect(() => applyOrderPatch(child, { qty: 3 }, 0)).toThrow(/Only the price/);
  });
});

describe("PaperEngine.modifyOrder", () => {
  let dir: string;
  let engine: PaperEngine;
  const last = new Map<string, number>([["AAPL", 100]]);
  const market = {
    async quotes(symbols: string[]) {
      return symbols.filter((s) => last.has(s)).map((s) => ({ symbol: s, last: last.get(s)!, change: 0, changePct: 0, time: 0 }));
    },
  } as unknown as MarketData;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "qt-paper-mod-"));
    engine = new PaperEngine({ store: new Store(dir), market });
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("moves a working limit; moving it through the market fills it", async () => {
    const acc = await engine.create({ balance: 10_000 });
    const placed = await engine.placeOrder(acc.id, { symbol: "AAPL", side: "buy", type: "limit", price: 90, qty: 2 });
    const moved = await engine.modifyOrder(acc.id, placed.order.id, { price: 92 });
    expect(moved.order).toMatchObject({ status: "working", price: 92 });
    const filled = await engine.modifyOrder(acc.id, placed.order.id, { price: 101 });
    expect(filled.order).toMatchObject({ status: "filled", fillPrice: 100 });
    expect(filled.account.positions.AAPL.qty).toBe(2);
    await expect(engine.modifyOrder(acc.id, "nope", { price: 1 })).rejects.toThrow(/not found/);
  });
});
