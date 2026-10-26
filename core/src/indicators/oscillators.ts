// Momentum oscillators: RSI, MACD, Stochastic.

import type { Bar, IndicatorDef, Series } from "../types";
import { ema, emptySeries, highest, lowest, rma, sma, valid, validPeriod, type Values } from "./ma";
import { SOURCE_INPUT, intInput, lengthInput, sourceInput, sourceValues } from "./source";

/**
 * Relative Strength Index with Wilder smoothing. Average gain/loss are seeded with
 * the simple average of the first n changes (so the first value is at index n),
 * then updated as avg = (prev * (n - 1) + current) / n.
 * RSI = 100 when the average loss is 0, and 50 when both averages are 0.
 */
export function rsi(values: Values, n: number): Series {
  const out = emptySeries(values.length);
  if (!validPeriod(n) || values.length <= n) return out;
  const gains = emptySeries(values.length);
  const losses = emptySeries(values.length);
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1];
    const b = values[i];
    if (valid(a) && valid(b)) {
      const d = b - a;
      gains[i] = d > 0 ? d : 0;
      losses[i] = d < 0 ? -d : 0;
    }
  }
  const g = rma(gains, n);
  const l = rma(losses, n);
  for (let i = 0; i < values.length; i++) {
    const ag = g[i];
    const al = l[i];
    if (ag === null || al === null) continue;
    if (al === 0) out[i] = ag === 0 ? 50 : 100;
    else out[i] = 100 - 100 / (1 + ag / al);
  }
  return out;
}

/** MACD line = EMA(fast) - EMA(slow); signal = EMA(signal) of the MACD line; hist = MACD - signal. */
export function macd(
  values: Values,
  fast: number,
  slow: number,
  signal: number,
): { macd: Series; signal: Series; hist: Series } {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Series = f.map((v, i) => (v === null || s[i] === null ? null : v - (s[i] as number)));
  const sig = ema(line, signal);
  const hist: Series = line.map((v, i) => (v === null || sig[i] === null ? null : v - (sig[i] as number)));
  return { macd: line, signal: sig, hist };
}

/**
 * Stochastic oscillator.
 * raw %K = 100 × (close − lowest low(k)) / (highest high(k) − lowest low(k)); 50 when the range is 0.
 * %K = SMA(kSmooth) of raw %K; %D = SMA(dSmooth) of %K.
 */
export function stochastic(bars: Bar[], k: number, kSmooth: number, dSmooth: number): { k: Series; d: Series } {
  const hh = highest(bars.map((b) => b.high), k);
  const ll = lowest(bars.map((b) => b.low), k);
  const raw: Series = bars.map((b, i) => {
    const h = hh[i];
    const l = ll[i];
    if (h === null || l === null) return null;
    const range = h - l;
    return range === 0 ? 50 : (100 * (b.close - l)) / range;
  });
  const kLine = sma(raw, kSmooth);
  const dLine = sma(kLine, dSmooth);
  return { k: kLine, d: dLine };
}

const RSI_LEN = lengthInput("length", "Length", 14);
export const RSI_DEF: IndicatorDef = {
  id: "rsi",
  name: "Relative Strength Index",
  shortName: "RSI",
  pane: "separate",
  inputs: [RSI_LEN, SOURCE_INPUT],
  outputs: [{ key: "rsi", label: "RSI", style: "line" }],
  range: { min: 0, max: 100 },
  levels: [30, 70],
  compute(bars, inputs) {
    return { rsi: rsi(sourceValues(bars, sourceInput(inputs, SOURCE_INPUT)), intInput(inputs, RSI_LEN)) };
  },
};

const MACD_FAST = lengthInput("fast", "Fast length", 12);
const MACD_SLOW = lengthInput("slow", "Slow length", 26);
const MACD_SIGNAL = lengthInput("signal", "Signal length", 9);
export const MACD_DEF: IndicatorDef = {
  id: "macd",
  name: "Moving Average Convergence Divergence",
  shortName: "MACD",
  pane: "separate",
  inputs: [MACD_FAST, MACD_SLOW, MACD_SIGNAL, SOURCE_INPUT],
  outputs: [
    { key: "hist", label: "Histogram", style: "histogram" },
    { key: "macd", label: "MACD", style: "line" },
    { key: "signal", label: "Signal", style: "line" },
  ],
  levels: [0],
  compute(bars, inputs) {
    const r = macd(
      sourceValues(bars, sourceInput(inputs, SOURCE_INPUT)),
      intInput(inputs, MACD_FAST),
      intInput(inputs, MACD_SLOW),
      intInput(inputs, MACD_SIGNAL),
    );
    return { macd: r.macd, signal: r.signal, hist: r.hist };
  },
};

const STOCH_K = lengthInput("k", "%K length", 14);
const STOCH_KS = lengthInput("kSmooth", "%K smoothing", 3);
const STOCH_D = lengthInput("d", "%D smoothing", 3);
export const STOCH_DEF: IndicatorDef = {
  id: "stoch",
  name: "Stochastic",
  shortName: "Stoch",
  pane: "separate",
  inputs: [STOCH_K, STOCH_KS, STOCH_D],
  outputs: [
    { key: "k", label: "%K", style: "line" },
    { key: "d", label: "%D", style: "line" },
  ],
  range: { min: 0, max: 100 },
  levels: [20, 80],
  compute(bars, inputs) {
    return stochastic(bars, intInput(inputs, STOCH_K), intInput(inputs, STOCH_KS), intInput(inputs, STOCH_D));
  },
};
