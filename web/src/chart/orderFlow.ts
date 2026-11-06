// Order flow on the chart: provider-interval flow and footprints grouped into the chart's bars
// (custom intervals span several provider bars), and the Delta / Cumulative delta panes as
// external indicator items.

import { cumulativeDelta, type BarFlow, type FootprintBar, type FootprintLevel, type IndicatorDef, type Series } from "@qt/core";
import type { ComputedIndicator } from "./IndicatorSet";

export const FLOW_UID_PREFIX = "flow:";
export type FlowPane = "delta" | "cvd";

export const isFlowUid = (uid: string): boolean => uid.startsWith(FLOW_UID_PREFIX);
export const flowPaneOf = (uid: string): FlowPane | null => (uid === `${FLOW_UID_PREFIX}delta` ? "delta" : uid === `${FLOW_UID_PREFIX}cvd` ? "cvd" : null);

/** Index of the chart bar containing time `t` (the last bar opening at or before it), -1 before the first. */
export function barIndexAt(times: readonly number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  if (hi < 0 || t < times[0]) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Delta (buy − sell) per chart bar from provider-interval flow; null where no flow falls in a bar. */
export function groupDelta(times: readonly number[], flow: readonly BarFlow[]): Series {
  const out: Series = times.map(() => null);
  for (const f of flow) {
    const i = barIndexAt(times, f.time);
    if (i < 0) continue;
    out[i] = (out[i] ?? 0) + (f.buy - f.sell);
  }
  return out;
}

/** Footprint per chart bar index: provider-interval footprints inside one chart bar are merged. */
export function groupFootprints(times: readonly number[], bars: Iterable<FootprintBar>): Map<number, FootprintBar> {
  const out = new Map<number, FootprintBar>();
  for (const b of bars) {
    const i = barIndexAt(times, b.time);
    if (i < 0) continue;
    const prev = out.get(i);
    out.set(i, prev ? mergeFootprint(prev, b) : b);
  }
  return out;
}

function mergeFootprint(a: FootprintBar, b: FootprintBar): FootprintBar {
  const levels = new Map<number, FootprintLevel>();
  for (const l of [...a.levels, ...b.levels]) {
    const m = levels.get(l.price);
    if (m) levels.set(l.price, { price: l.price, buy: m.buy + l.buy, sell: m.sell + l.sell });
    else levels.set(l.price, { ...l });
  }
  const list = [...levels.values()].sort((x, y) => x.price - y.price);
  let poc = list[0]?.price ?? 0;
  let best = -1;
  for (const l of list) if (l.buy + l.sell > best) [best, poc] = [l.buy + l.sell, l.price];
  const buy = a.buy + b.buy;
  const sell = a.sell + b.sell;
  return { time: Math.min(a.time, b.time), levels: list, buy, sell, delta: buy - sell, poc, trades: a.trades + b.trades };
}

const def = (id: FlowPane, name: string, shortName: string, style: "histogram" | "line"): IndicatorDef => ({
  id: `orderflow-${id}`,
  name,
  shortName,
  pane: "separate",
  inputs: [],
  outputs: [{ key: id, label: shortName, style }],
  levels: [0],
  compute: () => ({}),
});

const DELTA_DEF = def("delta", "Delta (taker buy − sell volume)", "Delta", "histogram");
const CVD_DEF = def("cvd", "Cumulative delta", "CVD", "line");

/** Delta / Cumulative delta items for the panes that are switched on. */
export function flowIndicators(delta: Series, show: { delta?: boolean; cvd?: boolean }, ordinal: number): ComputedIndicator[] {
  const out: ComputedIndicator[] = [];
  const item = (d: IndicatorDef, key: FlowPane, series: Series): ComputedIndicator => ({
    uid: `${FLOW_UID_PREFIX}${key}`,
    def: d,
    inputs: {},
    visible: true,
    series: { [key]: series },
    ordinal: ordinal + out.length,
    pane: "separate",
    external: true,
  });
  if (show.delta) out.push(item(DELTA_DEF, "delta", delta));
  if (show.cvd) out.push(item(CVD_DEF, "cvd", cumulativeDelta(delta)));
  return out;
}
