import { describe, expect, it } from "vitest";
import type { Bar } from "../src/types";
import { detectCandlePatterns } from "../src/analysis/candles";

type C = { o: number; h: number; l: number; c: number };

// 12-bar trend prefixes; SMA(10) slope at bar 11 is down / up respectively.
// Down: close 120 → 109, open = close + 0.5 (small bearish bars, last close 109).
// Up:   close 100 → 111, open = close − 0.5 (small bullish bars, last close 111).
const DOWN: C[] = Array.from({ length: 12 }, (_, k) => ({ o: 120.5 - k, h: 120.7 - k, l: 119.8 - k, c: 120 - k }));
const UP: C[] = Array.from({ length: 12 }, (_, k) => ({ o: 99.5 + k, h: 100.2 + k, l: 99.3 + k, c: 100 + k }));

function mk(prefix: C[], pattern: C[]): Bar[] {
  return [...prefix, ...pattern].map((x, i) => ({ time: i * 86400, open: x.o, high: x.h, low: x.l, close: x.c, volume: 1 }));
}
function namesAtEnd(bars: Bar[]): string[] {
  const last = bars.length - 1;
  return detectCandlePatterns(bars)
    .filter((p) => p.index === last)
    .map((p) => p.name);
}

// Long bars used as the first bar of two/three-bar patterns.
const LONG_BEAR: C = { o: 109, h: 109.1, l: 107, c: 107.2 }; // body 1.8, range 2.1, midpoint 108.1
const LONG_BULL: C = { o: 111, h: 113, l: 110.9, c: 112.8 }; // body 1.8, range 2.1, midpoint 111.9

interface Case {
  name: string;
  prefix: C[];
  pos: C[];
  neg: C[];
  negPrefix?: C[];
}

const CASES: Case[] = [
  // body 0.05 <= 10% of range 2 / body 0.5 > 0.2
  { name: "doji", prefix: DOWN, pos: [{ o: 109, h: 110, l: 108, c: 109.05 }], neg: [{ o: 109, h: 110, l: 108, c: 109.5 }] },
  // body 0.2, lower shadow 1.8 >= 0.4, upper 0.05 <= 0.205; negative: same shape after an uptrend
  { name: "hammer", prefix: DOWN, pos: [{ o: 108.8, h: 109.05, l: 107, c: 109 }], neg: [{ o: 108.8, h: 109.05, l: 107, c: 109 }], negPrefix: UP },
  { name: "hanging-man", prefix: UP, pos: [{ o: 110.8, h: 111.05, l: 109, c: 111 }], neg: [{ o: 110.8, h: 111.05, l: 109, c: 111 }], negPrefix: DOWN },
  // upper shadow 1.8 >= 0.4, lower 0.05; negative: upper shadow 0.1 < 2 × body
  { name: "inverted-hammer", prefix: DOWN, pos: [{ o: 109, h: 111, l: 108.95, c: 109.2 }], neg: [{ o: 109, h: 109.3, l: 108.95, c: 109.2 }] },
  { name: "shooting-star", prefix: UP, pos: [{ o: 111.2, h: 113, l: 110.95, c: 111 }], neg: [{ o: 111.2, h: 113, l: 110.95, c: 111 }], negPrefix: DOWN },
  // opens 107.1 <= 107.2, closes 109.2 >= 109, body 2.1 > 1.8; negative closes 108.8 < 109
  { name: "bullish-engulfing", prefix: DOWN, pos: [LONG_BEAR, { o: 107.1, h: 109.3, l: 107, c: 109.2 }], neg: [LONG_BEAR, { o: 107.1, h: 109.3, l: 107, c: 108.8 }] },
  { name: "bearish-engulfing", prefix: UP, pos: [LONG_BULL, { o: 112.9, h: 113, l: 110.7, c: 110.8 }], neg: [LONG_BULL, { o: 112.9, h: 113, l: 110.7, c: 111.2 }] },
  // opens 107.0 < 107.2, closes 108.4 above midpoint 108.1 and below 109; negative closes 108.0
  { name: "piercing-line", prefix: DOWN, pos: [LONG_BEAR, { o: 107, h: 108.5, l: 106.9, c: 108.4 }], neg: [LONG_BEAR, { o: 107, h: 108.5, l: 106.9, c: 108 }] },
  { name: "dark-cloud-cover", prefix: UP, pos: [LONG_BULL, { o: 113, h: 113.1, l: 111.5, c: 111.6 }], neg: [LONG_BULL, { o: 113, h: 113.1, l: 111.9, c: 112 }] },
  // star body 0.1 <= 0.54 below the first close; third closes 108.6 > 108.1; negative 107.9
  {
    name: "morning-star",
    prefix: DOWN,
    pos: [LONG_BEAR, { o: 106.9, h: 107, l: 106.6, c: 106.8 }, { o: 107, h: 108.7, l: 106.9, c: 108.6 }],
    neg: [LONG_BEAR, { o: 106.9, h: 107, l: 106.6, c: 106.8 }, { o: 107, h: 108, l: 106.9, c: 107.9 }],
  },
  {
    name: "evening-star",
    prefix: UP,
    pos: [LONG_BULL, { o: 113.1, h: 113.4, l: 113, c: 113.2 }, { o: 113, h: 113.1, l: 111.3, c: 111.4 }],
    neg: [LONG_BULL, { o: 113.1, h: 113.4, l: 113, c: 113.2 }, { o: 113, h: 113.1, l: 112.1, c: 112.2 }],
  },
  // bodies >= 60% of range, rising closes, opens inside the previous body; negative: third opens above the second body
  {
    name: "three-white-soldiers",
    prefix: DOWN,
    pos: [
      { o: 109, h: 110.1, l: 108.9, c: 110 },
      { o: 109.5, h: 110.9, l: 109.4, c: 110.8 },
      { o: 110.2, h: 111.7, l: 110.1, c: 111.6 },
    ],
    neg: [
      { o: 109, h: 110.1, l: 108.9, c: 110 },
      { o: 109.5, h: 110.9, l: 109.4, c: 110.8 },
      { o: 111, h: 111.7, l: 110.9, c: 111.6 },
    ],
  },
  {
    name: "three-black-crows",
    prefix: UP,
    pos: [
      { o: 110, h: 110.1, l: 108.9, c: 109 },
      { o: 109.5, h: 109.6, l: 108.1, c: 108.2 },
      { o: 108.8, h: 108.9, l: 107.3, c: 107.4 },
    ],
    neg: [
      { o: 110, h: 110.1, l: 108.9, c: 109 },
      { o: 109.5, h: 109.6, l: 108.1, c: 108.2 },
      { o: 108, h: 108.1, l: 107.3, c: 107.4 },
    ],
  },
  // second body 0.6 <= 0.9 and inside 107.2..109; negative body 1.2 > 0.9
  { name: "bullish-harami", prefix: DOWN, pos: [LONG_BEAR, { o: 107.6, h: 108.3, l: 107.5, c: 108.2 }], neg: [LONG_BEAR, { o: 107.6, h: 108.9, l: 107.5, c: 108.8 }] },
  { name: "bearish-harami", prefix: UP, pos: [LONG_BULL, { o: 112.4, h: 112.5, l: 111.7, c: 111.8 }], neg: [LONG_BULL, { o: 112.4, h: 112.5, l: 110.8, c: 110.9 }] },
  // equal lows/highs within 5% of 2.1 = 0.105; negative differs by 0.5
  { name: "tweezer-bottom", prefix: DOWN, pos: [LONG_BEAR, { o: 107.2, h: 108.6, l: 107, c: 108.5 }], neg: [LONG_BEAR, { o: 107.2, h: 108.6, l: 106.5, c: 108.5 }] },
  { name: "tweezer-top", prefix: UP, pos: [LONG_BULL, { o: 112.8, h: 113, l: 111.4, c: 111.5 }], neg: [LONG_BULL, { o: 112.8, h: 113.5, l: 111.4, c: 111.5 }] },
];

describe("detectCandlePatterns", () => {
  it("the trend prefixes contain none of the multi-bar patterns", () => {
    for (const p of [DOWN, UP]) expect(detectCandlePatterns(mk(p, [])).filter((x) => x.bars > 1)).toEqual([]);
  });
  for (const c of CASES) {
    it(`${c.name}: positive`, () => {
      const bars = mk(c.prefix, c.pos);
      expect(namesAtEnd(bars)).toContain(c.name);
      const hit = detectCandlePatterns(bars).find((p) => p.name === c.name)!;
      expect(hit.bars).toBe(c.name === "doji" || c.pos.length === 1 ? 1 : c.pos.length);
    });
    it(`${c.name}: negative`, () => {
      expect(namesAtEnd(mk(c.negPrefix ?? c.prefix, c.neg))).not.toContain(c.name);
    });
  }
  it("needs trend context before reporting trend patterns", () => {
    // A hammer shape at bar 0 has no SMA(10) slope yet.
    const bars = mk([], [{ o: 108.8, h: 109.05, l: 107, c: 109 }]);
    const names = detectCandlePatterns(bars).map((p) => p.name);
    expect(names).not.toContain("hammer");
    expect(names).not.toContain("hanging-man");
  });
});
