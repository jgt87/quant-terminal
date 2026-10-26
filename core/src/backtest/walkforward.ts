// Walk-forward optimization and a train/test split helper.
//
// Folds (half-open index ranges [start, end)):
//   fold k: train = [s, s + trainBars), test = [s + trainBars, s + trainBars + testBars),
//   s = k · step. Folds are generated while the whole test window fits in the data.
//   step must be >= testBars so out-of-sample windows never overlap (default = testBars).
// Per fold: sweepParams over the TRAIN bars only picks the best params by `metric`; those
// params are then run on the TEST bars only (bars.slice(testStart, testEnd)), so test
// data never influences the choice and indicators warm up inside the test window.
// Stitched out-of-sample equity: test folds are chained in order, each one started with
// the previous fold's final equity as initialCapital (exact compounding for every sizing
// mode). Drawdown and the buy-and-hold benchmark are recomputed over the stitched path.
// Trades keep the engine's fields with entryIndex/exitIndex shifted to indices of the
// full `bars` array. Combined metrics = computeMetrics over the stitched equity/trades.

import type { BacktestConfig, BacktestMetrics, Bar, EquityPoint, StrategyDef, Trade } from "../types";
import { runBacktest, sweepParams } from "./engine";
import { computeMetrics } from "./metrics";

export interface WalkForwardOptions {
  trainBars: number;
  testBars: number;
  step?: number;
  metric?: keyof BacktestMetrics;
}

export interface WalkForwardFold {
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  bestParams: Record<string, number>;
  trainMetrics: BacktestMetrics;
  testMetrics: BacktestMetrics;
}

export interface WalkForwardResult {
  folds: WalkForwardFold[];
  /** Stitched out-of-sample equity (test windows only, in order). */
  equity: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
}

export function walkForward(
  bars: Bar[],
  strategy: StrategyDef,
  grid: Record<string, number[]>,
  config: BacktestConfig,
  opts: WalkForwardOptions,
): WalkForwardResult {
  const train = Math.floor(opts.trainBars);
  const test = Math.floor(opts.testBars);
  const step = Math.floor(opts.step ?? test);
  const metric = opts.metric ?? "sharpe";
  if (!(train >= 1) || !(test >= 1)) throw new RangeError("walkForward: trainBars and testBars must be >= 1");
  if (step < test) throw new RangeError("walkForward: step must be >= testBars (test windows may not overlap)");

  const folds: WalkForwardFold[] = [];
  const equity: EquityPoint[] = [];
  const trades: Trade[] = [];
  const oosBars: Bar[] = [];
  // computeMetrics measures exposure with trade indices into the bars it is given,
  // so it gets a copy of the trades indexed into the stitched out-of-sample bars.
  const localTrades: Trade[] = [];
  let carry = config.initialCapital;

  for (let s = 0; s + train + test <= bars.length; s += step) {
    const trainBars = bars.slice(s, s + train);
    const testStart = s + train;
    const testEnd = testStart + test;
    const best = sweepParams(trainBars, strategy, grid, config, metric)[0];
    const testRes = runBacktest(bars.slice(testStart, testEnd), strategy, best.params, { ...config, initialCapital: carry });
    folds.push({
      trainStart: s,
      trainEnd: s + train,
      testStart,
      testEnd,
      bestParams: best.params,
      trainMetrics: best.metrics,
      testMetrics: testRes.metrics,
    });
    for (const p of testRes.equity) equity.push({ ...p });
    const offset = oosBars.length;
    for (const t of testRes.trades) {
      trades.push({ ...t, entryIndex: t.entryIndex + testStart, exitIndex: t.exitIndex + testStart });
      localTrades.push({ ...t, entryIndex: t.entryIndex + offset, exitIndex: t.exitIndex + offset });
    }
    oosBars.push(...bars.slice(testStart, testEnd));
    if (testRes.equity.length) carry = testRes.equity[testRes.equity.length - 1].equity;
  }

  // Recompute drawdown and benchmark over the stitched path.
  let peak = -Infinity;
  const c0 = oosBars[0]?.close ?? 0;
  equity.forEach((p, i) => {
    peak = Math.max(peak, p.equity);
    p.drawdownPct = peak > 0 ? Math.min(0, (p.equity / peak - 1) * 100) : 0;
    p.benchmark = c0 > 0 ? (config.initialCapital * oosBars[i].close) / c0 : 0;
  });
  const metrics = computeMetrics(equity, localTrades, config, oosBars);
  return { folds, equity, trades, metrics };
}

/** Splits bars chronologically: the first trainFraction (0..1) for training, the rest for testing. */
export function trainTestSplit(bars: Bar[], trainFraction = 0.7): { train: Bar[]; test: Bar[] } {
  const f = Math.min(1, Math.max(0, trainFraction));
  const cut = Math.round(bars.length * f);
  return { train: bars.slice(0, cut), test: bars.slice(cut) };
}
