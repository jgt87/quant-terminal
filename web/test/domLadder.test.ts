import { describe, expect, it } from "vitest";
import type { BookView } from "../src/api/depth";
import type { PaperOrderView } from "../src/api/paper";
import { clickOrder, dragPatch, ladderRows, ladderSteps, rowKey } from "../src/panels/dom/domModel";

const book: BookView = {
  symbol: "BINANCE:BTCUSDT",
  time: 0,
  mode: "stream",
  synced: true,
  bid: 100.4,
  ask: 100.6,
  step: 0,
  heatStep: null,
  bids: [[100.4, 1], [100.1, 2], [99.6, 4]],
  asks: [[100.6, 1], [101.3, 3]],
};

const order = (o: Partial<PaperOrderView>): PaperOrderView => ({ id: "o", symbol: "BINANCE:BTCUSDT", side: "buy", type: "limit", qty: 1, status: "working", createdAt: 0, price: 99, ...o }) as PaperOrderView;

describe("depth ladder model", () => {
  it("offers grouping steps from the price", () => {
    expect(ladderSteps(75000)).toEqual([1, 2, 5, 10, 25, 50, 100]);
    expect(ladderSteps(1.2)).toEqual([0.00002, 0.00004, 0.0001, 0.0002, 0.0005, 0.001, 0.002]);
  });

  it("lays out rows around the mid with summed sizes, best bid / ask and own orders", () => {
    const rows = ladderRows(book, 1, 5, [order({ id: "a", price: 99 }), order({ id: "b", side: "sell", price: 102, type: "stop", role: "stop-loss" }), order({ id: "c", status: "filled" }), order({ id: "d", symbol: "ETHUSDT" })], "binance:btcusdt", { qty: 1, avgPrice: 100.2 });
    expect(rows.map((r) => r.price)).toEqual([102, 101, 100, 99, 98]);
    const at = (p: number) => rows.find((r) => r.price === p)!;
    expect(at(100).bid).toBe(3); // 100.4 and 100.1 round to 100
    expect(at(101).ask).toBe(1); // 100.6 rounds to 101
    expect(at(100).bestBid).toBe(true);
    expect(at(101).bestAsk).toBe(true);
    expect(at(99).buys.map((o) => o.id)).toEqual(["a"]);
    expect(at(102).sells).toEqual([{ id: "b", side: "sell", qty: 1, type: "STP", leg: "stop-loss" }]);
    expect(at(100).position).toBe(true);
    expect(ladderRows(book, 1, 3, [], "", null, 110).map((r) => r.price)).toEqual([111, 110, 109]);
    expect(ladderRows(null, 1, 3)).toEqual([]);
    expect(rowKey(100.49, 1)).toBe(100);
  });

  it("places limits inside the spread and stops past it; drags change the price", () => {
    expect(clickOrder("buy", 100, book, 0.5, "S")).toEqual({ symbol: "S", side: "buy", type: "limit", qty: 0.5, price: 100 });
    expect(clickOrder("buy", 101, book, 0.5, "S").type).toBe("stop");
    expect(clickOrder("sell", 101, book, 0.5, "S").type).toBe("limit");
    expect(clickOrder("sell", 100, book, 0.5, "S").type).toBe("stop");
    expect(dragPatch("x", 99.5)).toEqual({ orderId: "x", patch: { price: 99.5 } });
  });
});
