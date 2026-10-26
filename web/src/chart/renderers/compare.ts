// Compare overlays on the price pane, rebased to the first visible bar.

import type { Series } from "@qt/core";
import type { ChartEngine } from "../ChartEngine";
import { baseIndex, rebaseToMain } from "../compare";
import { traceSeries } from "./line";
import type { PaneRenderCtx } from "./types";

/** Each compare series in main-price units, rebased at the first visible bar it has a value for. */
export function compareValues(e: ChartEngine, from: number): Series[] {
  return e.compare.map((c) => {
    const base = baseIndex(c.aligned, from);
    const mainBase = base >= 0 ? e.data.bars[base]?.close : undefined;
    return mainBase == null ? [] : rebaseToMain(c.aligned, base, mainBase);
  });
}

export function drawCompareLines(e: ChartEngine, rc: PaneRenderCtx): void {
  if (!e.compare.length || rc.from > rc.to) return;
  const values = compareValues(e, rc.from);
  const { ctx } = rc;
  const a = Math.max(0, rc.from - 1);
  const b = Math.min(e.data.length - 1, rc.to + 1);
  e.compare.forEach((c, k) => {
    const s = values[k];
    if (!s.length) return;
    ctx.beginPath();
    traceSeries(rc, s, a, b);
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
    ctx.stroke();
  });
}
