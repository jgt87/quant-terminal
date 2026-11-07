// Resolves indicator instances against the core registry and caches their computed series.

import { alignHigherTimeframe, INTERVAL_SECONDS, type Interval } from "@qt/core";
import type { Bar, IndicatorDef, IndicatorInstance, IndicatorStyle, InputValue, IntervalVisibility, Series } from "@qt/core";
import { anyIndicator } from "./studies/defs";

/** Bars of a higher timeframe for multi-timeframe indicators (null while not loaded). */
export type HtfProvider = (timeframe: string) => readonly Bar[] | null;

export interface ComputedIndicator {
  uid: string;
  def: IndicatorDef;
  inputs: Record<string, InputValue>;
  visible: boolean;
  series: Record<string, Series>;
  /** Ordinal among instances (drives the default palette color). */
  ordinal: number;
  style?: IndicatorStyle;
  visibility?: IntervalVisibility;
  /** Where it is drawn: the definition's pane unless the instance overrides it. */
  pane: "overlay" | "separate";
  /** Shares the pane of this separate-pane indicator (uid). */
  paneWith?: string;
  /** "own": fitted to its own hidden scale; "left": its own scale on the left price axis. */
  scale?: "own" | "left";
  /** Higher timeframe the values are computed on (aligned without look-ahead). */
  timeframe?: string;
  /** Not removable through the layout (script plots); the legend reports removal separately. */
  external?: boolean;
  error?: string;
}

/** Seconds of a timeframe id ("1D"), 0 when unknown. */
export function timeframeSeconds(tf: string | undefined): number {
  return tf && Object.prototype.hasOwnProperty.call(INTERVAL_SECONDS, tf) ? INTERVAL_SECONDS[tf as Interval] : 0;
}

export function resolvedInputs(def: IndicatorDef, inputs: Record<string, InputValue>): Record<string, InputValue> {
  const out: Record<string, InputValue> = {};
  for (const i of def.inputs) out[i.key] = inputs[i.key] ?? i.default;
  return out;
}

/** Compact label like "EMA 20" or "MACD 12 26 9". */
export function indicatorLabel(def: IndicatorDef, inputs: Record<string, InputValue>): string {
  const vals = def.inputs
    .filter((i) => i.type !== "bool")
    .map((i) => inputs[i.key] ?? i.default)
    .filter((v) => v !== "close");
  return vals.length ? `${def.shortName} ${vals.join(" ")}` : def.shortName;
}

/** Legend label with the timeframe, e.g. "EMA 20 · 1D". */
export function computedLabel(c: ComputedIndicator): string {
  const base = indicatorLabel(c.def, c.inputs);
  return c.timeframe ? `${base} · ${c.timeframe}` : base;
}

export class IndicatorSet {
  items: ComputedIndicator[] = [];
  private external: ComputedIndicator[] = [];
  private instances: ComputedIndicator[] = [];

  /** Extra items not stored in the layout (script plots). */
  setExternal(list: ComputedIndicator[]): void {
    this.external = list;
    this.items = [...this.instances, ...this.external];
  }

  setInstances(instances: IndicatorInstance[]): void {
    const prev = new Map(this.instances.map((c) => [c.uid, c]));
    const next: ComputedIndicator[] = [];
    instances.forEach((inst) => {
      const def = anyIndicator(inst.indicatorId);
      if (!def) return;
      const inputs = resolvedInputs(def, inst.inputs);
      const old = prev.get(inst.uid);
      const timeframe = inst.timeframe || undefined;
      const same = old && old.def === def && JSON.stringify(old.inputs) === JSON.stringify(inputs) && old.timeframe === timeframe;
      next.push({
        uid: inst.uid,
        def,
        inputs,
        visible: inst.visible,
        series: same ? old!.series : {},
        ordinal: next.length,
        error: same ? old!.error : undefined,
        style: inst.style,
        visibility: inst.visibility,
        pane: inst.pane ?? def.pane,
        paneWith: inst.paneWith,
        scale: inst.scale,
        timeframe,
      });
    });
    this.instances = next;
    this.items = [...next, ...this.external];
  }

  /** Items that still need computing (fresh or changed inputs). */
  needsCompute(): boolean {
    return this.instances.some((c) => Object.keys(c.series).length === 0 && !c.error);
  }

  /**
   * Computes every instance on `bars`. An instance with a higher timeframe than `chartSec` is
   * computed on that timeframe's bars (only those that opened by the last chart bar) and aligned
   * to the chart bars without look-ahead; it stays empty until those bars are loaded.
   */
  computeAll(bars: Bar[], onlyMissing = false, htf?: HtfProvider, chartSec = 0): void {
    for (const c of this.instances) {
      if (onlyMissing && (Object.keys(c.series).length > 0 || c.error)) continue;
      try {
        c.series = bars.length ? this.computeOne(c, bars, htf, chartSec) : {};
        c.error = undefined;
      } catch (e) {
        c.series = {};
        c.error = e instanceof Error ? e.message : String(e);
      }
    }
  }

  private computeOne(c: ComputedIndicator, bars: Bar[], htf: HtfProvider | undefined, chartSec: number): Record<string, Series> {
    const tfSec = timeframeSeconds(c.timeframe);
    if (!c.timeframe || !(tfSec > chartSec) || !htf) return c.def.compute(bars, c.inputs);
    const all = htf(c.timeframe);
    if (!all) return {};
    const lastTime = bars[bars.length - 1].time;
    const higher = all.filter((b) => b.time <= lastTime);
    if (higher.length === 0) return {};
    const raw = c.def.compute(higher, c.inputs);
    const out: Record<string, Series> = {};
    const opts = { lowerSec: chartSec || undefined, higherSec: tfSec === 2592000 ? 31 * 86400 : tfSec };
    for (const [k, v] of Object.entries(raw)) out[k] = alignHigherTimeframe(bars, higher, v, "no-lookahead", opts);
    return out;
  }

  /** Instances (layout indicators) waiting for higher-timeframe bars. */
  timeframes(): string[] {
    return [...new Set(this.instances.map((c) => c.timeframe).filter((t): t is string => !!t))];
  }

  get(uid: string): ComputedIndicator | undefined {
    return this.items.find((c) => c.uid === uid);
  }

  overlays(): ComputedIndicator[] {
    return this.items.filter((c) => c.pane === "overlay");
  }

  separates(): ComputedIndicator[] {
    return this.items.filter((c) => c.pane === "separate");
  }
}
