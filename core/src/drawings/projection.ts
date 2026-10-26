// Forecasting drawing tools: pure math (no DOM). Long/short position sizing, risk/reward and the
// outcome when later bars reach the target or the stop; forecast (prediction) outcome; bars-pattern
// capture and transforms; ghost-feed candles; sector (projection) geometry and hit-tests.

import type { Anchor, Bar } from "../types";
import type { Point } from "./geometry";

// ---------- bar lookup ----------

/** Index of the first bar with time >= `time` (bars.length when none). Bars sorted by time. */
export function barIndexAtOrAfter(bars: readonly Bar[], time: number): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the last bar with time <= `time` (-1 when none). */
export function barIndexAtOrBefore(bars: readonly Bar[], time: number): number {
  const i = barIndexAtOrAfter(bars, time);
  if (i < bars.length && bars[i].time === time) return i;
  return i - 1;
}

// ---------- price ticks ----------

/**
 * Tick size used by the forecasting and measuring tools when the symbol's own tick is unknown:
 * one unit of the last displayed decimal (≥ 10 → 0.01, ≥ 1 → 0.0001, ≥ 0.01 → 0.00001, smaller
 * prices keep about four significant digits). Same rule as the chart's price decimals.
 */
export function tickSizeFor(price: number): number {
  const a = Math.abs(price);
  let d: number;
  if (!isFinite(a) || a === 0) d = 2;
  else if (a >= 10) d = 2;
  else if (a >= 1) d = 4;
  else if (a >= 0.01) d = 5;
  else d = Math.min(10, Math.ceil(-Math.log10(a)) + 3);
  return Math.pow(10, -d);
}

/** Whole ticks in a price distance (absolute, rounded). */
export function ticksIn(distance: number, tick: number): number {
  return tick > 0 ? Math.round(Math.abs(distance) / tick) : 0;
}

// ---------- positions (risk / reward) ----------

export type PositionSide = "long" | "short";

export interface PositionLevels {
  entry: number;
  stop: number;
  target: number;
}

/** Stop and target prices from tick distances (long: target above, stop below; short: mirrored). */
export function positionPrices(side: PositionSide, entry: number, stopTicks: number, profitTicks: number, tick: number): PositionLevels {
  const s = side === "long" ? 1 : -1;
  return { entry, stop: entry - s * Math.abs(stopTicks) * tick, target: entry + s * Math.abs(profitTicks) * tick };
}

export interface PositionInputs {
  /** Account size in the account currency. */
  accountSize: number;
  /** Risk: percent of the account ("percents") or a cash amount ("money"). */
  risk: number;
  riskMode: "percents" | "money";
  /** Units per lot (contract size). */
  lotSize: number;
  /** Decimals the quantity is rounded down to; "default" = 2. */
  qtyPrecision: number | "default";
}

/** Default quantity precision when the user picks "Default" (documented sensible default). */
export const DEFAULT_QTY_PRECISION = 2;

/** Cash at risk: risk % of the account, or the cash amount (capped at the account size). */
export function riskAmount(inp: Pick<PositionInputs, "accountSize" | "risk" | "riskMode">): number {
  const acct = Math.max(0, inp.accountSize);
  if (inp.riskMode === "money") return Math.min(Math.max(0, inp.risk), acct);
  return (acct * Math.min(Math.max(0, inp.risk), 100)) / 100;
}

/** Rounds a quantity down to `precision` decimals (lot rounding never exceeds the risk). */
export function roundQty(q: number, precision: number | "default"): number {
  const p = precision === "default" ? DEFAULT_QTY_PRECISION : Math.max(0, Math.min(10, Math.floor(precision)));
  const f = Math.pow(10, p);
  return Math.floor(q * f + 1e-9) / f;
}

export interface PositionSize {
  riskAmount: number;
  /** Quantity in lots, rounded down to the precision. */
  qty: number;
  /** Units (qty × lot size). */
  units: number;
}

/** Position size: risk amount ÷ (stop distance × lot size), rounded down to the qty precision. */
export function positionSize(inp: PositionInputs, entry: number, stop: number): PositionSize {
  const risk = riskAmount(inp);
  const dist = Math.abs(entry - stop);
  const lot = inp.lotSize > 0 ? inp.lotSize : 1;
  const raw = dist > 0 ? risk / (dist * lot) : 0;
  const qty = roundQty(raw, inp.qtyPrecision);
  return { riskAmount: risk, qty, units: qty * lot };
}

/** Reward ÷ risk (0 when the stop distance is 0). */
export function riskReward(entry: number, stop: number, target: number): number {
  const r = Math.abs(entry - stop);
  return r > 0 ? Math.abs(target - entry) / r : 0;
}

export interface PositionStats extends PositionSize {
  side: PositionSide;
  levels: PositionLevels;
  riskReward: number;
  /** Target distance from entry: price, percent of entry, ticks; and the cash amount. */
  tpPrice: number;
  tpPercent: number;
  tpTicks: number;
  tpAmount: number;
  /** Stop distance: price, percent, ticks; and the cash amount lost. */
  slPrice: number;
  slPercent: number;
  slTicks: number;
  slAmount: number;
}

export function positionStats(side: PositionSide, levels: PositionLevels, inp: PositionInputs, tick: number): PositionStats {
  const size = positionSize(inp, levels.entry, levels.stop);
  const tp = Math.abs(levels.target - levels.entry);
  const sl = Math.abs(levels.entry - levels.stop);
  const pct = (v: number) => (levels.entry !== 0 ? (v / Math.abs(levels.entry)) * 100 : 0);
  return {
    ...size,
    side,
    levels,
    riskReward: riskReward(levels.entry, levels.stop, levels.target),
    tpPrice: tp,
    tpPercent: pct(tp),
    tpTicks: ticksIn(tp, tick),
    tpAmount: tp * size.units,
    slPrice: sl,
    slPercent: pct(sl),
    slTicks: ticksIn(sl, tick),
    slAmount: sl * size.units,
  };
}

export interface PositionOutcome {
  /**
   * "pending": no bar after the entry yet; "open": neither level reached (P&L at the last close in
   * range); "target" / "stop": the level reached first (closed).
   */
  status: "pending" | "open" | "target" | "stop";
  /** Bar index of the exit (closed) or of the last bar in range (open); -1 when pending. */
  index: number;
  /** Exit price (closed) or last close in range (open). */
  price: number;
  /** Signed price change in the position's favour (exit − entry for long, entry − exit for short). */
  change: number;
}

/**
 * Walks the bars after the entry bar up to `endTime` and reports which level price reached first.
 * Rules for one bar that touches both levels: a gap open beyond a level exits there at the open;
 * otherwise the intra-bar path is assumed O→L→H→C for a rising bar (close ≥ open) and O→H→L→C for
 * a falling bar, so a long's stop is hit first on a rising bar and its target first on a falling bar
 * (mirrored for a short).
 */
export function positionOutcome(side: PositionSide, lv: PositionLevels, bars: readonly Bar[], startTime: number, endTime: number): PositionOutcome {
  const long = side === "long";
  const sign = long ? 1 : -1;
  const first = barIndexAtOrBefore(bars, startTime) + 1;
  let last = -1;
  const done = (status: "target" | "stop", index: number, price: number): PositionOutcome => ({ status, index, price, change: sign * (price - lv.entry) });
  for (let i = Math.max(0, first); i < bars.length && bars[i].time <= endTime; i++) {
    const b = bars[i];
    last = i;
    const hitT = long ? b.high >= lv.target : b.low <= lv.target;
    const hitS = long ? b.low <= lv.stop : b.high >= lv.stop;
    if (!hitT && !hitS) continue;
    // Gap through a level: exit at the open.
    const openBeyondStop = long ? b.open <= lv.stop : b.open >= lv.stop;
    const openBeyondTarget = long ? b.open >= lv.target : b.open <= lv.target;
    if (openBeyondStop) return done("stop", i, b.open);
    if (openBeyondTarget) return done("target", i, b.open);
    if (hitT && hitS) {
      const lowFirst = b.close >= b.open;
      const stopFirst = long ? lowFirst : !lowFirst;
      return stopFirst ? done("stop", i, lv.stop) : done("target", i, lv.target);
    }
    return hitT ? done("target", i, lv.target) : done("stop", i, lv.stop);
  }
  if (last < 0) return { status: "pending", index: -1, price: lv.entry, change: 0 };
  const close = bars[last].close;
  return { status: "open", index: last, price: close, change: sign * (close - lv.entry) };
}

// ---------- forecast (prediction) ----------

export interface PredictionOutcome {
  /** "pending" until a bar at or after the target time exists. */
  status: "pending" | "success" | "failure";
  /** Close of the last bar at or before the target time (the source price while pending). */
  endPrice: number;
  /** endPrice − source price, and in percent of the source price. */
  change: number;
  percent: number;
  /** Bar index of the end bar (-1 when pending). */
  index: number;
}

/**
 * Outcome of a forecast from `src` to `dst`: once the end bar has passed (a bar at or after
 * dst.time exists), success when price reached the target price in the forecast direction between
 * the source and the target time (high ≥ target for an up forecast, low ≤ target for a down one).
 */
export function predictionOutcome(src: Anchor, dst: Anchor, bars: readonly Bar[]): PredictionOutcome {
  const pending: PredictionOutcome = { status: "pending", endPrice: src.price, change: 0, percent: 0, index: -1 };
  if (!bars.length || bars[bars.length - 1].time < dst.time) return pending;
  const end = barIndexAtOrBefore(bars, dst.time);
  if (end < 0) return pending;
  const up = dst.price >= src.price;
  let reached = false;
  for (let i = Math.max(0, barIndexAtOrBefore(bars, src.time) + 1); i <= end; i++) {
    if (up ? bars[i].high >= dst.price : bars[i].low <= dst.price) {
      reached = true;
      break;
    }
  }
  const endPrice = bars[end].close;
  const change = endPrice - src.price;
  return { status: reached ? "success" : "failure", endPrice, change, percent: src.price !== 0 ? (change / Math.abs(src.price)) * 100 : 0, index: end };
}

// ---------- bars pattern ----------

/** One copied bar: open, high, low, close relative to the pattern's base price. */
export type PatternBar = [number, number, number, number];

/** Copies the bars between two times (inclusive, either order) relative to `base`. */
export function capturePattern(bars: readonly Bar[], t0: number, t1: number, base: number): PatternBar[] {
  const from = Math.min(t0, t1);
  const to = Math.max(t0, t1);
  const out: PatternBar[] = [];
  for (let i = barIndexAtOrAfter(bars, from); i < bars.length && bars[i].time <= to; i++) {
    const b = bars[i];
    out.push([b.open - base, b.high - base, b.low - base, b.close - base]);
  }
  return out;
}

/**
 * Mirrored: reversed in time (bar order reversed, open and close swapped). Flipped: upside down
 * around the base (values negated, high and low swapped).
 */
export function transformPattern(p: readonly PatternBar[], o: { mirrored?: boolean; flipped?: boolean }): PatternBar[] {
  let out = p.map((b) => [...b] as PatternBar);
  if (o.mirrored) out = out.reverse().map(([op, h, l, c]) => [c, h, l, op]);
  if (o.flipped) out = out.map(([op, h, l, c]) => [-op, -l, -h, -c]);
  return out;
}

/** Bars-pattern style modes (catalog values). */
export const BARS_PATTERN_MODES = { hlBars: 0, line: 1, ocBars: 2, lineOpen: 3, lineHigh: 4, lineLow: 5, lineHl2: 6 } as const;

/** Value of a pattern bar plotted by a line mode (1 close, 3 open, 4 high, 5 low, 6 (H+L)/2). */
export function patternLineValue(b: PatternBar, mode: number): number {
  switch (mode) {
    case 3:
      return b[0];
    case 4:
      return b[1];
    case 5:
      return b[2];
    case 6:
      return (b[1] + b[2]) / 2;
    default:
      return b[3];
  }
}

// ---------- ghost feed ----------

export interface GhostCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Deterministic pseudo-random value in [0, 1) for an index (stable wicks across redraws). */
export function ghostNoise(i: number): number {
  const x = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Hypothetical candles along a clicked path: one candle per bar slot between consecutive points;
 * each opens at the previous close and closes on the path. Wicks extend beyond the body by up to
 * `variance` % of the body (deterministic per candle).
 */
export function ghostCandles(points: readonly Anchor[], intervalSec: number, variance: number): GhostCandle[] {
  const out: GhostCandle[] = [];
  if (points.length < 2 || !(intervalSec > 0)) return out;
  const sorted = [...points].sort((a, b) => a.time - b.time);
  let prev = sorted[0].price;
  const v = Math.max(0, variance) / 100;
  for (let s = 1; s < sorted.length; s++) {
    const a = sorted[s - 1];
    const b = sorted[s];
    const n = Math.max(1, Math.round((b.time - a.time) / intervalSec));
    for (let k = 1; k <= n; k++) {
      const close = a.price + ((b.price - a.price) * k) / n;
      const open = prev;
      const body = Math.abs(close - open);
      const i = out.length;
      const high = Math.max(open, close) + body * v * ghostNoise(2 * i);
      const low = Math.min(open, close) - body * v * ghostNoise(2 * i + 1);
      out.push({ time: a.time + Math.round(((b.time - a.time) * k) / n), open, high, low, close });
      prev = close;
    }
  }
  return out;
}

// ---------- rectangles ----------

/** Point inside the rectangle spanned by two corners (tolerance grows it). */
export function forecastInBox(x: number, y: number, a: Point, b: Point, tol = 0): boolean {
  return x >= Math.min(a.x, b.x) - tol && x <= Math.max(a.x, b.x) + tol && y >= Math.min(a.y, b.y) - tol && y <= Math.max(a.y, b.y) + tol;
}

// ---------- sector (projection) ----------

export interface SectorGeom {
  center: Point;
  radius: number;
  /** Angles (radians, canvas orientation) of the first and second arm. */
  start: number;
  end: number;
  /** Sweep from start to end, in (-π, π]. */
  sweep: number;
}

/** Sector centred at the first anchor, radius = |p1 − p0|, swept from p1's angle to p2's angle (shortest way). */
export function sectorGeometry(p0: Point, p1: Point, p2: Point): SectorGeom {
  const start = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  const end = Math.atan2(p2.y - p0.y, p2.x - p0.x);
  let sweep = end - start;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep <= -Math.PI) sweep += 2 * Math.PI;
  return { center: p0, radius: Math.hypot(p1.x - p0.x, p1.y - p0.y), start, end: start + sweep, sweep };
}

/** Angle `a` lies within the sweep from `start` (signed sweep). */
function inSweep(a: number, start: number, sweep: number): boolean {
  let d = a - start;
  if (sweep >= 0) {
    while (d < 0) d += 2 * Math.PI;
    while (d >= 2 * Math.PI) d -= 2 * Math.PI;
    return d <= sweep;
  }
  while (d > 0) d -= 2 * Math.PI;
  while (d <= -2 * Math.PI) d += 2 * Math.PI;
  return d >= sweep;
}

/** Sector hit: inside the filled sector, on its arc or on either arm (within tol px). */
export function hitSector(g: SectorGeom, x: number, y: number, tol: number): boolean {
  const dx = x - g.center.x;
  const dy = y - g.center.y;
  const r = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  if (r <= g.radius + tol && inSweep(ang, g.start, g.sweep)) return true;
  for (const a of [g.start, g.end]) {
    const ex = g.center.x + Math.cos(a) * g.radius;
    const ey = g.center.y + Math.sin(a) * g.radius;
    if (segDist(x, y, g.center.x, g.center.y, ex, ey) <= tol) return true;
  }
  return false;
}

function segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Point on the sector's arc at `coeff` × radius and angle fraction `f` of the sweep. */
export function sectorPoint(g: SectorGeom, coeff: number, f: number): Point {
  const a = g.start + g.sweep * f;
  return { x: g.center.x + Math.cos(a) * g.radius * coeff, y: g.center.y + Math.sin(a) * g.radius * coeff };
}
