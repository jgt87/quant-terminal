// Vertical panes: the main price pane plus stacked indicator panes, each with its own
// price scale. Heights are kept as ratios so resizing the chart keeps proportions.

import { PriceScale } from "./PriceScale";

export class Pane {
  readonly id: string;
  readonly main: boolean;
  ratio: number;
  readonly ps = new PriceScale();
  top = 0;
  height = 0;
  /** Indicator instance uids rendered in this pane. */
  uids: string[] = [];

  constructor(id: string, main: boolean, ratio: number) {
    this.id = id;
    this.main = main;
    this.ratio = ratio;
    if (!main) {
      this.ps.marginTop = 0.1;
      this.ps.marginBottom = 0.1;
    }
  }

  contains(y: number): boolean {
    return y >= this.top && y < this.top + this.height;
  }
}

export const MIN_PANE_PX = 40;

/** Lay panes out top-to-bottom inside `total` px with `sep` px separators between them. */
export function layoutPanes(panes: Pane[], total: number, sep: number): void {
  const avail = Math.max(0, total - sep * Math.max(0, panes.length - 1));
  const sum = panes.reduce((s, p) => s + p.ratio, 0) || 1;
  let y = 0;
  panes.forEach((p, i) => {
    const h = i === panes.length - 1 ? Math.max(0, total - y) : Math.round((avail * p.ratio) / sum);
    p.top = y;
    p.height = h;
    p.ps.setHeight(h);
    y += h + sep;
  });
}

/** Move the separator below pane `i` by dy px, trading height with pane i+1. */
export function dragSeparator(panes: Pane[], i: number, dy: number): void {
  const a = panes[i];
  const b = panes[i + 1];
  if (!a || !b) return;
  const total = a.height + b.height;
  const ha = Math.min(total - MIN_PANE_PX, Math.max(MIN_PANE_PX, a.height + dy));
  const ratioSum = a.ratio + b.ratio;
  a.ratio = (ratioSum * ha) / total;
  b.ratio = ratioSum - a.ratio;
}

/** Separator index whose band contains y (within `grab` px), or -1. */
export function separatorAt(panes: Pane[], y: number, sep: number, grab = 3): number {
  for (let i = 0; i < panes.length - 1; i++) {
    const top = panes[i].top + panes[i].height;
    if (y >= top - grab && y <= top + sep + grab) return i;
  }
  return -1;
}
