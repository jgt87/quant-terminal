import { describe, it, expect } from "vitest";
import type { Bar, Series } from "../src/types";
import {
  INDICATORS,
  getIndicator,
  sourceValues,
  sma,
  ema,
  wma,
  rma,
  rsi,
  stdev,
  highest,
  lowest,
  trueRange,
  atr,
  macd,
  bollinger,
  stochastic,
  vwap,
  obv,
  donchian,
} from "../src/indicators";

// ---------- deterministic data ----------

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeBars(count: number, seed = 42, start = 1_700_000_000, step = 3600): Bar[] {
  const rnd = lcg(seed);
  const bars: Bar[] = [];
  let close = 100;
  for (let i = 0; i < count; i++) {
    const open = close;
    close = Math.max(1, open * (1 + (rnd() - 0.5) * 0.04));
    const high = Math.max(open, close) * (1 + rnd() * 0.01);
    const low = Math.min(open, close) * (1 - rnd() * 0.01);
    const volume = Math.round(1000 + rnd() * 9000);
    bars.push({ time: start + i * step, open, high, low, close, volume });
  }
  return bars;
}

const BARS = makeBars(500);
const CLOSES = BARS.map((b) => b.close);

// ---------- naive reference implementations (loop-based, O(n·k)) ----------

function refSma(v: number[], n: number): Series {
  const out: Series = [];
  for (let i = 0; i < v.length; i++) {
    if (i < n - 1) { out.push(null); continue; }
    let s = 0;
    for (let k = i - n + 1; k <= i; k++) s += v[k];
    out.push(s / n);
  }
  return out;
}

function refWma(v: number[], n: number): Series {
  const out: Series = [];
  for (let i = 0; i < v.length; i++) {
    if (i < n - 1) { out.push(null); continue; }
    let s = 0;
    let w = 0;
    for (let k = 0; k < n; k++) {
      s += v[i - n + 1 + k] * (k + 1);
      w += k + 1;
    }
    out.push(s / w);
  }
  return out;
}

function refExp(v: number[], n: number, alpha: number): Series {
  const out: Series = [];
  let prev = 0;
  for (let i = 0; i < v.length; i++) {
    if (i < n - 1) { out.push(null); continue; }
    if (i === n - 1) {
      let s = 0;
      for (let k = 0; k < n; k++) s += v[k];
      prev = s / n;
    } else {
      prev = alpha * v[i] + (1 - alpha) * prev;
    }
    out.push(prev);
  }
  return out;
}
const refEma = (v: number[], n: number) => refExp(v, n, 2 / (n + 1));
const refRma = (v: number[], n: number) => refExp(v, n, 1 / n);

function refStdev(v: number[], n: number): Series {
  const out: Series = [];
  for (let i = 0; i < v.length; i++) {
    if (i < n - 1) { out.push(null); continue; }
    let s = 0;
    for (let k = i - n + 1; k <= i; k++) s += v[k];
    const m = s / n;
    let ss = 0;
    for (let k = i - n + 1; k <= i; k++) ss += (v[k] - m) ** 2;
    out.push(Math.sqrt(ss / n));
  }
  return out;
}

function refExtreme(v: number[], n: number, hi: boolean): Series {
  const out: Series = [];
  for (let i = 0; i < v.length; i++) {
    if (i < n - 1) { out.push(null); continue; }
    let m = v[i];
    for (let k = i - n + 1; k <= i; k++) m = hi ? Math.max(m, v[k]) : Math.min(m, v[k]);
    out.push(m);
  }
  return out;
}

function refRsi(v: number[], n: number): Series {
  const out: Series = v.map(() => null);
  if (v.length <= n) return out;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= n; i++) {
    const d = v[i] - v[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  g /= n;
  l /= n;
  const val = () => (l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l));
  out[n] = val();
  for (let i = n + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = val();
  }
  return out;
}

function refTr(bars: Bar[]): number[] {
  return bars.map((b, i) =>
    i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)),
  );
}

/** EMA of a series with leading nulls: seeds after the first `n` non-null values. */
function refEmaSeries(v: Series, n: number): Series {
  const first = v.findIndex((x) => x !== null);
  const out: Series = v.map(() => null);
  if (first < 0) return out;
  const tail = refEma(v.slice(first) as number[], n);
  tail.forEach((x, k) => (out[first + k] = x));
  return out;
}
function refSmaSeries(v: Series, n: number): Series {
  const first = v.findIndex((x) => x !== null);
  const out: Series = v.map(() => null);
  if (first < 0) return out;
  const tail = refSma(v.slice(first) as number[], n);
  tail.forEach((x, k) => (out[first + k] = x));
  return out;
}

function refStoch(bars: Bar[], k: number, ks: number, ds: number) {
  const raw: Series = bars.map((b, i) => {
    if (i < k - 1) return null;
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - k + 1; j <= i; j++) {
      hh = Math.max(hh, bars[j].high);
      ll = Math.min(ll, bars[j].low);
    }
    return hh === ll ? 50 : (100 * (b.close - ll)) / (hh - ll);
  });
  const kk = refSmaSeries(raw, ks);
  return { k: kk, d: refSmaSeries(kk, ds) };
}

function refVwap(bars: Bar[]): Series {
  return bars.map((b, i) => {
    const day = Math.floor(b.time / 86400);
    let pv = 0;
    let vol = 0;
    for (let j = 0; j <= i; j++) {
      if (Math.floor(bars[j].time / 86400) !== day) continue;
      const tp = (bars[j].high + bars[j].low + bars[j].close) / 3;
      pv += tp * bars[j].volume;
      vol += bars[j].volume;
    }
    return pv / vol;
  });
}

function refObv(bars: Bar[]): Series {
  return bars.map((_, i) => {
    let s = 0;
    for (let j = 1; j <= i; j++) {
      if (bars[j].close > bars[j - 1].close) s += bars[j].volume;
      else if (bars[j].close < bars[j - 1].close) s -= bars[j].volume;
    }
    return s;
  });
}

// ---------- helpers ----------

function expectSeriesClose(actual: Series, expected: Series, tol = 1e-9) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    const a = actual[i];
    const e = expected[i];
    if (e === null) {
      expect(a, `index ${i} should be null`).toBeNull();
    } else {
      expect(a, `index ${i} should be a number`).not.toBeNull();
      expect(Number.isFinite(a as number), `index ${i} finite`).toBe(true);
      expect(Math.abs((a as number) - e), `index ${i}: ${a} vs ${e}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(e)));
    }
  }
}

const leadingNulls = (s: Series) => {
  let k = 0;
  while (k < s.length && s[k] === null) k++;
  return k;
};
const noNaN = (s: Series) => s.every((v) => v === null || Number.isFinite(v));

// ---------- tests ----------

describe("low-level helpers vs naive reference (500 bars)", () => {
  for (const n of [1, 2, 5, 14, 20, 50]) {
    it(`sma/ema/wma/rma/stdev/highest/lowest n=${n}`, () => {
      expectSeriesClose(sma(CLOSES, n), refSma(CLOSES, n));
      expectSeriesClose(ema(CLOSES, n), refEma(CLOSES, n));
      expectSeriesClose(wma(CLOSES, n), refWma(CLOSES, n));
      expectSeriesClose(rma(CLOSES, n), refRma(CLOSES, n));
      expectSeriesClose(stdev(CLOSES, n), refStdev(CLOSES, n));
      expectSeriesClose(highest(CLOSES, n), refExtreme(CLOSES, n, true));
      expectSeriesClose(lowest(CLOSES, n), refExtreme(CLOSES, n, false));
    });
  }

  it("rsi(14) and rsi(2)", () => {
    expectSeriesClose(rsi(CLOSES, 14), refRsi(CLOSES, 14));
    expectSeriesClose(rsi(CLOSES, 2), refRsi(CLOSES, 2));
  });

  it("trueRange and atr(14)", () => {
    const tr = refTr(BARS);
    expectSeriesClose(trueRange(BARS), tr);
    expectSeriesClose(atr(BARS, 14), refRma(tr, 14));
  });

  it("macd(12,26,9)", () => {
    const f = refEma(CLOSES, 12);
    const s = refEma(CLOSES, 26);
    const line: Series = f.map((v, i) => (v === null || s[i] === null ? null : v - (s[i] as number)));
    const sig = refEmaSeries(line, 9);
    const hist: Series = line.map((v, i) => (v === null || sig[i] === null ? null : v - (sig[i] as number)));
    const r = macd(CLOSES, 12, 26, 9);
    expectSeriesClose(r.macd, line);
    expectSeriesClose(r.signal, sig);
    expectSeriesClose(r.hist, hist);
  });

  it("bollinger(20,2)", () => {
    const m = refSma(CLOSES, 20);
    const sd = refStdev(CLOSES, 20);
    const r = bollinger(CLOSES, 20, 2);
    expectSeriesClose(r.basis, m);
    expectSeriesClose(r.upper, m.map((v, i) => (v === null ? null : v + 2 * (sd[i] as number))));
    expectSeriesClose(r.lower, m.map((v, i) => (v === null ? null : v - 2 * (sd[i] as number))));
  });

  it("stochastic(14,3,3)", () => {
    const ref = refStoch(BARS, 14, 3, 3);
    const r = stochastic(BARS, 14, 3, 3);
    expectSeriesClose(r.k, ref.k);
    expectSeriesClose(r.d, ref.d);
  });

  it("vwap, obv, donchian(20)", () => {
    expectSeriesClose(vwap(BARS), refVwap(BARS));
    expectSeriesClose(obv(BARS), refObv(BARS));
    const hh = refExtreme(BARS.map((b) => b.high), 20, true);
    const ll = refExtreme(BARS.map((b) => b.low), 20, false);
    const d = donchian(BARS, 20);
    expectSeriesClose(d.upper, hh);
    expectSeriesClose(d.lower, ll);
    expectSeriesClose(d.basis, hh.map((v, i) => (v === null ? null : (v + (ll[i] as number)) / 2)));
  });
});

describe("indicator definitions vs naive reference (500 bars)", () => {
  const run = (id: string, inputs: Record<string, number | string | boolean> = {}) => {
    const def = getIndicator(id);
    expect(def, id).toBeDefined();
    return def!.compute(BARS, inputs);
  };

  it("registry contains every required id exactly once", () => {
    const ids = INDICATORS.map((d) => d.id);
    for (const id of ["sma", "ema", "wma", "rsi", "macd", "bb", "atr", "stoch", "vwap", "obv", "donchian", "volume"]) {
      expect(ids.filter((x) => x === id)).toHaveLength(1);
    }
    expect(getIndicator("nope")).toBeUndefined();
  });

  it("every output key is produced, aligned 1:1 and NaN-free", () => {
    for (const def of INDICATORS) {
      const out = def.compute(BARS, {});
      for (const o of def.outputs) {
        expect(out[o.key], `${def.id}.${o.key}`).toBeDefined();
        expect(out[o.key]).toHaveLength(BARS.length);
        expect(noNaN(out[o.key])).toBe(true);
      }
    }
  });

  it("defaults and custom inputs match the reference", () => {
    expectSeriesClose(run("sma").sma, refSma(CLOSES, 20));
    expectSeriesClose(run("sma", { length: 7 }).sma, refSma(CLOSES, 7));
    expectSeriesClose(run("ema", { length: 9 }).ema, refEma(CLOSES, 9));
    expectSeriesClose(run("wma", { length: 10 }).wma, refWma(CLOSES, 10));
    expectSeriesClose(run("rsi").rsi, refRsi(CLOSES, 14));
    expectSeriesClose(run("atr").atr, refRma(refTr(BARS), 14));
    expectSeriesClose(run("obv").obv, refObv(BARS));
    expectSeriesClose(run("vwap").vwap, refVwap(BARS));
    expectSeriesClose(run("volume").volume, BARS.map((b) => b.volume));
    const st = run("stoch");
    const ref = refStoch(BARS, 14, 3, 3);
    expectSeriesClose(st.k, ref.k);
    expectSeriesClose(st.d, ref.d);
    const bb = run("bb", { length: 10, mult: 1.5 });
    const m = refSma(CLOSES, 10);
    const sd = refStdev(CLOSES, 10);
    expectSeriesClose(bb.upper, m.map((v, i) => (v === null ? null : v + 1.5 * (sd[i] as number))));
  });

  it("source input selects the price", () => {
    const hl2 = BARS.map((b) => (b.high + b.low) / 2);
    expectSeriesClose(run("sma", { length: 5, source: "hl2" }).sma, refSma(hl2, 5));
    expect(sourceValues(BARS, "hlc3")[3]).toBeCloseTo((BARS[3].high + BARS[3].low + BARS[3].close) / 3, 12);
    expect(sourceValues(BARS, "ohlc4")[3]).toBeCloseTo((BARS[3].open + BARS[3].high + BARS[3].low + BARS[3].close) / 4, 12);
    expect(sourceValues(BARS, "open")[0]).toBe(BARS[0].open);
  });

  it("separate-pane ranges and levels", () => {
    expect(getIndicator("rsi")!.range).toEqual({ min: 0, max: 100 });
    expect(getIndicator("rsi")!.levels).toEqual([30, 70]);
    expect(getIndicator("stoch")!.range).toEqual({ min: 0, max: 100 });
    expect(getIndicator("stoch")!.levels).toEqual([20, 80]);
    expect(getIndicator("volume")!.pane).toBe("separate");
    expect(getIndicator("volume")!.outputs[0].style).toBe("histogram");
    expect(getIndicator("sma")!.pane).toBe("overlay");
  });
});

describe("warm-up null counts", () => {
  const cases: [string, Record<string, number>, Record<string, number>][] = [
    ["sma", { length: 20 }, { sma: 19 }],
    ["ema", { length: 20 }, { ema: 19 }],
    ["wma", { length: 20 }, { wma: 19 }],
    ["rsi", { length: 14 }, { rsi: 14 }],
    ["macd", { fast: 12, slow: 26, signal: 9 }, { macd: 25, signal: 33, hist: 33 }],
    ["bb", { length: 20 }, { basis: 19, upper: 19, lower: 19 }],
    ["atr", { length: 14 }, { atr: 13 }],
    ["stoch", { k: 14, kSmooth: 3, d: 3 }, { k: 15, d: 17 }],
    ["vwap", {}, { vwap: 0 }],
    ["obv", {}, { obv: 0 }],
    ["donchian", { length: 20 }, { upper: 19, lower: 19, basis: 19 }],
    ["volume", {}, { volume: 0 }],
  ];
  for (const [id, inputs, expected] of cases) {
    it(id, () => {
      const out = getIndicator(id)!.compute(BARS, inputs);
      for (const [key, count] of Object.entries(expected)) {
        expect(leadingNulls(out[key]), `${id}.${key}`).toBe(count);
        expect(out[key].slice(count).every((v) => v !== null), `${id}.${key} no gaps`).toBe(true);
      }
    });
  }

  it("period longer than the data gives all nulls", () => {
    const short = CLOSES.slice(0, 5);
    for (const s of [sma(short, 10), ema(short, 10), wma(short, 10), rma(short, 10), stdev(short, 10), highest(short, 10), lowest(short, 10), rsi(short, 5), rsi(short, 10)]) {
      expect(s).toHaveLength(5);
      expect(s.every((v) => v === null)).toBe(true);
    }
    expect(atr(BARS.slice(0, 3), 14).every((v) => v === null)).toBe(true);
    const m = macd(short, 12, 26, 9);
    expect([...m.macd, ...m.signal, ...m.hist].every((v) => v === null)).toBe(true);
    for (const def of INDICATORS) {
      const out = def.compute(BARS.slice(0, 3), {});
      for (const o of def.outputs) expect(out[o.key]).toHaveLength(3);
    }
  });

  it("empty input gives empty output", () => {
    for (const def of INDICATORS) {
      const out = def.compute([], {});
      for (const o of def.outputs) expect(out[o.key]).toEqual([]);
    }
  });
});

describe("worked examples", () => {
  const ONE_TO_TEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("SMA(3) of 1..10", () => {
    expect(sma(ONE_TO_TEN, 3)).toEqual([null, null, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(sma(ONE_TO_TEN, 10)).toEqual([null, null, null, null, null, null, null, null, null, 5.5]);
  });

  it("WMA(3) of 1..10: (1·1+2·2+3·3)/6 = 14/6", () => {
    const w = wma(ONE_TO_TEN, 3);
    expect(w[1]).toBeNull();
    expect(w[2]).toBeCloseTo(14 / 6, 12);
    expect(w[3]).toBeCloseTo((2 + 6 + 12) / 6, 12);
  });

  it("EMA(3) seeded with SMA at index 2, alpha = 0.5", () => {
    const e = ema(ONE_TO_TEN, 3);
    // seed = (1+2+3)/3 = 2; then 2 + 0.5·(4−2) = 3; 3 + 0.5·(5−3) = 4
    expect(e.slice(0, 5)).toEqual([null, null, 2, 3, 4]);
    const e2 = ema([2, 4, 6, 10], 2);
    // seed = 3 at index 1; alpha = 2/3: 3 + (2/3)(6−3) = 5; 5 + (2/3)(10−5) = 25/3
    expect(e2[0]).toBeNull();
    expect(e2[1]).toBe(3);
    expect(e2[2]).toBeCloseTo(5, 12);
    expect(e2[3]).toBeCloseTo(25 / 3, 12);
  });

  it("RMA(2): seed then (prev·1 + x)/2", () => {
    expect(rma([2, 4, 8], 2)).toEqual([null, 3, 5.5]);
  });

  it("RSI = 100 on monotonically rising closes, 0 on falling, 50 on flat", () => {
    expect(rsi(ONE_TO_TEN, 3).slice(3).every((v) => v === 100)).toBe(true);
    expect(rsi([...ONE_TO_TEN].reverse(), 3).slice(3).every((v) => v === 0)).toBe(true);
    expect(rsi([5, 5, 5, 5, 5], 2).slice(2)).toEqual([50, 50, 50]);
  });

  it("RSI(3) on a short sequence computed by hand", () => {
    // closes 10, 11, 10, 12, 11
    // changes: +1, −1, +2, −1
    // seed at index 3: avgGain = (1+0+2)/3 = 1, avgLoss = (0+1+0)/3 = 1/3
    //   RS = 3 → RSI = 100 − 100/4 = 75
    // index 4 (change −1): avgGain = (1·2 + 0)/3 = 2/3, avgLoss = (1/3·2 + 1)/3 = 5/9
    //   RS = (2/3)/(5/9) = 1.2 → RSI = 100 − 100/2.2 = 54.5454…
    const r = rsi([10, 11, 10, 12, 11], 3);
    expect(r.slice(0, 3)).toEqual([null, null, null]);
    expect(r[3]).toBeCloseTo(75, 10);
    expect(r[4]).toBeCloseTo(100 - 100 / 2.2, 10);
  });

  it("population stdev and Bollinger", () => {
    // [2,4,4,4,5,5,7,9]: mean 5, population variance 4, stdev 2
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9], 8)[7]).toBeCloseTo(2, 12);
    const bb = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
    expect(bb.basis[7]).toBeCloseTo(5, 12);
    expect(bb.upper[7]).toBeCloseTo(9, 12);
    expect(bb.lower[7]).toBeCloseTo(1, 12);
  });

  it("Bollinger width on a constant series is exactly 0", () => {
    const c = new Array(30).fill(42.17);
    const bb = bollinger(c, 20, 2);
    for (let i = 19; i < 30; i++) {
      expect(bb.upper[i]).toBe(bb.basis[i]);
      expect(bb.lower[i]).toBe(bb.basis[i]);
    }
  });

  it("MACD on a constant series is 0", () => {
    const m = macd(new Array(60).fill(10), 12, 26, 9);
    expect(m.macd[25]).toBe(0);
    expect(m.hist[59]).toBe(0);
  });

  it("true range uses the previous close on gaps", () => {
    const bars: Bar[] = [
      { time: 0, open: 10, high: 11, low: 9, close: 10, volume: 1 },
      { time: 60, open: 14, high: 15, low: 13, close: 14, volume: 1 }, // gap up: |15 − 10| = 5
      { time: 120, open: 8, high: 9, low: 7, close: 8, volume: 1 }, // gap down: |7 − 14| = 7
    ];
    expect(trueRange(bars)).toEqual([2, 5, 7]);
    expect(atr(bars, 2)).toEqual([null, 3.5, 5.25]);
  });

  it("OBV signs follow close direction", () => {
    const bars: Bar[] = [10, 11, 11, 9, 12].map((c, i) => ({ time: i * 60, open: c, high: c, low: c, close: c, volume: (i + 1) * 100 }));
    // 0, +200, unchanged, −400, +500
    expect(obv(bars)).toEqual([0, 200, 200, -200, 300]);
  });

  it("Stochastic stays within 0..100 and hits the extremes", () => {
    const st = stochastic(BARS, 14, 3, 3);
    for (const s of [st.k, st.d]) expect(s.every((v) => v === null || (v >= 0 && v <= 100))).toBe(true);
    const up: Bar[] = ONE_TO_TEN.map((c, i) => ({ time: i, open: c, high: c, low: c - 1, close: c, volume: 1 }));
    expect(stochastic(up, 3, 1, 1).k[5]).toBe(100);
    const flat: Bar[] = ONE_TO_TEN.map((_, i) => ({ time: i, open: 5, high: 5, low: 5, close: 5, volume: 1 }));
    expect(stochastic(flat, 3, 1, 1).k[5]).toBe(50);
  });

  it("VWAP resets at UTC midnight", () => {
    const day = 86400;
    const t0 = 19_000 * day; // a UTC midnight
    const mk = (time: number, p: number, v: number): Bar => ({ time, open: p, high: p, low: p, close: p, volume: v });
    const bars = [mk(t0 + day - 7200, 10, 100), mk(t0 + day - 3600, 20, 300), mk(t0 + day, 50, 10), mk(t0 + day + 3600, 60, 30)];
    const v = vwap(bars);
    expect(v[0]).toBe(10);
    expect(v[1]).toBeCloseTo((10 * 100 + 20 * 300) / 400, 12); // 17.5
    expect(v[2]).toBe(50); // new session
    expect(v[3]).toBeCloseTo((50 * 10 + 60 * 30) / 40, 12); // 57.5
  });

  it("VWAP with zero volume falls back to the typical price", () => {
    const v = vwap([{ time: 0, open: 1, high: 3, low: 1, close: 2, volume: 0 }]);
    expect(v[0]).toBe(2);
  });

  it("Donchian basis is the midpoint", () => {
    const bars: Bar[] = [
      { time: 0, open: 5, high: 6, low: 4, close: 5, volume: 1 },
      { time: 1, open: 5, high: 9, low: 5, close: 8, volume: 1 },
      { time: 2, open: 8, high: 8, low: 1, close: 2, volume: 1 },
    ];
    const d = donchian(bars, 2);
    expect(d.upper).toEqual([null, 9, 9]);
    expect(d.lower).toEqual([null, 4, 1]);
    expect(d.basis).toEqual([null, 6.5, 5]);
  });

  it("invalid periods give all nulls", () => {
    expect(sma(ONE_TO_TEN, 0).every((v) => v === null)).toBe(true);
    expect(ema(ONE_TO_TEN, -1).every((v) => v === null)).toBe(true);
    expect(rsi(ONE_TO_TEN, 0).every((v) => v === null)).toBe(true);
  });
});
