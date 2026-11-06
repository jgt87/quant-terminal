import { describe, expect, it } from "vitest";
import { tradeLineHit, tradeLinesFor, tradeLineBoxes, type TradeAccountView } from "../src/chart/tradeLines";
import { chartTheme } from "../src/chart/theme";
import { tradeRequest } from "../src/hooks/useChartTrading";

const acc: TradeAccountView = {
  orders: [
    { id: "a", symbol: "AAPL", side: "buy", type: "limit", qty: 5, price: 95, stopLoss: 90, takeProfit: 110, status: "working" },
    { id: "b", symbol: "AAPL", side: "sell", type: "stop-limit", qty: 2, price: 99, stopPrice: 100, status: "working" },
    { id: "c", symbol: "AAPL", side: "sell", type: "stop", qty: 3, price: 97, status: "working", parentId: "p", role: "stop-loss" },
    { id: "d", symbol: "MSFT", side: "buy", type: "limit", qty: 1, price: 300, status: "working" },
    { id: "e", symbol: "AAPL", side: "buy", type: "limit", qty: 1, price: 80, status: "filled" },
  ],
  positions: { AAPL: { qty: 3, avgPrice: 101, unrealizedPnl: -6 } },
};

describe("trade lines", () => {
  it("lists working orders, pending brackets, stop-limit triggers and the position of the symbol", () => {
    const lines = tradeLinesFor(acc, "aapl", (p) => p.toFixed(2));
    expect(lines.map((l) => [l.id, l.kind, l.price, l.field, l.action])).toEqual([
      ["a:price", "order", 95, "price", "cancel"],
      ["a:sl", "stop-loss", 90, "stopLoss", "remove-leg"],
      ["a:tp", "take-profit", 110, "takeProfit", "remove-leg"],
      ["b:price", "order", 99, "price", "cancel"],
      ["b:stop", "stop", 100, "stopPrice", "cancel"],
      ["c:price", "stop-loss", 97, "price", "cancel"],
      ["position", "position", 101, null, "close"],
    ]);
    expect(lines[0].text).toBe("Buy LMT 5 @ 95.00");
    expect(lines[6].text).toBe("Long 3 @ 101.00  −6.00");
    expect(tradeLinesFor(null, "AAPL")).toEqual([]);
    expect(tradeLinesFor({ ...acc, orders: [{ ...acc.orders[1], triggered: true }] }, "AAPL").map((l) => l.id)).toEqual(["b:price", "position"]);
  });

  it("hit-tests the × button, the label and the line", () => {
    const theme = chartTheme("dark");
    const ctx = { font: "", measureText: (t: string) => ({ width: t.length * 6 }) } as unknown as CanvasRenderingContext2D;
    const lines = tradeLinesFor(acc, "AAPL").slice(0, 1);
    const toY = (p: number) => 1000 - p * 10; // 95 → y 50
    const b = tradeLineBoxes(ctx, theme, lines[0], 50);
    expect(tradeLineHit(ctx, theme, lines, toY, b.close.x + 2, 50)?.part).toBe("close");
    expect(tradeLineHit(ctx, theme, lines, toY, b.label.x + 2, 50)?.part).toBe("label");
    expect(tradeLineHit(ctx, theme, lines, toY, 600, 53)?.part).toBe("line");
    expect(tradeLineHit(ctx, theme, lines, toY, 600, 60)).toBeNull();
  });

  it("maps drags and buttons to order requests", () => {
    const [order, sl, , , stop, child, pos] = tradeLinesFor(acc, "AAPL");
    expect(tradeRequest(order, { kind: "move", price: 96 })).toEqual({ op: "modify", orderId: "a", patch: { price: 96 } });
    expect(tradeRequest(stop, { kind: "move", price: 101 })).toEqual({ op: "modify", orderId: "b", patch: { stopPrice: 101 } });
    expect(tradeRequest(sl, { kind: "button" })).toEqual({ op: "modify", orderId: "a", patch: { stopLoss: null } });
    expect(tradeRequest(child, { kind: "button" })).toEqual({ op: "cancel", orderId: "c" });
    expect(tradeRequest(pos, { kind: "button" })).toEqual({ op: "close" });
    expect(tradeRequest(pos, { kind: "move", price: 1 })).toBeNull();
  });
});

describe("trade line layout", () => {
  it("moves a label right when its row overlaps another label", async () => {
    const { layoutTradeLines } = await import("../src/chart/tradeLines");
    const theme = chartTheme("dark");
    const ctx = { font: "", measureText: (t: string) => ({ width: t.length * 6 }) } as unknown as CanvasRenderingContext2D;
    const lines = tradeLinesFor(acc, "AAPL");
    const boxes = layoutTradeLines(ctx, theme, lines, (p) => 1000 - p * 2);
    // Stop-limit trigger (100) and its limit (99) are 2 px apart: side by side, not on top.
    const [b99, b100] = [boxes[3], boxes[4]];
    expect(b99.label.x === b100.label.x).toBe(false);
    for (let i = 0; i < boxes.length; i++)
      for (let k = i + 1; k < boxes.length; k++) {
        const a = boxes[i], b = boxes[k];
        const rowsOverlap = Math.abs(a.y - b.y) < a.label.h;
        const colsOverlap = a.label.x < b.close.x + b.close.w && b.label.x < a.close.x + a.close.w;
        expect(rowsOverlap && colsOverlap).toBe(false);
      }
  });
});
