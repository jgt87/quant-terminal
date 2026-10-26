// Built-in strategies. Each precomputes causal series in init() and reads
// them only up to ctx.index in onBar(). Entries use "reverse" where a
// strategy is naturally long/short; the engine turns a reverse into a plain
// exit when shorting is disabled.

import type { Bar, Series, Signal, StrategyContext, StrategyDef } from "../types";
import { bollinger, highest, lowest, macd, rsi, sma } from "../indicators";

const closes = (bars: Bar[]) => bars.map((b) => b.close);

const num = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

function crossUp(a: Series, b: Series, i: number): boolean {
  if (i < 1) return false;
  const a0 = a[i - 1], a1 = a[i], b0 = b[i - 1], b1 = b[i];
  return num(a0) && num(a1) && num(b0) && num(b1) && a0 <= b0 && a1 > b1;
}

function crossDown(a: Series, b: Series, i: number): boolean {
  if (i < 1) return false;
  const a0 = a[i - 1], a1 = a[i], b0 = b[i - 1], b1 = b[i];
  return num(a0) && num(a1) && num(b0) && num(b1) && a0 >= b0 && a1 < b1;
}

function crossUpLevel(a: Series, level: number, i: number): boolean {
  if (i < 1) return false;
  const a0 = a[i - 1], a1 = a[i];
  return num(a0) && num(a1) && a0 <= level && a1 > level;
}

const int = (v: number, min = 1) => Math.max(min, Math.round(v));

export const SMA_CROSS: StrategyDef = {
  id: "sma-cross",
  name: "SMA crossover",
  description: "Long when the fast SMA crosses above the slow SMA; flips short (or exits) on the cross back down.",
  params: [
    { key: "fast", label: "Fast length", type: "int", default: 10, min: 2, max: 200, step: 1 },
    { key: "slow", label: "Slow length", type: "int", default: 30, min: 3, max: 400, step: 1 },
  ],
  init(bars, p) {
    const c = closes(bars);
    return { fast: sma(c, int(p.fast)), slow: sma(c, int(p.slow)) };
  },
  onBar(ctx: StrategyContext): Signal {
    const { fast, slow } = ctx.data;
    if (crossUp(fast, slow, ctx.index)) return { action: "reverse", side: "long" };
    if (crossDown(fast, slow, ctx.index)) return { action: "reverse", side: "short" };
    return null;
  },
};

export const RSI_REVERSION: StrategyDef = {
  id: "rsi-reversion",
  name: "RSI mean reversion",
  description: "Long when RSI crosses up through the lower level; exit when RSI crosses above the upper level.",
  params: [
    { key: "period", label: "RSI length", type: "int", default: 14, min: 2, max: 100, step: 1 },
    { key: "lower", label: "Lower level", type: "float", default: 30, min: 1, max: 50, step: 1 },
    { key: "upper", label: "Upper level", type: "float", default: 70, min: 50, max: 99, step: 1 },
  ],
  init(bars, p) {
    return { rsi: rsi(closes(bars), int(p.period, 2)) };
  },
  onBar(ctx, p): Signal {
    const r = ctx.data.rsi;
    const i = ctx.index;
    if (!ctx.position) {
      if (crossUpLevel(r, p.lower, i)) return { action: "enter", side: "long" };
    } else if (crossUpLevel(r, p.upper, i)) {
      return { action: "exit" };
    }
    return null;
  },
};

export const BB_BREAKOUT: StrategyDef = {
  id: "bb-breakout",
  name: "Bollinger breakout",
  description: "Long when the close breaks above the upper Bollinger band; exit when it closes below the basis.",
  params: [
    { key: "period", label: "Length", type: "int", default: 20, min: 2, max: 200, step: 1 },
    { key: "mult", label: "Std dev multiplier", type: "float", default: 2, min: 0.5, max: 5, step: 0.1 },
  ],
  init(bars, p) {
    const bb = bollinger(closes(bars), int(p.period, 2), p.mult);
    return { basis: bb.basis, upper: bb.upper, lower: bb.lower };
  },
  onBar(ctx): Signal {
    const i = ctx.index;
    const c = ctx.bars[i].close;
    const up = ctx.data.upper[i];
    const basis = ctx.data.basis[i];
    if (!ctx.position) {
      if (num(up) && c > up) return { action: "enter", side: "long" };
    } else if (num(basis) && c < basis) {
      return { action: "exit" };
    }
    return null;
  },
};

export const DONCHIAN_BREAKOUT: StrategyDef = {
  id: "donchian-breakout",
  name: "Donchian breakout (turtle)",
  description:
    "Long on a close above the prior N-bar high, short on a close below the prior N-bar low (when shorting is allowed); exit on a break of the opposite M-bar channel.",
  params: [
    { key: "entry", label: "Entry channel", type: "int", default: 20, min: 2, max: 200, step: 1 },
    { key: "exit", label: "Exit channel", type: "int", default: 10, min: 2, max: 200, step: 1 },
  ],
  init(bars, p) {
    const h = bars.map((b) => b.high);
    const l = bars.map((b) => b.low);
    const n = int(p.entry, 1);
    const m = int(p.exit, 1);
    return { entryHigh: highest(h, n), entryLow: lowest(l, n), exitHigh: highest(h, m), exitLow: lowest(l, m) };
  },
  onBar(ctx): Signal {
    const i = ctx.index;
    if (i < 1) return null;
    const c = ctx.bars[i].close;
    // Channels of the PRIOR bars (exclude the current bar).
    const eh = ctx.data.entryHigh[i - 1];
    const el = ctx.data.entryLow[i - 1];
    const xh = ctx.data.exitHigh[i - 1];
    const xl = ctx.data.exitLow[i - 1];
    const pos = ctx.position;
    if (!pos) {
      if (num(eh) && c > eh) return { action: "enter", side: "long" };
      if (num(el) && c < el) return { action: "enter", side: "short" };
      return null;
    }
    if (pos.side === "long") {
      if (num(el) && c < el) return { action: "reverse", side: "short" };
      if (num(xl) && c < xl) return { action: "exit" };
    } else {
      if (num(eh) && c > eh) return { action: "reverse", side: "long" };
      if (num(xh) && c > xh) return { action: "exit" };
    }
    return null;
  },
};

export const MACD_CROSS: StrategyDef = {
  id: "macd-cross",
  name: "MACD signal cross",
  description: "Long when the MACD line crosses above its signal line; flips short (or exits) on the cross back down.",
  params: [
    { key: "fast", label: "Fast length", type: "int", default: 12, min: 2, max: 100, step: 1 },
    { key: "slow", label: "Slow length", type: "int", default: 26, min: 3, max: 200, step: 1 },
    { key: "signal", label: "Signal length", type: "int", default: 9, min: 2, max: 100, step: 1 },
  ],
  init(bars, p) {
    const m = macd(closes(bars), int(p.fast, 2), int(p.slow, 2), int(p.signal, 2));
    return { macd: m.macd, signal: m.signal, hist: m.hist };
  },
  onBar(ctx): Signal {
    const { macd: line, signal } = ctx.data;
    if (crossUp(line, signal, ctx.index)) return { action: "reverse", side: "long" };
    if (crossDown(line, signal, ctx.index)) return { action: "reverse", side: "short" };
    return null;
  },
};

export const STRATEGIES: StrategyDef[] = [SMA_CROSS, RSI_REVERSION, BB_BREAKOUT, DONCHIAN_BREAKOUT, MACD_CROSS];

export function getStrategy(id: string): StrategyDef | undefined {
  return STRATEGIES.find((s) => s.id === id);
}
