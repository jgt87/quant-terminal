// Order flow on the price pane: footprint cells (sell volume left, buy volume right, per price
// level) when bars are wide enough, and volume bubbles on the busiest price levels.

import { imbalances, type FootprintBar } from "@qt/core";
import { snap } from "../canvas";
import { font, withAlpha } from "../theme";
import type { PaneRenderCtx } from "./types";

/** Bars narrower than this (px) get no footprint cells. */
export const FOOTPRINT_MIN_SPACING = 34;

/** Short volume text: 950, 1.2K, 3.4M. */
export function shortVolume(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(a >= 10 ? 1 : 2).replace(/\.?0+$/, "");
  return v.toPrecision(2);
}

function visibleFootprints(rc: PaneRenderCtx, fp: ReadonlyMap<number, FootprintBar>): [number, FootprintBar][] {
  const out: [number, FootprintBar][] = [];
  for (let i = rc.from; i <= rc.to; i++) {
    const b = fp.get(i);
    if (b && b.levels.length) out.push([i, b]);
  }
  return out;
}

/**
 * Footprint cells: each bar's levels as rows (bin height = `tick`), sells on the left half and buys
 * on the right half, shaded by volume. Diagonal imbalances are drawn in full color; the point of
 * control gets an outline. Numbers show when the rows are tall enough.
 */
export function drawFootprints(rc: PaneRenderCtx, fp: ReadonlyMap<number, FootprintBar>, tick: number): void {
  const { ctx, ts, ps, dpr, theme } = rc;
  if (ts.barSpacing < FOOTPRINT_MIN_SPACING || !(tick > 0)) return;
  const list = visibleFootprints(rc, fp);
  if (!list.length) return;
  let maxVol = 0;
  for (const [, b] of list) for (const l of b.levels) maxVol = Math.max(maxVol, l.buy, l.sell);
  if (!(maxVol > 0)) return;
  const w = snap(ts.barSpacing * 0.9, dpr);
  const half = w / 2;
  const rowH = Math.abs(ps.toY(0) - ps.toY(tick));
  const showText = rowH >= 9 && half >= 16;
  ctx.font = font(theme, Math.max(8, Math.min(11, rowH - 2)));
  ctx.textBaseline = "middle";
  for (const [i, b] of list) {
    const x0 = snap(ts.indexToX(i) - half, dpr);
    const im = imbalances(b.levels);
    // Background so the candle under the footprint does not show through.
    const yTop = Math.min(ps.toY(b.levels[b.levels.length - 1].price + tick), ps.toY(b.levels[0].price));
    const yBot = Math.max(ps.toY(b.levels[b.levels.length - 1].price + tick), ps.toY(b.levels[0].price));
    ctx.fillStyle = theme.background;
    ctx.fillRect(x0, yTop, w, yBot - yTop);
    b.levels.forEach((l, k) => {
      const ya = ps.toY(l.price + tick);
      const yb = ps.toY(l.price);
      const top = snap(Math.min(ya, yb), dpr);
      const h = Math.max(1 / dpr, snap(Math.abs(yb - ya), dpr) - 1 / dpr);
      ctx.fillStyle = withAlpha(theme.down, im.sell[k] ? 0.85 : 0.12 + 0.55 * (l.sell / maxVol));
      ctx.fillRect(x0, top, half - 0.5, h);
      ctx.fillStyle = withAlpha(theme.up, im.buy[k] ? 0.85 : 0.12 + 0.55 * (l.buy / maxVol));
      ctx.fillRect(x0 + half + 0.5, top, half - 0.5, h);
      if (l.price === b.poc) {
        ctx.strokeStyle = theme.text;
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, top + 0.5, w - 1, Math.max(1, h - 1));
      }
      if (showText) {
        ctx.fillStyle = theme.text;
        ctx.textAlign = "right";
        ctx.fillText(shortVolume(l.sell), x0 + half - 3, top + h / 2);
        ctx.textAlign = "left";
        ctx.fillText(shortVolume(l.buy), x0 + half + 3, top + h / 2);
      }
    });
    // Bar delta under the footprint.
    if (showText) {
      ctx.textAlign = "center";
      ctx.fillStyle = b.delta >= 0 ? theme.up : theme.down;
      ctx.fillText(`${b.delta >= 0 ? "+" : ""}${shortVolume(b.delta)}`, x0 + half, yBot + 8);
    }
  }
}

/**
 * Volume bubbles: one circle per price level that traded at least 2.5× the median level volume of
 * the visible footprints, sized by volume, green where buyers dominated and red where sellers did.
 */
export function drawVolumeBubbles(rc: PaneRenderCtx, fp: ReadonlyMap<number, FootprintBar>, tick: number): void {
  const { ctx, ts, ps, theme } = rc;
  const list = visibleFootprints(rc, fp);
  if (!list.length || !(tick > 0)) return;
  const vols: number[] = [];
  for (const [, b] of list) for (const l of b.levels) vols.push(l.buy + l.sell);
  vols.sort((a, b) => a - b);
  const median = vols[Math.floor(vols.length / 2)];
  const max = vols[vols.length - 1];
  if (!(max > 0)) return;
  const maxR = Math.max(4, Math.min(28, ts.barSpacing * 1.6));
  for (const [i, b] of list) {
    for (const l of b.levels) {
      const v = l.buy + l.sell;
      if (v < median * 2.5) continue;
      const r = Math.max(2, maxR * Math.sqrt(v / max));
      const x = ts.indexToX(i);
      const y = ps.toY(l.price + tick / 2);
      const color = l.buy >= l.sell ? theme.up : theme.down;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(color, 0.35);
      ctx.fill();
      ctx.strokeStyle = withAlpha(color, 0.9);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
