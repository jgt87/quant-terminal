// Vertical scale of one pane: auto-fit to the visible data with margins, manual scaling by
// dragging the axis, linear or logarithmic mode, and "nice" ticks (1/2/2.5/5 x 10^n).

import { formatPrice, priceDecimals, stepDecimals, formatCompact } from "./format";

/** Scales whose values reach this size label ticks compactly (3.38B). */
const COMPACT_FROM = 1e6;

export interface PriceTick {
  price: number;
  y: number;
  text: string;
}

const NICE = [1, 2, 2.5, 5, 10];

/** Smallest nice step (1/2/2.5/5 x 10^n) that is >= raw. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !isFinite(raw)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  for (const m of NICE) {
    const s = m * base;
    if (s >= raw * (1 - 1e-9)) return s;
  }
  return 10 * base;
}

/** Linear ticks covering [min, max] with at most ~maxTicks entries. */
export function niceTicks(min: number, max: number, maxTicks: number): { step: number; values: number[] } {
  if (!(max > min) || maxTicks < 1) return { step: 0, values: [] };
  const step = niceStep((max - min) / maxTicks);
  const values: number[] = [];
  const start = Math.ceil(min / step - 1e-9) * step;
  for (let v = start, k = 0; v <= max + step * 1e-9 && k < 1000; k++, v = start + k * step) {
    values.push(Number(v.toPrecision(12)));
  }
  return { step, values };
}

/** Percent mode: price → % change relative to `base` (first visible bar's close). */
export function toPercent(price: number, base: number): number {
  return base ? (price / base - 1) * 100 : 0;
}

export function fromPercent(pct: number, base: number): number {
  return base * (1 + pct / 100);
}

export function formatPercentLabel(pct: number, decimals = 2): string {
  const v = Math.abs(pct) < 1e-9 ? 0 : pct;
  return `${v > 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

/** Indexed mode: price → value where `base` is 100. */
export function toIndexed(price: number, base: number): number {
  return base ? (price / base) * 100 : 100;
}

export class PriceScale {
  /** When set, labels show % change from this price (data stays in price units). */
  percentBase: number | null = null;
  /** With `percentBase`: label as an index where the base is 100 instead of a % change. */
  indexed = false;
  /** Higher values lower on the pane. */
  inverted = false;
  height = 0;
  log = false;
  auto = true;
  /** Margins as fractions of the height. */
  marginTop = 0.08;
  marginBottom = 0.08;
  /** Visible range in price units (not transformed). */
  min = 0;
  max = 1;
  /** Forced decimals (e.g. FX); otherwise derived from magnitude. */
  decimals: number | null = null;
  fx = false;

  setHeight(h: number): void {
    this.height = Math.max(1, h);
  }

  setLog(log: boolean): void {
    this.log = log;
  }

  /** Range in transformed space. */
  private tf(p: number): number {
    return this.log ? Math.log10(Math.max(p, 1e-12)) : p;
  }
  private inv(v: number): number {
    return this.log ? Math.pow(10, v) : v;
  }

  /** Set the data range to fit (only applied when auto-scaling). */
  fit(min: number, max: number): void {
    if (!this.auto) return;
    this.setRange(min, max);
  }

  setRange(min: number, max: number): void {
    if (!isFinite(min) || !isFinite(max)) return;
    if (this.log) {
      min = Math.max(min, 1e-12);
      max = Math.max(max, min);
    }
    if (max === min) {
      const pad = Math.abs(max) * 0.01 || 1;
      if (this.log) {
        min = min / 1.01;
        max = max * 1.01;
      } else {
        min -= pad;
        max += pad;
      }
    }
    this.min = min;
    this.max = max;
  }

  private innerTop(): number {
    return this.height * this.marginTop;
  }
  private innerHeight(): number {
    return Math.max(1, this.height * (1 - this.marginTop - this.marginBottom));
  }

  toY(price: number): number {
    const a = this.tf(this.min);
    const b = this.tf(this.max);
    const f = b === a ? 0.5 : (this.tf(price) - a) / (b - a);
    return this.innerTop() + this.innerHeight() * (this.inverted ? f : 1 - f);
  }

  fromY(y: number): number {
    const a = this.tf(this.min);
    const b = this.tf(this.max);
    const g = (y - this.innerTop()) / this.innerHeight();
    const f = this.inverted ? g : 1 - g;
    return this.inv(a + (b - a) * f);
  }

  /**
   * Scale by dragging the axis: dy > 0 (drag down) compresses, dy < 0 expands.
   * Scaling is around the range center in transformed space and turns auto-fit off.
   */
  scaleBy(dy: number): void {
    const factor = Math.exp(dy * 0.006);
    const a = this.tf(this.min);
    const b = this.tf(this.max);
    const c = (a + b) / 2;
    const h = ((b - a) / 2) * factor;
    if (!(h > 0) || !isFinite(h)) return;
    this.auto = false;
    this.min = this.inv(c - h);
    this.max = this.inv(c + h);
  }

  /** Vertical pan by dy pixels (only meaningful with auto-fit off). */
  panBy(dy: number): void {
    const a = this.tf(this.min);
    const b = this.tf(this.max);
    const d = ((this.inverted ? -dy : dy) / this.innerHeight()) * (b - a);
    this.auto = false;
    this.min = this.inv(a + d);
    this.max = this.inv(b + d);
  }

  resetAuto(): void {
    this.auto = true;
  }

  formatDecimals(sample: number): number {
    return this.decimals ?? priceDecimals(sample, this.fx);
  }

  format(price: number): string {
    if (this.percentBase && this.indexed) return toIndexed(price, this.percentBase).toFixed(2);
    if (this.percentBase) return formatPercentLabel(toPercent(price, this.percentBase));
    const mag = Math.max(Math.abs(this.min), Math.abs(this.max));
    // Large values (volume-like indicators) are abbreviated: 3.38B.
    if (this.decimals == null && mag >= COMPACT_FROM) return formatCompact(price);
    return formatPrice(price, this.formatDecimals(mag));
  }

  ticks(minPx = 34): PriceTick[] {
    const maxTicks = Math.max(1, Math.floor(this.height / minPx));
    if (this.percentBase) return this.percentTicks(maxTicks, this.percentBase);
    if (!this.log || this.max / this.min < 2.5) return this.linearTicks(maxTicks);
    return this.logTicks(minPx);
  }

  private percentTicks(maxTicks: number, base: number): PriceTick[] {
    const lo = toPercent(this.fromY(this.height), base);
    const hi = toPercent(this.fromY(0), base);
    const { step, values } = niceTicks(Math.min(lo, hi), Math.max(lo, hi), maxTicks);
    const dec = Math.min(Math.max(stepDecimals(step), 0), 6);
    return values.map((pct) => {
      const price = fromPercent(pct, base);
      // Indexed: the same nice steps, shown as 100 + % (base = 100).
      const text = this.indexed ? (100 + pct).toFixed(dec) : formatPercentLabel(pct, dec);
      return { price, y: this.toY(price), text };
    });
  }

  private linearTicks(maxTicks: number): PriceTick[] {
    const lo = this.fromY(this.height);
    const hi = this.fromY(0);
    const { step, values } = niceTicks(Math.min(lo, hi), Math.max(lo, hi), maxTicks);
    const d = Math.max(stepDecimals(step), 0);
    const base = this.formatDecimals(Math.max(Math.abs(this.min), Math.abs(this.max)));
    const dec = Math.min(Math.max(d, Math.min(base, 2)), 10);
    const compact = this.decimals == null && Math.max(Math.abs(lo), Math.abs(hi)) >= COMPACT_FROM;
    return values.map((price) => ({ price, y: this.toY(price), text: compact ? formatCompact(price) : formatPrice(price, this.decimals ?? dec) }));
  }

  private logTicks(minPx: number): PriceTick[] {
    const lo = Math.max(Math.min(this.fromY(this.height), this.fromY(0)), 1e-12);
    const hi = Math.max(this.fromY(this.height), this.fromY(0));
    const sets = [[1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 5], [1, 2.5, 5], [1]];
    const e0 = Math.floor(Math.log10(lo));
    const e1 = Math.ceil(Math.log10(hi));
    for (const set of sets) {
      const out: PriceTick[] = [];
      let ok = true;
      let lastY: number | null = null;
      for (let e = e0; e <= e1 && ok; e++) {
        for (const m of set) {
          const price = Number((m * Math.pow(10, e)).toPrecision(12));
          if (price < lo || price > hi) continue;
          const y = this.toY(price);
          if (lastY != null && Math.abs(lastY - y) < minPx) {
            ok = false;
            break;
          }
          lastY = y;
          out.push({ price, y, text: formatPrice(price, this.decimals ?? Math.max(0, stepDecimals(price))) });
        }
      }
      if (ok) return out;
    }
    // Decades too dense: show every n-th power of ten.
    const out: PriceTick[] = [];
    const every = Math.max(1, Math.ceil((e1 - e0) / Math.max(1, this.height / minPx)));
    for (let e = e0; e <= e1; e += every) {
      const price = Math.pow(10, e);
      if (price >= lo && price <= hi) out.push({ price, y: this.toY(price), text: formatPrice(price, 0) });
    }
    return out;
  }
}
