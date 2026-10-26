// Performance metrics for a finished backtest. Pure functions, no dependencies.
//
// Conventions (all documented here so the UI can label them correctly):
// - Percent values are in percent units (12.5 = 12.5%).
// - `maxDrawdownPct` and `EquityPoint.drawdownPct` are <= 0 (e.g. -23.4).
// - `maxDrawdownBars`: length in bars of the deepest drawdown episode, measured
//   from its peak to the bar where equity first regains that peak, or to the
//   last bar if it never recovers.
// - Per-bar returns r_t = e_t / e_(t-1) - 1 for t = 1..n-1.
// - Volatility = sample stdev(r) * sqrt(barsPerYear) * 100.
// - Sharpe = (mean(r) - rf/barsPerYear) / stdev(r) * sqrt(barsPerYear).
// - Sortino = (mean(r) - rf/barsPerYear) / DD * sqrt(barsPerYear) where
//   DD = sqrt(mean over ALL bars of min(0, r - rf/barsPerYear)^2).
// - CAGR uses elapsed bars (n - 1) / barsPerYear as the number of years.
// - Calmar = CAGR / |maxDrawdownPct|.
// - Ratios with a zero denominator are reported as 0, except when the
//   numerator is positive and the ratio would be +Infinity: then RATIO_CAP
//   (999) is used. This applies to profitFactor (wins but no losses), Sortino
//   (positive mean, no downside) and Calmar (positive CAGR, no drawdown).
//   Sharpe with zero volatility is 0. No metric is ever NaN or Infinity.
// - avgLoss is reported as a negative number (mean P&L of losing trades).
// - A win is a trade with pnl > 0; everything else counts as a loss for the
//   averages (break-even trades count in the loss bucket with 0 P&L).
// - Exposure = bars whose close was spent in a position / total bars.

import type { Bar, BacktestConfig, BacktestMetrics, EquityPoint, Trade } from "../types";

/** Stand-in for an infinite ratio so results stay finite and JSON-safe. */
export const RATIO_CAP = 999;

function fin(x: number): number {
  return Number.isFinite(x) ? x : 0;
}

function ratio(num: number, den: number): number {
  if (den === 0 || !Number.isFinite(den)) return num > 0 ? RATIO_CAP : 0;
  const r = num / den;
  if (!Number.isFinite(r)) return num > 0 ? RATIO_CAP : 0;
  return Math.max(-RATIO_CAP, Math.min(RATIO_CAP, r));
}

/** Deepest drawdown (<= 0, percent) and its duration in bars. */
export function maxDrawdown(values: number[]): { pct: number; bars: number } {
  let peak = -Infinity;
  let peakIdx = 0;
  let worst = 0;
  let worstPeakIdx = -1;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v >= peak) {
      peak = v;
      peakIdx = i;
      continue;
    }
    const dd = peak > 0 ? (v / peak - 1) * 100 : 0;
    if (dd < worst) {
      worst = dd;
      worstPeakIdx = peakIdx;
    }
  }
  if (worstPeakIdx < 0) return { pct: 0, bars: 0 };
  const peakVal = values[worstPeakIdx];
  let end = values.length - 1;
  for (let i = worstPeakIdx + 1; i < values.length; i++) {
    if (values[i] >= peakVal) {
      end = i;
      break;
    }
  }
  return { pct: worst, bars: end - worstPeakIdx };
}

export function computeMetrics(
  equity: EquityPoint[],
  trades: Trade[],
  config: BacktestConfig,
  bars: Bar[],
): BacktestMetrics {
  const n = equity.length;
  const initial = config.initialCapital > 0 ? config.initialCapital : n > 0 ? equity[0].equity : 0;
  const final = n > 0 ? equity[n - 1].equity : initial;
  const bpy = config.barsPerYear > 0 ? config.barsPerYear : 252;
  const rfBar = (config.riskFreeRate ?? 0) / bpy;

  const totalReturnPct = initial > 0 ? (final / initial - 1) * 100 : 0;

  const years = n > 1 ? (n - 1) / bpy : 0;
  let cagrPct = 0;
  if (years > 0 && initial > 0) {
    cagrPct = final <= 0 ? -100 : (Math.pow(final / initial, 1 / years) - 1) * 100;
  }

  // Per-bar returns.
  const rets: number[] = [];
  for (let i = 1; i < n; i++) {
    const prev = equity[i - 1].equity;
    rets.push(prev !== 0 ? equity[i].equity / prev - 1 : 0);
  }
  const m = rets.length;
  const mean = m > 0 ? rets.reduce((a, b) => a + b, 0) / m : 0;
  let sd = 0;
  if (m > 1) {
    let ss = 0;
    for (const r of rets) ss += (r - mean) ** 2;
    sd = Math.sqrt(ss / (m - 1));
  }
  let downSq = 0;
  for (const r of rets) {
    const d = Math.min(0, r - rfBar);
    downSq += d * d;
  }
  const downDev = m > 0 ? Math.sqrt(downSq / m) : 0;
  const excess = mean - rfBar;
  const sqrtB = Math.sqrt(bpy);
  const volatilityPct = sd * sqrtB * 100;
  const sharpe = sd > 0 ? fin((excess / sd) * sqrtB) : 0;
  const sortino = m > 0 ? ratio(excess * sqrtB, downDev) : 0;

  const dd = maxDrawdown(equity.map((p) => p.equity));
  const calmar = ratio(cagrPct, Math.abs(dd.pct));

  // Trade statistics.
  let grossWin = 0;
  let grossLoss = 0;
  let wins = 0;
  let losses = 0;
  let totalPnl = 0;
  let totalFees = 0;
  for (const t of trades) {
    totalPnl += t.pnl;
    totalFees += t.fees;
    if (t.pnl > 0) {
      wins++;
      grossWin += t.pnl;
    } else {
      losses++;
      grossLoss += -t.pnl;
    }
  }
  const count = trades.length;
  const winRatePct = count > 0 ? (wins / count) * 100 : 0;
  const profitFactor = count > 0 ? ratio(grossWin, grossLoss) : 0;
  const avgWin = wins > 0 ? grossWin / wins : 0;
  const avgLoss = losses > 0 ? -grossLoss / losses : 0;
  const expectancy = count > 0 ? totalPnl / count : 0;

  // Exposure: bars whose close was spent holding a position.
  const total = bars.length || n;
  let exposurePct = 0;
  if (total > 0) {
    const held = new Uint8Array(total);
    for (const t of trades) {
      const last = t.exitReason === "end" ? t.exitIndex : t.exitIndex - 1;
      for (let i = Math.max(0, t.entryIndex); i <= Math.min(total - 1, last); i++) held[i] = 1;
    }
    let c = 0;
    for (let i = 0; i < total; i++) c += held[i];
    exposurePct = (c / total) * 100;
  }

  let benchmarkReturnPct = 0;
  if (n > 0 && equity[0].benchmark > 0) {
    benchmarkReturnPct = (equity[n - 1].benchmark / equity[0].benchmark - 1) * 100;
  }

  return {
    totalReturnPct: fin(totalReturnPct),
    cagrPct: fin(cagrPct),
    volatilityPct: fin(volatilityPct),
    sharpe,
    sortino,
    maxDrawdownPct: fin(dd.pct),
    maxDrawdownBars: dd.bars,
    calmar,
    winRatePct,
    profitFactor,
    avgWin: fin(avgWin),
    avgLoss: fin(avgLoss),
    expectancy: fin(expectancy),
    exposurePct,
    trades: count,
    totalFees: fin(totalFees),
    benchmarkReturnPct: fin(benchmarkReturnPct),
  };
}
