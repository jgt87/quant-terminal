import { describe, expect, it } from "vitest";
import type { Bar } from "../src/types";
import {
  heikinAshi,
  kagi,
  lineBreak,
  pointAndFigure,
  rangeBars,
  renko,
  resampleBars,
  transformBars,
  MONDAY_ANCHOR,
} from "../src/transforms";
import { atr } from "../src/indicators/volatility";

const H = 3600;
const D = 86400;

/** Bars whose open/high/low/close all equal the given close; volume 1. */
function closes(cs: number[], step = D): Bar[] {
  return cs.map((c, i) => ({ time: i * step, open: c, high: c, low: c, close: c, volume: 1 }));
}
function ohlc(rows: [number, number, number, number][], step = D): Bar[] {
  return rows.map(([open, high, low, close], i) => ({ time: i * step, open, high, low, close, volume: 1 }));
}
const shape = (xs: { open: number; close: number; dir: number; sourceIndex: number }[]) =>
  xs.map((x) => [x.open, x.close, x.dir, x.sourceIndex]);

describe("renko", () => {
  it("builds bricks from closes with a 2-box reversal", () => {
    // ref 10, box 1. 11 → up 10-11; 12.2 → up 11-12; 11.5 and 10.9 are < 2 boxes from 12;
    // 9.9 → down 11-10 (2.1 boxes below 12); 8.7 → down 10-9.
    const out = renko(closes([10, 10.5, 11, 12.2, 11.5, 10.9, 9.9, 8.7]), { boxSize: 1 });
    expect(shape(out)).toEqual([
      [10, 11, 1, 2],
      [11, 12, 1, 3],
      [11, 10, -1, 6],
      [10, 9, -1, 7],
    ]);
    // Volume: bars 0..2 → 3, bar 3 → 1, bars 4..6 → 3, bar 7 → 1.
    expect(out.map((b) => b.volume)).toEqual([3, 1, 3, 1]);
    for (const b of out) expect(b.high - b.low).toBeCloseTo(1, 12);
  });

  it("emits several bricks from one bar; the first takes the volume", () => {
    const out = renko(closes([10, 13.5]), { boxSize: 1 });
    expect(shape(out)).toEqual([
      [10, 11, 1, 1],
      [11, 12, 1, 1],
      [12, 13, 1, 1],
    ]);
    expect(out.map((b) => b.volume)).toEqual([2, 0, 0]);
  });

  it("uses highs/lows with source hl", () => {
    // ref 10; bar 1 high 11.2 → up 10-11; bar 2 low 8.9 → 11 - 8.9 = 2.1 boxes → down 10-9.
    const bars = ohlc([
      [10, 10, 10, 10],
      [10, 11.2, 9.5, 10.5],
      [10.5, 10.6, 8.9, 9.2],
    ]);
    expect(shape(renko(bars, { boxSize: 1, source: "hl" }))).toEqual([
      [10, 11, 1, 1],
      [10, 9, -1, 2],
    ]);
    // Closes alone never move a full box here.
    expect(renko(bars, { boxSize: 1 })).toEqual([]);
  });

  it("ATR box size = last ATR(n) value", () => {
    const bars = ohlc(Array.from({ length: 30 }, (_, i) => [100 + i, 101 + i + (i % 3), 99 + i, 100.5 + i] as [number, number, number, number]));
    const a = atr(bars, 5);
    const box = a[a.length - 1] as number;
    expect(renko(bars, { boxSize: "atr", atrLength: 5 })).toEqual(renko(bars, { boxSize: box }));
    expect(renko(bars.slice(0, 3), { boxSize: "atr", atrLength: 5 })).toEqual([]);
  });

  it("is reachable through transformBars", () => {
    expect(transformBars(closes([10, 12]), "renko", { renko: { boxSize: 1 } })).toHaveLength(2);
  });
});

describe("kagi", () => {
  it("absolute reversal with yang/yin switching", () => {
    // start 10; 12.5 starts an up line (yang). 10.4 reverses (2.1 >= 2): shoulder 12.5.
    // 13 reverses up from waist 10.4 and rises above shoulder 12.5 (yang); 14 extends;
    // 9 reverses and falls below waist 10.4 → yin.
    const out = kagi(closes([10, 11, 12.5, 11, 10.4, 11, 13, 14, 9]), { reversal: 2, mode: "absolute" });
    expect(shape(out)).toEqual([
      [10, 12.5, 1, 2],
      [12.5, 10.4, 1, 4],
      [10.4, 14, 1, 7],
      [14, 9, -1, 8],
    ]);
    expect(out[2].high).toBe(14);
    expect(out[3].low).toBe(9);
  });

  it("percent reversal is measured from the line's extreme", () => {
    // 5%: 104 is 4% (no line); 110 starts up; 105 is 4.5% of 110 (< 5.5) → no reversal; 100 reverses.
    const out = kagi(closes([100, 104, 110, 105, 100]), { reversal: 5, mode: "percent" });
    expect(shape(out)).toEqual([
      [100, 110, 1, 2],
      [110, 100, 1, 4], // no previous waist yet → stays yang
    ]);
  });
});

describe("line break", () => {
  const cs = [10, 11, 12, 13, 12.5, 11.5, 9.5, 10, 12.5, 13.5];
  it("three-line break needs to break the extreme of the last 3 lines to reverse", () => {
    // Lines 10-11, 11-12, 12-13. 12.5/11.5 stay above the low of the last 3 lines (10).
    // 9.5 < 10 → down line from 12 (bottom of last line). 13.5 > 13 (high of last 3) → up from 12.
    expect(shape(lineBreak(closes(cs), { lines: 3 }))).toEqual([
      [10, 11, 1, 1],
      [11, 12, 1, 2],
      [12, 13, 1, 3],
      [12, 9.5, -1, 6],
      [12, 13.5, 1, 9],
    ]);
  });
  it("one-line break reverses on a break of the last line", () => {
    // 11.5 < 12 (bottom of line 12-13) → down line 12 → 11.5 at bar 5.
    const out = lineBreak(closes(cs), { lines: 1 });
    expect(shape(out).slice(0, 4)).toEqual([
      [10, 11, 1, 1],
      [11, 12, 1, 2],
      [12, 13, 1, 3],
      [12, 11.5, -1, 5],
    ]);
  });
});

describe("point & figure", () => {
  it("box 1, 3-box reversal, high/low method", () => {
    const bars = ohlc([
      [10, 10.2, 9.8, 10], // ref box 10; no box filled
      [10, 12.3, 10.1, 12], // X column 10..12
      [12, 13.0, 11.5, 12.5], // X extends to 13
      [12.5, 12.8, 10.4, 11], // low box 11 > 13 − 3 → no reversal
      [11, 12, 9.9, 10], // low box 10 <= 10 → O column 12..10
      [10, 10.5, 8.2, 9], // O extends to 9
      [9, 11.6, 9.5, 11], // high box 11 < 9 + 3 → nothing
      [11, 12.1, 11, 12], // high box 12 >= 12 → X column 10..12
    ]);
    const out = pointAndFigure(bars, { boxSize: 1, reversal: 3 });
    expect(out.map((c) => [c.dir, c.low, c.high, c.sourceIndex])).toEqual([
      [1, 10, 13, 2],
      [-1, 9, 12, 5],
      [1, 10, 12, 7],
    ]);
    expect([out[1].open, out[1].close]).toEqual([12, 9]); // O columns run top → bottom
  });
});

describe("range bars", () => {
  it("completed bars span exactly the range", () => {
    // Paths: bar0 10→10→11→11; bar1 11→11→14.5→14; bar2 14→14.2→11→11.5.
    // 14.5 completes 10-12 and 12-14; falling to 11 completes 14.5-12.5; 12.5→11.5 is the forming bar.
    const out = rangeBars(
      ohlc([
        [10, 11, 10, 11],
        [11, 14.5, 11, 14],
        [14, 14.2, 11, 11.5],
      ]),
      { range: 2 },
    );
    expect(out.map((b) => [b.open, b.high, b.low, b.close, b.dir, b.sourceIndex])).toEqual([
      [10, 12, 10, 12, 1, 1],
      [12, 14, 12, 14, 1, 1],
      [14, 14.5, 12.5, 12.5, -1, 2],
      [12.5, 12.5, 11, 11.5, -1, 2],
    ]);
    expect(out.map((b) => b.volume)).toEqual([2, 0, 1, 0]);
  });
});

describe("resampleBars", () => {
  it("1h → 2h aligned to UTC", () => {
    const bars = ohlc(
      [
        [1, 2, 0.5, 1.5],
        [1.5, 3, 1, 2],
        [2, 2.5, 1.8, 2.2],
        [2.2, 2.4, 1.1, 1.2],
      ],
      H,
    );
    expect(resampleBars(bars, H, 2 * H)).toEqual([
      { time: 0, open: 1, high: 3, low: 0.5, close: 2, volume: 2 },
      { time: 2 * H, open: 2, high: 2.5, low: 1.1, close: 1.2, volume: 2 },
    ]);
  });
  it("3h buckets start at UTC hours divisible by 3", () => {
    const bars = closes([1, 2, 3, 4, 5, 6], H).map((b) => ({ ...b, time: b.time + H })); // 01:00..06:00
    expect(resampleBars(bars, H, 3 * H).map((b) => [b.time / H, b.open, b.close, b.volume])).toEqual([
      [0, 1, 2, 2],
      [3, 3, 5, 3],
      [6, 6, 6, 1],
    ]);
  });
  it("15m → 45m and 1D → 2D", () => {
    expect(resampleBars(closes([1, 2, 3, 4, 5, 6], 900), 900, 2700).map((b) => b.time)).toEqual([0, 2700]);
    expect(resampleBars(closes([1, 2, 3, 4, 5]), D, 2 * D).map((b) => [b.time / D, b.close])).toEqual([
      [0, 2],
      [2, 4],
      [4, 5],
    ]);
  });
  it("weeks start on Monday", () => {
    // Day 0 = Thursday 1970-01-01. Thu..Sun → week of Mon 1969-12-29; days 4..9 → Mon 1970-01-05.
    const out = resampleBars(closes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), D, 7 * D);
    expect(out.map((b) => b.time)).toEqual([MONDAY_ANCHOR - 7 * D, MONDAY_ANCHOR]);
    expect(out.map((b) => b.volume)).toEqual([4, 6]);
    expect(new Date(out[1].time * 1000).getUTCDay()).toBe(1);
  });
  it("rejects targets that are not a multiple of the source", () => {
    expect(() => resampleBars([], 1800, 2700)).toThrow(RangeError);
  });
});

describe("heikinAshi", () => {
  /** Straight textbook definition, written independently. */
  function textbook(bars: Bar[]): Bar[] {
    const out: Bar[] = [];
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const close = (b.open + b.high + b.low + b.close) / 4;
      const open = i === 0 ? (b.open + b.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
      out.push({ time: b.time, open, close, high: Math.max(b.high, open, close), low: Math.min(b.low, open, close), volume: b.volume });
    }
    return out;
  }
  it("matches the textbook definition", () => {
    const bars = ohlc([
      [10, 12, 9, 11], // haC 10.5, haO (10+11)/2 = 10.5, haH 12, haL 9
      [11, 13, 10, 12], // haC 11.5, haO (10.5+10.5)/2 = 10.5, haH 13, haL 10
      [12, 12.5, 8, 8.5],
      [8.5, 9, 7, 7.5],
    ]);
    const ha = heikinAshi(bars);
    expect([ha[0].open, ha[0].close, ha[0].high, ha[0].low]).toEqual([10.5, 10.5, 12, 9]);
    expect([ha[1].open, ha[1].close, ha[1].high, ha[1].low]).toEqual([10.5, 11.5, 13, 10]);
    expect(ha).toEqual(textbook(bars));
  });
});
