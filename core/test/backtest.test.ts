import { describe, expect, it } from "vitest";
import type { BacktestConfig, Bar, EquityPoint, Signal, StrategyDef } from "../src/types";
import { runBacktest, sweepParams } from "../src/backtest/engine";
import { computeMetrics } from "../src/backtest/metrics";
import { STRATEGIES, getStrategy } from "../src/backtest/strategies";

// ---------- helpers ----------

const DAY = 86400;

function mk(rows: [number, number, number, number][]): Bar[] {
  return rows.map(([open, high, low, close], i) => ({ time: i * DAY, open, high, low, close, volume: 1000 }));
}

/** Strategy that emits the given signal on the given bar index. */
function scripted(script: Record<number, Signal>): StrategyDef {
  return {
    id: "scripted",
    name: "Scripted",
    description: "test",
    params: [],
    init: () => ({}),
    onBar: (ctx) => script[ctx.index] ?? null,
  };
}

function cfg(over: Partial<BacktestConfig> = {}): BacktestConfig {
  return {
    initialCapital: 10000,
    commissionBps: 0,
    commissionFixed: 0,
    slippageBps: 0,
    sizing: { mode: "fixed-qty", qty: 1 },
    allowShort: true,
    barsPerYear: 252,
    ...over,
  };
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomWalk(n: number, seed: number, start = 100): Bar[] {
  const r = rng(seed);
  const bars: Bar[] = [];
  let prev = start;
  for (let i = 0; i < n; i++) {
    const open = prev * (1 + (r() - 0.5) * 0.01);
    const close = open * (1 + (r() - 0.5) * 0.04);
    const high = Math.max(open, close) * (1 + r() * 0.01);
    const low = Math.min(open, close) * (1 - r() * 0.01);
    bars.push({ time: i * DAY, open, high, low, close, volume: 1000 + r() * 100 });
    prev = close;
  }
  return bars;
}

function allFinite(obj: Record<string, number>) {
  for (const [k, v] of Object.entries(obj)) {
    expect(Number.isFinite(v), `${k} = ${v}`).toBe(true);
  }
}

// Toy price path used by several tests.
//          open  high  low  close
const TOY = mk([
  [100, 101, 99, 100], // 0
  [102, 104, 101, 103], // 1
  [103, 106, 102, 105], // 2
  [105, 106, 98, 99], // 3
  [98, 100, 96, 97], // 4
  [97, 99, 95, 96], // 5
  [96, 98, 94, 95], // 6
  [95, 96, 93, 94], // 7
]);

// ---------- hand-computed scenario ----------

describe("runBacktest — hand-computed toy scenario", () => {
  // Signal "enter long" on bar 0 -> fills at bar 1 open; signal "exit" on bar 3 -> fills at bar 4 open.
  const strat = scripted({ 0: { action: "enter", side: "long" }, 3: { action: "exit" } });
  const config = cfg({ commissionBps: 10, commissionFixed: 1, slippageBps: 50, sizing: { mode: "fixed-qty", qty: 10 } });
  const res = runBacktest(TOY, strat, {}, config);

  it("fills, fees and P&L", () => {
    expect(res.trades).toHaveLength(1);
    const t = res.trades[0];
    // Entry: bar 1 open 102 * (1 + 0.005) = 102.51
    expect(t.entryIndex).toBe(1);
    expect(t.entryPrice).toBeCloseTo(102.51, 10);
    // Exit: bar 4 open 98 * (1 - 0.005) = 97.51
    expect(t.exitIndex).toBe(4);
    expect(t.exitPrice).toBeCloseTo(97.51, 10);
    // Entry fee: 10 * 102.51 = 1025.10 notional -> 1025.10 * 10/1e4 + 1 = 2.0251
    // Exit fee:  10 *  97.51 =  975.10 notional ->  975.10 * 10/1e4 + 1 = 1.9751
    expect(t.fees).toBeCloseTo(2.0251 + 1.9751, 10); // 4.0002
    // P&L: (97.51 - 102.51) * 10 - 4.0002 = -54.0002
    expect(t.pnl).toBeCloseTo(-54.0002, 10);
    expect(t.pnlPct).toBeCloseTo((-54.0002 / 1025.1) * 100, 10);
    expect(t.barsHeld).toBe(3);
    expect(t.exitReason).toBe("signal");
    expect(t.qty).toBe(10);
  });

  it("equity curve", () => {
    // Cash after entry: 10000 - 1025.10 - 2.0251 = 8972.8749
    // Bar 1: 8972.8749 + 10*103 = 10002.8749
    // Bar 2: 8972.8749 + 10*105 = 10022.8749
    // Bar 3: 8972.8749 + 10*99  =  9962.8749
    // Bar 4: exit -> 8972.8749 + 975.10 - 1.9751 = 9945.9998 (flat from here)
    const expected = [10000, 10002.8749, 10022.8749, 9962.8749, 9945.9998, 9945.9998, 9945.9998, 9945.9998];
    expect(res.equity).toHaveLength(8);
    res.equity.forEach((p, i) => expect(p.equity).toBeCloseTo(expected[i], 8));
    // Benchmark: 10000 / 100 = 100 units bought at bar 0 close -> 100 * close
    res.equity.forEach((p, i) => expect(p.benchmark).toBeCloseTo(100 * TOY[i].close, 8));
    // Drawdown at bar 3 relative to the bar-2 peak.
    expect(res.equity[3].drawdownPct).toBeCloseTo((9962.8749 / 10022.8749 - 1) * 100, 8);
    expect(res.equity[2].drawdownPct).toBe(0);
  });

  it("metrics", () => {
    const m = res.metrics;
    // Final equity = 10000 - 54.0002
    expect(m.totalReturnPct).toBeCloseTo((9945.9998 / 10000 - 1) * 100, 8);
    // Max DD: peak 10022.8749 (bar 2) -> trough 9945.9998, never recovers -> 7 - 2 = 5 bars
    expect(m.maxDrawdownPct).toBeCloseTo((9945.9998 / 10022.8749 - 1) * 100, 8);
    expect(m.maxDrawdownBars).toBe(5);
    expect(m.trades).toBe(1);
    expect(m.totalFees).toBeCloseTo(4.0002, 10);
    expect(m.winRatePct).toBe(0);
    expect(m.profitFactor).toBe(0);
    expect(m.avgLoss).toBeCloseTo(-54.0002, 10);
    expect(m.expectancy).toBeCloseTo(-54.0002, 10);
    // Held at the close of bars 1, 2, 3 -> 3 / 8
    expect(m.exposurePct).toBeCloseTo(37.5, 10);
    // Benchmark: 94 / 100 - 1
    expect(m.benchmarkReturnPct).toBeCloseTo(-6, 10);
    allFinite(m as unknown as Record<string, number>);
  });
});

// ---------- sides, reverse, shorts ----------

describe("runBacktest — sides", () => {
  it("short P&L is (entry - exit) * qty", () => {
    const res = runBacktest(TOY, scripted({ 0: { action: "enter", side: "short" }, 3: { action: "exit" } }), {}, cfg());
    const t = res.trades[0];
    expect(t.side).toBe("short");
    expect(t.entryPrice).toBe(102);
    expect(t.exitPrice).toBe(98);
    expect(t.pnl).toBeCloseTo(4, 10);
    // Bar 2 mark: 10000 + (102 - 105) = 9997
    expect(res.equity[2].equity).toBeCloseTo(9997, 10);
    expect(res.equity[7].equity).toBeCloseTo(10004, 10);
  });

  it("short slippage works against the trader", () => {
    const res = runBacktest(
      TOY,
      scripted({ 0: { action: "enter", side: "short" }, 3: { action: "exit" } }),
      {},
      cfg({ slippageBps: 100 }),
    );
    const t = res.trades[0];
    expect(t.entryPrice).toBeCloseTo(102 * 0.99, 10); // sell lower
    expect(t.exitPrice).toBeCloseTo(98 * 1.01, 10); // buy back higher
  });

  it("reverse closes and opens the opposite side at the same fill", () => {
    const res = runBacktest(
      TOY,
      scripted({ 0: { action: "enter", side: "long" }, 2: { action: "reverse", side: "short" } }),
      {},
      cfg(),
    );
    expect(res.trades).toHaveLength(2);
    const [a, b] = res.trades;
    expect(a.side).toBe("long");
    expect(a.entryPrice).toBe(102);
    expect(a.exitPrice).toBe(105); // bar 3 open
    expect(a.pnl).toBeCloseTo(3, 10);
    expect(b.side).toBe("short");
    expect(b.entryIndex).toBe(3);
    expect(b.entryPrice).toBe(105);
    expect(b.exitReason).toBe("end");
    expect(b.exitPrice).toBe(94); // last close
    expect(b.pnl).toBeCloseTo(11, 10);
    expect(res.equity[7].equity).toBeCloseTo(10014, 10);
  });

  it("allowShort=false ignores short entries and turns a reverse into an exit", () => {
    const noShort = cfg({ allowShort: false });
    const r1 = runBacktest(TOY, scripted({ 0: { action: "enter", side: "short" } }), {}, noShort);
    expect(r1.trades).toHaveLength(0);
    expect(r1.equity.every((p) => p.equity === 10000)).toBe(true);
    const r2 = runBacktest(
      TOY,
      scripted({ 0: { action: "enter", side: "long" }, 2: { action: "reverse", side: "short" } }),
      {},
      noShort,
    );
    expect(r2.trades).toHaveLength(1);
    expect(r2.trades[0].side).toBe("long");
    expect(r2.trades[0].exitIndex).toBe(3);
    expect(r2.trades[0].exitReason).toBe("signal");
  });

  it("enter on the same side is ignored", () => {
    const res = runBacktest(
      TOY,
      scripted({ 0: { action: "enter", side: "long" }, 1: { action: "enter", side: "long" }, 3: { action: "exit" } }),
      {},
      cfg(),
    );
    expect(res.trades).toHaveLength(1);
    expect(res.trades[0].qty).toBe(1);
  });

  it("signals on the last bar are ignored", () => {
    const res = runBacktest(TOY, scripted({ 7: { action: "enter", side: "long" } }), {}, cfg());
    expect(res.trades).toHaveLength(0);
  });

  it("sizing modes", () => {
    const s = scripted({ 0: { action: "enter", side: "long" }, 3: { action: "exit" } });
    const pct = runBacktest(TOY, s, {}, cfg({ sizing: { mode: "percent-equity", percent: 50 } }));
    expect(pct.trades[0].qty).toBeCloseTo(5000 / 102, 10);
    const cash = runBacktest(TOY, s, {}, cfg({ sizing: { mode: "fixed-cash", cash: 1000 } }));
    expect(cash.trades[0].qty).toBeCloseTo(1000 / 102, 10);
  });
});

// ---------- stops and targets ----------

describe("runBacktest — protective exits", () => {
  const enter = scripted({ 0: { action: "enter", side: "long" } });

  it("stop is not checked on the entry bar, then hits intrabar at the stop price", () => {
    const bars = mk([
      [100, 100, 100, 100],
      [100, 101, 90, 100], // entry bar: low below stop is ignored
      [99, 101, 94, 96], // low 94 <= stop 95
      [96, 97, 95, 96],
    ]);
    const res = runBacktest(bars, enter, {}, cfg({ stopLossPct: 5 }));
    expect(res.trades).toHaveLength(1);
    const t = res.trades[0];
    expect(t.exitReason).toBe("stop");
    expect(t.exitIndex).toBe(2);
    expect(t.exitPrice).toBeCloseTo(95, 10);
    expect(t.pnl).toBeCloseTo(-5, 10);
  });

  it("gap through the stop fills at the open (with slippage)", () => {
    const bars = mk([
      [100, 100, 100, 100],
      [100, 101, 99, 100],
      [90, 92, 89, 91], // opens below stop
      [91, 92, 90, 91],
    ]);
    const res = runBacktest(bars, enter, {}, cfg({ stopLossPct: 5, slippageBps: 100 }));
    const t = res.trades[0];
    // Entry 100 * 1.01 = 101; stop = 101 * 0.95 = 95.95; gap open 90 -> 90 * 0.99 = 89.1
    expect(t.entryPrice).toBeCloseTo(101, 10);
    expect(t.exitReason).toBe("stop");
    expect(t.exitPrice).toBeCloseTo(89.1, 10);
  });

  it("stop and target in the same bar -> stop", () => {
    const bars = mk([
      [100, 100, 100, 100],
      [100, 101, 99, 100],
      [100, 106, 94, 100],
      [100, 101, 99, 100],
    ]);
    const res = runBacktest(bars, enter, {}, cfg({ stopLossPct: 5, takeProfitPct: 5 }));
    expect(res.trades[0].exitReason).toBe("stop");
    expect(res.trades[0].exitPrice).toBeCloseTo(95, 10);
  });

  it("target hit intrabar", () => {
    const bars = mk([
      [100, 100, 100, 100],
      [100, 101, 99, 100],
      [101, 106, 100, 104],
      [104, 105, 103, 104],
    ]);
    const res = runBacktest(bars, enter, {}, cfg({ stopLossPct: 5, takeProfitPct: 5 }));
    expect(res.trades[0].exitReason).toBe("target");
    expect(res.trades[0].exitPrice).toBeCloseTo(105, 10);
  });

  it("short stop is above entry", () => {
    const bars = mk([
      [100, 100, 100, 100],
      [100, 101, 99, 100],
      [101, 106, 100, 104],
      [104, 105, 103, 104],
    ]);
    const res = runBacktest(bars, scripted({ 0: { action: "enter", side: "short" } }), {}, cfg({ stopLossPct: 5 }));
    expect(res.trades[0].exitReason).toBe("stop");
    expect(res.trades[0].exitPrice).toBeCloseTo(105, 10);
    expect(res.trades[0].pnl).toBeCloseTo(-5, 10);
  });

  it("open position is closed at the last close with costs", () => {
    const res = runBacktest(TOY, enter, {}, cfg({ commissionFixed: 1, slippageBps: 100 }));
    const t = res.trades[0];
    expect(t.exitReason).toBe("end");
    expect(t.exitIndex).toBe(7);
    expect(t.exitPrice).toBeCloseTo(94 * 0.99, 10);
    expect(t.fees).toBeCloseTo(2, 10);
    // Final equity equals initial + trade P&L once flat.
    expect(res.equity[7].equity).toBeCloseTo(10000 + t.pnl, 8);
  });
});

// ---------- look-ahead ----------

describe("runBacktest — no look-ahead", () => {
  it("ctx.bars and ctx.data hide the future", () => {
    const seen: unknown[] = [];
    const lens: number[] = [];
    const peek: StrategyDef = {
      id: "peek",
      name: "Peek",
      description: "",
      params: [],
      init: (bars) => ({ x: bars.map((b) => b.close) }),
      onBar: (ctx) => {
        seen.push(ctx.bars[ctx.index + 1], ctx.data.x[ctx.index + 1], ctx.bars.at(-1) === ctx.bars[ctx.index] ? undefined : "bad");
        lens.push(ctx.bars.length, ctx.data.x.length, ctx.bars.slice().length);
        expect(ctx.bars[ctx.index]).toBe(TOY[ctx.index]);
        return null;
      },
    };
    runBacktest(TOY, peek, {}, cfg());
    expect(seen.every((v) => v === undefined)).toBe(true);
    for (let i = 0; i < lens.length / 3; i++) {
      expect(lens.slice(i * 3, i * 3 + 3)).toEqual([i + 1, i + 1, i + 1]);
    }
  });

  it("ctx.bars is read-only", () => {
    const writer: StrategyDef = {
      id: "w",
      name: "w",
      description: "",
      params: [],
      init: () => ({}),
      onBar: (ctx) => {
        expect(() => {
          (ctx.bars as Bar[])[0] = { ...ctx.bars[0], close: 0 };
        }).toThrow();
        return null;
      },
    };
    runBacktest(TOY, writer, {}, cfg());
    expect(TOY[0].close).toBe(100);
  });

  const k = 400;
  for (const strat of STRATEGIES) {
    it(`${strat.id}: mutating bars after k leaves history up to k unchanged`, () => {
      const bars = randomWalk(800, 7);
      const config = cfg({ sizing: { mode: "percent-equity", percent: 100 }, commissionBps: 5, slippageBps: 5, stopLossPct: 8 });
      const params: Record<string, number> = strat.id === "rsi-reversion" ? { period: 6, lower: 35, upper: 65 } : strat.id === "bb-breakout" ? { period: 10, mult: 1 } : {};
      const a = runBacktest(bars, strat, params, config);
      const r = rng(99);
      const mutated = bars.map((b, i) => {
        if (i <= k) return b;
        const open = 50 + r() * 100;
        const close = 50 + r() * 100;
        return { ...b, open, close, high: Math.max(open, close) + r() * 5, low: Math.min(open, close) - r() * 5 };
      });
      const b = runBacktest(mutated, strat, params, config);
      expect(a.trades.length).toBeGreaterThan(0);
      for (let i = 0; i <= k; i++) expect(b.equity[i]).toEqual(a.equity[i]);
      const closedA = a.trades.filter((t) => t.exitIndex <= k);
      const closedB = b.trades.filter((t) => t.exitIndex <= k);
      expect(closedB).toEqual(closedA);
      const openA = a.trades.filter((t) => t.entryIndex <= k && t.exitIndex > k);
      const openB = b.trades.filter((t) => t.entryIndex <= k && t.exitIndex > k);
      expect(openB.map((t) => [t.side, t.entryIndex, t.entryPrice, t.qty])).toEqual(
        openA.map((t) => [t.side, t.entryIndex, t.entryPrice, t.qty]),
      );
    });
  }
});

// ---------- metrics ----------

describe("computeMetrics", () => {
  function curve(values: number[]): EquityPoint[] {
    return values.map((v, i) => ({ time: i * DAY, equity: v, drawdownPct: 0, benchmark: 100 }));
  }

  it("known equity series", () => {
    const eq = curve([100, 120, 90, 95, 130, 110]);
    const m = computeMetrics(eq, [], cfg({ initialCapital: 100, barsPerYear: 5 }), []);
    // Peak 120 -> trough 90: 90/120 - 1 = -25%; recovered at index 4 (130 >= 120): 4 - 1 = 3 bars.
    expect(m.maxDrawdownPct).toBeCloseTo(-25, 10);
    expect(m.maxDrawdownBars).toBe(3);
    // 5 elapsed bars at 5 bars/year = 1 year -> CAGR = 110/100 - 1 = 10%
    expect(m.cagrPct).toBeCloseTo(10, 10);
    expect(m.totalReturnPct).toBeCloseTo(10, 10);
    expect(m.calmar).toBeCloseTo(0.4, 10);
    // Returns: 0.2, -0.25, 5/90, 35/95, -20/130
    const rets = [0.2, -0.25, 5 / 90, 35 / 95, -20 / 130];
    const mean = rets.reduce((a, b) => a + b, 0) / 5;
    const sd = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / 4);
    expect(m.volatilityPct).toBeCloseTo(sd * Math.sqrt(5) * 100, 10);
    expect(m.sharpe).toBeCloseTo((mean / sd) * Math.sqrt(5), 10);
    const dd = Math.sqrt((0.25 ** 2 + (20 / 130) ** 2) / 5);
    expect(m.sortino).toBeCloseTo((mean / dd) * Math.sqrt(5), 10);
  });

  it("two-year CAGR", () => {
    const m = computeMetrics(curve([100, 110, 121]), [], cfg({ initialCapital: 100, barsPerYear: 1 }), []);
    expect(m.cagrPct).toBeCloseTo(10, 10);
    expect(m.maxDrawdownPct).toBe(0);
    expect(m.maxDrawdownBars).toBe(0);
  });

  it("zero-trade run has no NaN anywhere", () => {
    const res = runBacktest(randomWalk(200, 3), scripted({}), {}, cfg({ riskFreeRate: 0.03 }));
    expect(res.trades).toHaveLength(0);
    allFinite(res.metrics as unknown as Record<string, number>);
    expect(res.metrics.sharpe).toBe(0);
    expect(res.metrics.totalReturnPct).toBe(0);
    for (const p of res.equity) allFinite(p as unknown as Record<string, number>);
  });

  it("empty and single-bar inputs are safe", () => {
    allFinite(runBacktest([], scripted({}), {}, cfg()).metrics as unknown as Record<string, number>);
    allFinite(runBacktest(TOY.slice(0, 1), scripted({ 0: { action: "enter", side: "long" } }), {}, cfg()).metrics as unknown as Record<string, number>);
  });

  it("profit factor is capped when there are no losses", () => {
    const res = runBacktest(TOY, scripted({ 0: { action: "enter", side: "long" }, 1: { action: "exit" } }), {}, cfg());
    expect(res.trades[0].pnl).toBeCloseTo(1, 10); // 102 -> 103
    expect(res.metrics.profitFactor).toBe(999);
    expect(res.metrics.winRatePct).toBe(100);
  });
});

// ---------- built-in strategies ----------

describe("built-in strategies", () => {
  it("registry", () => {
    expect(STRATEGIES.map((s) => s.id)).toEqual(["sma-cross", "rsi-reversion", "bb-breakout", "donchian-breakout", "macd-cross"]);
    expect(getStrategy("macd-cross")?.id).toBe("macd-cross");
    expect(getStrategy("nope")).toBeUndefined();
    for (const s of STRATEGIES) {
      for (const p of s.params) {
        expect(p.min! <= p.default && p.default <= p.max!).toBe(true);
        expect(p.step).toBeGreaterThan(0);
      }
    }
  });

  const bars = randomWalk(1000, 42);
  for (const strat of STRATEGIES) {
    for (const allowShort of [false, true]) {
      it(`${strat.id} (allowShort=${allowShort}) runs on a 1,000-bar random walk`, () => {
        const res = runBacktest(bars, strat, {}, cfg({ allowShort, sizing: { mode: "percent-equity", percent: 100 }, commissionBps: 2 }));
        expect(res.equity).toHaveLength(1000);
        allFinite(res.metrics as unknown as Record<string, number>);
        for (const t of res.trades) {
          allFinite({ pnl: t.pnl, entry: t.entryPrice, exit: t.exitPrice, qty: t.qty });
          if (!allowShort) expect(t.side).toBe("long");
        }
      });
    }
  }
});

// ---------- sweep ----------

describe("sweepParams", () => {
  it("returns the cartesian product sorted by metric", () => {
    const bars = randomWalk(600, 5);
    const sma = getStrategy("sma-cross")!;
    const rows = sweepParams(bars, sma, { fast: [5, 10, 15], slow: [20, 40] }, cfg({ sizing: { mode: "percent-equity", percent: 100 } }), "totalReturnPct");
    expect(rows).toHaveLength(6);
    const combos = rows.map((r) => `${r.params.fast}/${r.params.slow}`).sort();
    expect(combos).toEqual(["10/20", "10/40", "15/20", "15/40", "5/20", "5/40"]);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].metrics.totalReturnPct).toBeGreaterThanOrEqual(rows[i].metrics.totalReturnPct);
    }
    // Each row matches an individual run.
    const single = runBacktest(bars, sma, rows[0].params, cfg({ sizing: { mode: "percent-equity", percent: 100 } }));
    expect(single.metrics).toEqual(rows[0].metrics);
  });

  it("defaults to sharpe and fills missing params with defaults", () => {
    const rows = sweepParams(randomWalk(300, 9), getStrategy("macd-cross")!, { fast: [8, 12] }, cfg());
    expect(rows).toHaveLength(2);
    expect(rows[0].params.slow).toBe(26);
    expect(rows[0].metrics.sharpe).toBeGreaterThanOrEqual(rows[1].metrics.sharpe);
  });
});
