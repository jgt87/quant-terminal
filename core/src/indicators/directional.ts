// Trend direction and strength: DMI/ADX, Aroon, Vortex, Parabolic SAR, SuperTrend, Ichimoku.

import type { Bar, IndicatorDef, IndicatorInputDef, Series } from "../types";
import { emptySeries, highest, lowest, rma } from "./ma";
import { barsSinceExtreme, rollingSum, shift, zip } from "./series";
import { floatInput, intInput, lengthInput } from "./source";
import { atr, trueRange } from "./volatility";

/**
 * Directional movement (Wilder). up = H − H[1], down = L[1] − L; +DM = up when up > down and up > 0,
 * else 0 (−DM mirrored). +DI = 100·RMA(+DM)/RMA(TR), −DI likewise; DX = 100·|+DI − −DI| / (+DI + −DI)
 * (0 when both are 0); ADX = RMA(DX, adxLen). The first bar has no previous bar and is skipped.
 */
export function dmi(bars: Bar[], n: number, adxLen: number): { plus: Series; minus: Series; adx: Series } {
  const len = bars.length;
  const pdm = emptySeries(len);
  const mdm = emptySeries(len);
  const tr = emptySeries(len);
  const trAll = trueRange(bars);
  for (let i = 1; i < len; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    pdm[i] = up > down && up > 0 ? up : 0;
    mdm[i] = down > up && down > 0 ? down : 0;
    tr[i] = trAll[i];
  }
  const str = rma(tr, n);
  const plus = zip(rma(pdm, n), str, (p, t) => (t === 0 ? 0 : (100 * p) / t));
  const minus = zip(rma(mdm, n), str, (m, t) => (t === 0 ? 0 : (100 * m) / t));
  const dx = zip(plus, minus, (p, m) => (p + m === 0 ? 0 : (100 * Math.abs(p - m)) / (p + m)));
  return { plus, minus, adx: rma(dx, adxLen) };
}

/** Aroon: up = 100·(n − bars since the highest high of the last n + 1 bars)/n; down uses the lowest low. */
export function aroon(bars: Bar[], n: number): { up: Series; down: Series } {
  const hs = barsSinceExtreme(bars.map((b) => b.high), n, true);
  const ls = barsSinceExtreme(bars.map((b) => b.low), n, false);
  const f = (s: Series): Series => s.map((v) => (v === null ? null : (100 * (n - v)) / n));
  return { up: f(hs), down: f(ls) };
}

/** Vortex: VI+ = Σ|H − L[1]| / ΣTR, VI− = Σ|L − H[1]| / ΣTR over n bars. */
export function vortex(bars: Bar[], n: number): { plus: Series; minus: Series } {
  const len = bars.length;
  const vp = emptySeries(len);
  const vm = emptySeries(len);
  const tr = emptySeries(len);
  const trAll = trueRange(bars);
  for (let i = 1; i < len; i++) {
    vp[i] = Math.abs(bars[i].high - bars[i - 1].low);
    vm[i] = Math.abs(bars[i].low - bars[i - 1].high);
    tr[i] = trAll[i];
  }
  const st = rollingSum(tr, n);
  return {
    plus: zip(rollingSum(vp, n), st, (a, t) => (t === 0 ? Number.NaN : a / t)),
    minus: zip(rollingSum(vm, n), st, (a, t) => (t === 0 ? Number.NaN : a / t)),
  };
}

/**
 * Parabolic SAR (Wilder). The first trend follows close[1] vs close[0]; the SAR starts at the
 * opposite extreme of bar 0. Each bar: SAR += AF·(EP − SAR), capped by the two previous lows
 * (uptrend) or highs (downtrend); a bar that crosses the SAR reverses the trend with SAR = EP.
 * AF starts at `start`, grows by `step` on each new extreme point, up to `max`.
 */
export function psar(bars: Bar[], start = 0.02, step = 0.02, max = 0.2): Series {
  const out = emptySeries(bars.length);
  if (bars.length < 2) return out;
  let up = bars[1].close >= bars[0].close;
  let sar = up ? bars[0].low : bars[0].high;
  let ep = up ? Math.max(bars[0].high, bars[1].high) : Math.min(bars[0].low, bars[1].low);
  let af = start;
  out[1] = sar;
  for (let i = 2; i < bars.length; i++) {
    const b = bars[i];
    let next = sar + af * (ep - sar);
    if (up) {
      next = Math.min(next, bars[i - 1].low, bars[i - 2].low);
      if (b.low < next) {
        up = false;
        next = ep;
        ep = b.low;
        af = start;
      } else if (b.high > ep) {
        ep = b.high;
        af = Math.min(af + step, max);
      }
    } else {
      next = Math.max(next, bars[i - 1].high, bars[i - 2].high);
      if (b.high > next) {
        up = true;
        next = ep;
        ep = b.high;
        af = start;
      } else if (b.low < ep) {
        ep = b.low;
        af = Math.min(af + step, max);
      }
    }
    sar = next;
    out[i] = sar;
  }
  return out;
}

/**
 * SuperTrend: bands hl2 ± factor·ATR(n). The lower band only rises while the previous close
 * stays above it, the upper band only falls while the previous close stays below it. The trend
 * turns down when the close falls below the previous lower band and up when it rises above the
 * previous upper band. `up` holds the lower band in uptrends, `down` the upper band in downtrends.
 */
export function supertrend(bars: Bar[], n: number, factor: number): { up: Series; down: Series; trend: Series } {
  const len = bars.length;
  const a = atr(bars, n);
  const up = emptySeries(len);
  const down = emptySeries(len);
  const trend = emptySeries(len);
  let lower = Number.NaN;
  let upper = Number.NaN;
  let dir = 1;
  let started = false;
  for (let i = 0; i < len; i++) {
    const v = a[i];
    if (v === null) continue;
    const b = bars[i];
    const mid = (b.high + b.low) / 2;
    let lo = mid - factor * v;
    let hi = mid + factor * v;
    if (started) {
      const pc = bars[i - 1].close;
      if (pc > lower) lo = Math.max(lo, lower);
      if (pc < upper) hi = Math.min(hi, upper);
      if (dir === 1 && b.close < lower) dir = -1;
      else if (dir === -1 && b.close > upper) dir = 1;
    } else {
      dir = b.close >= mid ? 1 : -1;
      started = true;
    }
    lower = lo;
    upper = hi;
    trend[i] = dir;
    if (dir === 1) up[i] = lo;
    else down[i] = hi;
  }
  return { up, down, trend };
}

function midpoint(bars: Bar[], n: number): Series {
  return zip(highest(bars.map((b) => b.high), n), lowest(bars.map((b) => b.low), n), (h, l) => (h + l) / 2);
}

/**
 * Ichimoku Kinko Hyo. Tenkan = midpoint(conv), Kijun = midpoint(base), Senkou A = (Tenkan + Kijun)/2
 * and Senkou B = midpoint(spanB), both plotted displacement − 1 bars ahead; Chikou = close plotted
 * displacement − 1 bars back. Values that would land after the last bar are not represented.
 */
export function ichimoku(
  bars: Bar[],
  conv: number,
  base: number,
  spanB: number,
  displacement: number,
): { tenkan: Series; kijun: Series; spanA: Series; spanB: Series; chikou: Series } {
  const tenkan = midpoint(bars, conv);
  const kijun = midpoint(bars, base);
  const off = Math.max(0, displacement - 1);
  // The leading spans run `off` bars past the last bar (the cloud ahead of price).
  const ahead = (v: Series): Series => (v.length ? Array.from({ length: v.length + off }, (_, i) => (i >= off ? v[i - off] : null)) : []);
  return {
    tenkan,
    kijun,
    spanA: ahead(zip(tenkan, kijun, (t, k) => (t + k) / 2)),
    spanB: ahead(midpoint(bars, spanB)),
    chikou: shift(bars.map((b) => b.close), -off),
  };
}

const DMI_LEN = lengthInput("length", "DI length", 14);
const ADX_LEN = lengthInput("adxLength", "ADX smoothing", 14);
export const DMI_DEF: IndicatorDef = {
  id: "dmi",
  name: "Directional Movement Index",
  shortName: "DMI",
  pane: "separate",
  inputs: [DMI_LEN, ADX_LEN],
  outputs: [
    { key: "adx", label: "ADX", style: "line" },
    { key: "plus", label: "+DI", style: "line" },
    { key: "minus", label: "−DI", style: "line" },
  ],
  levels: [20],
  compute(bars, inputs) {
    return dmi(bars, intInput(inputs, DMI_LEN), intInput(inputs, ADX_LEN));
  },
};

const ADX_ONLY_LEN = lengthInput("length", "DI length", 14);
const ADX_ONLY_SMOOTH = lengthInput("adxLength", "ADX smoothing", 14);
export const ADX_DEF: IndicatorDef = {
  id: "adx",
  name: "Average Directional Index",
  shortName: "ADX",
  pane: "separate",
  inputs: [ADX_ONLY_LEN, ADX_ONLY_SMOOTH],
  outputs: [{ key: "adx", label: "ADX", style: "line" }],
  levels: [20],
  compute(bars, inputs) {
    return { adx: dmi(bars, intInput(inputs, ADX_ONLY_LEN), intInput(inputs, ADX_ONLY_SMOOTH)).adx };
  },
};

const AROON_LEN = lengthInput("length", "Length", 14);
export const AROON_DEF: IndicatorDef = {
  id: "aroon",
  name: "Aroon",
  shortName: "Aroon",
  pane: "separate",
  inputs: [AROON_LEN],
  outputs: [
    { key: "up", label: "Up", style: "line" },
    { key: "down", label: "Down", style: "line" },
  ],
  range: { min: 0, max: 100 },
  levels: [30, 70],
  compute(bars, inputs) {
    return aroon(bars, intInput(inputs, AROON_LEN));
  },
};

const AROON_OSC_LEN = lengthInput("length", "Length", 14);
export const AROON_OSC_DEF: IndicatorDef = {
  id: "aroonosc",
  name: "Aroon Oscillator",
  shortName: "Aroon Osc",
  pane: "separate",
  inputs: [AROON_OSC_LEN],
  outputs: [{ key: "osc", label: "Oscillator", style: "line" }],
  range: { min: -100, max: 100 },
  levels: [0],
  compute(bars, inputs) {
    const r = aroon(bars, intInput(inputs, AROON_OSC_LEN));
    return { osc: zip(r.up, r.down, (u, d) => u - d) };
  },
};

const VORTEX_LEN = lengthInput("length", "Length", 14);
export const VORTEX_DEF: IndicatorDef = {
  id: "vortex",
  name: "Vortex Indicator",
  shortName: "VI",
  pane: "separate",
  inputs: [VORTEX_LEN],
  outputs: [
    { key: "plus", label: "VI+", style: "line" },
    { key: "minus", label: "VI−", style: "line" },
  ],
  levels: [1],
  compute(bars, inputs) {
    return vortex(bars, intInput(inputs, VORTEX_LEN));
  },
};

const SAR_START: IndicatorInputDef = { key: "start", label: "Start", type: "float", default: 0.02, min: 0.001, max: 1, step: 0.001 };
const SAR_STEP: IndicatorInputDef = { key: "step", label: "Increment", type: "float", default: 0.02, min: 0.001, max: 1, step: 0.001 };
const SAR_MAX: IndicatorInputDef = { key: "max", label: "Maximum", type: "float", default: 0.2, min: 0.001, max: 1, step: 0.01 };
export const PSAR_DEF: IndicatorDef = {
  id: "psar",
  name: "Parabolic SAR",
  shortName: "SAR",
  pane: "overlay",
  inputs: [SAR_START, SAR_STEP, SAR_MAX],
  outputs: [{ key: "sar", label: "SAR", style: "dots" }],
  compute(bars, inputs) {
    return { sar: psar(bars, floatInput(inputs, SAR_START), floatInput(inputs, SAR_STEP), floatInput(inputs, SAR_MAX)) };
  },
};

const ST_LEN = lengthInput("length", "ATR length", 10);
const ST_FACTOR: IndicatorInputDef = { key: "factor", label: "Factor", type: "float", default: 3, min: 0.01, max: 100, step: 0.1 };
export const SUPERTREND_DEF: IndicatorDef = {
  id: "supertrend",
  name: "SuperTrend",
  shortName: "ST",
  pane: "overlay",
  inputs: [ST_LEN, ST_FACTOR],
  outputs: [
    { key: "up", label: "Up trend", style: "line" },
    { key: "down", label: "Down trend", style: "line" },
  ],
  compute(bars, inputs) {
    const r = supertrend(bars, intInput(inputs, ST_LEN), floatInput(inputs, ST_FACTOR));
    return { up: r.up, down: r.down };
  },
};

const ICHI_CONV = lengthInput("conversion", "Conversion line length", 9);
const ICHI_BASE = lengthInput("base", "Base line length", 26);
const ICHI_SPANB = lengthInput("spanB", "Leading span B length", 52);
const ICHI_DISP = lengthInput("displacement", "Displacement", 26);
export const ICHIMOKU_DEF: IndicatorDef = {
  id: "ichimoku",
  name: "Ichimoku Cloud",
  shortName: "Ichimoku",
  pane: "overlay",
  inputs: [ICHI_CONV, ICHI_BASE, ICHI_SPANB, ICHI_DISP],
  outputs: [
    { key: "tenkan", label: "Conversion", style: "line" },
    { key: "kijun", label: "Base", style: "line" },
    { key: "chikou", label: "Lagging span", style: "line" },
    { key: "spanA", label: "Leading span A", style: "band-upper", forward: true },
    { key: "spanB", label: "Leading span B", style: "band-lower", forward: true },
  ],
  compute(bars, inputs) {
    return ichimoku(
      bars,
      intInput(inputs, ICHI_CONV),
      intInput(inputs, ICHI_BASE),
      intInput(inputs, ICHI_SPANB),
      intInput(inputs, ICHI_DISP),
    );
  },
};
