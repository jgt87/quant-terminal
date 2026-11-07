// Liquidity heatmap behind the candles: resting order book size per price bin over time, one
// column per depth frame, colored on a ramp by size relative to the busiest visible cells. Cells
// smaller than ~2 px are merged (largest size wins) and drawn in one path per color level.

import type { DepthFrame } from "@qt/core";
import cfg from "../../config/heatmap.json";
import type { ThemeMode } from "../theme";
import type { PaneRenderCtx } from "./types";

const MIN_PX = 2;

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** `levels` colors interpolated along the theme's ramp, as rgba strings. */
export function heatColors(mode: ThemeMode, levels = cfg.levels): string[] {
  const ramp = (cfg.ramp as Record<string, string[]>)[mode] ?? cfg.ramp.dark;
  const alpha = (cfg.alpha as Record<string, number>)[mode] ?? cfg.alpha.dark;
  const stops = ramp.map(hexRgb);
  return Array.from({ length: levels }, (_, k) => {
    const t = levels === 1 ? 1 : k / (levels - 1);
    const pos = t * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(pos));
    const f = pos - i;
    const c = stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * f));
    // Weak cells are more transparent so the chart background shows through.
    const a = alpha * (0.35 + 0.65 * t);
    return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
  });
}

/** Color level of a size: 0..levels-1, or -1 for cells too small to draw. */
export function heatLevel(q: number, ref: number, levels = cfg.levels): number {
  if (!(q > 0) || !(ref > 0)) return -1;
  const share = Math.min(1, q / ref);
  if (share < cfg.minShare) return -1;
  return Math.min(levels - 1, Math.floor(Math.pow(share, cfg.gamma) * levels));
}

/** Size at the given quantile of the non-empty cells (robust maximum for the color scale). */
export function quantileSize(frames: readonly DepthFrame[], q = 0.985): number {
  const all: number[] = [];
  for (const f of frames) for (const v of f.qty) if (v > 0) all.push(v);
  if (!all.length) return 0;
  all.sort((a, b) => a - b);
  return all[Math.min(all.length - 1, Math.floor(q * (all.length - 1)))];
}

/** Left x (px) of a frame time (UTC ms): bars span [index − ½, index + ½]. */
const frameX = (rc: PaneRenderCtx, ms: number) => rc.ts.indexToX(rc.ts.timeToIndex(ms / 1000) - 0.5);

export function drawHeatmap(rc: PaneRenderCtx, frames: readonly DepthFrame[]): void {
  const { ctx, ts, ps, width, height, theme } = rc;
  if (!frames.length || ts.count === 0) return;
  // Typical spacing between frames, to size the last column and to stop at gaps in the data.
  const gaps: number[] = [];
  for (let i = 1; i < frames.length && gaps.length < 200; i++) gaps.push(frames[frames.length - i].time - frames[frames.length - i - 1].time);
  gaps.sort((a, b) => a - b);
  const typicalGap = gaps.length ? gaps[gaps.length >> 1] : 1000;

  // Visible frames, merged into columns at least MIN_PX wide.
  interface Col {
    x0: number;
    x1: number;
    frames: DepthFrame[];
  }
  const cols: Col[] = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const next = frames[i + 1];
    const endMs = next && next.time - f.time <= typicalGap * 4 ? next.time : f.time + typicalGap;
    const x0 = frameX(rc, f.time);
    // The newest frame is the current book: it also fills the space right of it.
    const x1 = next ? frameX(rc, endMs) : Math.max(frameX(rc, endMs), width);
    if (x1 < 0 || x0 > width) continue;
    const last = cols[cols.length - 1];
    if (last && last.x1 - last.x0 < MIN_PX && Math.abs(last.x1 - x0) < 0.5) {
      last.x1 = x1;
      last.frames.push(f);
    } else cols.push({ x0, x1, frames: [f] });
  }
  if (!cols.length) return;
  const ref = quantileSize(cols.flatMap((c) => c.frames));
  if (!(ref > 0)) return;
  const levels = cfg.levels;
  const colors = heatColors(theme.mode, levels);
  const cells: number[][] = Array.from({ length: levels }, () => []);
  const top = ps.fromY(0);
  const bottom = ps.fromY(height);
  const lo = Math.min(top, bottom);
  const hi = Math.max(top, bottom);
  for (const c of cols) {
    // Size per price (merged frames: the largest size per bin).
    const step = c.frames[0].step;
    const ref0 = c.frames[0].bid ?? c.frames[0].base;
    const binPx = Math.abs(ps.toY(ref0) - ps.toY(ref0 + step));
    const group = binPx >= MIN_PX ? 1 : Math.ceil(MIN_PX / Math.max(binPx, 1e-6));
    const gstep = step * group;
    const sizes = new Map<number, number>();
    for (const f of c.frames) {
      if (f.step !== step) continue;
      for (let i = 0; i < f.qty.length; i++) {
        const q = f.qty[i];
        if (!(q > 0)) continue;
        const p = f.base + i * step;
        if (p + step < lo || p > hi) continue;
        const k = Math.floor(p / gstep + 1e-9);
        sizes.set(k, Math.max(sizes.get(k) ?? 0, q));
      }
    }
    const x0 = Math.max(0, c.x0);
    const w = Math.min(width, c.x1) - x0;
    if (w <= 0) continue;
    for (const [k, q] of sizes) {
      const level = heatLevel(q, ref, levels);
      if (level < 0) continue;
      const ya = ps.toY((k + 1) * gstep);
      const yb = ps.toY(k * gstep);
      cells[level].push(x0, Math.min(ya, yb), w, Math.max(1, Math.abs(yb - ya)));
    }
  }
  ctx.save();
  for (let l = 0; l < levels; l++) {
    const list = cells[l];
    if (!list.length) continue;
    ctx.beginPath();
    for (let i = 0; i < list.length; i += 4) ctx.rect(list[i], list[i + 1], list[i + 2], list[i + 3]);
    ctx.fillStyle = colors[l];
    ctx.fill();
  }
  // Best bid / ask over time.
  for (const side of ["bid", "ask"] as const) {
    ctx.beginPath();
    let pen = false;
    for (const c of cols) {
      const f = c.frames[c.frames.length - 1];
      const p = f[side];
      if (p == null) {
        pen = false;
        continue;
      }
      const y = ps.toY(p);
      if (!pen) ctx.moveTo(Math.max(0, c.x0), y);
      else ctx.lineTo(Math.max(0, c.x0), y);
      ctx.lineTo(Math.min(width, c.x1), y);
      pen = true;
    }
    ctx.strokeStyle = cfg.bidAskLine[side];
    ctx.lineWidth = cfg.bidAskLine.width;
    ctx.stroke();
  }
  ctx.restore();
}
