// Price-axis value badges of one pane (last price, indicator last values, compare overlays and
// any registered extra labels such as drawing prices or alert levels), laid out so none overlap.
// The scene layer draws them without a crosshair; while the crosshair is over a pane, the UI
// layer repaints that pane's axis with the crosshair label pinned and the others moved aside.

import type { ChartEngine } from "../ChartEngine";
import { outputStyle } from "../indicatorStyle";
import type { Pane } from "../Pane";
import { font } from "../theme";
import { compareValues } from "./compare";
import { BADGE_H, drawPriceAxis, drawPriceBadge } from "./axes";
import { layoutLabels, type AxisLabel } from "./labelLayout";

/** Badge priorities: higher wins when space runs out. */
export const PRIORITY = { crosshair: 100, lastPrice: 50, extra: 30, indicator: 20, compare: 10 } as const;

export interface PriceAxisLabel {
  id: string;
  /** Price in the pane's units (converted with the pane scale). */
  price: number;
  text?: string;
  bg: string;
  fg: string;
  priority: number;
  pin?: boolean;
}

/** Extra badge source (drawing price labels, alert lines, ...) for one pane of one chart. */
export type AxisLabelSource = (e: ChartEngine, pane: Pane, paneIndex: number) => PriceAxisLabel[];

const sources = new WeakMap<ChartEngine, Set<AxisLabelSource>>();

/** Adds price-axis badges from another feature; returns the unregister function. */
export function registerAxisLabels(e: ChartEngine, src: AxisLabelSource): () => void {
  let set = sources.get(e);
  if (!set) sources.set(e, (set = new Set()));
  set.add(src);
  e.invalidate();
  return () => {
    set!.delete(src);
    e.invalidate();
  };
}

/** Last-price badge color: the direction of the last bar versus the previous close. */
export function lastColor(e: ChartEngine): string {
  const last = e.data.last();
  const prev = e.data.bars[e.data.length - 2];
  if (!last) return e.theme.up;
  const ref = prev ? prev.close : last.open;
  return last.close >= ref ? e.theme.up : e.theme.down;
}

/** Every value badge the pane wants (no crosshair). */
export function paneLabels(e: ChartEngine, pane: Pane, paneIndex: number): PriceAxisLabel[] {
  const t = e.theme;
  const out: PriceAxisLabel[] = [];
  for (const uid of pane.uids) {
    const c = e.indicators.get(uid);
    if (!c || !e.indicatorShown(c)) continue;
    c.def.outputs.forEach((o, j) => {
      const s = c.series[o.key];
      if (!s) return;
      const st = outputStyle(t, c, j, o);
      if (!st.visible) return;
      const v = s[s.length - 1];
      if (v == null || !isFinite(v)) return;
      out.push({ id: `ind:${uid}:${o.key}`, price: v, bg: st.color, fg: t.lastPriceText, priority: PRIORITY.indicator });
    });
  }
  if (pane.main && e.compare.length && e.data.length) {
    const { from } = e.ts.visibleRange();
    const values = compareValues(e, Math.max(0, from));
    e.compare.forEach((c, k) => {
      const s = values[k];
      const v = s?.[s.length - 1];
      if (v == null || !isFinite(v)) return;
      out.push({ id: `cmp:${c.symbol}`, price: v, bg: c.color, fg: t.lastPriceText, priority: PRIORITY.compare });
    });
  }
  for (const src of sources.get(e) ?? []) {
    try {
      for (const l of src(e, pane, paneIndex)) out.push(l);
    } catch {
      /* a broken extra source never breaks the axis */
    }
  }
  if (pane.main && e.settings.scales?.lastPriceLabel !== false) {
    const last = e.data.last();
    if (last) out.push({ id: "last", price: last.close, bg: lastColor(e), fg: t.lastPriceText, priority: PRIORITY.lastPrice, pin: true });
  }
  return out;
}

export interface BadgeBox {
  id: string;
  /** Center y in canvas px. */
  y: number;
  text: string;
  bg: string;
  fg: string;
  /** Ids folded into a "+n" marker (only on markers). */
  folded?: string[];
}

/**
 * Lays out the pane's badges (plus an optional pinned crosshair label at `crosshairY`, absolute
 * canvas px) inside the pane. Returns the boxes to draw, the crosshair first when present.
 */
export function layoutPaneBadges(e: ChartEngine, pane: Pane, paneIndex: number, crosshair?: { y: number; text: string }): BadgeBox[] {
  const t = e.theme;
  const labels = paneLabels(e, pane, paneIndex);
  const ax: AxisLabel[] = labels.map((l) => ({ id: l.id, pos: pane.top + pane.ps.toY(l.price), size: BADGE_H, priority: l.priority, pin: l.pin }));
  if (crosshair) ax.push({ id: "crosshair", pos: crosshair.y, size: BADGE_H, priority: PRIORITY.crosshair, pin: true });
  const res = layoutLabels(ax, pane.top, pane.top + pane.height, { gap: 1 });
  const byId = new Map(labels.map((l) => [l.id, l]));
  const boxes: BadgeBox[] = [];
  for (const p of res.placed) {
    if (p.id === "crosshair" && crosshair) {
      boxes.push({ id: p.id, y: p.pos, text: crosshair.text, bg: t.crosshairLabelBg, fg: t.crosshairLabelText });
      continue;
    }
    const l = byId.get(p.id);
    if (!l) continue;
    boxes.push({ id: l.id, y: p.pos, text: l.text || pane.ps.format(l.price), bg: l.bg, fg: l.fg });
  }
  for (const c of res.collapsed) {
    boxes.push({ id: `+${c.ids.length}`, y: c.pos, text: `+${c.ids.length}`, bg: t.crosshairLabelBg, fg: t.crosshairLabelText, folded: c.ids });
  }
  // Paint order: others first, then last price, then the crosshair on top.
  const rank = (b: BadgeBox) => (b.id === "crosshair" ? 2 : b.id === "last" ? 1 : 0);
  return boxes.sort((a, b) => rank(a) - rank(b));
}

const recorded = new WeakMap<ChartEngine, Map<number, string>>();

/**
 * Scene-layer badges of one pane: layout, paint, and a record of the boxes on the chart root
 * (`data-axis-badges`, JSON of {pane, id, top, bottom}) for tests and tools.
 */
export function drawPaneBadges(e: ChartEngine, ctx: CanvasRenderingContext2D, x0: number, pane: Pane, paneIndex: number, dpr: number): void {
  const boxes = layoutPaneBadges(e, pane, paneIndex);
  clearCoveredTicks(e, ctx, x0, pane, boxes);
  drawBadgeBoxes(e, ctx, x0, boxes, dpr);
  let m = recorded.get(e);
  if (!m) recorded.set(e, (m = new Map()));
  for (const k of [...m.keys()]) if (k >= e.panes.length) m.delete(k);
  m.set(paneIndex, JSON.stringify(boxes.map((b) => ({ pane: paneIndex, id: b.id, top: Math.round((b.y - BADGE_H / 2) * 10) / 10, bottom: Math.round((b.y + BADGE_H / 2) * 10) / 10 }))));
  const all = `[${[...m.entries()].sort((x, y) => x[0] - y[0]).map(([, v]) => v.slice(1, -1)).filter(Boolean).join(",")}]`;
  if (e.root.dataset.axisBadges !== all) e.root.dataset.axisBadges = all;
}

/** Erases tick labels a badge would half cover (a label peeking out under a badge reads as noise). */
function clearCoveredTicks(e: ChartEngine, ctx: CanvasRenderingContext2D, x0: number, pane: Pane, boxes: readonly BadgeBox[]): void {
  if (!boxes.length) return;
  const t = e.theme;
  const half = t.fontSize / 2 + 1;
  ctx.fillStyle = t.background;
  for (const tick of pane.ps.ticks()) {
    const y = pane.top + tick.y;
    if (boxes.some((b) => y + half > b.y - BADGE_H / 2 && y - half < b.y + BADGE_H / 2)) ctx.fillRect(x0 + 2, y - half, t.priceAxisWidth - 3, half * 2);
  }
}

export function drawBadgeBoxes(e: ChartEngine, ctx: CanvasRenderingContext2D, x0: number, boxes: readonly BadgeBox[], dpr: number): void {
  const t = e.theme;
  for (const b of boxes) drawPriceBadge(ctx, x0, t.priceAxisWidth, b.y, b.text, b.bg, b.fg, t, dpr);
}

/**
 * UI-layer repaint of one pane's price axis with the crosshair label pinned: background, ticks,
 * then the re-laid-out badges. Covers the scene's badges of that pane exactly.
 */
export function drawPaneAxisWithCrosshair(e: ChartEngine, ctx: CanvasRenderingContext2D, x0: number, pane: Pane, paneIndex: number, crosshair: { y: number; text: string }, dpr: number): void {
  const t = e.theme;
  const left = e.plotLeft > 0;
  ctx.fillStyle = t.background;
  ctx.fillRect(x0, pane.top, t.priceAxisWidth, pane.height);
  drawPriceAxis(ctx, x0, pane.top, pane.height, pane.ps.ticks(), t, dpr, left);
  ctx.font = font(t);
  const boxes = layoutPaneBadges(e, pane, paneIndex, crosshair);
  clearCoveredTicks(e, ctx, x0, pane, boxes);
  drawBadgeBoxes(e, ctx, x0, boxes, dpr);
}
