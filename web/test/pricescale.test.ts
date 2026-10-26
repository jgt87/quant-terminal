import { describe, expect, it } from "vitest";
import { niceStep, niceTicks, PriceScale } from "../src/chart/PriceScale";
import { formatPrice, priceDecimals, stepDecimals } from "../src/chart/format";

describe("nice ticks", () => {
  it("picks 1/2/2.5/5 x 10^n steps", () => {
    expect(niceStep(0.9)).toBe(1);
    expect(niceStep(1.1)).toBe(2);
    expect(niceStep(2.2)).toBe(2.5);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(6)).toBe(10);
    expect(niceStep(130)).toBe(200);
    expect(niceStep(0.0031)).toBeCloseTo(0.005, 12);
    expect(niceStep(2.5)).toBe(2.5);
  });

  it("ticks are multiples of the step inside the range", () => {
    const { step, values } = niceTicks(101.3, 187.9, 8);
    expect(step).toBe(20);
    expect(values).toEqual([120, 140, 160, 180]);
    const small = niceTicks(1.0812, 1.0899, 6);
    for (const v of small.values) {
      expect(Math.abs(v / small.step - Math.round(v / small.step))).toBeLessThan(1e-6);
      expect(v).toBeGreaterThanOrEqual(1.0812);
      expect(v).toBeLessThanOrEqual(1.0899);
    }
  });

  it("formats by magnitude", () => {
    expect(priceDecimals(18234.5)).toBe(2);
    expect(priceDecimals(5.2)).toBe(4);
    expect(priceDecimals(1.0834, true)).toBe(5);
    expect(formatPrice(-3.5, 2)).toBe("−3.50");
    expect(stepDecimals(0.25)).toBe(2);
    expect(stepDecimals(50)).toBe(0);
  });
});

describe("PriceScale", () => {
  it("linear y <-> price round trip with margins", () => {
    const ps = new PriceScale();
    ps.setHeight(400);
    ps.fit(100, 200);
    expect(ps.toY(200)).toBeCloseTo(400 * ps.marginTop, 9);
    expect(ps.toY(100)).toBeCloseTo(400 * (1 - ps.marginBottom), 9);
    for (const p of [90, 100, 150.25, 200, 210]) expect(ps.fromY(ps.toY(p))).toBeCloseTo(p, 9);
  });

  it("log mode round trip and equal ratios map to equal distances", () => {
    const ps = new PriceScale();
    ps.setHeight(500);
    ps.setLog(true);
    ps.fit(10, 1000);
    for (const p of [5, 10, 31.6, 100, 999, 2000]) expect(ps.fromY(ps.toY(p))).toBeCloseTo(p, 6);
    const d1 = ps.toY(10) - ps.toY(100);
    const d2 = ps.toY(100) - ps.toY(1000);
    expect(d1).toBeCloseTo(d2, 9);
    const ticks = ps.ticks();
    expect(ticks.length).toBeGreaterThan(2);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i].price).toBeGreaterThan(ticks[i - 1].price);
  });

  it("manual scale disables auto-fit until reset", () => {
    const ps = new PriceScale();
    ps.setHeight(300);
    ps.fit(10, 20);
    ps.scaleBy(50);
    expect(ps.auto).toBe(false);
    expect(ps.max - ps.min).toBeGreaterThan(10);
    ps.fit(0, 1);
    expect(ps.min).not.toBe(0);
    ps.resetAuto();
    ps.fit(0, 1);
    expect(ps.min).toBe(0);
    expect(ps.max).toBe(1);
  });
});

describe("percent scale", () => {
  it("maps prices to % change from the base and back", async () => {
    const { toPercent, fromPercent, formatPercentLabel } = await import("../src/chart/PriceScale");
    expect(toPercent(110, 100)).toBeCloseTo(10, 12);
    expect(toPercent(95, 100)).toBeCloseTo(-5, 12);
    expect(fromPercent(10, 100)).toBeCloseTo(110, 12);
    expect(fromPercent(toPercent(1.2345, 1.1), 1.1)).toBeCloseTo(1.2345, 12);
    expect(toPercent(5, 0)).toBe(0);
    expect(formatPercentLabel(1.5)).toBe("+1.50%");
    expect(formatPercentLabel(-0.25)).toBe("-0.25%");
    expect(formatPercentLabel(-1e-12)).toBe("0.00%");
  });

  it("labels ticks in percent while keeping price-space positions", () => {
    const ps = new PriceScale();
    ps.setHeight(400);
    ps.setRange(90, 120);
    ps.percentBase = 100;
    const ticks = ps.ticks();
    expect(ticks.length).toBeGreaterThan(2);
    for (const t of ticks) {
      expect(t.text.endsWith("%")).toBe(true);
      expect(t.y).toBeCloseTo(ps.toY(t.price), 9);
    }
    expect(ticks.some((t) => t.text === "0%" || t.text === "+0%" || t.text === "0.00%")).toBe(true);
    expect(ps.format(110)).toBe("+10.00%");
  });
});
