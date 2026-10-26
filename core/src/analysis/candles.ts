// Candlestick pattern recognition with textbook definitions and explicit thresholds.
//
// Terms (per bar): body = |close − open|, range = high − low,
// upper shadow = high − max(open, close), lower shadow = min(open, close) − low.
// Bullish bar: close > open; bearish bar: close < open.
//
// Trend context: SMA(10) of close. The trend before a pattern whose first bar is s is the
// slope at bar j = s − 1: up when SMA10[j] > SMA10[j − 1], down when SMA10[j] < SMA10[j − 1].
// Patterns that need a trend are not reported until that slope exists (bar index >= 11).
//
// Thresholds (all documented in THRESHOLDS below):
//   doji              body <= 10% of range
//   long body         body >= 50% of range
//   hammer shape      body > 0, lower shadow >= 2 × body, upper shadow <= 10% of range
//                     → hammer after a downtrend, hanging man after an uptrend
//   inverted shape    body > 0, upper shadow >= 2 × body, lower shadow <= 10% of range
//                     → inverted hammer after a downtrend, shooting star after an uptrend
//   engulfing         opposite colors; second body covers the first body
//                     (open2 <= close1 and close2 >= open1 for bullish, mirrored for
//                     bearish) and is strictly larger; bullish after down, bearish after up
//   piercing line     downtrend; bar 1 bearish with long body; bar 2 bullish, opens below
//                     bar 1's close, closes above bar 1's body midpoint but below its open
//                     (continuous markets rarely gap below the prior low, so the open is
//                     tested against the prior close)
//   dark cloud cover  mirror of piercing line in an uptrend
//   morning star      downtrend; bar 1 bearish long body; bar 2 small body
//                     (<= 30% of bar 1's body) whose body top is <= bar 1's close;
//                     bar 3 bullish closing above bar 1's body midpoint
//   evening star      mirror in an uptrend
//   three white soldiers  three bullish bars with body >= 60% of range, each close above
//                     the previous close and each open inside the previous body
//   three black crows mirror
//   harami            bar 1 long body; bar 2 body <= 50% of bar 1's body and strictly
//                     inside it; bullish after a downtrend (bar 1 bearish), bearish after an
//                     uptrend (bar 1 bullish)
//   tweezer top       uptrend; bullish bar then bearish bar with highs equal within 5% of
//                     the larger of the two ranges
//   tweezer bottom    downtrend; bearish then bullish with equal lows (same tolerance)

import type { Bar } from "../types";
import type { CandlePattern } from "../types-ext";
import { sma } from "../indicators/ma";

export const THRESHOLDS = {
  trendSma: 10,
  dojiBody: 0.1,
  longBody: 0.5,
  shadowToBody: 2,
  smallShadow: 0.1,
  starBody: 0.3,
  soldierBody: 0.6,
  haramiBody: 0.5,
  tweezerTol: 0.05,
} as const;

const body = (b: Bar) => Math.abs(b.close - b.open);
const range = (b: Bar) => b.high - b.low;
const upper = (b: Bar) => b.high - Math.max(b.open, b.close);
const lower = (b: Bar) => Math.min(b.open, b.close) - b.low;
const bull = (b: Bar) => b.close > b.open;
const bear = (b: Bar) => b.close < b.open;
const mid = (b: Bar) => (b.open + b.close) / 2;
const longBody = (b: Bar) => range(b) > 0 && body(b) >= THRESHOLDS.longBody * range(b);

export function detectCandlePatterns(bars: Bar[]): CandlePattern[] {
  const T = THRESHOLDS;
  const out: CandlePattern[] = [];
  const avg = sma(
    bars.map((b) => b.close),
    T.trendSma,
  );
  /** 1 up, -1 down, 0 flat/unknown: the slope before the pattern's first bar s. */
  const trend = (s: number): 1 | -1 | 0 => {
    const j = s - 1;
    if (j < 1) return 0;
    const a = avg[j];
    const p = avg[j - 1];
    if (a === null || p === null) return 0;
    return a > p ? 1 : a < p ? -1 : 0;
  };
  const add = (i: number, name: string, bias: CandlePattern["bias"], n: number) =>
    out.push({ index: i, time: bars[i].time, name, bias, bars: n });

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const r = range(b);
    const bd = body(b);

    // ----- one bar -----
    if (r > 0 && bd <= T.dojiBody * r) add(i, "doji", "neutral", 1);
    const t1 = trend(i);
    if (r > 0 && bd > 0 && lower(b) >= T.shadowToBody * bd && upper(b) <= T.smallShadow * r) {
      if (t1 === -1) add(i, "hammer", "bullish", 1);
      if (t1 === 1) add(i, "hanging-man", "bearish", 1);
    }
    if (r > 0 && bd > 0 && upper(b) >= T.shadowToBody * bd && lower(b) <= T.smallShadow * r) {
      if (t1 === -1) add(i, "inverted-hammer", "bullish", 1);
      if (t1 === 1) add(i, "shooting-star", "bearish", 1);
    }

    // ----- two bars -----
    if (i >= 1) {
      const a = bars[i - 1];
      const t2 = trend(i - 1);
      if (t2 === -1 && bear(a) && bull(b) && b.open <= a.close && b.close >= a.open && bd > body(a))
        add(i, "bullish-engulfing", "bullish", 2);
      if (t2 === 1 && bull(a) && bear(b) && b.open >= a.close && b.close <= a.open && bd > body(a))
        add(i, "bearish-engulfing", "bearish", 2);
      if (t2 === -1 && bear(a) && longBody(a) && bull(b) && b.open < a.close && b.close > mid(a) && b.close < a.open)
        add(i, "piercing-line", "bullish", 2);
      if (t2 === 1 && bull(a) && longBody(a) && bear(b) && b.open > a.close && b.close < mid(a) && b.close > a.open)
        add(i, "dark-cloud-cover", "bearish", 2);
      const inside =
        longBody(a) &&
        bd <= T.haramiBody * body(a) &&
        Math.max(b.open, b.close) < Math.max(a.open, a.close) &&
        Math.min(b.open, b.close) > Math.min(a.open, a.close);
      if (inside && t2 === -1 && bear(a)) add(i, "bullish-harami", "bullish", 2);
      if (inside && t2 === 1 && bull(a)) add(i, "bearish-harami", "bearish", 2);
      const tol = T.tweezerTol * Math.max(range(a), r);
      if (t2 === 1 && bull(a) && bear(b) && Math.abs(a.high - b.high) <= tol) add(i, "tweezer-top", "bearish", 2);
      if (t2 === -1 && bear(a) && bull(b) && Math.abs(a.low - b.low) <= tol) add(i, "tweezer-bottom", "bullish", 2);
    }

    // ----- three bars -----
    if (i >= 2) {
      const a = bars[i - 2];
      const m = bars[i - 1];
      const t3 = trend(i - 2);
      const small = body(m) <= T.starBody * body(a);
      if (t3 === -1 && bear(a) && longBody(a) && small && Math.max(m.open, m.close) <= a.close && bull(b) && b.close > mid(a))
        add(i, "morning-star", "bullish", 3);
      if (t3 === 1 && bull(a) && longBody(a) && small && Math.min(m.open, m.close) >= a.close && bear(b) && b.close < mid(a))
        add(i, "evening-star", "bearish", 3);
      const strong = (x: Bar) => range(x) > 0 && body(x) >= T.soldierBody * range(x);
      const trio = [a, m, b];
      if (
        trio.every((x) => bull(x) && strong(x)) &&
        m.close > a.close &&
        b.close > m.close &&
        m.open >= a.open &&
        m.open <= a.close &&
        b.open >= m.open &&
        b.open <= m.close
      )
        add(i, "three-white-soldiers", "bullish", 3);
      if (
        trio.every((x) => bear(x) && strong(x)) &&
        m.close < a.close &&
        b.close < m.close &&
        m.open <= a.open &&
        m.open >= a.close &&
        b.open <= m.open &&
        b.open >= m.close
      )
        add(i, "three-black-crows", "bearish", 3);
    }
  }
  return out;
}
