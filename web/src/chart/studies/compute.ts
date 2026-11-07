// Study results computed from the chart bars (revealed bars in replay, transformed elements on
// price-only chart types). Cached per study and data version; the visible-range profile is
// computed per frame by the renderer instead.

import {
  autoFib,
  detectCandlePatterns,
  detectChartPatterns,
  detectGaps,
  sessionVolumeProfiles,
  supportResistance,
  tpoProfile,
  zigzag,
  type Anchor,
  type Bar,
  type CandlePattern,
  type ChartPattern,
  type InputValue,
  type Pivot,
  type PriceGap,
  type SrLevel,
  type TpoProfile,
  type VolumeProfile,
} from "@qt/core";
import type { StudyId } from "./defs";

export interface TpoSession {
  profile: TpoProfile;
  startIndex: number;
  endIndex: number;
  tick: number;
}

export interface StudyResult {
  candles?: CandlePattern[];
  patterns?: ChartPattern[];
  pivots?: Pivot[];
  fib?: { a: Anchor; b: Anchor } | null;
  sessions?: VolumeProfile[];
  tpo?: TpoSession[];
  gaps?: PriceGap[];
  levels?: SrLevel[];
  error?: string;
}

const num = (v: InputValue | undefined, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const flag = (v: InputValue | undefined, d: boolean) => (typeof v === "boolean" ? v : d);

/** "Nice" step (1, 2, 2.5, 5 × 10^k) at or above x. */
export function niceStep(x: number): number {
  if (!(x > 0) || !isFinite(x)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= x - 1e-12) return m * p;
  return 10 * p;
}

/** Candle patterns kept by the study's group filters (bar count and bias). */
export function filterCandlePatterns(list: CandlePattern[], inputs: Record<string, InputValue>): CandlePattern[] {
  const bars = [flag(inputs.oneBar, true), flag(inputs.twoBar, true), flag(inputs.threeBar, true)];
  const bias = { bullish: flag(inputs.bullish, true), bearish: flag(inputs.bearish, true), neutral: flag(inputs.neutral, false) };
  return list.filter((p) => bars[Math.min(3, Math.max(1, p.bars)) - 1] && bias[p.bias]);
}

/** Splits bars into sessions (UTC days shifted by `boundarySec`) as [start, end] index pairs. */
export function sessionRanges(bars: readonly Bar[], boundarySec: number): [number, number][] {
  const out: [number, number][] = [];
  const day = (t: number) => Math.floor((t - boundarySec) / 86400);
  let s = 0;
  for (let i = 1; i <= bars.length; i++) {
    if (i === bars.length || day(bars[i].time) !== day(bars[s].time)) {
      out.push([s, i - 1]);
      s = i;
    }
  }
  return bars.length ? out : [];
}

export function computeStudy(id: StudyId, bars: Bar[], inputs: Record<string, InputValue>, intradaySec: number): StudyResult {
  if (bars.length === 0) return {};
  switch (id) {
    case "candle-patterns":
      return { candles: filterCandlePatterns(detectCandlePatterns(bars), inputs) };
    case "chart-patterns":
      return { patterns: detectChartPatterns(bars, { deviationPct: num(inputs.deviation, 3), depth: num(inputs.depth, 1), tolerancePct: num(inputs.tolerance, 1.5) }) };
    case "zigzag":
      return { pivots: zigzag(bars, num(inputs.deviation, 5), num(inputs.depth, 1)) };
    case "autofib":
      return { fib: autoFib(bars, { deviationPct: num(inputs.deviation, 5), depth: num(inputs.depth, 1) }) };
    case "vp-session":
      return { sessions: sessionVolumeProfiles(bars, num(inputs.sessionStart, 0) * 3600, Math.round(num(inputs.rows, 24)), num(inputs.valueArea, 70)) };
    case "tpo": {
      if (!(intradaySec < 86400)) return { error: "TPO needs an intraday chart" };
      const period = Math.max(intradaySec / 60, num(inputs.period, 30));
      const target = Math.max(5, num(inputs.rows, 40));
      const out: TpoSession[] = [];
      for (const [s, e] of sessionRanges(bars, num(inputs.sessionStart, 0) * 3600)) {
        const slice = bars.slice(s, e + 1);
        let lo = Infinity;
        let hi = -Infinity;
        for (const b of slice) {
          if (b.low < lo) lo = b.low;
          if (b.high > hi) hi = b.high;
        }
        const tick = niceStep((hi - lo) / target);
        out.push({ profile: tpoProfile(slice, period, tick, num(inputs.valueArea, 70)), startIndex: s, endIndex: e, tick });
      }
      return { tpo: out };
    }
    case "gaps":
      return { gaps: detectGaps(bars, { minPercent: num(inputs.minPercent, 0.1), maxGaps: Math.round(num(inputs.maxGaps, 20)), includeFilled: flag(inputs.showFilled, false) }) };
    case "support-resistance":
      return {
        levels: supportResistance(bars, {
          strength: num(inputs.strength, 5),
          tolerance: num(inputs.tolerance, 0.5),
          minTouches: num(inputs.minTouches, 2),
          maxLevels: num(inputs.maxLevels, 8),
          lookback: num(inputs.lookback, 500),
        }),
      };
    case "vp-visible":
      return {};
  }
}
