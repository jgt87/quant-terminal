// Default layout (from JSON) and helpers to build indicator instances.

import { anyIndicator } from "../chart/studies/defs";
import type { IndicatorInstance, InputValue, Interval, Layout, ChartType } from "@qt/core";
import defaults from "../config/defaultLayout.json";

let counter = 0;
export function uid(prefix = "i"): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function newIndicator(indicatorId: string, inputs: Record<string, InputValue> = {}): IndicatorInstance {
  const def = anyIndicator(indicatorId);
  const resolved: Record<string, InputValue> = {};
  for (const i of def?.inputs ?? []) resolved[i.key] = inputs[i.key] ?? i.default;
  return { uid: uid(), indicatorId, inputs: resolved, visible: true };
}

export function defaultLayout(): Layout {
  return {
    id: defaults.id,
    name: defaults.name,
    symbol: defaults.symbol,
    interval: defaults.interval as Interval,
    chartType: defaults.chartType as ChartType,
    logScale: defaults.logScale,
    indicators: defaults.indicators.map((i) => newIndicator(i.indicatorId, i.inputs)),
    drawings: {},
    updatedAt: Date.now(),
  };
}

/** Fill gaps in a stored layout (older or partial documents). */
export function normalizeLayout(l: Partial<Layout>): Layout {
  const d = defaultLayout();
  return {
    ...d,
    ...l,
    indicators: Array.isArray(l.indicators) ? l.indicators.map((i) => ({ ...i, visible: i.visible ?? true })) : d.indicators,
    drawings: l.drawings && typeof l.drawings === "object" ? l.drawings : {},
  };
}
