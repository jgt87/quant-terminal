// Order flow signal markers on the price pane: absorption (A), stop runs (S) and icebergs (I) as
// small round badges at their price, green for bid-side / up-reversal signals, red for the others.

import { FLOW_EVENT_LABEL, type FlowEvent } from "@qt/core";
import { font } from "../theme";
import type { PaneRenderCtx } from "./types";

const LETTER: Record<FlowEvent["kind"], string> = {
  "absorption-bid": "A",
  "absorption-ask": "A",
  "stop-run-up": "S",
  "stop-run-down": "S",
  "iceberg-bid": "I",
  "iceberg-ask": "I",
};

/** Signals that point to buying support (drawn in the up color). */
export const isBullish = (k: FlowEvent["kind"]) => k === "absorption-bid" || k === "stop-run-down" || k === "iceberg-bid";

export const flowEventTitle = (e: FlowEvent) => FLOW_EVENT_LABEL[e.kind];

export function drawFlowEvents(rc: PaneRenderCtx, events: readonly FlowEvent[]): void {
  const { ctx, ts, ps, width, height, theme } = rc;
  if (!events.length) return;
  const r = Math.max(5, Math.min(8, ts.barSpacing * 0.35));
  ctx.save();
  ctx.font = font(theme, Math.round(r * 1.3), 700);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Several signals on one bar and price are stacked sideways.
  const seen = new Map<string, number>();
  for (const e of events) {
    const i = Math.floor(ts.timeToIndex(e.time) + 1e-9);
    let x = ts.indexToX(i);
    const y = ps.toY(e.price);
    if (x < -r || x > width + r || y < -r || y > height + r) continue;
    const key = `${i}|${Math.round(y / r)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    x += n * (r * 2 + 1);
    const color = isBullish(e.kind) ? theme.up : theme.down;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = theme.background;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(LETTER[e.kind], x, y + 0.5);
  }
  ctx.restore();
}
