// Volume flow: Money Flow Index, Chaikin Money Flow, Accumulation/Distribution, Chaikin Oscillator,
// Force Index, Ease of Movement, Price Volume Trend.

import type { Bar, IndicatorDef, IndicatorInputDef, Series } from "../types";
import { ema, emptySeries, sma } from "./ma";
import { rollingSum, zip } from "./series";
import { intInput, lengthInput } from "./source";

const vol = (b: Bar) => (Number.isFinite(b.volume) && b.volume > 0 ? b.volume : 0);

/** Close location value ((C − L) − (H − C)) / (H − L); 0 when H = L. */
function clv(b: Bar): number {
  const r = b.high - b.low;
  return r === 0 ? 0 : (b.close - b.low - (b.high - b.close)) / r;
}

/**
 * Money Flow Index: raw flow = typical price · volume, positive when the typical price rises,
 * negative when it falls. MFI = 100 − 100 / (1 + Σpositive / Σnegative) over n bars;
 * 100 when there is no negative flow, 50 when there is no flow at all.
 */
export function mfi(bars: Bar[], n: number): Series {
  const len = bars.length;
  const pos = emptySeries(len);
  const neg = emptySeries(len);
  for (let i = 1; i < len; i++) {
    const tp = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const pt = (bars[i - 1].high + bars[i - 1].low + bars[i - 1].close) / 3;
    const f = tp * vol(bars[i]);
    pos[i] = tp > pt ? f : 0;
    neg[i] = tp < pt ? f : 0;
  }
  return zip(rollingSum(pos, n), rollingSum(neg, n), (p, q) => (q === 0 ? (p === 0 ? 50 : 100) : 100 - 100 / (1 + p / q)));
}

/** Chaikin Money Flow: Σ(CLV · volume) / Σvolume over n bars (0 when there is no volume). */
export function cmf(bars: Bar[], n: number): Series {
  const mfv = bars.map((b) => clv(b) * vol(b));
  return zip(rollingSum(mfv, n), rollingSum(bars.map(vol), n), (a, v) => (v === 0 ? 0 : a / v));
}

/** Accumulation/Distribution line: running total of CLV · volume. */
export function adl(bars: Bar[]): Series {
  let acc = 0;
  return bars.map((b) => (acc += clv(b) * vol(b)));
}

/** Chaikin Oscillator: EMA(ADL, fast) − EMA(ADL, slow). */
export function chaikinOsc(bars: Bar[], fast: number, slow: number): Series {
  const a = adl(bars);
  return zip(ema(a, fast), ema(a, slow), (x, y) => x - y);
}

/** Elder's Force Index: EMA((C − C[1]) · volume, n). */
export function forceIndex(bars: Bar[], n: number): Series {
  const raw = emptySeries(bars.length);
  for (let i = 1; i < bars.length; i++) raw[i] = (bars[i].close - bars[i - 1].close) * vol(bars[i]);
  return ema(raw, n);
}

/**
 * Ease of Movement: distance = hl2 − hl2[1], box ratio = (volume / divisor) / (H − L);
 * EOM = SMA(distance / box ratio, n). Bars with no range or no volume count as 0.
 */
export function easeOfMovement(bars: Bar[], n: number, divisor: number): Series {
  const raw = emptySeries(bars.length);
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const p = bars[i - 1];
    const dist = (b.high + b.low) / 2 - (p.high + p.low) / 2;
    const v = vol(b);
    const r = b.high - b.low;
    raw[i] = v === 0 || r === 0 ? 0 : (dist * r * divisor) / v;
  }
  return sma(raw, n);
}

/** Price Volume Trend: running total of volume · (C − C[1]) / C[1]. */
export function pvt(bars: Bar[]): Series {
  let acc = 0;
  return bars.map((b, i) => {
    if (i > 0) {
      const pc = bars[i - 1].close;
      if (pc !== 0) acc += (vol(b) * (b.close - pc)) / pc;
    }
    return acc;
  });
}

const MFI_LEN = lengthInput("length", "Length", 14);
export const MFI_DEF: IndicatorDef = {
  id: "mfi",
  name: "Money Flow Index",
  shortName: "MFI",
  pane: "separate",
  inputs: [MFI_LEN],
  outputs: [{ key: "mfi", label: "MFI", style: "line" }],
  range: { min: 0, max: 100 },
  levels: [20, 80],
  compute(bars, inputs) {
    return { mfi: mfi(bars, intInput(inputs, MFI_LEN)) };
  },
};

const CMF_LEN = lengthInput("length", "Length", 20);
export const CMF_DEF: IndicatorDef = {
  id: "cmf",
  name: "Chaikin Money Flow",
  shortName: "CMF",
  pane: "separate",
  inputs: [CMF_LEN],
  outputs: [{ key: "cmf", label: "CMF", style: "line" }],
  levels: [0],
  compute(bars, inputs) {
    return { cmf: cmf(bars, intInput(inputs, CMF_LEN)) };
  },
};

export const ADL_DEF: IndicatorDef = {
  id: "adl",
  name: "Accumulation/Distribution",
  shortName: "A/D",
  pane: "separate",
  inputs: [],
  outputs: [{ key: "adl", label: "A/D", style: "line" }],
  compute(bars) {
    return { adl: adl(bars) };
  },
};

const CO_FAST = lengthInput("fast", "Fast length", 3);
const CO_SLOW = lengthInput("slow", "Slow length", 10);
export const CHAIKIN_OSC_DEF: IndicatorDef = {
  id: "chaikinosc",
  name: "Chaikin Oscillator",
  shortName: "Chaikin Osc",
  pane: "separate",
  inputs: [CO_FAST, CO_SLOW],
  outputs: [{ key: "osc", label: "Oscillator", style: "line" }],
  levels: [0],
  compute(bars, inputs) {
    return { osc: chaikinOsc(bars, intInput(inputs, CO_FAST), intInput(inputs, CO_SLOW)) };
  },
};

const FI_LEN = lengthInput("length", "Length", 13);
export const FORCE_INDEX_DEF: IndicatorDef = {
  id: "efi",
  name: "Elder Force Index",
  shortName: "EFI",
  pane: "separate",
  inputs: [FI_LEN],
  outputs: [{ key: "efi", label: "EFI", style: "line" }],
  levels: [0],
  compute(bars, inputs) {
    return { efi: forceIndex(bars, intInput(inputs, FI_LEN)) };
  },
};

const EOM_LEN = lengthInput("length", "Length", 14);
const EOM_DIV: IndicatorInputDef = { key: "divisor", label: "Divisor", type: "int", default: 10000, min: 1, max: 1_000_000_000, step: 1 };
export const EOM_DEF: IndicatorDef = {
  id: "eom",
  name: "Ease of Movement",
  shortName: "EOM",
  pane: "separate",
  inputs: [EOM_LEN, EOM_DIV],
  outputs: [{ key: "eom", label: "EOM", style: "line" }],
  levels: [0],
  compute(bars, inputs) {
    return { eom: easeOfMovement(bars, intInput(inputs, EOM_LEN), intInput(inputs, EOM_DIV)) };
  },
};

export const PVT_DEF: IndicatorDef = {
  id: "pvt",
  name: "Price Volume Trend",
  shortName: "PVT",
  pane: "separate",
  inputs: [],
  outputs: [{ key: "pvt", label: "PVT", style: "line" }],
  compute(bars) {
    return { pvt: pvt(bars) };
  },
};
