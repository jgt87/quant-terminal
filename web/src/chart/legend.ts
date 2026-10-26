// Legend values for the hovered (or last) bar: OHLCV plus per-indicator outputs.

import type { Bar } from "@qt/core";
import type { ChartEngine } from "./ChartEngine";
import { percentSeries, baseIndex } from "./compare";
import { computedLabel } from "./IndicatorSet";
import { outputStyle } from "./indicatorStyle";

export interface LegendValue {
  label: string;
  value: number | null;
  color: string;
  dash: number[];
}

export interface LegendIndicator {
  uid: string;
  label: string;
  /** Script plots: removed through the engine, not the layout. */
  external?: boolean;
  paneId: string;
  visible: boolean;
  error?: string;
  values: LegendValue[];
}

export interface LegendCompare {
  symbol: string;
  color: string;
  /** Percent change from the first visible bar at the legend bar, null when unknown. */
  pct: number | null;
  error?: string;
}

export interface LegendData {
  index: number;
  bar: Bar;
  change: number;
  changePct: number;
  indicators: LegendIndicator[];
  compare: LegendCompare[];
  /** "Renko · box 2.5" while a price-only chart type is active. */
  transform: string | null;
}

export function buildLegend(e: ChartEngine, index: number | null): LegendData | null {
  const bars = e.data.bars;
  if (bars.length === 0) return null;
  const i = index == null ? bars.length - 1 : Math.max(0, Math.min(bars.length - 1, index));
  const bar = e.display[i] ?? bars[i];
  const prev = i > 0 ? bars[i - 1].close : bars[i].open;
  const change = bars[i].close - prev;
  const indicators: LegendIndicator[] = [];
  for (const pane of e.panes) {
    for (const uid of pane.uids) {
      const c = e.indicators.get(uid);
      if (!c) continue;
      indicators.push({
        uid,
        label: computedLabel(c),
        external: c.external,
        paneId: pane.id,
        visible: c.visible,
        error: c.error,
        values: c.def.outputs.flatMap((out, j) => {
          const st = outputStyle(e.theme, c, j, out);
          if (!st.visible) return [];
          const raw = c.series[out.key]?.[i];
          const v = raw == null || !isFinite(raw) ? null : raw;
          const color =
            out.style === "histogram" && !c.style?.outputs?.[out.key]?.color
              ? (v ?? 0) >= 0 ? e.theme.histUp : e.theme.histDown
              : st.color;
          return [{ label: out.label, value: v, color, dash: st.dash }];
        }),
      });
    }
  }
  const from = Math.max(0, e.ts.visibleRange().from);
  const compare = e.compare.map((c) => {
    const base = baseIndex(c.aligned, from);
    const pct = base >= 0 ? (percentSeries(c.aligned, base)[i] ?? null) : null;
    return { symbol: c.symbol, color: c.color, pct, error: c.error };
  });
  return { index: i, bar, change, changePct: prev !== 0 ? (change / prev) * 100 : 0, indicators, compare, transform: e.transformStatus() };
}
