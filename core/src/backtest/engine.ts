// Bar-by-bar backtest engine. Pure TypeScript, no dependencies.
//
// Execution model
// - strategy.init(bars, params) runs once (on a copy of the bars). Its series
//   must be causal; the engine additionally hides every value after bar i
//   from onBar, so a strategy cannot read ahead through ctx.bars or ctx.data.
// - A signal returned on bar i is filled at bar i+1 OPEN (market order).
//   Signals on the last bar are ignored.
// - Slippage (bps) always works against the trader: buys fill at
//   price * (1 + slip), sells at price * (1 - slip).
// - Commission per fill = notional * commissionBps / 1e4 + commissionFixed.
// - Sizing: percent-equity (fractional qty = cash * pct/100 / fillPrice; the
//   account is flat at that moment so cash == equity), fixed-qty, fixed-cash
//   (qty = cash / fillPrice). Commission is paid on top of the sized notional.
// - One net position. "enter" while flat opens; "enter" on the same side is
//   ignored; "enter" on the opposite side acts like "reverse". "reverse" closes
//   and opens the opposite side at the same fill price (two fills, two
//   commissions). Shorts require allowShort; otherwise a short entry is
//   ignored and a reverse into short only closes the long.
// - Stop-loss / take-profit (percent of the trade's entry fill price) are
//   checked from the bar after the entry bar onward, against that bar's
//   high/low. If the bar opens beyond a level, the fill is the open (with
//   slippage). If stop and target are both touched in one bar, the stop wins.
// - Any open position is closed at the last bar's close (exitReason "end",
//   with slippage and commission).
// - Equity = cash + signed position value, marked at every bar close.
//   EquityPoint.drawdownPct is <= 0. Benchmark = initialCapital invested in
//   buy-and-hold at bar 0 close, no costs.

import type {
  Bar,
  BacktestConfig,
  BacktestMetrics,
  BacktestResult,
  EquityPoint,
  Series,
  Side,
  Signal,
  StrategyContext,
  StrategyDef,
  Trade,
} from "../types";
import { computeMetrics } from "./metrics";

/** Read-only view of arr[0..last]; anything later reads as undefined. */
function causalView<T>(arr: readonly T[], last: number): readonly T[] {
  const len = Math.min(arr.length, last + 1);
  const isIndex = (p: PropertyKey): number => {
    if (typeof p !== "string") return -1;
    if (p === "" || !/^\d+$/.test(p)) return -1;
    return Number(p);
  };
  return new Proxy(arr as T[], {
    get(target, prop, receiver) {
      if (prop === "length") return len;
      const idx = isIndex(prop);
      if (idx >= 0) return idx < len ? target[idx] : undefined;
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      const idx = isIndex(prop);
      if (idx >= 0) return idx < len;
      return Reflect.has(target, prop);
    },
    ownKeys(target) {
      return Reflect.ownKeys(target).filter((k) => {
        const idx = isIndex(k);
        return idx < 0 || idx < len;
      });
    },
    getOwnPropertyDescriptor(target, prop) {
      const idx = isIndex(prop);
      if (idx >= len) return undefined;
      if (prop === "length") return { value: len, writable: true, enumerable: false, configurable: false };
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    set() {
      return false;
    },
    deleteProperty() {
      return false;
    },
    defineProperty() {
      return false;
    },
  }) as readonly T[];
}

/** Defaults from the strategy's param definitions, overridden by `params`. */
export function resolveParams(strategy: StrategyDef, params: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of strategy.params) out[p.key] = p.default;
  for (const [k, v] of Object.entries(params)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return out;
}

interface OpenPosition {
  side: Side;
  qty: number;
  entryPrice: number;
  entryIndex: number;
  entryFee: number;
}

export function runBacktest(
  bars: Bar[],
  strategy: StrategyDef,
  params: Record<string, number>,
  config: BacktestConfig,
): BacktestResult {
  const p = resolveParams(strategy, params);
  const n = bars.length;
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  if (n === 0) return { trades, equity, metrics: computeMetrics(equity, trades, config, bars) };

  const slip = (config.slippageBps || 0) / 1e4;
  const bps = (config.commissionBps || 0) / 1e4;
  const fixed = config.commissionFixed || 0;
  const fee = (notional: number) => Math.abs(notional) * bps + fixed;
  const buyPx = (px: number) => px * (1 + slip);
  const sellPx = (px: number) => px * (1 - slip);

  const series = strategy.init(bars.slice(), p) ?? {};

  let cash = config.initialCapital;
  let pos: OpenPosition | null = null;
  let pending: Signal = null;
  let peak = -Infinity;
  const benchQty = bars[0].close > 0 ? config.initialCapital / bars[0].close : 0;

  const sign = (s: Side) => (s === "long" ? 1 : -1);

  const open = (side: Side, rawPx: number, i: number) => {
    if (side === "short" && !config.allowShort) return;
    const px = side === "long" ? buyPx(rawPx) : sellPx(rawPx);
    if (!(px > 0)) return;
    let qty: number;
    const sz = config.sizing;
    if (sz.mode === "fixed-qty") qty = sz.qty;
    else if (sz.mode === "fixed-cash") qty = sz.cash / px;
    else qty = (Math.max(0, cash) * sz.percent) / 100 / px;
    if (!(qty > 0) || !Number.isFinite(qty)) return;
    const f = fee(qty * px);
    cash += side === "long" ? -qty * px - f : qty * px - f;
    pos = { side, qty, entryPrice: px, entryIndex: i, entryFee: f };
  };

  /** Close at an already slippage-adjusted price. */
  const closeAt = (px: number, i: number, reason: Trade["exitReason"]) => {
    if (!pos) return;
    const { side, qty, entryPrice, entryIndex, entryFee } = pos;
    const f = fee(qty * px);
    cash += side === "long" ? qty * px - f : -qty * px - f;
    const gross = sign(side) * (px - entryPrice) * qty;
    const pnl = gross - entryFee - f;
    const basis = entryPrice * qty;
    trades.push({
      side,
      entryIndex,
      entryTime: bars[entryIndex].time,
      entryPrice,
      exitIndex: i,
      exitTime: bars[i].time,
      exitPrice: px,
      qty,
      pnl,
      pnlPct: basis > 0 ? (pnl / basis) * 100 : 0,
      fees: entryFee + f,
      barsHeld: i - entryIndex,
      exitReason: reason,
    });
    pos = null;
  };
  /** Close at a raw market price, applying slippage for the closing side. */
  const closeMarket = (rawPx: number, i: number, reason: Trade["exitReason"]) => {
    if (!pos) return;
    closeAt(pos.side === "long" ? sellPx(rawPx) : buyPx(rawPx), i, reason);
  };

  const execute = (sig: NonNullable<Signal>, i: number) => {
    const px = bars[i].open;
    const cur = pos as OpenPosition | null;
    if (sig.action === "exit") {
      closeMarket(px, i, "signal");
      return;
    }
    if (!cur) {
      open(sig.side, px, i);
      return;
    }
    if (cur.side === sig.side) return;
    // Opposite side: enter-opposite and reverse both flip the position.
    closeMarket(px, i, "signal");
    open(sig.side, px, i);
  };

  const checkProtective = (i: number) => {
    const cur = pos as OpenPosition | null;
    if (!cur || cur.entryIndex >= i) return;
    const sl = config.stopLossPct;
    const tp = config.takeProfitPct;
    const hasSl = typeof sl === "number" && sl > 0;
    const hasTp = typeof tp === "number" && tp > 0;
    if (!hasSl && !hasTp) return;
    const b = bars[i];
    if (cur.side === "long") {
      if (hasSl) {
        const stop = cur.entryPrice * (1 - sl! / 100);
        if (b.open <= stop) return closeMarket(b.open, i, "stop");
        if (b.low <= stop) return closeMarket(stop, i, "stop");
      }
      if (hasTp) {
        const target = cur.entryPrice * (1 + tp! / 100);
        if (b.open >= target) return closeMarket(b.open, i, "target");
        if (b.high >= target) return closeMarket(target, i, "target");
      }
    } else {
      if (hasSl) {
        const stop = cur.entryPrice * (1 + sl! / 100);
        if (b.open >= stop) return closeMarket(b.open, i, "stop");
        if (b.high >= stop) return closeMarket(stop, i, "stop");
      }
      if (hasTp) {
        const target = cur.entryPrice * (1 - tp! / 100);
        if (b.open <= target) return closeMarket(b.open, i, "target");
        if (b.low <= target) return closeMarket(target, i, "target");
      }
    }
  };

  const seriesKeys = Object.keys(series);

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    if (pending) {
      execute(pending, i);
      pending = null;
    }
    checkProtective(i);

    if (i === n - 1 && pos) closeMarket(bar.close, i, "end");

    const cur = pos as OpenPosition | null;
    const eq = cash + (cur ? sign(cur.side) * cur.qty * bar.close : 0);
    if (eq > peak) peak = eq;
    equity.push({
      time: bar.time,
      equity: eq,
      drawdownPct: peak > 0 ? Math.min(0, (eq / peak - 1) * 100) : 0,
      benchmark: benchQty * bar.close,
    });

    if (i < n - 1) {
      const data: Record<string, Series> = {};
      for (const k of seriesKeys) data[k] = causalView(series[k], i) as Series;
      const ctx: StrategyContext = {
        index: i,
        bars: causalView(bars, i),
        position: cur ? { side: cur.side, qty: cur.qty, entryPrice: cur.entryPrice } : null,
        data,
      };
      pending = strategy.onBar(ctx, p) ?? null;
    }
  }

  return { trades, equity, metrics: computeMetrics(equity, trades, config, bars) };
}

export interface SweepRow {
  params: Record<string, number>;
  metrics: BacktestMetrics;
}

/** Cartesian product of `grid`; unspecified params use strategy defaults. */
export function sweepParams(
  bars: Bar[],
  strategy: StrategyDef,
  grid: Record<string, number[]>,
  config: BacktestConfig,
  metric: keyof BacktestMetrics = "sharpe",
): SweepRow[] {
  const keys = Object.keys(grid).filter((k) => Array.isArray(grid[k]) && grid[k].length > 0);
  let combos: Record<string, number>[] = [{}];
  for (const k of keys) {
    const next: Record<string, number>[] = [];
    for (const c of combos) for (const v of grid[k]) next.push({ ...c, [k]: v });
    combos = next;
  }
  const rows = combos.map((c) => {
    const params = resolveParams(strategy, c);
    return { params, metrics: runBacktest(bars, strategy, params, config).metrics };
  });
  const val = (r: SweepRow) => {
    const v = r.metrics[metric];
    return Number.isFinite(v) ? v : -Infinity;
  };
  return rows.sort((a, b) => val(b) - val(a));
}
