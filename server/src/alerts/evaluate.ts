// Pure alert-condition evaluation. No I/O: bars, drawings and indicator series come in as data.
import { drawingAlertValue, type Alert, type AlertCondition, type AlertOperand, type Bar, type Drawing, type DrawingAlertValue, type Interval, type Series } from "@qt/core";
import { INTERVAL_SEC } from "../bars";

/**
 * A scalar operand value, a price band (channel drawings), price levels (Fibonacci drawings), a
 * vertical line's time with the evaluated bar time, or null when not available.
 */
export type OperandValue = DrawingAlertValue;

/** Computes an indicator output over `bars` (aligned 1:1). */
export type IndicatorFn = (indicatorId: string, inputs: Record<string, number | string | boolean>, output: string, bars: Bar[]) => Series;

/** Runtime state kept between evaluations of one alert (in memory only). */
export interface AlertState {
  /** Bar time and per-condition [left, right] values of the last evaluation. */
  sample?: { barTime: number; values: [OperandValue, OperandValue][] };
  /** Identity of the last evaluated data point (bar time, close, volume) for "every-time". */
  sampleKey?: string;
}

export interface EvalResult {
  fired: boolean;
  /** The alert should be switched off (fired with trigger "once", or expired). */
  deactivate: boolean;
  expired: boolean;
  /** Price (close of the evaluated bar) and its open time, when a bar was evaluated. */
  price?: number;
  barTime?: number;
  state: AlertState;
  /** Why a condition could not be evaluated (unknown drawing, missing data, ...). */
  error?: string;
}

export interface EvalInput {
  bars: Bar[];
  interval: Interval;
  /** Wall clock, ms. */
  now: number;
  /** Drawings by id (from the alert's layout). */
  drawings?: ReadonlyMap<string, Drawing>;
  indicator?: IndicatorFn;
}

/** Close time (UTC seconds) of a bar: the next bar's nominal open. 1M uses the calendar month. */
export function barCloseTime(time: number, interval: Interval): number {
  if (interval === "1M") {
    const d = new Date(time * 1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) / 1000;
  }
  return time + INTERVAL_SEC[interval];
}

// ---------- Drawings ----------

/**
 * Value of a drawing at bar time `t` (the shared geometry in core `drawings/alerts`, the same the
 * chart draws): lines where they are drawn (segment + extend flags), horizontal lines and rays,
 * the vertical line's time, Fibonacci levels, and the bands of channels and rectangles.
 */
export function drawingValue(d: Drawing, t: number): OperandValue {
  return drawingAlertValue(d, t);
}

// ---------- Operands ----------

/** Resolves operand values per bar index; indicator series are computed once per operand. */
export function operandResolver(input: EvalInput): { value(op: AlertOperand, i: number): OperandValue; error?: string } {
  const series = new Map<string, Series>();
  const self = {
    error: undefined as string | undefined,
    value(op: AlertOperand, i: number): OperandValue {
      const bar = input.bars[i];
      if (!bar) return null;
      switch (op.kind) {
        case "value":
          return op.value;
        case "price":
          return bar[op.field ?? "close"];
        case "indicator": {
          const key = JSON.stringify([op.indicatorId, op.inputs, op.output]);
          let s = series.get(key);
          if (!s) {
            if (!input.indicator) {
              self.error = "Indicators are not available";
              return null;
            }
            s = input.indicator(op.indicatorId, op.inputs, op.output, input.bars);
            series.set(key, s);
          }
          const v = s[i];
          return typeof v === "number" && Number.isFinite(v) ? v : null;
        }
        case "drawing": {
          const d = input.drawings?.get(op.drawingId);
          if (!d) {
            self.error = `Drawing not found: ${op.drawingId}`;
            return null;
          }
          return drawingValue(d, bar.time);
        }
      }
    },
  };
  return self;
}

const isNum = (v: OperandValue): v is number => typeof v === "number";
const isBand = (v: OperandValue): v is { lo: number; hi: number } => v !== null && typeof v === "object" && "lo" in v;
const isTime = (v: OperandValue): v is { time: number; at: number } => v !== null && typeof v === "object" && "at" in v;
const inside = (x: number, band: { lo: number; hi: number }) => x >= band.lo && x <= band.hi;

/** Price lines a value offers for crossing: one price, every level, or both bounds of a band. */
function crossLines(v: OperandValue): number[] | null {
  if (isNum(v)) return [v];
  if (v !== null && typeof v === "object" && "levels" in v) return v.levels;
  if (isBand(v)) return [v.lo, v.hi];
  return null;
}

/** Crossing of a number (left) over any of the right operand's lines between two evaluations. */
function crossed(op: "crosses" | "crosses-up" | "crosses-down", l: OperandValue, r: OperandValue, pl: OperandValue, pr: OperandValue): boolean {
  // Vertical line: the bar time reaches the line's time.
  if (isTime(r)) return isTime(pr) && pr.at < r.time && r.at >= r.time;
  if (!isNum(l) || !isNum(pl)) return false;
  const cur = crossLines(r);
  const prev = crossLines(pr);
  if (!cur || !prev || cur.length !== prev.length) return false;
  return cur.some((x, i) => {
    const up = pl <= prev[i] && l > x;
    const down = pl >= prev[i] && l < x;
    return op === "crosses-up" ? up : op === "crosses-down" ? down : up || down;
  });
}

/**
 * Does one condition hold? `cur` are the values now, `prev` the values one step before
 * (previous evaluation or previous bar). `history(n)` gives the left operand n bars back.
 */
export function conditionHolds(
  cond: AlertCondition,
  cur: [OperandValue, OperandValue],
  prev: [OperandValue, OperandValue] | null,
  leftBarsAgo: (n: number) => OperandValue,
): boolean {
  const [l, r] = cur;
  switch (cond.op) {
    case "greater":
      return isNum(l) && isNum(r) && l > r;
    case "less":
      return isNum(l) && isNum(r) && l < r;
    case "crosses-up":
    case "crosses-down":
    case "crosses":
      return prev !== null && crossed(cond.op, l, r, prev[0], prev[1]);
    case "enters-channel":
    case "exits-channel": {
      if (!prev || !isNum(l) || !isBand(r) || !isNum(prev[0]) || !isBand(prev[1])) return false;
      const was = inside(prev[0], prev[1]);
      const is = inside(l, r);
      return cond.op === "enters-channel" ? !was && is : was && !is;
    }
    case "moving-up-pct":
    case "moving-down-pct": {
      const base = leftBarsAgo(cond.bars ?? 1);
      if (!isNum(l) || !isNum(base) || base === 0) return false;
      const pct = ((l - base) / Math.abs(base)) * 100;
      const need = cond.pct ?? 0;
      return cond.op === "moving-up-pct" ? pct >= need : pct <= -need;
    }
  }
}

/**
 * Evaluate an alert on the latest bars.
 *
 * - Expired alerts (now >= expiresAt) never fire and are deactivated.
 * - "once-per-bar-close" evaluates the last *closed* bar only (open time + interval <= now),
 *   compares crossings with the bar before it, fires at most once per closed bar, and only for
 *   bars that closed after the alert was created.
 * - Other triggers evaluate the latest (possibly forming) bar. Crossings compare with the
 *   previous evaluation's values when that sample belongs to the current or previous bar, else
 *   with the previous bar. "once-per-bar" fires at most once per bar, "every-time" once per new
 *   data point (bar time/close/volume changed), "once" fires once and deactivates the alert.
 * - All conditions must hold (AND).
 */
export function evaluateAlert(alert: Alert, input: EvalInput, state: AlertState = {}): EvalResult {
  const { bars, interval, now } = input;
  if (alert.expiresAt !== undefined && now >= alert.expiresAt) {
    return { fired: false, deactivate: true, expired: true, state };
  }
  const closeMode = alert.trigger === "once-per-bar-close";
  let c = bars.length - 1;
  if (closeMode) while (c >= 0 && barCloseTime(bars[c].time, interval) * 1000 > now) c--;
  if (c < 0) return { fired: false, deactivate: false, expired: false, state, error: bars.length ? undefined : "No bars" };

  const bar = bars[c];
  const resolver = operandResolver(input);
  const curValues: [OperandValue, OperandValue][] = alert.conditions.map((k) => [resolver.value(k.left, c), resolver.value(k.right, c)]);
  const s = state.sample;
  const usePrevSample =
    !closeMode && s !== undefined && s.values.length === alert.conditions.length && s.barTime >= (c > 0 ? bars[c - 1].time : bar.time);

  const holds = alert.conditions.every((cond, k) => {
    let prev: [OperandValue, OperandValue] | null = null;
    if (usePrevSample) prev = s.values[k];
    else if (c > 0) prev = [resolver.value(cond.left, c - 1), resolver.value(cond.right, c - 1)];
    return conditionHolds(cond, curValues[k], prev, (n) => (c - n >= 0 ? resolver.value(cond.left, c - n) : null));
  });

  const sampleKey = `${bar.time}:${bar.close}:${bar.volume}`;
  const next: AlertState = { sample: { barTime: bar.time, values: curValues }, sampleKey };
  const base = { deactivate: false, expired: false, price: bar.close, barTime: bar.time, state: next, error: resolver.error };
  if (!holds) return { ...base, fired: false };

  const last = alert.lastFiredAt;
  let allowed: boolean;
  switch (alert.trigger) {
    case "once":
      allowed = true;
      break;
    case "once-per-bar":
      allowed = last === undefined || last < bar.time * 1000;
      break;
    case "once-per-bar-close": {
      const closedAt = barCloseTime(bar.time, interval) * 1000;
      allowed = closedAt >= alert.createdAt && (last === undefined || last < closedAt);
      break;
    }
    case "every-time":
      allowed = state.sampleKey !== sampleKey;
      break;
  }
  if (!allowed) return { ...base, fired: false };
  return { ...base, fired: true, deactivate: alert.trigger === "once" };
}
