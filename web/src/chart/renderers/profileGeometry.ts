// Volume profile rows → pixel rectangles. Each row spans its price band vertically; its width is
// its volume relative to the profile's largest row times `maxWidth`, split into up and down parts.
// Pure (used by the renderer and tests).

import type { VolumeProfile } from "@qt/core";

export interface RowRect {
  /** Top edge (the row's high price) and height in pane px (at least 1). */
  y: number;
  h: number;
  /** Total, up and down widths in px (up + down = w). */
  w: number;
  upW: number;
  downW: number;
  inValueArea: boolean;
  poc: boolean;
}

export function profileRowRects(p: VolumeProfile, toY: (price: number) => number, maxWidth: number): RowRect[] {
  let max = 0;
  for (const r of p.rows) if (r.volume > max) max = r.volume;
  const eps = 1e-9 * Math.max(1, Math.abs(p.vah), Math.abs(p.val));
  return p.rows.map((r) => {
    const y1 = toY(r.priceHigh);
    const y2 = toY(r.priceLow);
    const w = max > 0 ? (r.volume / max) * maxWidth : 0;
    const upW = max > 0 ? (r.upVolume / max) * maxWidth : 0;
    return {
      y: Math.min(y1, y2),
      h: Math.max(1, Math.abs(y2 - y1)),
      w,
      upW,
      downW: Math.max(0, w - upW),
      inValueArea: r.priceLow >= p.val - eps && r.priceHigh <= p.vah + eps,
      poc: p.poc >= r.priceLow - eps && p.poc <= r.priceHigh + eps,
    };
  });
}
