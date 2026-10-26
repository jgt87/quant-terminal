// Volume histogram overlaid at the bottom of the main pane with its own (unlabelled) scale.

import type { Bar } from "@qt/core";
import { snap } from "../canvas";
import type { PaneRenderCtx } from "./types";

export const VOLUME_HEIGHT_FRACTION = 0.18;

export function drawVolumeOverlay(rc: PaneRenderCtx, bars: readonly Bar[]): void {
  const { ctx, ts, from, to, height, dpr, theme } = rc;
  if (from > to) return;
  let max = 0;
  for (let i = from; i <= to; i++) if (bars[i].volume > max) max = bars[i].volume;
  if (!(max > 0)) return;
  const h = height * VOLUME_HEIGHT_FRACTION;
  const w = Math.max(1 / dpr, snap(ts.barSpacing * 0.72, dpr));
  for (const up of [true, false]) {
    ctx.fillStyle = up ? theme.volumeUp : theme.volumeDown;
    for (let i = from; i <= to; i++) {
      const b = bars[i];
      if (b.close >= b.open !== up) continue;
      const bh = (b.volume / max) * h;
      if (bh <= 0) continue;
      const x = snap(ts.indexToX(i) - w / 2, dpr);
      const y = snap(height - bh, dpr);
      ctx.fillRect(x, y, w, height - y);
    }
  }
}
