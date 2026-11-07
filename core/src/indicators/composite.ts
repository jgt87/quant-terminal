// Indicator catalog, round 3 (public formula definitions): Williams Alligator, Williams Fractals,
// Squeeze Momentum, SMI Ergodic and Woodies CCI.

import type { Bar, IndicatorDef, Series } from "../types";
import { emptySeries, ema, highest, lowest, rma, sma, stdev, valid, type Values } from "./ma";
import { cci } from "./momentum";
import { linreg, zip } from "./series";
import { SOURCE_INPUT, floatInput, intInput, lengthInput, sourceInput, sourceValues } from "./source";
import { trueRange } from "./volatility";

const hl2 = (bars: Bar[]) => bars.map((b) => (b.high + b.low) / 2);

/** A series moved `n` bars into the future: the result runs `n` bars past the last bar. */
export function projectForward(values: Values, n: number): Series {
  if (!values.length) return [];
  const out = emptySeries(values.length + Math.max(0, n));
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (valid(v)) out[i + Math.max(0, n)] = v;
  }
  return out;
}

/**
 * Williams Alligator: smoothed (Wilder) moving averages of the median price, each displaced into
 * the future — jaw 13 / 8, teeth 8 / 5, lips 5 / 3.
 */
export function alligator(bars: Bar[], jaw = 13, jawShift = 8, teeth = 8, teethShift = 5, lips = 5, lipsShift = 3): { jaw: Series; teeth: Series; lips: Series } {
  const m = hl2(bars);
  return { jaw: projectForward(rma(m, jaw), jawShift), teeth: projectForward(rma(m, teeth), teethShift), lips: projectForward(rma(m, lips), lipsShift) };
}

/**
 * Williams Fractals: a bar whose high is above the `n` highs on each side (up fractal, at its high)
 * or whose low is below the `n` lows on each side (down fractal, at its low). A fractal is only
 * known `n` bars later, so the last `n` bars never have one.
 */
export function fractals(bars: Bar[], n = 2): { up: Series; down: Series } {
  const up = emptySeries(bars.length);
  const down = emptySeries(bars.length);
  for (let i = n; i < bars.length - n; i++) {
    let isUp = true;
    let isDown = true;
    for (let k = 1; k <= n && (isUp || isDown); k++) {
      if (!(bars[i].high > bars[i - k].high && bars[i].high > bars[i + k].high)) isUp = false;
      if (!(bars[i].low < bars[i - k].low && bars[i].low < bars[i + k].low)) isDown = false;
    }
    if (isUp) up[i] = bars[i].high;
    if (isDown) down[i] = bars[i].low;
  }
  return { up, down };
}

/**
 * Squeeze Momentum: the squeeze is on while the Bollinger Bands (n, bbMult) sit inside the Keltner
 * Channel (n, kcMult · SMA of the true range). Momentum = linear regression (n) of the close minus
 * the midpoint of (the average of the n-bar high and low) and SMA(close, n).
 */
export function squeeze(bars: Bar[], n = 20, bbMult = 2, kcMult = 1.5): { momentum: Series; squeeze: Series } {
  const c = bars.map((b) => b.close);
  const basis = sma(c, n);
  const dev = stdev(c, n);
  const rangeMa = sma(trueRange(bars), n);
  const hh = highest(bars.map((b) => b.high), n);
  const ll = lowest(bars.map((b) => b.low), n);
  const delta = c.map((x, i) => {
    const h = hh[i];
    const l = ll[i];
    const m = basis[i];
    return h === null || l === null || m === null ? null : x - ((h + l) / 2 + m) / 2;
  });
  const momentum = linreg(delta, n);
  const sq = emptySeries(bars.length);
  for (let i = 0; i < bars.length; i++) {
    const m = basis[i];
    const d = dev[i];
    const r = rangeMa[i];
    if (m === null || d === null || r === null) continue;
    const on = m - bbMult * d > m - kcMult * r && m + bbMult * d < m + kcMult * r;
    if (on) sq[i] = 0;
  }
  return { momentum, squeeze: sq };
}

/**
 * SMI Ergodic: the true strength index as a ratio — double-smoothed (EMA long, then short) price
 * change over double-smoothed absolute change, in −1..1 — its EMA signal, and their difference.
 */
export function smiErgodic(values: Values, short = 5, long = 20, signal = 5): { smi: Series; signal: Series; osc: Series } {
  const pc = values.map((v, i) => (i > 0 && valid(v) && valid(values[i - 1]) ? v - (values[i - 1] as number) : null));
  const num = ema(ema(pc, long), short);
  const den = ema(ema(pc.map((x) => (x === null ? null : Math.abs(x))), long), short);
  const smi = zip(num, den, (a, b) => (b === 0 ? 0 : a / b));
  const sig = ema(smi, signal);
  return { smi, signal: sig, osc: zip(smi, sig, (a, b) => a - b) };
}

/** Woodies CCI: CCI (n) as a histogram with a short "turbo" CCI line. */
export function woodiesCci(values: Values, n = 14, turbo = 6): { cci: Series; turbo: Series } {
  return { cci: cci(values, n), turbo: cci(values, turbo) };
}

// ---------- definitions ----------

const AL = {
  jaw: lengthInput("jaw", "Jaw length", 13),
  jawShift: { ...lengthInput("jawShift", "Jaw offset", 8), min: 0 },
  teeth: lengthInput("teeth", "Teeth length", 8),
  teethShift: { ...lengthInput("teethShift", "Teeth offset", 5), min: 0 },
  lips: lengthInput("lips", "Lips length", 5),
  lipsShift: { ...lengthInput("lipsShift", "Lips offset", 3), min: 0 },
};
export const ALLIGATOR_DEF: IndicatorDef = {
  id: "alligator",
  name: "Williams Alligator",
  shortName: "Alligator",
  pane: "overlay",
  inputs: Object.values(AL),
  outputs: [
    { key: "jaw", label: "Jaw", style: "line", forward: true },
    { key: "teeth", label: "Teeth", style: "line", forward: true },
    { key: "lips", label: "Lips", style: "line", forward: true },
  ],
  compute: (bars, inputs) =>
    alligator(
      bars,
      intInput(inputs, AL.jaw),
      intInput(inputs, AL.jawShift),
      intInput(inputs, AL.teeth),
      intInput(inputs, AL.teethShift),
      intInput(inputs, AL.lips),
      intInput(inputs, AL.lipsShift),
    ),
};

const FR_N = { ...lengthInput("periods", "Periods", 2), max: 20 };
export const FRACTALS_DEF: IndicatorDef = {
  id: "fractals",
  name: "Williams Fractals",
  shortName: "Fractals",
  pane: "overlay",
  inputs: [FR_N],
  outputs: [
    { key: "up", label: "Up fractal", style: "dots" },
    { key: "down", label: "Down fractal", style: "dots" },
  ],
  compute: (bars, inputs) => fractals(bars, intInput(inputs, FR_N)),
};

const SQ_LEN = lengthInput("length", "Length", 20);
const SQ_BB = { key: "bbMult", label: "BB multiplier", type: "float" as const, default: 2, min: 0.1, max: 10, step: 0.1 };
const SQ_KC = { key: "kcMult", label: "KC multiplier", type: "float" as const, default: 1.5, min: 0.1, max: 10, step: 0.1 };
export const SQUEEZE_DEF: IndicatorDef = {
  id: "squeeze",
  name: "Squeeze Momentum",
  shortName: "Squeeze",
  pane: "separate",
  inputs: [SQ_LEN, SQ_BB, SQ_KC],
  outputs: [
    { key: "momentum", label: "Momentum", style: "histogram" },
    { key: "squeeze", label: "Squeeze on", style: "dots" },
  ],
  levels: [0],
  compute: (bars, inputs) => squeeze(bars, intInput(inputs, SQ_LEN), floatInput(inputs, SQ_BB), floatInput(inputs, SQ_KC)),
};

const SMI_SHORT = lengthInput("short", "Short length", 5);
const SMI_LONG = lengthInput("long", "Long length", 20);
const SMI_SIG = lengthInput("signal", "Signal length", 5);
export const SMI_ERGODIC_DEF: IndicatorDef = {
  id: "smiergodic",
  name: "SMI Ergodic Indicator / Oscillator",
  shortName: "SMIO",
  pane: "separate",
  inputs: [SMI_SHORT, SMI_LONG, SMI_SIG, SOURCE_INPUT],
  outputs: [
    { key: "osc", label: "Oscillator", style: "histogram" },
    { key: "smi", label: "SMI", style: "line" },
    { key: "signal", label: "Signal", style: "line" },
  ],
  levels: [0],
  compute: (bars, inputs) =>
    smiErgodic(sourceValues(bars, sourceInput(inputs, SOURCE_INPUT)), intInput(inputs, SMI_SHORT), intInput(inputs, SMI_LONG), intInput(inputs, SMI_SIG)),
};

const WC_LEN = lengthInput("length", "CCI length", 14);
const WC_TURBO = lengthInput("turbo", "Turbo length", 6);
const WC_SOURCE = { ...SOURCE_INPUT, default: "hlc3" };
export const WOODIES_CCI_DEF: IndicatorDef = {
  id: "woodiescci",
  name: "Woodies CCI",
  shortName: "Woodies CCI",
  pane: "separate",
  inputs: [WC_LEN, WC_TURBO, WC_SOURCE],
  outputs: [
    { key: "cci", label: "CCI", style: "histogram" },
    { key: "turbo", label: "Turbo CCI", style: "line" },
  ],
  levels: [-200, -100, 0, 100, 200],
  compute: (bars, inputs) => woodiesCci(sourceValues(bars, sourceInput(inputs, WC_SOURCE)), intInput(inputs, WC_LEN), intInput(inputs, WC_TURBO)),
};
