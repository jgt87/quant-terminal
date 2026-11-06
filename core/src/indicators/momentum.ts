// Momentum oscillators: CCI, Williams %R, ROC, Momentum, Awesome Oscillator, TRIX, Ultimate
// Oscillator, Stochastic RSI, Chande Momentum, DPO, TSI, Coppock Curve.

import type { Bar, IndicatorDef, Series } from "../types";
import { ema, emptySeries, highest, lowest, sma, valid, validPeriod, wma, type Values } from "./ma";
import { rsi } from "./oscillators";
import { lag, rollingSum, zip } from "./series";
import { SOURCE_INPUT, intInput, lengthInput, sourceInput, sourceValues } from "./source";

/** Commodity Channel Index: (x − SMA(x, n)) / (0.015 · mean absolute deviation(x, n)); 0 when the deviation is 0. */
export function cci(values: Values, n: number): Series {
  const out = emptySeries(values.length);
  if (!validPeriod(n)) return out;
  const mean = sma(values, n);
  for (let i = n - 1; i < values.length; i++) {
    const m = mean[i];
    const x = values[i];
    if (m === null || !valid(x)) continue;
    let dev = 0;
    for (let k = i - n + 1; k <= i; k++) dev += Math.abs((values[k] as number) - m);
    dev /= n;
    out[i] = dev === 0 ? 0 : (x - m) / (0.015 * dev);
  }
  return out;
}

/** Williams %R: −100 · (highest high − close) / (highest high − lowest low); −50 when the range is 0. */
export function williamsR(bars: Bar[], n: number): Series {
  const hh = highest(bars.map((b) => b.high), n);
  const ll = lowest(bars.map((b) => b.low), n);
  return bars.map((b, i) => {
    const h = hh[i];
    const l = ll[i];
    if (h === null || l === null) return null;
    return h === l ? -50 : (-100 * (h - b.close)) / (h - l);
  });
}

/** Rate of change in percent: 100 · (x − x[n]) / x[n]. */
export function roc(values: Values, n: number): Series {
  return zip(values, lag(values, n), (x, p) => (p === 0 ? Number.NaN : (100 * (x - p)) / p));
}

/** Momentum: x − x[n]. */
export function momentum(values: Values, n: number): Series {
  return zip(values, lag(values, n), (x, p) => x - p);
}

/** Awesome Oscillator: SMA(hl2, fast) − SMA(hl2, slow). */
export function awesome(bars: Bar[], fast = 5, slow = 34): Series {
  const hl2 = bars.map((b) => (b.high + b.low) / 2);
  return zip(sma(hl2, fast), sma(hl2, slow), (a, b) => a - b);
}

/** TRIX: one-bar percent change of a triple-smoothed EMA. */
export function trix(values: Values, n: number): Series {
  const e3 = ema(ema(ema(values, n), n), n);
  return zip(e3, lag(e3, 1), (x, p) => (p === 0 ? Number.NaN : (100 * (x - p)) / p));
}

/**
 * Ultimate Oscillator. Buying pressure BP = C − min(L, C[1]), TR = max(H, C[1]) − min(L, C[1]);
 * avg_k = ΣBP/ΣTR over k bars; UO = 100 · (4·avg_short + 2·avg_mid + avg_long) / 7.
 */
export function ultimate(bars: Bar[], s = 7, m = 14, l = 28): Series {
  const len = bars.length;
  const bp = emptySeries(len);
  const tr = emptySeries(len);
  for (let i = 1; i < len; i++) {
    const pc = bars[i - 1].close;
    const lo = Math.min(bars[i].low, pc);
    bp[i] = bars[i].close - lo;
    tr[i] = Math.max(bars[i].high, pc) - lo;
  }
  const avg = (k: number) => zip(rollingSum(bp, k), rollingSum(tr, k), (a, t) => (t === 0 ? 0 : a / t));
  const as = avg(s);
  const am = avg(m);
  const al = avg(l);
  return as.map((a, i) => (a === null || am[i] === null || al[i] === null ? null : (100 * (4 * a + 2 * (am[i] as number) + (al[i] as number))) / 7));
}

/** Stochastic RSI: %K = SMA(kSmooth) of the stochastic of RSI(rsiLen) over stochLen; %D = SMA(dSmooth) of %K. */
export function stochRsi(values: Values, rsiLen: number, stochLen: number, kSmooth: number, dSmooth: number): { k: Series; d: Series } {
  const r = rsi(values, rsiLen);
  const hh = highest(r, stochLen);
  const ll = lowest(r, stochLen);
  const raw = r.map((v, i) => {
    const h = hh[i];
    const l = ll[i];
    if (v === null || h === null || l === null) return null;
    return h === l ? 50 : (100 * (v - l)) / (h - l);
  });
  const k = sma(raw, kSmooth);
  return { k, d: sma(k, dSmooth) };
}

/** Chande Momentum Oscillator: 100 · (Σups − Σdowns) / (Σups + Σdowns) over n changes; 0 when flat. */
export function cmo(values: Values, n: number): Series {
  const len = values.length;
  const ups = emptySeries(len);
  const downs = emptySeries(len);
  for (let i = 1; i < len; i++) {
    const a = values[i - 1];
    const b = values[i];
    if (!valid(a) || !valid(b)) continue;
    ups[i] = Math.max(b - a, 0);
    downs[i] = Math.max(a - b, 0);
  }
  return zip(rollingSum(ups, n), rollingSum(downs, n), (u, d) => (u + d === 0 ? 0 : (100 * (u - d)) / (u + d)));
}

/** Detrended Price Oscillator (non-centred): x − SMA(x, n) taken ⌊n/2⌋ + 1 bars ago. */
export function dpo(values: Values, n: number): Series {
  return zip(values, lag(sma(values, n), Math.floor(n / 2) + 1), (x, m) => x - m);
}

/** True Strength Index: 100 · EMA(EMA(Δx, long), short) / EMA(EMA(|Δx|, long), short); signal = EMA(TSI, signal). */
export function tsi(values: Values, long: number, short: number, signal: number): { tsi: Series; signal: Series } {
  const d = zip(values, lag(values, 1), (x, p) => x - p);
  const ad = d.map((v) => (v === null ? null : Math.abs(v)));
  const num = ema(ema(d, long), short);
  const den = ema(ema(ad, long), short);
  const t = zip(num, den, (a, b) => (b === 0 ? 0 : (100 * a) / b));
  return { tsi: t, signal: ema(t, signal) };
}

/** Coppock Curve: WMA(ROC(longRoc) + ROC(shortRoc), wmaLen). */
export function coppock(values: Values, wmaLen: number, longRoc: number, shortRoc: number): Series {
  return wma(zip(roc(values, longRoc), roc(values, shortRoc), (a, b) => a + b), wmaLen);
}

function srcOsc(
  id: string,
  name: string,
  shortName: string,
  defLen: number,
  fn: (v: Values, n: number) => Series,
  extra: Partial<IndicatorDef> = {},
  style: "line" | "histogram" = "line",
): IndicatorDef {
  const len = lengthInput("length", "Length", defLen);
  return {
    id,
    name,
    shortName,
    pane: "separate",
    inputs: [len, SOURCE_INPUT],
    outputs: [{ key: id, label: shortName, style }],
    ...extra,
    compute(bars, inputs) {
      return { [id]: fn(sourceValues(bars, sourceInput(inputs, SOURCE_INPUT)), intInput(inputs, len)) };
    },
  };
}

export const CCI_DEF: IndicatorDef = (() => {
  const len = lengthInput("length", "Length", 20);
  const src = { ...SOURCE_INPUT, default: "hlc3" as const };
  return {
    id: "cci",
    name: "Commodity Channel Index",
    shortName: "CCI",
    pane: "separate",
    inputs: [len, src],
    outputs: [{ key: "cci", label: "CCI", style: "line" }],
    levels: [-100, 0, 100],
    compute(bars, inputs) {
      return { cci: cci(sourceValues(bars, sourceInput(inputs, src)), intInput(inputs, len)) };
    },
  } satisfies IndicatorDef;
})();

const WR_LEN = lengthInput("length", "Length", 14);
export const WILLIAMS_R_DEF: IndicatorDef = {
  id: "willr",
  name: "Williams %R",
  shortName: "%R",
  pane: "separate",
  inputs: [WR_LEN],
  outputs: [{ key: "willr", label: "%R", style: "line" }],
  range: { min: -100, max: 0 },
  levels: [-80, -20],
  compute(bars, inputs) {
    return { willr: williamsR(bars, intInput(inputs, WR_LEN)) };
  },
};

export const ROC_DEF = srcOsc("roc", "Rate of Change", "ROC", 9, roc, { levels: [0] });
export const MOMENTUM_DEF = srcOsc("mom", "Momentum", "Mom", 10, momentum, { levels: [0] });
export const TRIX_DEF = srcOsc("trix", "TRIX", "TRIX", 18, trix, { levels: [0] });
export const CMO_DEF = srcOsc("cmo", "Chande Momentum Oscillator", "CMO", 9, cmo, { range: { min: -100, max: 100 }, levels: [-50, 0, 50] });
export const DPO_DEF = srcOsc("dpo", "Detrended Price Oscillator", "DPO", 21, dpo, { levels: [0] });

const AO_FAST = lengthInput("fast", "Fast length", 5);
const AO_SLOW = lengthInput("slow", "Slow length", 34);
export const AWESOME_DEF: IndicatorDef = {
  id: "ao",
  name: "Awesome Oscillator",
  shortName: "AO",
  pane: "separate",
  inputs: [AO_FAST, AO_SLOW],
  outputs: [{ key: "ao", label: "AO", style: "histogram" }],
  levels: [0],
  compute(bars, inputs) {
    return { ao: awesome(bars, intInput(inputs, AO_FAST), intInput(inputs, AO_SLOW)) };
  },
};

const UO_S = lengthInput("short", "Fast length", 7);
const UO_M = lengthInput("mid", "Middle length", 14);
const UO_L = lengthInput("long", "Slow length", 28);
export const ULTIMATE_DEF: IndicatorDef = {
  id: "uo",
  name: "Ultimate Oscillator",
  shortName: "UO",
  pane: "separate",
  inputs: [UO_S, UO_M, UO_L],
  outputs: [{ key: "uo", label: "UO", style: "line" }],
  range: { min: 0, max: 100 },
  levels: [30, 70],
  compute(bars, inputs) {
    return { uo: ultimate(bars, intInput(inputs, UO_S), intInput(inputs, UO_M), intInput(inputs, UO_L)) };
  },
};

const SR_RSI = lengthInput("rsiLength", "RSI length", 14);
const SR_STOCH = lengthInput("stochLength", "Stochastic length", 14);
const SR_K = lengthInput("k", "%K smoothing", 3);
const SR_D = lengthInput("d", "%D smoothing", 3);
export const STOCH_RSI_DEF: IndicatorDef = {
  id: "stochrsi",
  name: "Stochastic RSI",
  shortName: "Stoch RSI",
  pane: "separate",
  inputs: [SR_RSI, SR_STOCH, SR_K, SR_D, SOURCE_INPUT],
  outputs: [
    { key: "k", label: "%K", style: "line" },
    { key: "d", label: "%D", style: "line" },
  ],
  range: { min: 0, max: 100 },
  levels: [20, 80],
  compute(bars, inputs) {
    return stochRsi(
      sourceValues(bars, sourceInput(inputs, SOURCE_INPUT)),
      intInput(inputs, SR_RSI),
      intInput(inputs, SR_STOCH),
      intInput(inputs, SR_K),
      intInput(inputs, SR_D),
    );
  },
};

const TSI_LONG = lengthInput("long", "Long length", 25);
const TSI_SHORT = lengthInput("short", "Short length", 13);
const TSI_SIGNAL = lengthInput("signal", "Signal length", 13);
export const TSI_DEF: IndicatorDef = {
  id: "tsi",
  name: "True Strength Index",
  shortName: "TSI",
  pane: "separate",
  inputs: [TSI_LONG, TSI_SHORT, TSI_SIGNAL, SOURCE_INPUT],
  outputs: [
    { key: "tsi", label: "TSI", style: "line" },
    { key: "signal", label: "Signal", style: "line" },
  ],
  levels: [0],
  compute(bars, inputs) {
    return tsi(
      sourceValues(bars, sourceInput(inputs, SOURCE_INPUT)),
      intInput(inputs, TSI_LONG),
      intInput(inputs, TSI_SHORT),
      intInput(inputs, TSI_SIGNAL),
    );
  },
};

const COP_WMA = lengthInput("wma", "WMA length", 10);
const COP_LONG = lengthInput("longRoc", "Long ROC length", 14);
const COP_SHORT = lengthInput("shortRoc", "Short ROC length", 11);
export const COPPOCK_DEF: IndicatorDef = {
  id: "coppock",
  name: "Coppock Curve",
  shortName: "Coppock",
  pane: "separate",
  inputs: [COP_WMA, COP_LONG, COP_SHORT, SOURCE_INPUT],
  outputs: [{ key: "coppock", label: "Coppock", style: "line" }],
  levels: [0],
  compute(bars, inputs) {
    return {
      coppock: coppock(
        sourceValues(bars, sourceInput(inputs, SOURCE_INPUT)),
        intInput(inputs, COP_WMA),
        intInput(inputs, COP_LONG),
        intInput(inputs, COP_SHORT),
      ),
    };
  },
};
