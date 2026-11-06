// Bands and volatility: Keltner Channels, Envelope, Bollinger %B and Bandwidth, Historical
// Volatility, Choppiness Index, Chandelier Exit.

import type { Bar, IndicatorDef, IndicatorInputDef, Series } from "../types";
import { ema, emptySeries, highest, lowest, sma, valid, validPeriod, type Values } from "./ma";
import { rollingSum, zip } from "./series";
import { SOURCE_INPUT, floatInput, intInput, lengthInput, sourceInput, sourceValues } from "./source";
import { atr, bollinger, trueRange } from "./volatility";

/** Keltner Channels: basis = EMA(x, n); upper/lower = basis ± mult · ATR(atrLen). */
export function keltner(bars: Bar[], values: Values, n: number, mult: number, atrLen: number): { basis: Series; upper: Series; lower: Series } {
  const basis = ema(values, n);
  const a = atr(bars, atrLen);
  return {
    basis,
    upper: zip(basis, a, (b, r) => b + mult * r),
    lower: zip(basis, a, (b, r) => b - mult * r),
  };
}

/** Moving-average envelope: SMA(x, n) ± pct %. */
export function envelope(values: Values, n: number, pct: number): { basis: Series; upper: Series; lower: Series } {
  const basis = sma(values, n);
  return {
    basis,
    upper: basis.map((b) => (b === null ? null : b * (1 + pct / 100))),
    lower: basis.map((b) => (b === null ? null : b * (1 - pct / 100))),
  };
}

/** Bollinger %B: (x − lower) / (upper − lower); null when the bands touch. */
export function bbPercentB(values: Values, n: number, mult: number): Series {
  const bb = bollinger(values, n, mult);
  return values.map((x, i) => {
    const u = bb.upper[i];
    const l = bb.lower[i];
    if (!valid(x) || u === null || l === null || u === l) return null;
    return (x - l) / (u - l);
  });
}

/** Bollinger Bandwidth: (upper − lower) / basis. */
export function bbWidth(values: Values, n: number, mult: number): Series {
  const bb = bollinger(values, n, mult);
  return bb.basis.map((b, i) => (b === null || b === 0 || bb.upper[i] === null ? null : ((bb.upper[i] as number) - (bb.lower[i] as number)) / b));
}

/**
 * Historical volatility in percent: sample standard deviation (n − 1) of the last n log returns,
 * annualised with √periodsPerYear.
 */
export function historicalVolatility(values: Values, n: number, periodsPerYear: number): Series {
  const len = values.length;
  const out = emptySeries(len);
  if (!validPeriod(n) || n < 2) return out;
  const r = emptySeries(len);
  for (let i = 1; i < len; i++) {
    const a = values[i - 1];
    const b = values[i];
    if (valid(a) && valid(b) && a > 0 && b > 0) r[i] = Math.log(b / a);
  }
  let run = 0;
  for (let i = 0; i < len; i++) {
    run = r[i] !== null ? run + 1 : 0;
    if (run < n) continue;
    let m = 0;
    for (let k = i - n + 1; k <= i; k++) m += r[k] as number;
    m /= n;
    let ss = 0;
    for (let k = i - n + 1; k <= i; k++) ss += ((r[k] as number) - m) ** 2;
    out[i] = 100 * Math.sqrt(ss / (n - 1)) * Math.sqrt(periodsPerYear);
  }
  return out;
}

/** Choppiness Index: 100 · log10(ΣTR(n) / (highest high − lowest low)) / log10(n). */
export function choppiness(bars: Bar[], n: number): Series {
  if (!validPeriod(n) || n < 2) return emptySeries(bars.length);
  const str = rollingSum(trueRange(bars), n);
  const range = zip(highest(bars.map((b) => b.high), n), lowest(bars.map((b) => b.low), n), (h, l) => h - l);
  return zip(str, range, (s, r) => (r === 0 ? Number.NaN : (100 * Math.log10(s / r)) / Math.log10(n)));
}

/** Chandelier Exit: long stop = highest high(n) − mult · ATR(n); short stop = lowest low(n) + mult · ATR(n). */
export function chandelier(bars: Bar[], n: number, mult: number): { long: Series; short: Series } {
  const a = atr(bars, n);
  return {
    long: zip(highest(bars.map((b) => b.high), n), a, (h, r) => h - mult * r),
    short: zip(lowest(bars.map((b) => b.low), n), a, (l, r) => l + mult * r),
  };
}

const MULT = (def: number): IndicatorInputDef => ({ key: "mult", label: "Multiplier", type: "float", default: def, min: 0.001, max: 50, step: 0.1 });

const KC_LEN = lengthInput("length", "Length", 20);
const KC_MULT = MULT(2);
const KC_ATR = lengthInput("atrLength", "ATR length", 10);
export const KELTNER_DEF: IndicatorDef = {
  id: "kc",
  name: "Keltner Channels",
  shortName: "KC",
  pane: "overlay",
  inputs: [KC_LEN, KC_MULT, KC_ATR, SOURCE_INPUT],
  outputs: [
    { key: "upper", label: "Upper", style: "band-upper" },
    { key: "basis", label: "Basis", style: "line" },
    { key: "lower", label: "Lower", style: "band-lower" },
  ],
  compute(bars, inputs) {
    return keltner(bars, sourceValues(bars, sourceInput(inputs, SOURCE_INPUT)), intInput(inputs, KC_LEN), floatInput(inputs, KC_MULT), intInput(inputs, KC_ATR));
  },
};

const ENV_LEN = lengthInput("length", "Length", 20);
const ENV_PCT: IndicatorInputDef = { key: "percent", label: "Percent", type: "float", default: 2.5, min: 0.01, max: 100, step: 0.1 };
export const ENVELOPE_DEF: IndicatorDef = {
  id: "env",
  name: "Envelope",
  shortName: "Env",
  pane: "overlay",
  inputs: [ENV_LEN, ENV_PCT, SOURCE_INPUT],
  outputs: [
    { key: "upper", label: "Upper", style: "band-upper" },
    { key: "basis", label: "Basis", style: "line" },
    { key: "lower", label: "Lower", style: "band-lower" },
  ],
  compute(bars, inputs) {
    return envelope(sourceValues(bars, sourceInput(inputs, SOURCE_INPUT)), intInput(inputs, ENV_LEN), floatInput(inputs, ENV_PCT));
  },
};

const PB_LEN = lengthInput("length", "Length", 20);
const PB_MULT = MULT(2);
export const BB_PERCENT_B_DEF: IndicatorDef = {
  id: "bbpb",
  name: "Bollinger Bands %B",
  shortName: "%B",
  pane: "separate",
  inputs: [PB_LEN, PB_MULT, SOURCE_INPUT],
  outputs: [{ key: "pb", label: "%B", style: "line" }],
  levels: [0, 1],
  compute(bars, inputs) {
    return { pb: bbPercentB(sourceValues(bars, sourceInput(inputs, SOURCE_INPUT)), intInput(inputs, PB_LEN), floatInput(inputs, PB_MULT)) };
  },
};

const BW_LEN = lengthInput("length", "Length", 20);
const BW_MULT = MULT(2);
export const BB_WIDTH_DEF: IndicatorDef = {
  id: "bbw",
  name: "Bollinger Bandwidth",
  shortName: "BBW",
  pane: "separate",
  inputs: [BW_LEN, BW_MULT, SOURCE_INPUT],
  outputs: [{ key: "bbw", label: "BBW", style: "line" }],
  compute(bars, inputs) {
    return { bbw: bbWidth(sourceValues(bars, sourceInput(inputs, SOURCE_INPUT)), intInput(inputs, BW_LEN), floatInput(inputs, BW_MULT)) };
  },
};

const HV_LEN = lengthInput("length", "Length", 10);
const HV_YEAR: IndicatorInputDef = { key: "periodsPerYear", label: "Periods per year", type: "int", default: 252, min: 1, max: 1_000_000, step: 1 };
export const HV_DEF: IndicatorDef = {
  id: "hv",
  name: "Historical Volatility",
  shortName: "HV",
  pane: "separate",
  inputs: [HV_LEN, HV_YEAR, SOURCE_INPUT],
  outputs: [{ key: "hv", label: "HV", style: "line" }],
  compute(bars, inputs) {
    return { hv: historicalVolatility(sourceValues(bars, sourceInput(inputs, SOURCE_INPUT)), intInput(inputs, HV_LEN), intInput(inputs, HV_YEAR)) };
  },
};

const CHOP_LEN = { ...lengthInput("length", "Length", 14), min: 2 };
export const CHOP_DEF: IndicatorDef = {
  id: "chop",
  name: "Choppiness Index",
  shortName: "CHOP",
  pane: "separate",
  inputs: [CHOP_LEN],
  outputs: [{ key: "chop", label: "CHOP", style: "line" }],
  range: { min: 0, max: 100 },
  levels: [38.2, 61.8],
  compute(bars, inputs) {
    return { chop: choppiness(bars, intInput(inputs, CHOP_LEN)) };
  },
};

const CE_LEN = lengthInput("length", "ATR period", 22);
const CE_MULT = MULT(3);
export const CHANDELIER_DEF: IndicatorDef = {
  id: "chandelier",
  name: "Chandelier Exit",
  shortName: "CE",
  pane: "overlay",
  inputs: [CE_LEN, CE_MULT],
  outputs: [
    { key: "long", label: "Long stop", style: "line" },
    { key: "short", label: "Short stop", style: "line" },
  ],
  compute(bars, inputs) {
    return chandelier(bars, intInput(inputs, CE_LEN), floatInput(inputs, CE_MULT));
  },
};
