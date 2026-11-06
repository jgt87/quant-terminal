import { describe, it, expect } from "vitest";
import type { Bar, Series } from "../src/types";
import {
  INDICATORS,
  getIndicator,
  sma,
  ema,
  rma,
  zip,
  lag,
  shift,
  rollingSum,
  barsSinceExtreme,
  linreg,
  dema,
  tema,
  hma,
  alma,
  kama,
  vwma,
  dmi,
  aroon,
  vortex,
  psar,
  supertrend,
  ichimoku,
  cci,
  williamsR,
  roc,
  momentum,
  awesome,
  trix,
  ultimate,
  stochRsi,
  cmo,
  dpo,
  tsi,
  coppock,
  keltner,
  envelope,
  bbPercentB,
  bbWidth,
  historicalVolatility,
  choppiness,
  chandelier,
  mfi,
  cmf,
  adl,
  chaikinOsc,
  forceIndex,
  easeOfMovement,
  pvt,
  atr,
} from "../src/indicators";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeBars(count: number, seed = 7, start = 1_700_000_000, step = 3600): Bar[] {
  const rnd = lcg(seed);
  const bars: Bar[] = [];
  let close = 100;
  for (let i = 0; i < count; i++) {
    const open = close;
    close = Math.max(1, open * (1 + (rnd() - 0.5) * 0.04));
    const high = Math.max(open, close) * (1 + rnd() * 0.01);
    const low = Math.min(open, close) * (1 - rnd() * 0.01);
    bars.push({ time: start + i * step, open, high, low, close, volume: Math.round(1000 + rnd() * 9000) });
  }
  return bars;
}

/** Bars with a fixed OHLC per index from a close function (high = close + 1, low = close − 1). */
function barsFrom(closes: number[], volume = 1000): Bar[] {
  return closes.map((c, i) => ({ time: 1_700_000_000 + i * 60, open: c, high: c + 1, low: c - 1, close: c, volume }));
}

const BARS = makeBars(400);
const CLOSES = BARS.map((b) => b.close);
const RISING = barsFrom(Array.from({ length: 120 }, (_, i) => 100 + i));
const FALLING = barsFrom(Array.from({ length: 120 }, (_, i) => 300 - i));
const FLAT = barsFrom(new Array(120).fill(50));
const LINE = Array.from({ length: 80 }, (_, i) => 10 + 2 * i);

const last = (s: Series) => s[s.length - 1] as number;
const close = (a: number | null, b: number, eps = 1e-9) => {
  expect(a).not.toBeNull();
  expect(Math.abs((a as number) - b)).toBeLessThan(eps);
};
function expectClose(a: Series, b: Series, eps = 1e-9) {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) {
    if (b[i] === null) expect(a[i]).toBeNull();
    else close(a[i], b[i] as number, eps);
  }
}
function within(s: Series, lo: number, hi: number) {
  for (const v of s) if (v !== null) {
    expect(v).toBeGreaterThanOrEqual(lo - 1e-9);
    expect(v).toBeLessThanOrEqual(hi + 1e-9);
  }
}

describe("registry", () => {
  it("has unique ids and every definition computes aligned, finite-or-null outputs", () => {
    const ids = INDICATORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(INDICATORS.length).toBeGreaterThanOrEqual(50);
    for (const def of INDICATORS) {
      const defaults = Object.fromEntries(def.inputs.map((i) => [i.key, i.default]));
      const out = def.compute(BARS, defaults);
      for (const o of def.outputs) {
        const s = out[o.key];
        expect(s, `${def.id}.${o.key}`).toBeDefined();
        if (o.forward) expect(s.length).toBeGreaterThanOrEqual(BARS.length);
        else expect(s.length).toBe(BARS.length);
        expect(s.some((v) => v !== null), `${def.id}.${o.key} has values`).toBe(true);
        for (const v of s) if (v !== null) expect(Number.isFinite(v)).toBe(true);
      }
      expect(getIndicator(def.id)).toBe(def);
    }
  });

  it("survives empty and one-bar input", () => {
    for (const def of INDICATORS) {
      const defaults = Object.fromEntries(def.inputs.map((i) => [i.key, i.default]));
      for (const bars of [[], BARS.slice(0, 1)]) {
        const out = def.compute(bars, defaults);
        for (const o of def.outputs) {
          if (o.forward) expect(out[o.key].length).toBeGreaterThanOrEqual(bars.length);
          else expect(out[o.key].length).toBe(bars.length);
        }
      }
    }
  });
});

describe("series helpers", () => {
  it("rollingSum matches a naive sum, including after a gap", () => {
    const v: (number | null)[] = CLOSES.slice(0, 60);
    v[20] = null;
    const r = rollingSum(v, 5);
    for (let i = 0; i < v.length; i++) {
      const win = v.slice(Math.max(0, i - 4), i + 1);
      if (i < 4 || win.some((x) => x === null)) expect(r[i]).toBeNull();
      else close(r[i], (win as number[]).reduce((a, b) => a + b, 0));
    }
  });

  it("rollingSum stays exact over long runs", () => {
    const v = makeBars(5000, 3).map((b) => b.close);
    const r = rollingSum(v, 50);
    let s = 0;
    for (let k = v.length - 50; k < v.length; k++) s += v[k];
    close(last(r), s, 1e-7);
  });

  it("lag, shift and zip", () => {
    expect(lag([1, 2, 3], 1)).toEqual([null, 1, 2]);
    expect(shift([1, 2, 3], 1)).toEqual([null, 1, 2]);
    expect(shift([1, 2, 3], -1)).toEqual([2, 3, null]);
    expect(zip([1, null, 3], [1, 1, 0], (a, b) => a / b)).toEqual([1, null, null]);
  });

  it("barsSinceExtreme prefers the newest of equal extremes", () => {
    expect(barsSinceExtreme([1, 5, 3, 5, 2], 3, true)).toEqual([null, null, null, 0, 1]);
    expect(barsSinceExtreme([3, 1, 2, 4], 2, false)).toEqual([null, null, 1, 2]);
  });

  it("linreg reproduces a straight line and its projection", () => {
    const r = linreg(LINE, 10);
    for (let i = 9; i < LINE.length; i++) close(r[i], LINE[i]);
    close(linreg(LINE, 10, 3)[20], LINE[23]);
  });
});

describe("moving averages", () => {
  const flat = new Array(60).fill(7);
  it("all return the constant on a constant series", () => {
    for (const s of [dema(flat, 5), tema(flat, 5), hma(flat, 9), alma(flat, 9), kama(flat, 10), linreg(flat, 9)]) {
      close(last(s), 7);
    }
  });

  it("DEMA and TEMA follow their definitions", () => {
    const e1 = ema(CLOSES, 10);
    const e2 = ema(e1, 10);
    const e3 = ema(e2, 10);
    expectClose(dema(CLOSES, 10), zip(e1, e2, (a, b) => 2 * a - b));
    const t = tema(CLOSES, 10);
    close(last(t), 3 * last(e1) - 3 * last(e2) + last(e3));
    // First TEMA value appears when the third EMA is seeded: index 3·(n − 1).
    expect(t[26]).toBeNull();
    expect(t[27]).not.toBeNull();
  });

  it("HMA(9) has no lag on a straight line", () => {
    const h = hma(LINE, 9);
    for (let i = 20; i < LINE.length; i++) close(h[i], LINE[i]);
  });

  it("ALMA with offset 0.5 is symmetric (equals the centre value on a line)", () => {
    const a = alma(LINE, 9, 0.5, 6);
    close(a[30], LINE[26]);
  });

  it("KAMA moves with the fast constant on a perfectly efficient trend", () => {
    const k = kama(LINE, 10, 2, 30);
    expect(k[9]).toBeNull();
    close(k[10], LINE[10]);
    // ER = 1 → sc = (2/3)²
    close(k[11], LINE[10] + (4 / 9) * (LINE[11] - LINE[10]));
  });

  it("VWMA equals SMA with equal volume and weights by volume", () => {
    const bars = barsFrom(LINE);
    expectClose(vwma(bars, LINE, 5), sma(LINE, 5));
    const weighted: Bar[] = [
      { time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { time: 1, open: 3, high: 3, low: 3, close: 3, volume: 3 },
    ];
    close(vwma(weighted, [1, 3], 2)[1], (1 * 1 + 3 * 3) / 4);
  });
});

describe("trend direction and strength", () => {
  it("DMI: rising bars give +DI > −DI and a strong ADX; flat bars give 0", () => {
    const r = dmi(RISING, 14, 14);
    expect(last(r.plus)).toBeGreaterThan(last(r.minus));
    close(last(r.minus), 0);
    close(last(r.adx), 100);
    const f = dmi(FLAT, 14, 14);
    close(last(f.plus), 0);
    close(last(f.adx), 0);
    // +DI seeds after n changes (index n), ADX after n more DX values.
    expect(r.plus[13]).toBeNull();
    expect(r.plus[14]).not.toBeNull();
    expect(r.adx[26]).toBeNull();
    expect(r.adx[27]).not.toBeNull();
  });

  it("Aroon: new highs every bar → up 100, down 0", () => {
    const r = aroon(RISING, 14);
    expect(r.up[13]).toBeNull();
    close(r.up[14], 100);
    close(last(r.down), 0);
    const f = aroon(FALLING, 14);
    close(last(f.down), 100);
  });

  it("Vortex: rising market has VI+ > 1 > VI−", () => {
    const r = vortex(RISING, 14);
    expect(last(r.plus)).toBeGreaterThan(1);
    expect(last(r.minus)).toBeLessThan(1);
  });

  it("Parabolic SAR stays below lows in an uptrend and flips on a reversal", () => {
    const s = psar(RISING);
    for (let i = 2; i < RISING.length; i++) expect(s[i] as number).toBeLessThanOrEqual(RISING[i].low);
    const v = barsFrom([...Array.from({ length: 30 }, (_, i) => 100 + i), ...Array.from({ length: 30 }, (_, i) => 129 - 2 * i)]);
    const r = psar(v);
    expect(r[59] as number).toBeGreaterThan(v[59].high);
  });

  it("SuperTrend tracks below price in an uptrend, above in a downtrend", () => {
    const up = supertrend(RISING, 10, 3);
    expect(last(up.trend)).toBe(1);
    expect(last(up.up)).toBeLessThan(RISING[RISING.length - 1].close);
    expect(last(up.down as Series)).toBeNull();
    const dn = supertrend(FALLING, 10, 3);
    expect(last(dn.trend)).toBe(-1);
    expect(last(dn.down)).toBeGreaterThan(FALLING[FALLING.length - 1].close);
    // The lower band never falls while the trend is up.
    for (let i = 11; i < up.up.length; i++) expect(up.up[i] as number).toBeGreaterThanOrEqual(up.up[i - 1] as number);
  });

  it("Ichimoku lines, displacement and lagging span", () => {
    const r = ichimoku(RISING, 9, 26, 52, 26);
    // Tenkan = (highest high + lowest low)/2 over 9 bars = close − 4 on this ramp.
    close(r.tenkan[20], RISING[20].close - 4);
    close(r.kijun[40], RISING[40].close - 12.5);
    // Spans are shifted 25 bars ahead, the lagging span 25 bars back.
    close(r.spanA[60], ((r.tenkan[35] as number) + (r.kijun[35] as number)) / 2);
    close(r.chikou[10], RISING[35].close);
    expect(r.chikou[RISING.length - 1]).toBeNull();
    // Midpoint(52) first exists at index 51, plotted 25 bars later.
    expect(r.spanB[51 + 25]).not.toBeNull();
    expect(r.spanB[50 + 25]).toBeNull();
    // The cloud runs 25 bars past the last bar: its last value is the span of the last bar.
    const n = RISING.length;
    expect(r.spanA).toHaveLength(n + 25);
    expect(r.spanB).toHaveLength(n + 25);
    close(r.spanA[n + 24], ((r.tenkan[n - 1] as number) + (r.kijun[n - 1] as number)) / 2);
    expect(r.tenkan).toHaveLength(n);
  });
});

describe("momentum", () => {
  it("CCI matches a naive mean-deviation implementation", () => {
    const n = 20;
    const c = cci(CLOSES, n);
    for (const i of [n - 1, 100, 399]) {
      const win = CLOSES.slice(i - n + 1, i + 1);
      const m = win.reduce((a, b) => a + b, 0) / n;
      const md = win.reduce((a, b) => a + Math.abs(b - m), 0) / n;
      close(c[i], (CLOSES[i] - m) / (0.015 * md), 1e-7);
    }
    close(last(cci(new Array(30).fill(3), 20)), 0);
  });

  it("Williams %R range and extremes", () => {
    const r = williamsR(BARS, 14);
    within(r, -100, 0);
    // Ramp closes sit 1 below their bar's high, which is the window's highest high.
    close(last(williamsR(RISING, 14)), (-100 * 1) / (RISING[119].high - RISING[106].low));
  });

  it("ROC, Momentum, DPO and CMO by hand", () => {
    expect(roc([100, 110, 99], 1)).toEqual([null, 10, -10]);
    expect(momentum([1, 4, 9], 2)).toEqual([null, null, 8]);
    close(last(cmo(LINE, 9)), 100);
    close(last(cmo([...LINE].reverse(), 9)), -100);
    const d = dpo(LINE, 10);
    // On a line, x − SMA(10) from 6 bars ago = 2·(6 + 4.5)
    close(last(d), 2 * (6 + 4.5));
  });

  it("Awesome Oscillator is 0 on a flat market; TRIX is 0 on a constant", () => {
    close(last(awesome(FLAT)), 0);
    close(last(trix(new Array(80).fill(5), 9)), 0);
  });

  it("Ultimate Oscillator stays in 0..100 and is 100 when every close is the high of its true range", () => {
    within(ultimate(BARS), 0, 100);
    const up = RISING.map((b) => ({ ...b, high: b.close }));
    close(last(ultimate(up)), 100);
  });

  it("Stochastic RSI stays in 0..100", () => {
    const r = stochRsi(CLOSES, 14, 14, 3, 3);
    within(r.k, 0, 100);
    within(r.d, 0, 100);
  });

  it("TSI is +100 on a steady rise; Coppock is positive on a rise", () => {
    close(last(tsi(LINE, 25, 13, 13).tsi), 100);
    expect(last(coppock(LINE, 10, 14, 11))).toBeGreaterThan(0);
  });
});

describe("bands and volatility", () => {
  it("Keltner: basis is the EMA, bands are ±mult·ATR", () => {
    const k = keltner(BARS, CLOSES, 20, 2, 10);
    const a = atr(BARS, 10);
    expectClose(k.basis, ema(CLOSES, 20));
    close(last(k.upper) - last(k.basis), 2 * last(a));
    close(last(k.basis) - last(k.lower), 2 * last(a));
  });

  it("Envelope is SMA ± percent", () => {
    const e = envelope(LINE, 5, 10);
    close(last(e.upper), last(sma(LINE, 5)) * 1.1);
  });

  it("%B and Bandwidth", () => {
    const pb = bbPercentB(CLOSES, 20, 2);
    // %B = 0.5 exactly where the close equals the basis (mean); check the identity elsewhere.
    const bw = bbWidth(CLOSES, 20, 2);
    expect(last(bw)).toBeGreaterThan(0);
    expect(pb[18]).toBeNull();
    expect(bbPercentB(new Array(30).fill(1), 20, 2)[25]).toBeNull();
  });

  it("Historical volatility is 0 for constant growth and positive otherwise", () => {
    const geo = Array.from({ length: 40 }, (_, i) => 100 * 1.01 ** i);
    close(last(historicalVolatility(geo, 10, 252)), 0, 1e-7);
    // Alternating ±r log returns: sample stdev of n values.
    const alt = Array.from({ length: 21 }, (_, i) => (i % 2 ? 110 : 100));
    const r = Math.log(1.1);
    const n = 10;
    const expected = 100 * Math.sqrt((n * r * r) / (n - 1)) * Math.sqrt(252);
    close(last(historicalVolatility(alt, n, 252)), expected, 1e-7);
  });

  it("Choppiness is low in a clean trend and within 0..100", () => {
    within(choppiness(BARS, 14), 0, 100);
    expect(last(choppiness(RISING, 14))).toBeLessThan(40);
  });

  it("Chandelier exits sit around the extremes", () => {
    const c = chandelier(RISING, 22, 3);
    const a = atr(RISING, 22);
    close(last(c.long), RISING[119].high - 3 * last(a));
    close(last(c.short), RISING[98].low + 3 * last(a));
  });
});

describe("volume flow", () => {
  it("MFI is 100 when the typical price only rises, 0 when it only falls, 50 when flat", () => {
    close(last(mfi(RISING, 14)), 100);
    close(last(mfi(FALLING, 14)), 0);
    close(last(mfi(FLAT, 14)), 50);
    within(mfi(BARS, 14), 0, 100);
  });

  it("CMF and A/D use the close location value", () => {
    const atHigh = RISING.map((b) => ({ ...b, close: b.high }));
    close(last(cmf(atHigh, 20)), 1);
    const a = adl(atHigh);
    close(last(a), atHigh.length * 1000);
    // Mid-range closes contribute nothing.
    close(last(adl(FLAT)), 0);
  });

  it("Chaikin Oscillator is EMA(3) − EMA(10) of A/D", () => {
    const a = adl(BARS);
    close(last(chaikinOsc(BARS, 3, 10)), last(ema(a, 3)) - last(ema(a, 10)));
  });

  it("Force Index, Ease of Movement and PVT by hand", () => {
    const fi = forceIndex(RISING, 1);
    close(fi[5], 1 * 1000);
    // EOM: distance 1, range 2, volume 1000, divisor 10000 → 1·2·10000/1000 = 20.
    close(last(easeOfMovement(RISING, 3, 10000)), 20);
    const p = pvt(barsFrom([100, 110, 99]));
    close(p[2], 1000 * 0.1 + 1000 * (-11 / 110));
  });

  it("RMA-based helpers stay consistent with the existing library", () => {
    // SMMA is Wilder's RMA.
    const def = getIndicator("smma");
    expect(def).toBeDefined();
    expectClose(def!.compute(BARS, { length: 7, source: "close" }).smma, rma(CLOSES, 7));
  });
});
