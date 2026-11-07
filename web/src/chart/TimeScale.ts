// Index-based horizontal scale. Bars are laid out by index (gaps such as weekends are skipped);
// the view is described by `barSpacing` (px per bar) and `rightOffset` (bars of empty space
// right of the last bar; negative when scrolled into history). Anchoring the view to the
// last bar means prepending history never moves the visible bars on screen.

import { tickLabel } from "./format";
import { toZone } from "./timeZone";

export interface TimeScaleOptions {
  minSpacing: number;
  maxSpacing: number;
  defaultSpacing: number;
  defaultRightOffset: number;
}

export const DEFAULT_TIME_OPTIONS: TimeScaleOptions = {
  minSpacing: 0.05,
  maxSpacing: 80,
  defaultSpacing: 7,
  defaultRightOffset: 6,
};

const DAY = 86400;
const LABEL_SPANS = [
  60, 300, 900, 1800, 3600, 7200, 14400, 21600, 43200, DAY, 2 * DAY, 7 * DAY, 14 * DAY,
  30 * DAY, 91 * DAY, 182 * DAY, 365 * DAY, 2 * 365 * DAY, 5 * 365 * DAY, 10 * 365 * DAY,
];

export interface TimeTick {
  index: number;
  x: number;
  text: string;
  major: boolean;
}

export class TimeScale {
  barSpacing: number;
  rightOffset: number;
  width = 0;
  /** IANA zone of the time axis labels (intraday charts). */
  zone = "UTC";
  intervalSec = DAY;
  readonly opts: TimeScaleOptions;
  private times: readonly number[] = [];

  constructor(opts: Partial<TimeScaleOptions> = {}) {
    this.opts = { ...DEFAULT_TIME_OPTIONS, ...opts };
    this.barSpacing = this.opts.defaultSpacing;
    this.rightOffset = this.opts.defaultRightOffset;
  }

  get count(): number {
    return this.times.length;
  }
  get lastIndex(): number {
    return this.times.length - 1;
  }

  setWidth(w: number): void {
    this.width = Math.max(0, w);
    this.clamp();
  }

  /** Replace the time axis (new series). Does not touch the view. */
  setTimes(times: readonly number[], intervalSec: number): void {
    this.times = times;
    this.intervalSec = intervalSec;
    this.clamp();
  }

  /** History was prepended: indices shift, but the view (anchored right) stays put. */
  prependTimes(times: readonly number[]): void {
    this.times = times;
  }

  /**
   * `n` bars were appended. At the live edge the chart follows the new bar;
   * when scrolled into history the view is kept stable.
   */
  appendTimes(times: readonly number[], n: number): void {
    this.times = times;
    // Indices of existing bars are unchanged but the last index grew: shift the view back.
    if (this.rightOffset < 0) this.rightOffset -= n;
    this.clamp();
  }

  reset(): void {
    this.barSpacing = this.opts.defaultSpacing;
    this.rightOffset = this.opts.defaultRightOffset;
    this.clamp();
  }

  /** Show the fractional index range [from, to] across the full width (clamped like a zoom). */
  setVisibleRange(from: number, to: number): void {
    if (!(to > from) || this.width <= 0) return;
    this.barSpacing = this.clampSpacing(this.width / (to - from));
    // x(to) = width  <=>  lastIndex + rightOffset - to + 0.5 = 0
    this.rightOffset = to - this.lastIndex - 0.5;
    this.clamp();
  }

  /** Center x (px) of bar index `i` (fractional allowed). */
  indexToX(i: number): number {
    return this.width - (this.lastIndex + this.rightOffset - i + 0.5) * this.barSpacing;
  }

  /** Fractional index under x. */
  xToIndex(x: number): number {
    return this.lastIndex + this.rightOffset + 0.5 - (this.width - x) / this.barSpacing;
  }

  /** Nearest whole bar index under x (not clamped to the data). */
  xToBar(x: number): number {
    return Math.round(this.xToIndex(x));
  }

  /** Visible index range clamped to the data; `from > to` when nothing is visible. */
  visibleRange(): { from: number; to: number } {
    const from = Math.max(0, Math.floor(this.xToIndex(0)));
    const to = Math.min(this.lastIndex, Math.ceil(this.xToIndex(this.width)));
    return { from, to };
  }

  /** Leftmost visible logical index (negative when empty space shows left of the data). */
  leftIndex(): number {
    return this.xToIndex(0);
  }

  /** Zoom by `factor` (>1 zooms in) keeping the bar under `anchorX` fixed. */
  zoom(factor: number, anchorX: number): void {
    const anchorIndex = this.xToIndex(anchorX);
    const next = this.clampSpacing(this.barSpacing * factor);
    if (next === this.barSpacing) return;
    this.barSpacing = next;
    this.rightOffset = anchorIndex - this.lastIndex - 0.5 + (this.width - anchorX) / this.barSpacing;
    this.clamp();
  }

  /** Pan by dx pixels; positive dx drags the chart right (reveals older bars). */
  pan(dx: number): void {
    this.rightOffset -= dx / this.barSpacing;
    this.clamp();
  }

  /** Scroll the view by n bars; positive n moves toward newer bars. */
  scrollBars(n: number): void {
    this.rightOffset += n;
    this.clamp();
  }

  visibleBarCount(): number {
    return this.barSpacing > 0 ? this.width / this.barSpacing : 0;
  }

  timeAt(i: number): number | undefined {
    return this.times[i];
  }

  /** Time for a (possibly fractional/out-of-range) index, extrapolating with interval seconds. */
  indexToTime(i: number): number {
    const n = this.count;
    if (n === 0) return 0;
    const times = this.times;
    if (i >= n - 1) return Math.round(times[n - 1] + (i - (n - 1)) * this.intervalSec);
    if (i <= 0) return Math.round(times[0] + i * this.intervalSec);
    const lo = Math.floor(i);
    const f = i - lo;
    if (f === 0) return times[lo];
    return Math.round(times[lo] + (times[lo + 1] - times[lo]) * f);
  }

  /**
   * Fractional index for a timestamp. Bar times map to their exact index, times between bars
   * interpolate, and times outside the data extrapolate using interval seconds.
   */
  timeToIndex(t: number): number {
    const n = this.count;
    if (n === 0) return 0;
    const times = this.times;
    if (t >= times[n - 1]) return n - 1 + (t - times[n - 1]) / this.intervalSec;
    if (t <= times[0]) return (t - times[0]) / this.intervalSec;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) lo = mid;
      else hi = mid;
    }
    if (times[lo] === t) return lo;
    return lo + (t - times[lo]) / (times[hi] - times[lo]);
  }

  timeToX(t: number): number {
    return this.indexToX(this.timeToIndex(t));
  }

  xToTime(x: number): number {
    return this.indexToTime(this.xToIndex(x));
  }

  /** Average seconds per bar over the data (accounts for session gaps). */
  private avgSecondsPerBar(): number {
    const n = this.count;
    if (n < 2) return this.intervalSec;
    return Math.max(this.intervalSec, (this.times[n - 1] - this.times[0]) / (n - 1));
  }

  /**
   * Tick marks for the time axis at calendar boundaries, at least `minLabelPx` apart. Empty
   * space right of the last bar gets ticks at projected times (one interval per bar).
   */
  ticks(minLabelPx = 80): TimeTick[] {
    const { from, to: lastVisible } = this.visibleRange();
    if (from > lastVisible) return [];
    const to = lastVisible < this.lastIndex ? lastVisible : Math.max(lastVisible, Math.ceil(this.xToIndex(this.width)));
    const wanted = (this.avgSecondsPerBar() / this.barSpacing) * minLabelPx;
    let span = LABEL_SPANS[LABEL_SPANS.length - 1];
    for (const s of LABEL_SPANS) {
      if (s >= wanted && s >= this.intervalSec) {
        span = s;
        break;
      }
    }
    const out: TimeTick[] = [];
    // Intraday calendars follow the chart's zone; daily and longer bars are dates already.
    const tz = this.intervalSec < DAY ? this.zone : "UTC";
    const key0 = (t: number) => bucketKey(toZone(t, tz), span);
    let prevTime: number | null = from > 0 ? this.times[from - 1] : null;
    let prevKey: number | null = prevTime == null ? null : key0(prevTime);
    let lastX = -Infinity;
    for (let i = from; i <= to; i++) {
      const t = i <= this.lastIndex ? this.times[i] : this.indexToTime(i);
      const key = key0(t);
      if (prevKey !== null && key !== prevKey) {
        const x = this.indexToX(i);
        if (x - lastX >= minLabelPx * 0.7) {
          const { text, major } = tickLabel(t, prevTime, span, tz);
          out.push({ index: i, x, text, major });
          lastX = x;
        }
      }
      prevKey = key;
      prevTime = t;
    }
    return out;
  }

  private clampSpacing(s: number): number {
    return Math.min(this.opts.maxSpacing, Math.max(this.opts.minSpacing, s));
  }

  private clamp(): void {
    this.barSpacing = this.clampSpacing(this.barSpacing);
    if (this.width <= 0 || this.count === 0) return;
    const keep = Math.min(5, this.count);
    const maxRight = this.width / this.barSpacing - keep;
    const minRight = -(this.count - keep);
    if (this.rightOffset > maxRight) this.rightOffset = maxRight;
    if (this.rightOffset < minRight) this.rightOffset = Math.min(minRight, maxRight);
  }
}

/** Calendar bucket of `t` for a tick span; a change of bucket marks a tick. */
export function bucketKey(t: number, span: number): number {
  if (span < DAY) return Math.floor(t / span);
  if (span < 7 * DAY) return Math.floor(t / span);
  if (span < 28 * DAY) return Math.floor((t / DAY + 3) / 7 / Math.round(span / (7 * DAY)));
  const d = new Date(t * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (span < 365 * DAY) return Math.floor((y * 12 + m) / Math.round(span / (30.4 * DAY)));
  return Math.floor(y / Math.round(span / (365 * DAY)));
}
