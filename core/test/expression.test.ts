import { describe, expect, it } from "vitest";
import type { Bar } from "../src/types";
import { ExpressionError, evaluateExpression, isExpression, parseExpression } from "../src/analysis/expression";

const bar = (time: number, open: number, high: number, low: number, close: number, volume = 100): Bar => ({
  time,
  open,
  high,
  low,
  close,
  volume,
});

describe("parseExpression", () => {
  it("parses ratio, spread with scale, and averages", () => {
    expect(parseExpression("AAPL/MSFT")).toEqual({
      symbols: ["AAPL", "MSFT"],
      ast: { type: "bin", op: "/", left: { type: "sym", symbol: "AAPL" }, right: { type: "sym", symbol: "MSFT" } },
    });
    const spread = parseExpression("BINANCE:BTCUSDT-BINANCE:ETHUSDT*20");
    expect(spread.symbols).toEqual(["BINANCE:BTCUSDT", "BINANCE:ETHUSDT"]);
    expect(spread.ast).toEqual({
      type: "bin",
      op: "-",
      left: { type: "sym", symbol: "BINANCE:BTCUSDT" },
      right: { type: "bin", op: "*", left: { type: "sym", symbol: "BINANCE:ETHUSDT" }, right: { type: "num", value: 20 } },
    });
    const avg = parseExpression("(EURUSD=X+GBPUSD=X)/2");
    expect(avg.symbols).toEqual(["EURUSD=X", "GBPUSD=X"]);
    expect(avg.ast.type === "bin" && avg.ast.op).toBe("/");
  });

  it("handles unary minus, precedence, quoted and numeric-looking symbols", () => {
    expect(parseExpression("-A*2").ast).toEqual({
      type: "bin",
      op: "*",
      left: { type: "neg", arg: { type: "sym", symbol: "A" } },
      right: { type: "num", value: 2 },
    });
    expect(parseExpression('"BTC-USD"/"ETH-USD"').symbols).toEqual(["BTC-USD", "ETH-USD"]);
    expect(parseExpression("7203.T/2.5").ast).toEqual({
      type: "bin",
      op: "/",
      left: { type: "sym", symbol: "7203.T" },
      right: { type: "num", value: 2.5 },
    });
    expect(parseExpression("A + A * B").symbols).toEqual(["A", "B"]);
  });

  it("rejects malformed input without evaluating anything", () => {
    for (const bad of ["", "AAPL/", "(A", "A)", "A ; B", "A $$ B (", '"unterminated', "*A"]) {
      expect(() => parseExpression(bad), bad).toThrow(ExpressionError);
    }
  });
});

describe("isExpression", () => {
  it("tells plain symbols from expressions", () => {
    expect(isExpression("AAPL")).toBe(false);
    expect(isExpression("BINANCE:BTCUSDT")).toBe(false);
    expect(isExpression("BTC-USD")).toBe(false); // bare hyphen → plain symbol
    expect(isExpression('"BTC-USD"')).toBe(false);
    expect(isExpression("AAPL/MSFT")).toBe(true);
    expect(isExpression("AAPL - MSFT")).toBe(true);
    expect(isExpression("BINANCE:BTCUSDT-BINANCE:ETHUSDT*20")).toBe(true);
    expect(isExpression("(EURUSD=X+GBPUSD=X)/2")).toBe(true);
    expect(isExpression("AAPL/")).toBe(false);
  });
});

describe("evaluateExpression", () => {
  const A = [bar(0, 1, 1, 1, 1), bar(1, 10, 12, 8, 11, 50), bar(2, 20, 22, 18, 21)];
  const B = [bar(1, 5, 8, 4, 5), bar(2, 10, 11, 9, 10), bar(3, 1, 1, 1, 1)];

  it("inner-joins by time and recomputes high/low for ratios", () => {
    const out = evaluateExpression(parseExpression("A/B").ast, { A, B });
    expect(out.map((b) => b.time)).toEqual([1, 2]);
    // Field-wise at t=1: open 10/5 = 2, high 12/8 = 1.5, low 8/4 = 2, close 11/5 = 2.2.
    // Field-wise high (1.5) < low (2); recomputed: high = max = 2.2, low = min = 1.5.
    expect(out[0].open).toBeCloseTo(2, 12);
    expect(out[0].close).toBeCloseTo(2.2, 12);
    expect(out[0].high).toBeCloseTo(2.2, 12);
    expect(out[0].low).toBeCloseTo(1.5, 12);
    for (const b of out) expect(b.high).toBeGreaterThanOrEqual(b.low);
    expect(out[0].volume).toBe(0); // several symbols → no volume
  });

  it("evaluates spreads with constants and keeps single-symbol volume", () => {
    const spread = evaluateExpression(parseExpression("A-B*2").ast, { A, B });
    // t=1: open 10-10 = 0, high 12-16 = -4, low 8-8 = 0, close 11-10 = 1 → high 1, low -4.
    expect(spread[0]).toEqual({ time: 1, open: 0, high: 1, low: -4, close: 1, volume: 0 });
    const scaled = evaluateExpression(parseExpression("(A+A)/2").ast, { A });
    expect(scaled.map((b) => [b.close, b.volume])).toEqual([
      [1, 100],
      [11, 50],
      [21, 100],
    ]);
  });

  it("drops non-finite results and requires every series", () => {
    const Z = [bar(1, 0, 1, 0, 1), bar(2, 1, 1, 1, 1)];
    expect(evaluateExpression(parseExpression("A/Z").ast, { A, Z }).map((b) => b.time)).toEqual([2]);
    expect(() => evaluateExpression(parseExpression("A/Q").ast, { A })).toThrow();
  });
});
