// More moving averages: DEMA, TEMA, HMA, ALMA, KAMA, least squares (LSMA), SMMA, VWMA.

import type { Bar, IndicatorDef, IndicatorInputDef, Series } from "../types";
import { ema, emptySeries, rma, valid, validPeriod, wma, type Values } from "./ma";
import { linreg, rollingSum, zip } from "./series";
import { SOURCE_INPUT, floatInput, intInput, lengthInput, sourceInput, sourceValues } from "./source";

/** Double EMA: 2·EMA(n) − EMA(EMA(n)). */
export function dema(values: Values, n: number): Series {
  const e1 = ema(values, n);
  const e2 = ema(e1, n);
  return zip(e1, e2, (a, b) => 2 * a - b);
}

/** Triple EMA: 3·E1 − 3·E2 + E3, with E2 = EMA(E1), E3 = EMA(E2). */
export function tema(values: Values, n: number): Series {
  const e1 = ema(values, n);
  const e2 = ema(e1, n);
  const e3 = ema(e2, n);
  return e1.map((a, i) => (a === null || e2[i] === null || e3[i] === null ? null : 3 * a - 3 * (e2[i] as number) + (e3[i] as number)));
}

/** Hull MA: WMA(2·WMA(n/2) − WMA(n), ⌊√n⌋), with n/2 rounded down (minimum 1). */
export function hma(values: Values, n: number): Series {
  if (!validPeriod(n)) return emptySeries(values.length);
  const half = wma(values, Math.max(1, Math.floor(n / 2)));
  const full = wma(values, n);
  const diff = zip(half, full, (h, f) => 2 * h - f);
  return wma(diff, Math.max(1, Math.floor(Math.sqrt(n))));
}

/**
 * Arnaud Legoux MA: Gaussian-weighted window. Weight of the k-th oldest value (k = 0..n−1) is
 * exp(−(k − m)² / (2s²)) with m = offset·(n − 1) and s = n / sigma.
 */
export function alma(values: Values, n: number, offset = 0.85, sigma = 6): Series {
  const out = emptySeries(values.length);
  if (!validPeriod(n) || !(sigma > 0)) return out;
  const m = offset * (n - 1);
  const s = n / sigma;
  const w: number[] = [];
  let wsum = 0;
  for (let k = 0; k < n; k++) {
    const x = Math.exp(-((k - m) ** 2) / (2 * s * s));
    w.push(x);
    wsum += x;
  }
  let run = 0;
  for (let i = 0; i < values.length; i++) {
    run = valid(values[i]) ? run + 1 : 0;
    if (run < n) continue;
    let acc = 0;
    for (let k = 0; k < n; k++) acc += w[k] * (values[i - n + 1 + k] as number);
    out[i] = acc / wsum;
  }
  return out;
}

/**
 * Kaufman adaptive MA. Efficiency ratio ER = |p − p[n]| / Σ|p − p[1]| over n bars;
 * smoothing sc = (ER·(fastSC − slowSC) + slowSC)², fastSC = 2/(fast+1), slowSC = 2/(slow+1);
 * KAMA = KAMA[1] + sc·(p − KAMA[1]). Seeded with the price at the first bar that has n changes.
 */
export function kama(values: Values, n: number, fast = 2, slow = 30): Series {
  const out = emptySeries(values.length);
  if (!validPeriod(n) || !validPeriod(fast) || !validPeriod(slow)) return out;
  const fsc = 2 / (fast + 1);
  const ssc = 2 / (slow + 1);
  let prev: number | null = null;
  for (let i = n; i < values.length; i++) {
    const p = values[i];
    const p0 = values[i - n];
    if (!valid(p) || !valid(p0)) {
      prev = null;
      continue;
    }
    let noise = 0;
    let ok = true;
    for (let k = i - n + 1; k <= i; k++) {
      const a = values[k];
      const b = values[k - 1];
      if (!valid(a) || !valid(b)) {
        ok = false;
        break;
      }
      noise += Math.abs(a - b);
    }
    if (!ok) {
      prev = null;
      continue;
    }
    if (prev === null) {
      prev = p;
    } else {
      const er = noise === 0 ? 0 : Math.abs(p - p0) / noise;
      const sc = (er * (fsc - ssc) + ssc) ** 2;
      prev = prev + sc * (p - prev);
    }
    out[i] = prev;
  }
  return out;
}

/** Volume-weighted MA: Σ(p·v) / Σv over n bars (null when the window's volume is 0). */
export function vwma(bars: Bar[], values: Values, n: number): Series {
  const vol = bars.map((b) => (Number.isFinite(b.volume) && b.volume > 0 ? b.volume : 0));
  const pv = zip(values, vol, (p, v) => p * v);
  const spv = rollingSum(pv, n);
  const sv = rollingSum(vol, n);
  return zip(spv, sv, (a, b) => (b === 0 ? Number.NaN : a / b));
}

function maDef(id: string, name: string, shortName: string, defLen: number, fn: (v: Values, n: number) => Series): IndicatorDef {
  const len = lengthInput("length", "Length", defLen);
  return {
    id,
    name,
    shortName,
    pane: "overlay",
    inputs: [len, SOURCE_INPUT],
    outputs: [{ key: id, label: shortName, style: "line" }],
    compute(bars, inputs) {
      return { [id]: fn(sourceValues(bars, sourceInput(inputs, SOURCE_INPUT)), intInput(inputs, len)) };
    },
  };
}

export const DEMA_DEF = maDef("dema", "Double Exponential Moving Average", "DEMA", 20, dema);
export const TEMA_DEF = maDef("tema", "Triple Exponential Moving Average", "TEMA", 20, tema);
export const HMA_DEF = maDef("hma", "Hull Moving Average", "HMA", 9, hma);
export const SMMA_DEF = maDef("smma", "Smoothed Moving Average", "SMMA", 7, rma);
export const LSMA_DEF = maDef("lsma", "Least Squares Moving Average", "LSMA", 25, (v, n) => linreg(v, n));

const ALMA_LEN = lengthInput("length", "Length", 9);
const ALMA_OFFSET: IndicatorInputDef = { key: "offset", label: "Offset", type: "float", default: 0.85, min: 0, max: 1, step: 0.01 };
const ALMA_SIGMA: IndicatorInputDef = { key: "sigma", label: "Sigma", type: "float", default: 6, min: 0.1, max: 100, step: 0.1 };
export const ALMA_DEF: IndicatorDef = {
  id: "alma",
  name: "Arnaud Legoux Moving Average",
  shortName: "ALMA",
  pane: "overlay",
  inputs: [ALMA_LEN, ALMA_OFFSET, ALMA_SIGMA, SOURCE_INPUT],
  outputs: [{ key: "alma", label: "ALMA", style: "line" }],
  compute(bars, inputs) {
    const src = sourceValues(bars, sourceInput(inputs, SOURCE_INPUT));
    return { alma: alma(src, intInput(inputs, ALMA_LEN), floatInput(inputs, ALMA_OFFSET), floatInput(inputs, ALMA_SIGMA)) };
  },
};

const KAMA_LEN = lengthInput("length", "Efficiency length", 10);
const KAMA_FAST = lengthInput("fast", "Fast length", 2);
const KAMA_SLOW = lengthInput("slow", "Slow length", 30);
export const KAMA_DEF: IndicatorDef = {
  id: "kama",
  name: "Kaufman Adaptive Moving Average",
  shortName: "KAMA",
  pane: "overlay",
  inputs: [KAMA_LEN, KAMA_FAST, KAMA_SLOW, SOURCE_INPUT],
  outputs: [{ key: "kama", label: "KAMA", style: "line" }],
  compute(bars, inputs) {
    const src = sourceValues(bars, sourceInput(inputs, SOURCE_INPUT));
    return { kama: kama(src, intInput(inputs, KAMA_LEN), intInput(inputs, KAMA_FAST), intInput(inputs, KAMA_SLOW)) };
  },
};

const VWMA_LEN = lengthInput("length", "Length", 20);
export const VWMA_DEF: IndicatorDef = {
  id: "vwma",
  name: "Volume Weighted Moving Average",
  shortName: "VWMA",
  pane: "overlay",
  inputs: [VWMA_LEN, SOURCE_INPUT],
  outputs: [{ key: "vwma", label: "VWMA", style: "line" }],
  compute(bars, inputs) {
    return { vwma: vwma(bars, sourceValues(bars, sourceInput(inputs, SOURCE_INPUT)), intInput(inputs, VWMA_LEN)) };
  },
};
