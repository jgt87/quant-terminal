// Volume-based indicators: VWAP (session), OBV, raw volume.

import type { Bar, IndicatorDef, Series } from "../types";

const DAY_SECONDS = 86400;

/**
 * Session VWAP: Σ(typical price × volume) / Σ volume, accumulated from the first bar
 * of each UTC day and reset when the UTC date changes. Typical price = (H + L + C) / 3.
 * While the session's cumulative volume is still 0 the bar's typical price is used.
 */
export function vwap(bars: Bar[]): Series {
  const out: Series = new Array(bars.length).fill(null);
  let day = Number.NaN;
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const d = Math.floor(b.time / DAY_SECONDS);
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    const tp = (b.high + b.low + b.close) / 3;
    const v = Number.isFinite(b.volume) && b.volume > 0 ? b.volume : 0;
    pv += tp * v;
    vol += v;
    out[i] = vol > 0 ? pv / vol : tp;
  }
  return out;
}

/** On-balance volume: starts at 0; adds volume on up closes, subtracts it on down closes. */
export function obv(bars: Bar[]): Series {
  const out: Series = new Array(bars.length).fill(null);
  let acc = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i > 0) {
      const v = Number.isFinite(bars[i].volume) ? bars[i].volume : 0;
      if (bars[i].close > bars[i - 1].close) acc += v;
      else if (bars[i].close < bars[i - 1].close) acc -= v;
    }
    out[i] = acc;
  }
  return out;
}

export const VWAP_DEF: IndicatorDef = {
  id: "vwap",
  name: "Volume Weighted Average Price",
  shortName: "VWAP",
  pane: "overlay",
  inputs: [],
  outputs: [{ key: "vwap", label: "VWAP", style: "line" }],
  compute(bars) {
    return { vwap: vwap(bars) };
  },
};

export const OBV_DEF: IndicatorDef = {
  id: "obv",
  name: "On Balance Volume",
  shortName: "OBV",
  pane: "separate",
  inputs: [],
  outputs: [{ key: "obv", label: "OBV", style: "line" }],
  compute(bars) {
    return { obv: obv(bars) };
  },
};

/**
 * Raw volume as a histogram. The web layer shades each column by direction
 * (close ≥ open is up), which it can read from the bars themselves.
 */
export const VOLUME_DEF: IndicatorDef = {
  id: "volume",
  name: "Volume",
  shortName: "Vol",
  pane: "separate",
  inputs: [],
  outputs: [{ key: "volume", label: "Volume", style: "histogram" }],
  compute(bars) {
    return { volume: bars.map((b) => (Number.isFinite(b.volume) ? b.volume : 0)) };
  },
};
