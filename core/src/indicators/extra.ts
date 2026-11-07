// Indicator catalog, round 2 (public formula definitions): Connors RSI, Fisher Transform, Schaff
// Trend Cycle, Know Sure Thing, Klinger Oscillator, Mass Index, Elder Ray, Linear Regression
// Channel, Standard Error Bands, Price Channel, McGinley Dynamic, Zero-lag EMA, VIDYA, Relative
// Vigor Index, Balance of Power, Volume Oscillator, Net Volume, Rank Correlation Index, Ulcer
// Index, Chande Kroll Stop, Accelerator Oscillator.

import type { Bar, IndicatorDef, IndicatorInputDef, Series } from "../types";
import { ema, emptySeries, highest, lowest, sma, valid, validPeriod, type Values } from "./ma";
import { awesome, cmo, roc } from "./momentum";
import { rsi } from "./oscillators";
import { lag, linreg, rollingSum, zip } from "./series";
import { SOURCE_INPUT, floatInput, intInput, lengthInput, sourceInput, sourceValues } from "./source";
import { atr } from "./volatility";

const closes = (bars: Bar[]) => bars.map((b) => b.close);

// ---------- formulas ----------

/** Up / down streak: +k after k higher closes in a row, −k after k lower, 0 when unchanged. */
export function streak(values: Values): Series {
  const out = emptySeries(values.length);
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    const p = i > 0 ? values[i - 1] : null;
    if (!valid(x)) {
      s = 0;
      continue;
    }
    if (!valid(p)) s = 0;
    else if (x > p) s = s > 0 ? s + 1 : 1;
    else if (x < p) s = s < 0 ? s - 1 : -1;
    else s = 0;
    out[i] = s;
  }
  return out;
}

/** Percent of the previous `n` values that are below the current one (0..100). */
export function percentRank(values: Values, n: number): Series {
  const out = emptySeries(values.length);
  if (!validPeriod(n)) return out;
  for (let i = n; i < values.length; i++) {
    const x = values[i];
    if (!valid(x)) continue;
    let below = 0;
    let ok = true;
    for (let k = i - n; k < i; k++) {
      const v = values[k];
      if (!valid(v)) {
        ok = false;
        break;
      }
      if (v < x) below++;
    }
    if (ok) out[i] = (100 * below) / n;
  }
  return out;
}

/** Connors RSI: mean of RSI(close, 3), RSI(streak, 2) and the percent rank of the 1-bar ROC over 100 bars. */
export function connorsRsi(values: Values, rsiLen = 3, streakLen = 2, rankLen = 100): Series {
  const a = rsi(values, rsiLen);
  const b = rsi(streak(values), streakLen);
  const c = percentRank(roc(values, 1), rankLen);
  return a.map((x, i) => (x === null || b[i] === null || c[i] === null ? null : (x + (b[i] as number) + (c[i] as number)) / 3));
}

/**
 * Fisher Transform of hl2 over `n` bars: v = 0.66·(position in the range − 0.5) + 0.67·v[1]
 * (clamped to ±0.999), fisher = 0.5·ln((1 + v)/(1 − v)) + 0.5·fisher[1]; trigger = fisher[1].
 */
export function fisher(bars: Bar[], n: number): { fisher: Series; trigger: Series } {
  const hl2 = bars.map((b) => (b.high + b.low) / 2);
  const hh = highest(hl2, n);
  const ll = lowest(hl2, n);
  const f = emptySeries(bars.length);
  const t = emptySeries(bars.length);
  let v = 0;
  let prev: number | null = null;
  for (let i = 0; i < bars.length; i++) {
    const h = hh[i];
    const l = ll[i];
    if (h === null || l === null) continue;
    const pos = h === l ? 0 : (hl2[i] - l) / (h - l) - 0.5;
    v = Math.max(-0.999, Math.min(0.999, 0.66 * pos + 0.67 * v));
    const fish: number = 0.5 * Math.log((1 + v) / (1 - v)) + 0.5 * (prev ?? 0);
    t[i] = prev;
    f[i] = fish;
    prev = fish;
  }
  return { fisher: f, trigger: t };
}

/** Stochastic of `values` over n bars, then smoothed by half each bar (Schaff's double step). */
function smoothedStoch(values: Values, n: number): Series {
  const hh = highest(values, n);
  const ll = lowest(values, n);
  const out = emptySeries(values.length);
  let pf: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    const h = hh[i];
    const l = ll[i];
    if (!valid(x) || h === null || l === null) continue;
    const k: number = h === l ? (pf ?? 50) : (100 * (x - l)) / (h - l);
    pf = pf === null ? k : pf + 0.5 * (k - pf);
    out[i] = pf;
  }
  return out;
}

/** Schaff Trend Cycle: a twice-applied, smoothed stochastic of MACD (EMA fast − EMA slow) over `cycle` bars. */
export function schaff(values: Values, fast = 23, slow = 50, cycle = 10): Series {
  const m = zip(ema(values, fast), ema(values, slow), (a, b) => a - b);
  return smoothedStoch(smoothedStoch(m, cycle), cycle);
}

/** Know Sure Thing: weighted sum of four smoothed ROCs (10/10, 15/10, 20/10, 30/15) and its SMA signal. */
export function kst(values: Values, signal = 9): { kst: Series; signal: Series } {
  const r = (len: number, sm: number) => sma(roc(values, len), sm);
  const a = r(10, 10);
  const b = r(15, 10);
  const c = r(20, 10);
  const d = r(30, 15);
  const k = a.map((x, i) => (x === null || b[i] === null || c[i] === null || d[i] === null ? null : x + 2 * (b[i] as number) + 3 * (c[i] as number) + 4 * (d[i] as number)));
  return { kst: k, signal: sma(k, signal) };
}

/**
 * Klinger Volume Oscillator. trend = +1 when hlc3 rises, −1 otherwise; dm = high − low;
 * cm accumulates dm while the trend holds and restarts from dm[1] + dm when it flips;
 * VF = volume · |2·dm/cm − 1| · trend · 100; KVO = EMA(VF, fast) − EMA(VF, slow); signal = EMA(KVO, signal).
 */
export function klinger(bars: Bar[], fast = 34, slow = 55, signal = 13): { kvo: Series; signal: Series } {
  const vf = emptySeries(bars.length);
  let trend = 0;
  let cm = 0;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const p = bars[i - 1];
    const t = (b.high + b.low + b.close) / 3 > (p.high + p.low + p.close) / 3 ? 1 : -1;
    const dm = b.high - b.low;
    const dmPrev = p.high - p.low;
    cm = t === trend ? cm + dm : dmPrev + dm;
    trend = t;
    vf[i] = cm === 0 ? 0 : b.volume * Math.abs(2 * (dm / cm) - 1) * t * 100;
  }
  const k = zip(ema(vf, fast), ema(vf, slow), (a, c) => a - c);
  return { kvo: k, signal: ema(k, signal) };
}

/** Mass Index: sum over `sum` bars of EMA(range, n) / EMA(EMA(range, n), n). */
export function massIndex(bars: Bar[], n = 9, sum = 25): Series {
  const e1 = ema(
    bars.map((b) => b.high - b.low),
    n,
  );
  const e2 = ema(e1, n);
  return rollingSum(
    zip(e1, e2, (a, b) => (b === 0 ? 1 : a / b)),
    sum,
  );
}

/** Elder Ray: bull power = high − EMA(close, n), bear power = low − EMA(close, n). */
export function elderRay(bars: Bar[], n = 13): { bull: Series; bear: Series } {
  const e = ema(closes(bars), n);
  return { bull: zip(bars.map((b) => b.high), e, (h, m) => h - m), bear: zip(bars.map((b) => b.low), e, (l, m) => l - m) };
}

/** Residuals of the least-squares line over the window ending at i: returns the root of Σr² / div. */
function residualDev(values: Values, n: number, i: number, div: number): number | null {
  if (i < n - 1 || div <= 0) return null;
  const sx = ((n - 1) * n) / 2;
  const sxx = ((n - 1) * n * (2 * n - 1)) / 6;
  let sy = 0;
  let sxy = 0;
  for (let k = 0; k < n; k++) {
    const y = values[i - n + 1 + k];
    if (!valid(y)) return null;
    sy += y;
    sxy += k * y;
  }
  const den = n * sxx - sx * sx;
  const slope = den === 0 ? 0 : (n * sxy - sx * sy) / den;
  const icpt = (sy - slope * sx) / n;
  let ss = 0;
  for (let k = 0; k < n; k++) {
    const r = (values[i - n + 1 + k] as number) - (icpt + slope * k);
    ss += r * r;
  }
  return Math.sqrt(ss / div);
}

/** Linear Regression Channel: the regression line at each bar ± `mult` standard deviations of its residuals. */
export function lrChannel(values: Values, n = 100, mult = 2): { upper: Series; basis: Series; lower: Series } {
  const basis = linreg(values, n);
  const dev = values.map((_, i) => (basis[i] === null ? null : residualDev(values, n, i, n)));
  return { upper: zip(basis, dev, (b, d) => b + mult * d), basis, lower: zip(basis, dev, (b, d) => b - mult * d) };
}

/** Standard Error Bands: regression line ± `mult` standard errors (Σr² / (n − 2)), all smoothed by SMA(`smooth`). */
export function stdErrorBands(values: Values, n = 21, mult = 2, smooth = 3): { upper: Series; basis: Series; lower: Series } {
  const line = linreg(values, n);
  const se = values.map((_, i) => (line[i] === null ? null : residualDev(values, n, i, n - 2)));
  return {
    upper: sma(
      zip(line, se, (b, d) => b + mult * d),
      smooth,
    ),
    basis: sma(line, smooth),
    lower: sma(
      zip(line, se, (b, d) => b - mult * d),
      smooth,
    ),
  };
}

/** Price Channel: highest high and lowest low of the previous `n` bars (the current bar excluded). */
export function priceChannel(bars: Bar[], n = 20): { upper: Series; lower: Series } {
  return { upper: lag(highest(bars.map((b) => b.high), n), 1), lower: lag(lowest(bars.map((b) => b.low), n), 1) };
}

/** McGinley Dynamic: md += (x − md) / (k · n · (x / md)^4), seeded with SMA(n). */
export function mcginley(values: Values, n = 14, k = 0.6): Series {
  const out = emptySeries(values.length);
  const seed = sma(values, n);
  let md: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (!valid(x)) continue;
    if (md === null) {
      if (seed[i] === null) continue;
      md = seed[i] as number;
    } else if (md !== 0) {
      md = md + (x - md) / (k * n * Math.pow(x / md, 4));
    }
    out[i] = md;
  }
  return out;
}

/** Zero-lag EMA: EMA(n) of x + (x − x[lag]) with lag = ⌊(n − 1)/2⌋. */
export function zlema(values: Values, n: number): Series {
  const l = Math.floor((n - 1) / 2);
  return ema(
    zip(values, lag(values, l), (x, p) => x + (x - p)),
    n,
  );
}

/** VIDYA: an EMA whose weight is scaled by |CMO(cmoLen)| / 100 each bar; seeded with the first value. */
export function vidya(values: Values, n = 14, cmoLen = 9): Series {
  const alpha = 2 / (n + 1);
  const c = cmo(values, cmoLen);
  const out = emptySeries(values.length);
  let v: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    const k = c[i];
    if (!valid(x) || k === null) continue;
    const a = alpha * Math.abs(k / 100);
    v = v === null ? x : a * x + (1 - a) * v;
    out[i] = v;
  }
  return out;
}

const weigh4 = (s: Values) => zip(zip(s, lag(s, 1), (a, b) => a + 2 * b), zip(lag(s, 2), lag(s, 3), (c, d) => 2 * c + d), (x, y) => (x + y) / 6);

/** Relative Vigor Index: Σ weighted (close − open) / Σ weighted (high − low) over n bars, and its weighted signal. */
export function relativeVigor(bars: Bar[], n = 10): { rvgi: Series; signal: Series } {
  const num = weigh4(bars.map((b) => b.close - b.open));
  const den = weigh4(bars.map((b) => b.high - b.low));
  const r = zip(rollingSum(num, n), rollingSum(den, n), (a, b) => (b === 0 ? 0 : a / b));
  return { rvgi: r, signal: weigh4(r) };
}

/** Balance of Power: (close − open) / (high − low), smoothed by SMA(n) (n = 1: raw). 0 on a zero range. */
export function balanceOfPower(bars: Bar[], n = 14): Series {
  const raw = bars.map((b) => (b.high === b.low ? 0 : (b.close - b.open) / (b.high - b.low)));
  return n <= 1 ? raw : sma(raw, n);
}

/** Volume Oscillator: 100 · (EMA(volume, fast) − EMA(volume, slow)) / EMA(volume, slow). */
export function volumeOscillator(bars: Bar[], fast = 5, slow = 10): Series {
  const v = bars.map((b) => b.volume);
  return zip(ema(v, fast), ema(v, slow), (a, b) => (b === 0 ? 0 : (100 * (a - b)) / b));
}

/** Net Volume: volume signed by the direction of the close (0 when unchanged). */
export function netVolume(bars: Bar[]): Series {
  return bars.map((b, i) => (i === 0 ? null : b.volume * Math.sign(b.close - bars[i - 1].close)));
}

/** Ranks of `xs` (1 = smallest), ties get their average rank. */
function ranks(xs: number[]): number[] {
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && xs[idx[j + 1]] === xs[idx[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k]] = avg;
    i = j + 1;
  }
  return r;
}

/** Rank Correlation Index: Spearman (rank) correlation of time and price over n bars, × 100 (+100 = steadily rising). */
export function rankCorrelation(values: Values, n = 9): Series {
  const out = emptySeries(values.length);
  if (!validPeriod(n) || n < 2) return out;
  for (let i = n - 1; i < values.length; i++) {
    const win: number[] = [];
    for (let k = i - n + 1; k <= i; k++) {
      const v = values[k];
      if (!valid(v)) break;
      win.push(v);
    }
    if (win.length < n) continue;
    // Pearson correlation of the ranks (exact with ties; 0 when the prices do not vary).
    const pr = ranks(win);
    const m = (n + 1) / 2;
    let sxy = 0;
    let syy = 0;
    let sxx = 0;
    for (let k = 0; k < n; k++) {
      const dx = k + 1 - m;
      const dy = pr[k] - m;
      sxy += dx * dy;
      sxx += dx * dx;
      syy += dy * dy;
    }
    out[i] = syy === 0 ? 0 : (100 * sxy) / Math.sqrt(sxx * syy);
  }
  return out;
}

/** Ulcer Index: root mean square of the percent drawdowns from the n-bar high. */
export function ulcerIndex(values: Values, n = 14): Series {
  const hh = highest(values, n);
  const dd2 = zip(values, hh, (x, h) => (h === 0 ? 0 : (100 * (x - h)) / h) ** 2);
  return sma(dd2, n).map((v) => (v === null ? null : Math.sqrt(v)));
}

/**
 * Chande Kroll Stop: first stops highest(high, p) − x·ATR(p) and lowest(low, p) + x·ATR(p); the
 * short stop is the highest of the first high stop over q bars, the long stop the lowest of the
 * first low stop over q bars.
 */
export function chandeKroll(bars: Bar[], p = 10, x = 1, q = 9): { stopShort: Series; stopLong: Series } {
  const a = atr(bars, p);
  const hs = zip(highest(bars.map((b) => b.high), p), a, (h, r) => h - x * r);
  const ls = zip(lowest(bars.map((b) => b.low), p), a, (l, r) => l + x * r);
  return { stopShort: highest(hs, q), stopLong: lowest(ls, q) };
}

/** Accelerator Oscillator: Awesome Oscillator minus its SMA(n). */
export function accelerator(bars: Bar[], n = 5): Series {
  const ao = awesome(bars);
  return zip(ao, sma(ao, n), (a, s) => a - s);
}

// ---------- definitions ----------

const src = (bars: Bar[], inputs: Record<string, number | string | boolean>) => sourceValues(bars, sourceInput(inputs, SOURCE_INPUT));
const MULT = (def: number): IndicatorInputDef => ({ key: "mult", label: "Multiplier", type: "float", default: def, min: 0.01, max: 50, step: 0.1 });

const CRSI_RSI = lengthInput("rsiLength", "RSI length", 3);
const CRSI_STREAK = lengthInput("streakLength", "Up / down length", 2);
const CRSI_RANK = lengthInput("rankLength", "ROC rank length", 100);
export const CONNORS_RSI_DEF: IndicatorDef = {
  id: "crsi",
  name: "Connors RSI",
  shortName: "CRSI",
  pane: "separate",
  inputs: [CRSI_RSI, CRSI_STREAK, CRSI_RANK, SOURCE_INPUT],
  outputs: [{ key: "crsi", label: "CRSI", style: "line" }],
  range: { min: 0, max: 100 },
  levels: [10, 90],
  compute: (bars, inputs) => ({ crsi: connorsRsi(src(bars, inputs), intInput(inputs, CRSI_RSI), intInput(inputs, CRSI_STREAK), intInput(inputs, CRSI_RANK)) }),
};

const FISH_LEN = lengthInput("length", "Length", 9);
export const FISHER_DEF: IndicatorDef = {
  id: "fisher",
  name: "Fisher Transform",
  shortName: "Fisher",
  pane: "separate",
  inputs: [FISH_LEN],
  outputs: [
    { key: "fisher", label: "Fisher", style: "line" },
    { key: "trigger", label: "Trigger", style: "line" },
  ],
  levels: [-1.5, 0, 1.5],
  compute: (bars, inputs) => fisher(bars, intInput(inputs, FISH_LEN)),
};

const STC_FAST = lengthInput("fast", "Fast length", 23);
const STC_SLOW = lengthInput("slow", "Slow length", 50);
const STC_CYCLE = lengthInput("cycle", "Cycle length", 10);
export const SCHAFF_DEF: IndicatorDef = {
  id: "stc",
  name: "Schaff Trend Cycle",
  shortName: "STC",
  pane: "separate",
  inputs: [STC_FAST, STC_SLOW, STC_CYCLE, SOURCE_INPUT],
  outputs: [{ key: "stc", label: "STC", style: "line" }],
  range: { min: 0, max: 100 },
  levels: [25, 75],
  compute: (bars, inputs) => ({ stc: schaff(src(bars, inputs), intInput(inputs, STC_FAST), intInput(inputs, STC_SLOW), intInput(inputs, STC_CYCLE)) }),
};

const KST_SIGNAL = lengthInput("signal", "Signal length", 9);
export const KST_DEF: IndicatorDef = {
  id: "kst",
  name: "Know Sure Thing",
  shortName: "KST",
  pane: "separate",
  inputs: [KST_SIGNAL, SOURCE_INPUT],
  outputs: [
    { key: "kst", label: "KST", style: "line" },
    { key: "signal", label: "Signal", style: "line" },
  ],
  levels: [0],
  compute: (bars, inputs) => kst(src(bars, inputs), intInput(inputs, KST_SIGNAL)),
};

const KVO_FAST = lengthInput("fast", "Fast length", 34);
const KVO_SLOW = lengthInput("slow", "Slow length", 55);
const KVO_SIGNAL = lengthInput("signal", "Signal length", 13);
export const KLINGER_DEF: IndicatorDef = {
  id: "kvo",
  name: "Klinger Oscillator",
  shortName: "KVO",
  pane: "separate",
  inputs: [KVO_FAST, KVO_SLOW, KVO_SIGNAL],
  outputs: [
    { key: "kvo", label: "KVO", style: "line" },
    { key: "signal", label: "Signal", style: "line" },
  ],
  levels: [0],
  compute: (bars, inputs) => klinger(bars, intInput(inputs, KVO_FAST), intInput(inputs, KVO_SLOW), intInput(inputs, KVO_SIGNAL)),
};

const MI_EMA = lengthInput("length", "EMA length", 9);
const MI_SUM = lengthInput("sum", "Sum length", 25);
export const MASS_INDEX_DEF: IndicatorDef = {
  id: "massi",
  name: "Mass Index",
  shortName: "MI",
  pane: "separate",
  inputs: [MI_EMA, MI_SUM],
  outputs: [{ key: "mi", label: "MI", style: "line" }],
  levels: [26.5, 27],
  compute: (bars, inputs) => ({ mi: massIndex(bars, intInput(inputs, MI_EMA), intInput(inputs, MI_SUM)) }),
};

const ER_LEN = lengthInput("length", "Length", 13);
export const ELDER_RAY_DEF: IndicatorDef = {
  id: "elderray",
  name: "Elder Ray (Bull / Bear Power)",
  shortName: "Elder Ray",
  pane: "separate",
  inputs: [ER_LEN],
  outputs: [
    { key: "bull", label: "Bull power", style: "histogram" },
    { key: "bear", label: "Bear power", style: "histogram" },
  ],
  levels: [0],
  compute: (bars, inputs) => elderRay(bars, intInput(inputs, ER_LEN)),
};

const LRC_LEN = lengthInput("length", "Length", 100);
const LRC_MULT = MULT(2);
export const LR_CHANNEL_DEF: IndicatorDef = {
  id: "lrc",
  name: "Linear Regression Channel",
  shortName: "LRC",
  pane: "overlay",
  inputs: [LRC_LEN, LRC_MULT, SOURCE_INPUT],
  outputs: [
    { key: "upper", label: "Upper", style: "band-upper" },
    { key: "basis", label: "Regression", style: "line" },
    { key: "lower", label: "Lower", style: "band-lower" },
  ],
  compute: (bars, inputs) => lrChannel(src(bars, inputs), intInput(inputs, LRC_LEN), floatInput(inputs, LRC_MULT)),
};

const SEB_LEN = lengthInput("length", "Length", 21);
const SEB_MULT = MULT(2);
const SEB_SMOOTH = lengthInput("smooth", "Smoothing", 3);
export const STD_ERROR_BANDS_DEF: IndicatorDef = {
  id: "seb",
  name: "Standard Error Bands",
  shortName: "SEB",
  pane: "overlay",
  inputs: [SEB_LEN, SEB_MULT, SEB_SMOOTH, SOURCE_INPUT],
  outputs: [
    { key: "upper", label: "Upper", style: "band-upper" },
    { key: "basis", label: "Regression", style: "line" },
    { key: "lower", label: "Lower", style: "band-lower" },
  ],
  compute: (bars, inputs) => stdErrorBands(src(bars, inputs), intInput(inputs, SEB_LEN), floatInput(inputs, SEB_MULT), intInput(inputs, SEB_SMOOTH)),
};

const PC_LEN = lengthInput("length", "Length", 20);
export const PRICE_CHANNEL_DEF: IndicatorDef = {
  id: "pricechannel",
  name: "Price Channel",
  shortName: "PC",
  pane: "overlay",
  inputs: [PC_LEN],
  outputs: [
    { key: "upper", label: "Upper", style: "band-upper" },
    { key: "lower", label: "Lower", style: "band-lower" },
  ],
  compute: (bars, inputs) => priceChannel(bars, intInput(inputs, PC_LEN)),
};

/** Single-line overlay of a source (moving-average style). */
function srcOverlay(id: string, name: string, shortName: string, defLen: number, fn: (v: Values, n: number) => Series): IndicatorDef {
  const len = lengthInput("length", "Length", defLen);
  return {
    id,
    name,
    shortName,
    pane: "overlay",
    inputs: [len, SOURCE_INPUT],
    outputs: [{ key: id, label: shortName, style: "line" }],
    compute: (bars, inputs) => ({ [id]: fn(src(bars, inputs), intInput(inputs, len)) }),
  };
}

export const MCGINLEY_DEF = srcOverlay("mcginley", "McGinley Dynamic", "McGinley", 14, (v, n) => mcginley(v, n));
export const ZLEMA_DEF = srcOverlay("zlema", "Zero Lag EMA", "ZLEMA", 21, zlema);
export const VIDYA_DEF = srcOverlay("vidya", "Variable Index Dynamic Average", "VIDYA", 14, (v, n) => vidya(v, n));

const RVGI_LEN = lengthInput("length", "Length", 10);
export const RVGI_DEF: IndicatorDef = {
  id: "rvgi",
  name: "Relative Vigor Index",
  shortName: "RVGI",
  pane: "separate",
  inputs: [RVGI_LEN],
  outputs: [
    { key: "rvgi", label: "RVGI", style: "line" },
    { key: "signal", label: "Signal", style: "line" },
  ],
  levels: [0],
  compute: (bars, inputs) => relativeVigor(bars, intInput(inputs, RVGI_LEN)),
};

const BOP_LEN = lengthInput("length", "Smoothing", 14);
export const BOP_DEF: IndicatorDef = {
  id: "bop",
  name: "Balance of Power",
  shortName: "BOP",
  pane: "separate",
  inputs: [BOP_LEN],
  outputs: [{ key: "bop", label: "BOP", style: "histogram" }],
  range: { min: -1, max: 1 },
  levels: [0],
  compute: (bars, inputs) => ({ bop: balanceOfPower(bars, intInput(inputs, BOP_LEN)) }),
};

const VO_FAST = lengthInput("fast", "Fast length", 5);
const VO_SLOW = lengthInput("slow", "Slow length", 10);
export const VOLUME_OSC_DEF: IndicatorDef = {
  id: "volosc",
  name: "Volume Oscillator",
  shortName: "Vol Osc",
  pane: "separate",
  inputs: [VO_FAST, VO_SLOW],
  outputs: [{ key: "vo", label: "Vol Osc %", style: "line" }],
  levels: [0],
  compute: (bars, inputs) => ({ vo: volumeOscillator(bars, intInput(inputs, VO_FAST), intInput(inputs, VO_SLOW)) }),
};

export const NET_VOLUME_DEF: IndicatorDef = {
  id: "netvol",
  name: "Net Volume",
  shortName: "Net Vol",
  pane: "separate",
  inputs: [],
  outputs: [{ key: "netvol", label: "Net volume", style: "histogram" }],
  levels: [0],
  compute: (bars) => ({ netvol: netVolume(bars) }),
};

const RCI_LEN = lengthInput("length", "Length", 9);
export const RCI_DEF: IndicatorDef = {
  id: "rci",
  name: "Rank Correlation Index",
  shortName: "RCI",
  pane: "separate",
  inputs: [RCI_LEN, SOURCE_INPUT],
  outputs: [{ key: "rci", label: "RCI", style: "line" }],
  range: { min: -100, max: 100 },
  levels: [-80, 0, 80],
  compute: (bars, inputs) => ({ rci: rankCorrelation(src(bars, inputs), Math.max(2, intInput(inputs, RCI_LEN))) }),
};

const UI_LEN = lengthInput("length", "Length", 14);
export const ULCER_DEF: IndicatorDef = {
  id: "ulcer",
  name: "Ulcer Index",
  shortName: "UI",
  pane: "separate",
  inputs: [UI_LEN, SOURCE_INPUT],
  outputs: [{ key: "ui", label: "UI", style: "line" }],
  compute: (bars, inputs) => ({ ui: ulcerIndex(src(bars, inputs), intInput(inputs, UI_LEN)) }),
};

const CKS_P = lengthInput("atrLength", "ATR length", 10);
const CKS_X: IndicatorInputDef = { key: "mult", label: "ATR multiplier", type: "float", default: 1, min: 0.01, max: 20, step: 0.1 };
const CKS_Q = lengthInput("stopLength", "Stop length", 9);
export const CHANDE_KROLL_DEF: IndicatorDef = {
  id: "cks",
  name: "Chande Kroll Stop",
  shortName: "CKS",
  pane: "overlay",
  inputs: [CKS_P, CKS_X, CKS_Q],
  outputs: [
    { key: "stopShort", label: "Stop short", style: "line" },
    { key: "stopLong", label: "Stop long", style: "line" },
  ],
  compute: (bars, inputs) => chandeKroll(bars, intInput(inputs, CKS_P), floatInput(inputs, CKS_X), intInput(inputs, CKS_Q)),
};

const AC_LEN = lengthInput("length", "Smoothing", 5);
export const ACCELERATOR_DEF: IndicatorDef = {
  id: "ac",
  name: "Accelerator Oscillator",
  shortName: "AC",
  pane: "separate",
  inputs: [AC_LEN],
  outputs: [{ key: "ac", label: "AC", style: "histogram" }],
  levels: [0],
  compute: (bars, inputs) => ({ ac: accelerator(bars, intInput(inputs, AC_LEN)) }),
};
