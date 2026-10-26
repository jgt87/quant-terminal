// Price-only chart types (renko, kagi, line break, point & figure, range bars) on an index axis.
// The core transforms emit elements stamped with the time of the source bar that completed them;
// several elements can share one time. The chart lays them out by index, so every element gets a
// strictly increasing axis time (duplicates are nudged forward by whole seconds) and the time
// axis is labelled by the completing time. Pure.

import { getIndicator, TRANSFORM_DEFAULTS, transformBars, type Bar, type ChartType, type TransformKind, type TransformOptions, type TransformedBar } from "@qt/core";

export const TRANSFORM_KINDS: readonly TransformKind[] = ["renko", "kagi", "linebreak", "pnf", "range"];

/** The transform behind a chart type, or null for time-based chart types. */
export function transformOf(t: ChartType): TransformKind | null {
  return (TRANSFORM_KINDS as readonly string[]).includes(t) ? (t as TransformKind) : null;
}

/** One chart element on the index axis. `time` is unique and increasing; `sourceTime` is the real completing time. */
export interface AxisBar extends Bar {
  dir: 1 | -1;
  sourceTime: number;
  sourceIndex: number;
}

/** Index-axis bars from transform elements: element i sits at index i with a unique time. */
export function toIndexAxis(elements: readonly TransformedBar[]): AxisBar[] {
  const out: AxisBar[] = new Array(elements.length);
  let prev = -Infinity;
  for (let i = 0; i < elements.length; i++) {
    const e = elements[i];
    const t = e.time > prev ? e.time : prev + 1;
    out[i] = { time: t, open: e.open, high: e.high, low: e.low, close: e.close, volume: e.volume, dir: e.dir, sourceTime: e.time, sourceIndex: e.sourceIndex };
    prev = t;
  }
  return out;
}

/** Element index shown for a source-bar time: the last element completed at or before it (-1 = none). */
export function indexForSourceTime(axis: readonly AxisBar[], time: number): number {
  let lo = 0;
  let hi = axis.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (axis[mid].sourceTime <= time) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Effective options of a transform (defaults filled in). */
export function transformOptions(kind: TransformKind, opts: TransformOptions | undefined): TransformOptions {
  const own = opts?.[kind];
  return { [kind]: { ...TRANSFORM_DEFAULTS[kind], ...(own as object | undefined) } } as TransformOptions;
}

/** Last ATR(n) value of the source (the box size "atr" resolves to), null without enough data. */
export function lastAtrValue(bars: Bar[], n: number): number | null {
  const s = getIndicator("atr")?.compute(bars, { length: n }).atr ?? [];
  for (let i = s.length - 1; i >= 0; i--) {
    const v = s[i];
    if (v != null && isFinite(v) && v > 0) return v;
  }
  return null;
}

/** Source bars → index-axis bars for `kind`. */
export function transformSeries(bars: Bar[], kind: TransformKind, opts: TransformOptions | undefined): AxisBar[] {
  return toIndexAxis(transformBars(bars, kind, transformOptions(kind, opts)));
}

const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(2) : Number(v.toPrecision(4)).toString());

/** Status text such as "Renko · box ATR(14) = 1.23" for the legend. */
export function transformLabel(kind: TransformKind, opts: TransformOptions | undefined, bars: Bar[] = []): string {
  const o = transformOptions(kind, opts);
  const box = (size: number | "atr", atrLength = 14) => {
    if (size !== "atr") return `box ${fmt(size)}`;
    const v = bars.length ? lastAtrValue(bars, atrLength) : null;
    return `box ATR(${atrLength})${v != null ? ` = ${fmt(v)}` : ""}`;
  };
  switch (kind) {
    case "renko":
      return `Renko · ${box(o.renko!.boxSize, o.renko!.atrLength)}${o.renko!.source === "hl" ? " · high/low" : ""}`;
    case "kagi":
      return `Kagi · reversal ${fmt(o.kagi!.reversal)}${o.kagi!.mode === "percent" ? "%" : ""}`;
    case "linebreak":
      return `Line break · ${o.linebreak!.lines} lines`;
    case "pnf":
      return `Point & Figure · ${box(o.pnf!.boxSize, o.pnf!.atrLength)} · reversal ${o.pnf!.reversal}`;
    case "range":
      return `Range · ${fmt(o.range!.range)}`;
  }
}

/**
 * Box size of a point & figure series: adjacent opposite columns are offset by exactly one box
 * (an O column starts one box below the X top, an X column one box above the O bottom).
 */
export function pnfBoxSize(axis: readonly { high: number; low: number; dir: 1 | -1 }[], fallback: number | null): number | null {
  for (let i = 1; i < axis.length; i++) {
    const a = axis[i - 1];
    const b = axis[i];
    const d = a.dir === 1 ? a.high - b.high : b.low - a.low;
    if (d > 0 && isFinite(d)) return d;
  }
  return fallback;
}
