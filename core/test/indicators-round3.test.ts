import { describe, expect, it } from "vitest";
import type { Bar } from "../src/types";
import { getIndicator } from "../src/indicators";
import { alligator, fractals, projectForward, smiErgodic, squeeze, woodiesCci } from "../src/indicators/composite";
import { autoPeriod, periodKey, pivotLevels, pivotPoints, previousPeriod } from "../src/indicators/levels";
import { cci } from "../src/indicators/momentum";
import { rma } from "../src/indicators/ma";

const DAY = 86400;
const bar = (time: number, open: number, high: number, low: number, close: number): Bar => ({ time, open, high, low, close, volume: 1 });
/** Hourly bars over several UTC days; prices follow a slow wave. */
const hourly = (days: number, start = Date.UTC(2026, 0, 5) / 1000): Bar[] =>
  Array.from({ length: days * 24 }, (_, i) => {
    const m = 100 + 10 * Math.sin(i / 9) + i * 0.05;
    return bar(start + i * 3600, m - 0.2, m + 1 + (i % 5) * 0.1, m - 1 - (i % 3) * 0.1, m + 0.2);
  });
const wave = (n: number): Bar[] =>
  Array.from({ length: n }, (_, i) => {
    const m = 50 + 8 * Math.sin(i / 6) + 3 * Math.sin(i / 2.3);
    return bar(i * DAY, m - 0.3, m + 1, m - 1, m + 0.3);
  });

describe("pivot points", () => {
  const prev = { open: 100, high: 110, low: 90, close: 105 };

  it("computes the six formula types from the previous period", () => {
    const t = pivotLevels("traditional", prev, 104);
    const p = (110 + 90 + 105) / 3;
    expect(t.p).toBeCloseTo(p);
    expect(t.r1).toBeCloseTo(2 * p - 90);
    expect(t.s1).toBeCloseTo(2 * p - 110);
    expect(t.r2).toBeCloseTo(p + 20);
    expect(t.r3).toBeCloseTo(110 + 2 * (p - 90));
    expect(t.s5).toBeCloseTo(p * 4 - (4 * 110 - 90));
    const f = pivotLevels("fibonacci", prev, 104);
    expect(f.r1).toBeCloseTo(p + 0.382 * 20);
    expect(f.s3).toBeCloseTo(p - 20);
    expect(f.r4).toBeUndefined();
    const w = pivotLevels("woodie", prev, 104);
    expect(w.p).toBeCloseTo((110 + 90 + 2 * 104) / 4);
    const c = pivotLevels("classic", prev, 104);
    expect(c.r4).toBeCloseTo(p + 60);
    const d = pivotLevels("demark", prev, 104); // close > open: X = 2H + L + C
    expect(d.p).toBeCloseTo((2 * 110 + 90 + 105) / 4);
    expect(d.r2).toBeUndefined();
    const cam = pivotLevels("camarilla", prev, 104);
    expect(cam.r4).toBeCloseTo(105 + (1.1 * 20) / 2);
    expect(cam.r5).toBeCloseTo((110 / 90) * 105);
    expect(cam.s5).toBeCloseTo(105 - (cam.r5! - 105));
  });

  it("holds the previous UTC day's levels on every bar of the day and leaves the first day empty", () => {
    const bars = hourly(3);
    const out = pivotPoints(bars, "traditional", "day");
    expect(out.p.slice(0, 24).every((v) => v === null)).toBe(true);
    const day1 = bars.slice(0, 24);
    const h = Math.max(...day1.map((b) => b.high));
    const l = Math.min(...day1.map((b) => b.low));
    const c = day1[23].close;
    expect(out.p[24]).toBeCloseTo((h + l + c) / 3);
    expect(new Set(out.p.slice(24, 48)).size).toBe(1);
    expect(out.p[48]).not.toBe(out.p[24]);
  });

  it("groups weeks from Monday and months by calendar", () => {
    const mon = Date.UTC(2026, 0, 5) / 1000; // a Monday
    expect(periodKey(mon - 1, "week")).toBe(periodKey(mon, "week") - 1);
    expect(periodKey(mon + 6 * DAY, "week")).toBe(periodKey(mon, "week"));
    expect(periodKey(Date.UTC(2026, 1, 1) / 1000, "month")).toBe(periodKey(Date.UTC(2026, 0, 31) / 1000, "month") + 1);
  });

  it("picks the period from the bar spacing in Auto", () => {
    expect(autoPeriod(hourly(2).filter((_, i) => i % 1 === 0))).toBe("week");
    const fiveMin = Array.from({ length: 50 }, (_, i) => bar(i * 300, 1, 1, 1, 1));
    expect(autoPeriod(fiveMin)).toBe("day");
    expect(autoPeriod(wave(30))).toBe("month");
    expect(autoPeriod(Array.from({ length: 30 }, (_, i) => bar(i * 7 * DAY, 1, 1, 1, 1)))).toBe("year");
  });

  it("brings the catalog to 82 indicators", async () => {
    const { INDICATORS } = await import("../src/indicators");
    expect(INDICATORS.length).toBe(82);
    for (const id of ["pivots", "prevhl", "alligator", "fractals", "squeeze", "smiergodic", "woodiescci"]) expect(getIndicator(id)).toBeDefined();
  });

  it("is registered with its type and period choices", () => {
    const def = getIndicator("pivots")!;
    expect(def.inputs.map((i) => i.options?.length)).toEqual([6, 5]);
    expect(def.outputs.every((o) => o.style === "steps")).toBe(true);
    const out = def.compute(hourly(3), { type: 5, period: 1 });
    expect(out.r4[30]).toBeCloseTo(previousPeriod(hourly(3), "day").close[30]! + (1.1 * (Math.max(...hourly(3).slice(0, 24).map((b) => b.high)) - Math.min(...hourly(3).slice(0, 24).map((b) => b.low)))) / 2);
  });
});

describe("previous period high / low", () => {
  it("shows the previous day's high, low and close", () => {
    const bars = hourly(2);
    const p = previousPeriod(bars, "day");
    expect(p.high[0]).toBeNull();
    expect(p.high[30]).toBe(Math.max(...bars.slice(0, 24).map((b) => b.high)));
    expect(p.low[47]).toBe(Math.min(...bars.slice(0, 24).map((b) => b.low)));
    expect(p.close[24]).toBe(bars[23].close);
  });
});

describe("Williams Alligator and Fractals", () => {
  it("displaces smoothed averages of the median price into the future", () => {
    const bars = wave(60);
    const a = alligator(bars);
    expect(a.jaw.length).toBe(60 + 8);
    expect(a.lips.length).toBe(60 + 3);
    const m = rma(bars.map((b) => (b.high + b.low) / 2), 13);
    expect(a.jaw[20 + 8]).toBeCloseTo(m[20]!);
    expect(projectForward([1, null, 3], 2)).toEqual([null, null, 1, null, 3]);
  });

  it("marks highs above and lows below the bars on both sides", () => {
    const highs = [1, 2, 5, 2, 1, 1, 1];
    const bars = highs.map((h, i) => bar(i, h, h, h === 1 && i === 5 ? -3 : h - 0.5, h));
    const f = fractals(bars, 2);
    expect(f.up[2]).toBe(5);
    expect(f.up.filter((v) => v !== null)).toHaveLength(1);
    expect(f.down[5]).toBeNull(); // only 1 bar after it: not confirmed yet
    expect(f.up[5]).toBeNull();
  });
});

describe("Squeeze Momentum, SMI Ergodic, Woodies CCI", () => {
  it("flags the squeeze when the bands are inside the channel", () => {
    const flat = Array.from({ length: 60 }, (_, i) => bar(i * DAY, 100, 101 + (i % 2), 99 - (i % 2), 100 + (i % 2) * 0.01));
    const s = squeeze(flat);
    expect(s.squeeze[59]).toBe(0);
    const trending = Array.from({ length: 60 }, (_, i) => bar(i * DAY, 100 + i * 3, 100.5 + i * 3, 99.5 + i * 3, 100 + i * 3 + 0.4));
    const t = squeeze(trending);
    expect(t.squeeze[59]).toBeNull();
    expect(t.momentum[59]).toBeGreaterThan(0);
  });

  it("keeps the ergodic ratio in -1..1 with a signal and oscillator", () => {
    const closes = wave(120).map((b) => b.close);
    const e = smiErgodic(closes);
    const vals = e.smi.filter((v): v is number => v !== null);
    expect(vals.length).toBeGreaterThan(50);
    expect(vals.every((v) => v >= -1 && v <= 1)).toBe(true);
    expect(e.osc[119]).toBeCloseTo(e.smi[119]! - e.signal[119]!);
    const up = smiErgodic(Array.from({ length: 60 }, (_, i) => i));
    expect(up.smi[59]).toBeCloseTo(1);
  });

  it("pairs a CCI histogram with a turbo CCI", () => {
    const x = wave(80).map((b) => b.close);
    const w = woodiesCci(x);
    expect(w.cci).toEqual(cci(x, 14));
    expect(w.turbo).toEqual(cci(x, 6));
  });
});
