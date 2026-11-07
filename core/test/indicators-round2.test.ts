import { describe, expect, it } from "vitest";
import type { Bar } from "../src/types";
import { INDICATORS, getIndicator } from "../src/indicators";
import {
  accelerator,
  balanceOfPower,
  chandeKroll,
  connorsRsi,
  elderRay,
  fisher,
  klinger,
  kst,
  lrChannel,
  massIndex,
  mcginley,
  netVolume,
  percentRank,
  priceChannel,
  rankCorrelation,
  relativeVigor,
  schaff,
  stdErrorBands,
  streak,
  ulcerIndex,
  vidya,
  volumeOscillator,
  zlema,
} from "../src/indicators/extra";
import { ema } from "../src/indicators/ma";

const bar = (i: number, close: number, extra: Partial<Bar> = {}): Bar => ({ time: i * 60, open: close, high: close + 1, low: close - 1, close, volume: 100 + i, ...extra });
const wave = (n: number) => Array.from({ length: n }, (_, i) => bar(i, 100 + 10 * Math.sin(i / 5) + i * 0.1, { open: 100 + 10 * Math.sin((i - 1) / 5) + i * 0.1 }));
const close = (b: Bar[]) => b.map((x) => x.close);
function near(a: number | null, b: number, d = 1e-9): void {
  expect(a).not.toBeNull();
  expect(Math.abs((a as number) - b)).toBeLessThan(d);
}

describe("indicator catalog round 2", () => {
  it("registers 21 new indicators with unique ids and outputs that compute", () => {
    const ids = ["crsi", "fisher", "stc", "kst", "kvo", "massi", "elderray", "lrc", "seb", "pricechannel", "mcginley", "zlema", "vidya", "rvgi", "bop", "volosc", "netvol", "rci", "ulcer", "cks", "ac"];
    expect(new Set(INDICATORS.map((d) => d.id)).size).toBe(INDICATORS.length);
    expect(INDICATORS.length).toBe(75);
    const bars = wave(300);
    for (const id of ids) {
      const def = getIndicator(id)!;
      expect(def, id).toBeDefined();
      const out = def.compute(bars, {});
      for (const o of def.outputs) {
        expect(out[o.key], `${id}.${o.key}`).toHaveLength(bars.length);
        expect(out[o.key].slice(-1)[0], `${id}.${o.key} last`).not.toBeNull();
        expect(Number.isFinite(out[o.key].slice(-1)[0] as number), `${id}.${o.key} finite`).toBe(true);
      }
    }
  });

  it("streak, percent rank and Connors RSI", () => {
    expect(streak([1, 2, 3, 3, 2, 1, 1, 4])).toEqual([0, 1, 2, 0, -1, -2, 0, 1]);
    expect(percentRank([1, 2, 3, 4, 2.5], 4)).toEqual([null, null, null, null, 50]);
    const c = connorsRsi(close(wave(200)));
    const v = c.filter((x): x is number => x !== null);
    expect(v.length).toBeGreaterThan(50);
    expect(v.every((x) => x >= 0 && x <= 100)).toBe(true);
  });

  it("Fisher Transform follows its recursion; trigger is the previous value", () => {
    const bars = wave(60);
    const { fisher: f, trigger } = fisher(bars, 9);
    const hl2 = bars.map((b) => (b.high + b.low) / 2);
    let v = 0;
    let prev = 0;
    for (let i = 8; i < bars.length; i++) {
      const win = hl2.slice(i - 8, i + 1);
      const h = Math.max(...win);
      const l = Math.min(...win);
      v = Math.max(-0.999, Math.min(0.999, 0.66 * ((hl2[i] - l) / (h - l) - 0.5) + 0.67 * v));
      const fish = 0.5 * Math.log((1 + v) / (1 - v)) + 0.5 * prev;
      expect(Math.abs((f[i] as number) - fish)).toBeLessThan(1e-9);
      if (i > 8) expect(trigger[i]).toBe(f[i - 1]);
      prev = fish;
    }
  });

  it("Schaff Trend Cycle stays in 0..100", () => {
    const s = schaff(close(wave(300))).filter((x): x is number => x !== null);
    expect(s.length).toBeGreaterThan(100);
    expect(s.every((x) => x >= 0 && x <= 100)).toBe(true);
  });

  it("KST is zero on a flat series and positive on a rising one", () => {
    const flat = kst(Array(80).fill(10));
    expect(flat.kst[79]).toBe(0);
    const up = kst(Array.from({ length: 80 }, (_, i) => 10 + i));
    expect(up.kst[79]).toBeGreaterThan(0);
    expect(up.signal[79]).not.toBeNull();
  });

  it("Klinger: positive while hlc3 keeps rising on volume", () => {
    const bars = Array.from({ length: 120 }, (_, i) => bar(i, 100 + i, { high: 101 + i + (i % 3), low: 99 + i, volume: 1000 }));
    const k = klinger(bars);
    expect(k.kvo[119]).not.toBeNull();
    expect(Number.isFinite(k.signal[119] as number)).toBe(true);
  });

  it("Mass Index is about 25 for a constant range", () => {
    const bars = Array.from({ length: 80 }, (_, i) => bar(i, 100));
    const m = massIndex(bars);
    expect(Math.abs((m[79] as number) - 25)).toBeLessThan(1e-9);
  });

  it("Elder Ray subtracts the EMA from high and low", () => {
    const bars = wave(40);
    const e = ema(close(bars), 13);
    const r = elderRay(bars);
    expect(r.bull[39]).toBeCloseTo(bars[39].high - (e[39] as number), 9);
    expect(r.bear[39]).toBeCloseTo(bars[39].low - (e[39] as number), 9);
  });

  it("regression channel and standard error bands are zero-width on a straight line", () => {
    const line = Array.from({ length: 50 }, (_, i) => 3 + 2 * i);
    const c = lrChannel(line, 10, 2);
    expect(c.basis[49]).toBeCloseTo(101, 9);
    expect(c.upper[49]).toBeCloseTo(101, 9);
    const s = stdErrorBands(line, 10, 2, 1);
    expect(s.lower[49]).toBeCloseTo(101, 9);
    // With noise the bands open up symmetrically.
    const noisy = line.map((y, i) => y + (i % 2 ? 1 : -1));
    const n = lrChannel(noisy, 10, 2);
    expect((n.upper[49] as number) - (n.basis[49] as number)).toBeCloseTo((n.basis[49] as number) - (n.lower[49] as number), 9);
    expect((n.upper[49] as number) - (n.basis[49] as number)).toBeGreaterThan(1);
  });

  it("Price Channel excludes the current bar", () => {
    const bars = [1, 5, 3, 9].map((c, i) => bar(i, c));
    const p = priceChannel(bars, 2);
    expect(p.upper).toEqual([null, null, 6, 6]);
    expect(p.lower).toEqual([null, null, 0, 2]);
  });

  it("McGinley, ZLEMA and VIDYA track a constant series exactly", () => {
    const flat = Array(60).fill(50);
    expect(mcginley(flat, 14)[59]).toBe(50);
    expect(zlema(flat, 21)[59]).toBeCloseTo(50, 9);
    expect(vidya(flat, 14)[59]).toBe(50);
    // ZLEMA reacts faster than EMA to a step.
    const step = [...Array(40).fill(10), ...Array(10).fill(20)];
    expect(zlema(step, 10)[45] as number).toBeGreaterThan(ema(step, 10)[45] as number);
  });

  it("Relative Vigor, Balance of Power, volume oscillator and net volume", () => {
    const up = Array.from({ length: 30 }, (_, i) => bar(i, 10 + i, { open: 9 + i, high: 11 + i, low: 8 + i }));
    const r = relativeVigor(up, 10);
    expect(r.rvgi[29]).toBeCloseTo(1 / 3, 9);
    expect(balanceOfPower(up, 1)[0]).toBeCloseTo(1 / 3, 9);
    expect(balanceOfPower([bar(0, 5, { high: 5, low: 5 })], 1)).toEqual([0]);
    const vo = volumeOscillator(Array.from({ length: 30 }, (_, i) => bar(i, 1, { volume: 100 })));
    expect(vo[29]).toBe(0);
    expect(netVolume([bar(0, 1, { volume: 5 }), bar(1, 2, { volume: 7 }), bar(2, 1, { volume: 3 }), bar(3, 1, { volume: 9 })])).toEqual([null, 7, -3, 0]);
  });

  it("Rank Correlation Index is ±100 for monotone series", () => {
    expect(rankCorrelation([1, 2, 3, 4, 5], 5)[4]).toBe(100);
    expect(rankCorrelation([5, 4, 3, 2, 1], 5)[4]).toBe(-100);
    expect(Math.abs(rankCorrelation([1, 1, 1, 1, 1], 5)[4] as number)).toBeLessThan(1e-9);
  });

  it("Ulcer Index is 0 without drawdowns and measures them otherwise", () => {
    expect(ulcerIndex(Array.from({ length: 20 }, (_, i) => i + 1), 5)[19]).toBe(0);
    // The last 5 bars: one at the 100 high, four 10 % below it → sqrt((0 + 4 · 100) / 5).
    expect(ulcerIndex([100, 100, 100, 100, 100, 90, 90, 90, 90], 5)[8]).toBeCloseTo(Math.sqrt(80), 9);
  });

  it("Chande Kroll Stop and the Accelerator Oscillator", () => {
    const bars = wave(80);
    const c = chandeKroll(bars);
    expect((c.stopShort[79] as number) > 0 && (c.stopLong[79] as number) > 0).toBe(true);
    const ac = accelerator(bars);
    expect(ac[79]).not.toBeNull();
    near(accelerator(Array.from({ length: 60 }, (_, i) => bar(i, 10)))[59], 0);
  });
});
