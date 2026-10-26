import { describe, expect, it } from "vitest";
import type { Bar } from "../src/types";
import {
  barIndexAtOrAfter,
  barIndexAtOrBefore,
  capturePattern,
  forecastInBox,
  ghostCandles,
  hitSector,
  patternLineValue,
  positionOutcome,
  positionPrices,
  positionSize,
  positionStats,
  predictionOutcome,
  riskAmount,
  riskReward,
  roundQty,
  sectorGeometry,
  tickSizeFor,
  ticksIn,
  transformPattern,
} from "../src/drawings/projection";

const bar = (time: number, open: number, high: number, low: number, close: number, volume = 100): Bar => ({ time, open, high, low, close, volume });

describe("bar lookup", () => {
  const bars = [bar(10, 1, 1, 1, 1), bar(20, 1, 1, 1, 1), bar(30, 1, 1, 1, 1)];
  it("finds indices at or after / at or before a time", () => {
    expect(barIndexAtOrAfter(bars, 5)).toBe(0);
    expect(barIndexAtOrAfter(bars, 20)).toBe(1);
    expect(barIndexAtOrAfter(bars, 21)).toBe(2);
    expect(barIndexAtOrAfter(bars, 31)).toBe(3);
    expect(barIndexAtOrBefore(bars, 5)).toBe(-1);
    expect(barIndexAtOrBefore(bars, 20)).toBe(1);
    expect(barIndexAtOrBefore(bars, 29)).toBe(1);
    expect(barIndexAtOrBefore(bars, 99)).toBe(2);
  });
});

describe("ticks", () => {
  it("tick size follows the displayed decimals", () => {
    expect(tickSizeFor(150)).toBeCloseTo(0.01);
    expect(tickSizeFor(1.2345)).toBeCloseTo(0.0001);
    expect(tickSizeFor(0.05)).toBeCloseTo(0.00001);
    expect(ticksIn(-1.5, 0.01)).toBe(150);
  });
});

describe("position sizing", () => {
  const inputs = { accountSize: 1000, risk: 25, riskMode: "percents" as const, lotSize: 1, qtyPrecision: "default" as const };

  it("risk amount: percent of account or cash (capped)", () => {
    expect(riskAmount(inputs)).toBe(250);
    expect(riskAmount({ ...inputs, riskMode: "money", risk: 40 })).toBe(40);
    expect(riskAmount({ ...inputs, riskMode: "money", risk: 5000 })).toBe(1000);
    expect(riskAmount({ ...inputs, risk: 150 })).toBe(1000);
  });

  it("qty = risk ÷ stop distance, rounded down to the precision and lot size", () => {
    // 250 / (100 − 97) = 83.333… → 83.33 (default 2 decimals)
    expect(positionSize(inputs, 100, 97).qty).toBe(83.33);
    expect(positionSize({ ...inputs, qtyPrecision: 0 }, 100, 97).qty).toBe(83);
    // Lots of 10 units: 250 / (3 × 10) = 8.333 → 8 lots = 80 units.
    const s = positionSize({ ...inputs, lotSize: 10, qtyPrecision: 0 }, 100, 97);
    expect(s.qty).toBe(8);
    expect(s.units).toBe(80);
    expect(positionSize(inputs, 100, 100).qty).toBe(0);
  });

  it("roundQty never rounds up", () => {
    expect(roundQty(1.999, 2)).toBe(1.99);
    expect(roundQty(0.3, 1)).toBe(0.3);
    expect(roundQty(5.5, 0)).toBe(5);
  });

  it("levels from ticks for long and short", () => {
    expect(positionPrices("long", 100, 300, 600, 0.01)).toEqual({ entry: 100, stop: 97, target: 106 });
    expect(positionPrices("short", 100, 300, 600, 0.01)).toEqual({ entry: 100, stop: 103, target: 94 });
  });

  it("risk/reward and stats", () => {
    expect(riskReward(100, 97, 106)).toBe(2);
    expect(riskReward(100, 100, 106)).toBe(0);
    const st = positionStats("long", { entry: 100, stop: 97, target: 106 }, { ...inputs, qtyPrecision: 0 }, 0.01);
    expect(st.riskReward).toBe(2);
    expect(st.qty).toBe(83);
    expect(st.tpTicks).toBe(600);
    expect(st.slTicks).toBe(300);
    expect(st.tpPercent).toBeCloseTo(6);
    expect(st.tpAmount).toBeCloseTo(498);
    expect(st.slAmount).toBeCloseTo(249);
  });
});

describe("position outcome", () => {
  const lv = { entry: 100, stop: 97, target: 106 };
  it("pending without bars after the entry", () => {
    expect(positionOutcome("long", lv, [bar(0, 100, 100, 100, 100)], 0, 100).status).toBe("pending");
  });

  it("open: neither level reached, P&L at the last close in range", () => {
    const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 102, 99, 101), bar(2, 101, 103, 100, 102), bar(9, 102, 120, 80, 110)];
    const o = positionOutcome("long", lv, bars, 0, 5);
    expect(o.status).toBe("open");
    expect(o.price).toBe(102);
    expect(o.change).toBe(2);
  });

  it("target first / stop first", () => {
    const up = [bar(0, 100, 100, 100, 100), bar(1, 100, 107, 99, 106)];
    expect(positionOutcome("long", lv, up, 0, 10)).toMatchObject({ status: "target", price: 106, change: 6, index: 1 });
    const down = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 96, 97)];
    expect(positionOutcome("long", lv, down, 0, 10)).toMatchObject({ status: "stop", price: 97, change: -3 });
    const short = { entry: 100, stop: 103, target: 94 };
    expect(positionOutcome("short", short, down, 0, 10).status).toBe("open");
    expect(positionOutcome("short", short, [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 93, 94)], 0, 10)).toMatchObject({ status: "target", change: 6 });
  });

  it("both levels in one bar: rising bar = low first, falling bar = high first", () => {
    const rising = [bar(0, 100, 100, 100, 100), bar(1, 100, 107, 96, 105)];
    const falling = [bar(0, 100, 100, 100, 100), bar(1, 100, 107, 96, 98)];
    expect(positionOutcome("long", lv, rising, 0, 10).status).toBe("stop");
    expect(positionOutcome("long", lv, falling, 0, 10).status).toBe("target");
    const short = { entry: 100, stop: 104, target: 96 };
    const r2 = [bar(0, 100, 100, 100, 100), bar(1, 100, 105, 95, 103)];
    const f2 = [bar(0, 100, 100, 100, 100), bar(1, 100, 105, 95, 97)];
    expect(positionOutcome("short", short, r2, 0, 10).status).toBe("target");
    expect(positionOutcome("short", short, f2, 0, 10).status).toBe("stop");
  });

  it("gap through a level exits at the open", () => {
    const gap = [bar(0, 100, 100, 100, 100), bar(1, 95, 96, 94, 95)];
    expect(positionOutcome("long", lv, gap, 0, 10)).toMatchObject({ status: "stop", price: 95, change: -5 });
  });
});

describe("prediction outcome", () => {
  const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 104, 99, 103), bar(2, 103, 106, 102, 105), bar(3, 105, 106, 104, 104)];
  it("pending until the end bar exists", () => {
    expect(predictionOutcome({ time: 0, price: 100 }, { time: 10, price: 110 }, bars).status).toBe("pending");
    expect(predictionOutcome({ time: 0, price: 100 }, { time: 1, price: 110 }, []).status).toBe("pending");
  });
  it("success when the target was reached, with the actual change", () => {
    const o = predictionOutcome({ time: 0, price: 100 }, { time: 2, price: 105 }, bars);
    expect(o.status).toBe("success");
    expect(o.endPrice).toBe(105);
    expect(o.change).toBe(5);
    expect(o.percent).toBeCloseTo(5);
  });
  it("failure otherwise (also for down forecasts)", () => {
    expect(predictionOutcome({ time: 0, price: 100 }, { time: 3, price: 110 }, bars).status).toBe("failure");
    expect(predictionOutcome({ time: 0, price: 100 }, { time: 3, price: 98 }, bars).status).toBe("failure");
    expect(predictionOutcome({ time: 0, price: 100 }, { time: 3, price: 99 }, bars).status).toBe("success");
  });
});

describe("bars pattern", () => {
  const bars = [bar(0, 10, 12, 9, 11), bar(1, 11, 13, 10, 12), bar(2, 12, 15, 11, 14), bar(3, 1, 1, 1, 1)];
  it("captures bars between two times relative to a base", () => {
    expect(capturePattern(bars, 2, 1, 10)).toEqual([
      [1, 3, 0, 2],
      [2, 5, 1, 4],
    ]);
  });
  it("mirrored reverses time, flipped turns it upside down", () => {
    const p = capturePattern(bars, 0, 1, 10);
    expect(transformPattern(p, { mirrored: true })).toEqual([
      [2, 3, 0, 1],
      [1, 2, -1, 0],
    ]);
    expect(transformPattern(p, { flipped: true })[0]).toEqual([-0, 1, -2, -1]);
    expect(transformPattern(p, {})).toEqual(p);
  });
  it("line modes", () => {
    const b: [number, number, number, number] = [1, 4, 0, 3];
    expect(patternLineValue(b, 1)).toBe(3);
    expect(patternLineValue(b, 3)).toBe(1);
    expect(patternLineValue(b, 4)).toBe(4);
    expect(patternLineValue(b, 5)).toBe(0);
    expect(patternLineValue(b, 6)).toBe(2);
  });
});

describe("ghost feed", () => {
  it("one candle per bar slot along the path, open = previous close", () => {
    const c = ghostCandles([{ time: 0, price: 100 }, { time: 4, price: 104 }, { time: 6, price: 100 }], 1, 50);
    expect(c.length).toBe(6);
    expect(c[0]).toMatchObject({ time: 1, open: 100, close: 101 });
    expect(c[3].close).toBe(104);
    expect(c[4].open).toBe(104);
    expect(c[5].close).toBe(100);
    for (const k of c) {
      expect(k.high).toBeGreaterThanOrEqual(Math.max(k.open, k.close));
      expect(k.low).toBeLessThanOrEqual(Math.min(k.open, k.close));
      expect(k.high - Math.max(k.open, k.close)).toBeLessThanOrEqual(Math.abs(k.close - k.open) * 0.5 + 1e-9);
    }
    // Deterministic.
    expect(ghostCandles([{ time: 0, price: 100 }, { time: 4, price: 104 }], 1, 50)).toEqual(ghostCandles([{ time: 0, price: 100 }, { time: 4, price: 104 }], 1, 50));
    expect(ghostCandles([{ time: 0, price: 1 }], 1, 50)).toEqual([]);
  });
  it("variance 0 gives wickless candles", () => {
    for (const k of ghostCandles([{ time: 0, price: 1 }, { time: 3, price: 4 }], 1, 0)) {
      expect(k.high).toBe(Math.max(k.open, k.close));
      expect(k.low).toBe(Math.min(k.open, k.close));
    }
  });
});

describe("sector", () => {
  const g = sectorGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 });
  it("geometry: radius and shortest sweep", () => {
    expect(g.radius).toBe(100);
    expect(g.sweep).toBeCloseTo(Math.PI / 2);
    expect(sectorGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: -100 }).sweep).toBeCloseTo(-Math.PI / 2);
  });
  it("hit inside / on the arms, miss outside", () => {
    expect(hitSector(g, 50, 50, 3)).toBe(true);
    expect(hitSector(g, 50, 1, 3)).toBe(true);
    expect(hitSector(g, -50, 50, 3)).toBe(false);
    expect(hitSector(g, 90, 90, 3)).toBe(false);
  });
  it("box hit", () => {
    expect(forecastInBox(5, 5, { x: 0, y: 0 }, { x: 10, y: 10 })).toBe(true);
    expect(forecastInBox(15, 5, { x: 0, y: 0 }, { x: 10, y: 10 }, 3)).toBe(false);
  });
});
