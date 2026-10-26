import { describe, expect, it } from "vitest";
import type { Bar } from "../src/types";
import { pivots, zigzag } from "../src/analysis/pivots";
import { autoFib } from "../src/analysis/autofib";
import { detectChartPatterns } from "../src/analysis/chartPatterns";
import { fibLevels } from "../src/drawings/geometry";

const D = 86400;

function fromHighs(highs: number[]): Bar[] {
  return highs.map((h, i) => ({ time: i * D, open: h - 0.5, high: h, low: h - 1, close: h - 0.5, volume: 1 }));
}
function line(prices: number[]): Bar[] {
  return prices.map((p, i) => ({ time: i * D, open: p, high: p, low: p, close: p, volume: 1 }));
}
/**
 * Bars that walk linearly between waypoints, `steps` bars per leg. Waypoint k is reached
 * at bar k·steps, where that bar's high (or low) equals the waypoint exactly.
 */
function wave(points: number[], steps = 5): Bar[] {
  const closes = [points[0]];
  for (let k = 1; k < points.length; k++) {
    for (let s = 1; s <= steps; s++) closes.push(points[k - 1] + ((points[k] - points[k - 1]) * s) / steps);
  }
  return closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1];
    return { time: i * D, open: o, high: Math.max(o, c), low: Math.min(o, c), close: c, volume: 1 };
  });
}

describe("pivots", () => {
  it("fractal highs and lows need full windows on both sides", () => {
    // highs 1 2 5 3 2 4 1, lows = highs − 1
    const bars = fromHighs([1, 2, 5, 3, 2, 4, 1]);
    expect(pivots(bars, 2, 2).map((p) => [p.kind, p.index])).toEqual([["high", 2]]);
    expect(pivots(bars, 1, 1).map((p) => [p.kind, p.index, p.price])).toEqual([
      ["high", 2, 5],
      ["low", 4, 1],
      ["high", 5, 4],
    ]);
  });
  it("the first bar of an equal-high plateau wins", () => {
    expect(pivots(fromHighs([1, 3, 3, 1]), 1, 1).filter((p) => p.kind === "high").map((p) => p.index)).toEqual([1]);
  });
});

describe("zigzag", () => {
  it("reverses on a 5% retracement and ends with the provisional extreme", () => {
    // 100 → 106 (≥ 5% up: low pivot at bar 0) → 110 → 104 (≤ 104.5: high pivot 110 at bar 2)
    // → 98 → 103 (≥ 102.9: low pivot 98 at bar 4) → 108 → 115 → 112 (not ≤ 109.25): provisional high 115.
    const z = zigzag(line([100, 106, 110, 104, 98, 103, 108, 115, 112]), 5, 1);
    expect(z.map((p) => [p.kind, p.index, p.price])).toEqual([
      ["low", 0, 100],
      ["high", 2, 110],
      ["low", 4, 98],
      ["high", 7, 115],
    ]);
  });
  it("small moves produce no pivots", () => {
    expect(zigzag(line([100, 101, 100.5, 101.5, 100.2]), 5, 1)).toEqual([]);
  });
  it("moves the last pivot when price breaks beyond it without a full reversal", () => {
    // 105.1 >= 105 confirms low pivot 100. 99.9 is not a 5% drop from 105.1 (99.845) but is
    // below the pivot, so the low pivot moves to bar 2; 106 is the provisional high.
    const z = zigzag(line([100, 105.1, 99.9, 106]), 5, 1);
    expect(z.map((p) => [p.kind, p.index, p.price])).toEqual([
      ["low", 2, 99.9],
      ["high", 3, 106],
    ]);
  });
});

describe("autoFib", () => {
  it("anchors the last swing: a = start, b = end", () => {
    const bars = line([100, 106, 110, 104, 98, 103, 108, 115, 112]);
    const f = autoFib(bars, { deviationPct: 5 })!;
    expect(f).toEqual({ a: { time: 4 * D, price: 98 }, b: { time: 7 * D, price: 115 } });
    // Ratio 0 at b (115), 1 at a (98), 0.5 at 106.5.
    expect(fibLevels(f.a, f.b, [0, 0.5, 1]).map((l) => l.price)).toEqual([115, 106.5, 98]);
  });
  it("returns null without a swing", () => {
    expect(autoFib(line([100, 101, 100]), { deviationPct: 5 })).toBeNull();
  });
});

describe("detectChartPatterns", () => {
  const names = (bars: Bar[]) => detectChartPatterns(bars).map((p) => p.name);
  const find = (bars: Bar[], name: string) => detectChartPatterns(bars).find((p) => p.name === name);

  it("double top / bottom with measured-move targets", () => {
    const top = find(wave([100, 120, 108, 120.5, 104]), "double-top")!;
    expect(top.points.map((p) => p.price)).toEqual([120, 108, 120.5]);
    expect(top.target).toBeCloseTo(108 - (120.5 - 108), 9); // 95.5
    expect([top.startIndex, top.endIndex]).toEqual([5, 15]);
    const bot = find(wave([120, 100, 112, 100.5, 118]), "double-bottom")!;
    expect(bot.target).toBeCloseTo(112 + (112 - 100), 9); // 124
  });

  it("triple top / bottom (and no double inside them)", () => {
    const t = wave([100, 120, 108, 120.4, 109, 119.8, 100]);
    const tt = find(t, "triple-top")!;
    expect(tt.target).toBeCloseTo(108 - (120.4 - 108), 9); // 95.6
    expect(names(t)).not.toContain("double-top");
    const b = wave([120, 100, 112, 100.3, 111, 99.8, 118]);
    expect(find(b, "triple-bottom")!.target).toBeCloseTo(112 + (112 - 99.8), 9); // 124.2
  });

  it("head and shoulders and inverse", () => {
    // Pivots at bars 5 (115), 10 (105), 15 (125), 20 (106), 25 (115.5).
    // Neckline through (10, 105) and (20, 106): 105.5 at the head, 106.5 at the right shoulder.
    const hs = find(wave([100, 115, 105, 125, 106, 115.5, 95]), "head-and-shoulders")!;
    expect(hs.points.map((p) => p.price)).toEqual([115, 105, 125, 106, 115.5]);
    expect(hs.target).toBeCloseTo(106.5 - (125 - 105.5), 9); // 87
    // Neckline through (10, 115) and (20, 114): 114.5 at the head, 113.5 at the right shoulder.
    const inv = find(wave([120, 105, 115, 95, 114, 104.5, 125]), "inverse-head-and-shoulders")!;
    expect(inv.target).toBeCloseTo(113.5 + (114.5 - 95), 9); // 133
  });

  it("triangles", () => {
    const asc = find(wave([106, 120, 105, 120.3, 112, 125]), "ascending-triangle")!;
    expect(asc.target).toBeCloseTo(120.15 + (120.15 - 105), 9); // 135.3
    expect(names(wave([120, 100, 115, 100.2, 108, 95]))).toContain("descending-triangle");
    const sym = find(wave([100, 120, 104, 116, 108, 125]), "symmetric-triangle")!;
    expect(sym.bias).toBe("neutral");
    expect(sym.target).toBeUndefined();
  });

  it("wedges", () => {
    // Highs 110 → 114 (+0.4/bar), lows 104 → 110 (+0.6/bar): rising, converging.
    const rw = find(wave([100, 110, 104, 114, 110, 116, 90]), "rising-wedge")!;
    expect(rw.bias).toBe("bearish");
    expect(rw.target).toBe(104);
    // Lows 110 → 106 (−0.4/bar), highs 116 → 110 (−0.6/bar): falling, converging.
    const fw = find(wave([120, 110, 116, 106, 110, 104, 130]), "falling-wedge")!;
    expect(fw.bias).toBe("bullish");
    expect(fw.target).toBe(116);
  });

  it("flags", () => {
    // Pole 100 → 120 (20%), flag 113 / 118 / 112 retraces 8 <= 10; target = 118 + 20.
    const bull = find(wave([100, 120, 113, 118, 112, 130]), "bull-flag")!;
    expect(bull.target).toBeCloseTo(138, 9);
    // Pole 120 → 100, flag 106 / 101 / 107 retraces 7 <= 10; target = 101 − 20.
    const bear = find(wave([120, 100, 106, 101, 107, 90]), "bear-flag")!;
    expect(bear.target).toBeCloseTo(81, 9);
  });

  it("finds nothing on noise or on a clean staircase trend", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
    const noise = Array.from({ length: 300 }, () => 100 + rnd()); // bounded ±1%, below the 3% threshold
    expect(detectChartPatterns(line(noise))).toEqual([]);
    // Higher highs and higher lows by 5% per swing: the channel widens, nothing is equal.
    const stairs: number[] = [100];
    for (let k = 0; k < 8; k++) stairs.push(115 * 1.05 ** k, 105 * 1.05 ** k);
    expect(detectChartPatterns(wave(stairs.slice(1)))).toEqual([]);
  });

  it("is deterministic", () => {
    const bars = wave([100, 115, 105, 125, 106, 115.5, 95, 110, 100, 120]);
    expect(detectChartPatterns(bars)).toEqual(detectChartPatterns(bars));
  });
});
