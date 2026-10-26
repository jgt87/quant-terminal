// Volatility measures: true range, ATR, Bollinger Bands.

import type { Bar, IndicatorDef, IndicatorInputDef, Series } from "../types";
import { rma, sma, stdev, type Values } from "./ma";
import { SOURCE_INPUT, floatInput, intInput, lengthInput, sourceInput, sourceValues } from "./source";

/**
 * True range: max(high − low, |high − previous close|, |low − previous close|).
 * The first bar has no previous close, so its true range is high − low.
 */
export function trueRange(bars: Bar[]): Series {
  return bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
}

/** Average true range: Wilder RMA of the true range; first value at index n−1. */
export function atr(bars: Bar[], n: number): Series {
  return rma(trueRange(bars), n);
}

/** Bollinger Bands: basis = SMA(n); upper/lower = basis ± mult × population stdev(n). */
export function bollinger(values: Values, n: number, mult: number): { basis: Series; upper: Series; lower: Series } {
  const basis = sma(values, n);
  const dev = stdev(values, n);
  const upper: Series = basis.map((b, i) => (b === null || dev[i] === null ? null : b + mult * (dev[i] as number)));
  const lower: Series = basis.map((b, i) => (b === null || dev[i] === null ? null : b - mult * (dev[i] as number)));
  return { basis, upper, lower };
}

const BB_LEN = lengthInput("length", "Length", 20);
const BB_MULT: IndicatorInputDef = { key: "mult", label: "StdDev multiplier", type: "float", default: 2, min: 0.001, max: 50, step: 0.1 };
export const BB_DEF: IndicatorDef = {
  id: "bb",
  name: "Bollinger Bands",
  shortName: "BB",
  pane: "overlay",
  inputs: [BB_LEN, BB_MULT, SOURCE_INPUT],
  outputs: [
    { key: "upper", label: "Upper", style: "band-upper" },
    { key: "basis", label: "Basis", style: "line" },
    { key: "lower", label: "Lower", style: "band-lower" },
  ],
  compute(bars, inputs) {
    return bollinger(
      sourceValues(bars, sourceInput(inputs, SOURCE_INPUT)),
      intInput(inputs, BB_LEN),
      floatInput(inputs, BB_MULT),
    );
  },
};

const ATR_LEN = lengthInput("length", "Length", 14);
export const ATR_DEF: IndicatorDef = {
  id: "atr",
  name: "Average True Range",
  shortName: "ATR",
  pane: "separate",
  inputs: [ATR_LEN],
  outputs: [{ key: "atr", label: "ATR", style: "line" }],
  compute(bars, inputs) {
    return { atr: atr(bars, intInput(inputs, ATR_LEN)) };
  },
};
