import { describe, expect, it } from "vitest";
import type { BacktestConfig, Bar, StrategyDef } from "../src/types";
import { trainTestSplit, walkForward } from "../src/backtest/walkforward";
import { sweepParams } from "../src/backtest/engine";
import { SMA_CROSS } from "../src/backtest/strategies";

const D = 86400;
const bars: Bar[] = Array.from({ length: 100 }, (_, i) => {
  const c = 100 + 10 * Math.sin(i / 6) + i * 0.1;
  return { time: i * D, open: c - 0.2, high: c + 1, low: c - 1, close: c, volume: 1000 };
});
const cfg: BacktestConfig = {
  initialCapital: 10000,
  commissionBps: 0,
  commissionFixed: 0,
  slippageBps: 0,
  sizing: { mode: "percent-equity", percent: 100 },
  allowShort: true,
  barsPerYear: 252,
};
const GRID = { fast: [3, 5], slow: [10, 15] };

describe("walkForward", () => {
  it("fold boundaries: train [s, s+train), test right after, step = test", () => {
    const res = walkForward(bars, SMA_CROSS, GRID, cfg, { trainBars: 40, testBars: 20 });
    expect(res.folds.map((f) => [f.trainStart, f.trainEnd, f.testStart, f.testEnd])).toEqual([
      [0, 40, 40, 60],
      [20, 60, 60, 80],
      [40, 80, 80, 100],
    ]);
    for (const f of res.folds) expect(f.testStart).toBeGreaterThanOrEqual(f.trainEnd);
    // Stitched out-of-sample equity covers bars 40..99 exactly once, in order.
    expect(res.equity.map((p) => p.time)).toEqual(bars.slice(40).map((b) => b.time));
    // Best params come from a sweep over the training window only.
    expect(res.folds[1].bestParams).toEqual(sweepParams(bars.slice(20, 60), SMA_CROSS, GRID, cfg, "sharpe")[0].params);
    // Each fold starts flat with the previous fold's final equity.
    expect(res.equity[20].equity).toBeCloseTo(res.equity[19].equity, 9);
    expect(res.metrics.totalReturnPct).toBeCloseTo((res.equity[59].equity / 10000 - 1) * 100, 9);
    for (const t of res.trades) expect(t.entryIndex).toBeGreaterThanOrEqual(40);
    for (const p of res.equity) expect(p.drawdownPct).toBeLessThanOrEqual(0);
  });

  it("no leakage: optimization never sees test bars and tests never see train bars", () => {
    const log: { first: number; last: number }[] = [];
    const spy: StrategyDef = {
      id: "spy",
      name: "Spy",
      description: "records the bars it is given",
      params: [{ key: "p", label: "p", type: "int", default: 1 }],
      init(b) {
        log.push({ first: b[0].time, last: b[b.length - 1].time });
        return {};
      },
      onBar: (ctx) => (ctx.index === 1 ? { action: "enter", side: "long" } : null),
    };
    const res = walkForward(bars, spy, { p: [1, 2, 3] }, cfg, { trainBars: 30, testBars: 10, step: 15 });
    expect(res.folds.map((f) => f.testStart)).toEqual([30, 45, 60, 75, 90]);
    // 3 sweep runs + 1 test run per fold.
    expect(log).toHaveLength(res.folds.length * 4);
    res.folds.forEach((f, k) => {
      const runs = log.slice(k * 4, k * 4 + 4);
      for (const r of runs.slice(0, 3)) {
        expect(r.first).toBe(bars[f.trainStart].time);
        expect(r.last).toBeLessThan(bars[f.testStart].time);
      }
      expect(runs[3].first).toBe(bars[f.testStart].time);
      expect(runs[3].last).toBe(bars[f.testEnd - 1].time);
    });
  });

  it("rejects overlapping test windows", () => {
    expect(() => walkForward(bars, SMA_CROSS, {}, cfg, { trainBars: 40, testBars: 20, step: 10 })).toThrow(RangeError);
  });
});

describe("trainTestSplit", () => {
  it("splits chronologically", () => {
    const { train, test } = trainTestSplit(bars.slice(0, 10), 0.7);
    expect(train.map((b) => b.time / D)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(test.map((b) => b.time / D)).toEqual([7, 8, 9]);
  });
});
