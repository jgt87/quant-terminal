// Classic chart patterns on zig-zag pivots. Deterministic: the same bars and options
// always give the same list, ordered by endIndex, then startIndex, then name.
//
// Pivots come from zigzag(bars, deviationPct, depth) and alternate high/low; the last
// one is the provisional current extreme. Every window of consecutive pivots is tested.
//
// Tolerance rules ("equal" = within tolerancePct percent of the two prices' mean;
// change d(p1→p2) = (p2 − p1) / p1 × 100):
//   double top/bottom   H L H (L H L): the two extremes equal. Target = neckline ∓ height,
//                       height = |extreme − neckline|, neckline = the middle pivot.
//   triple top/bottom   H L H L H: max − min of the three extremes <= tolerancePct of
//                       their mean. Target = neckline (lowest low / highest high) ∓ height.
//   head and shoulders  H L H L H: head above both shoulders by more than tolerancePct,
//                       shoulders equal within shoulderTolPct. Neckline = line through the
//                       two lows; target = neckline at the right shoulder − (head − neckline
//                       at the head). Inverse: mirrored.
//   triangles/wedges    last 4 pivots → upper line through 2 highs, lower through 2 lows;
//                       the lines must converge (gap at the last pivot < gap at the first).
//                       flat = |d| <= tolerancePct, rising = d > tol, falling = d < −tol.
//                       ascending triangle: flat highs, rising lows; target = resistance +
//                       height. descending: falling highs, flat lows; target = support −
//                       height. symmetric: falling highs, rising lows; no target.
//                       rising wedge: both rising (bearish, target = first low);
//                       falling wedge: both falling (bullish, target = first high).
//   bull flag           L H L H L: pole d(L0→H1) >= flagPoleMinPct, flag highs and lows flat
//                       or falling (each new one <= previous × (1 + tol)), flag retraces at
//                       most flagMaxRetracePct of the pole, pole bars <= flag bars.
//                       Target = last flag high + pole height. bear flag: mirrored.
// A double top/bottom that lies inside a reported triple top/bottom is dropped.

import type { Bar } from "../types";
import type { ChartPattern, Pivot } from "../types-ext";
import { zigzag } from "./pivots";

export interface ChartPatternOptions {
  deviationPct?: number;
  depth?: number;
  tolerancePct?: number;
  shoulderTolPct?: number;
  flagPoleMinPct?: number;
  flagMaxRetracePct?: number;
}

export const CHART_PATTERN_DEFAULTS: Required<ChartPatternOptions> = {
  deviationPct: 3,
  depth: 1,
  tolerancePct: 1.5,
  shoulderTolPct: 3,
  flagPoleMinPct: 8,
  flagMaxRetracePct: 50,
};

const change = (a: number, b: number) => ((b - a) / a) * 100;
const pts = (ps: Pivot[]) => ps.map((p) => ({ time: p.time, price: p.price }));
const kinds = (ps: Pivot[]) => ps.map((p) => (p.kind === "high" ? "H" : "L")).join("");
const lineAt = (a: Pivot, b: Pivot, x: number) => a.price + ((b.price - a.price) * (x - a.index)) / (b.index - a.index || 1);

export function detectChartPatterns(bars: Bar[], opts: ChartPatternOptions = {}): ChartPattern[] {
  const o = { ...CHART_PATTERN_DEFAULTS, ...opts };
  const tol = o.tolerancePct;
  const equal = (a: number, b: number) => (Math.abs(a - b) / ((a + b) / 2)) * 100 <= tol;
  const piv = zigzag(bars, o.deviationPct, o.depth);
  const out: ChartPattern[] = [];
  const add = (name: string, bias: ChartPattern["bias"], ps: Pivot[], target?: number) =>
    out.push({
      name,
      bias,
      points: pts(ps),
      startIndex: ps[0].index,
      endIndex: ps[ps.length - 1].index,
      ...(target !== undefined ? { target } : {}),
    });

  for (let e = 0; e < piv.length; e++) {
    // ----- 3 pivots: double top / bottom -----
    if (e >= 2) {
      const w = piv.slice(e - 2, e + 1);
      const [a, m, b] = w;
      const k = kinds(w);
      if (k === "HLH" && equal(a.price, b.price)) {
        const top = Math.max(a.price, b.price);
        add("double-top", "bearish", w, m.price - (top - m.price));
      }
      if (k === "LHL" && equal(a.price, b.price)) {
        const bot = Math.min(a.price, b.price);
        add("double-bottom", "bullish", w, m.price + (m.price - bot));
      }
    }

    // ----- 4 pivots: triangles and wedges -----
    if (e >= 3) {
      const w = piv.slice(e - 3, e + 1);
      const [h1, h2] = w.filter((p) => p.kind === "high");
      const [l1, l2] = w.filter((p) => p.kind === "low");
      const first = w[0].index;
      const last = w[3].index;
      const gap = (x: number) => lineAt(h1, h2, x) - lineAt(l1, l2, x);
      const converging = gap(last) < gap(first) && gap(last) > 0;
      if (converging) {
        const dU = change(h1.price, h2.price);
        const dL = change(l1.price, l2.price);
        const flatU = Math.abs(dU) <= tol;
        const flatL = Math.abs(dL) <= tol;
        if (flatU && dL > tol) {
          const res = (h1.price + h2.price) / 2;
          add("ascending-triangle", "bullish", w, res + (res - l1.price));
        } else if (flatL && dU < -tol) {
          const sup = (l1.price + l2.price) / 2;
          add("descending-triangle", "bearish", w, sup - (h1.price - sup));
        } else if (dU < -tol && dL > tol) {
          add("symmetric-triangle", "neutral", w);
        } else if (dU > tol && dL > tol) {
          add("rising-wedge", "bearish", w, l1.price);
        } else if (dU < -tol && dL < -tol) {
          add("falling-wedge", "bullish", w, h1.price);
        }
      }
    }

    // ----- 5 pivots: triple tops, head and shoulders, flags -----
    if (e >= 4) {
      const w = piv.slice(e - 4, e + 1);
      const k = kinds(w);
      const [p0, p1, p2, p3, p4] = w;
      if (k === "HLHLH") {
        const tops = [p0.price, p2.price, p4.price];
        const mean = (tops[0] + tops[1] + tops[2]) / 3;
        const neck = Math.min(p1.price, p3.price);
        if (((Math.max(...tops) - Math.min(...tops)) / mean) * 100 <= tol) {
          add("triple-top", "bearish", w, neck - (Math.max(...tops) - neck));
        } else if (
          change(p0.price, p2.price) > tol &&
          change(p4.price, p2.price) > tol &&
          (Math.abs(p0.price - p4.price) / ((p0.price + p4.price) / 2)) * 100 <= o.shoulderTolPct
        ) {
          const neckHead = lineAt(p1, p3, p2.index);
          add("head-and-shoulders", "bearish", w, lineAt(p1, p3, p4.index) - (p2.price - neckHead));
        }
      }
      if (k === "LHLHL") {
        const bots = [p0.price, p2.price, p4.price];
        const mean = (bots[0] + bots[1] + bots[2]) / 3;
        const neck = Math.max(p1.price, p3.price);
        if (((Math.max(...bots) - Math.min(...bots)) / mean) * 100 <= tol) {
          add("triple-bottom", "bullish", w, neck + (neck - Math.min(...bots)));
        } else if (
          change(p0.price, p2.price) < -tol &&
          change(p4.price, p2.price) < -tol &&
          (Math.abs(p0.price - p4.price) / ((p0.price + p4.price) / 2)) * 100 <= o.shoulderTolPct
        ) {
          const neckHead = lineAt(p1, p3, p2.index);
          add("inverse-head-and-shoulders", "bullish", w, lineAt(p1, p3, p4.index) + (neckHead - p2.price));
        }
        // Bull flag: L0 H1 L1 H2 L2.
        const pole = p1.price - p0.price;
        if (
          change(p0.price, p1.price) >= o.flagPoleMinPct &&
          p3.price <= p1.price * (1 + tol / 100) &&
          p4.price <= p2.price * (1 + tol / 100) &&
          p1.price - Math.min(p2.price, p4.price) <= (o.flagMaxRetracePct / 100) * pole &&
          p1.index - p0.index <= p4.index - p1.index
        ) {
          add("bull-flag", "bullish", w, p3.price + pole);
        }
      }
      if (k === "HLHLH") {
        // Bear flag: H0 L1 H1 L2 H2.
        const pole = p0.price - p1.price;
        if (
          -change(p0.price, p1.price) >= o.flagPoleMinPct &&
          p3.price >= p1.price * (1 - tol / 100) &&
          p4.price >= p2.price * (1 - tol / 100) &&
          Math.max(p2.price, p4.price) - p1.price <= (o.flagMaxRetracePct / 100) * pole &&
          p1.index - p0.index <= p4.index - p1.index
        ) {
          add("bear-flag", "bearish", w, p3.price - pole);
        }
      }
    }
  }

  const contains = (big: ChartPattern, small: ChartPattern) => big.startIndex <= small.startIndex && big.endIndex >= small.endIndex;
  const kept = out.filter((p) => {
    if (p.name === "double-top") return !out.some((q) => q.name === "triple-top" && contains(q, p));
    if (p.name === "double-bottom") return !out.some((q) => q.name === "triple-bottom" && contains(q, p));
    return true;
  });
  return kept.sort((a, b) => a.endIndex - b.endIndex || a.startIndex - b.startIndex || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
