// One-dimensional label layout for the axes: labels that want a position along the axis are
// moved apart so none overlap. Pure, used for the price axis (y) and the time axis (x).
//
// - Pinned labels (crosshair, last price) are placed first, in priority order, as close to their
//   wanted position as the free space allows. A higher-priority pinned label never moves for a
//   lower one.
// - The other labels go into the free gaps between pinned labels (the gap containing their
//   wanted center, else the nearest gap with room) and are spread with the least total
//   movement: overlapping labels merge into a block centered on their wanted positions.
// - A gap too small for its labels keeps the highest-priority ones and folds the rest into one
//   "+n" marker at the mean wanted position of the folded labels.
// Order is stable: equal positions keep priority order, then input order.

export interface AxisLabel {
  id: string;
  /** Wanted center along the axis. */
  pos: number;
  /** Extent along the axis (label height on the price axis, width on the time axis). */
  size: number;
  /** Higher wins (crosshair > last price > others). */
  priority: number;
  /** Stays at its wanted position when possible; others move around it. */
  pin?: boolean;
}

export interface PlacedLabel {
  id: string;
  /** Final center. */
  pos: number;
  size: number;
}

export interface CollapsedLabel {
  /** Center of the "+n" marker. */
  pos: number;
  size: number;
  /** Ids folded into the marker (in priority order). */
  ids: string[];
}

export interface LabelLayout {
  placed: PlacedLabel[];
  collapsed: CollapsedLabel[];
}

export interface LayoutOptions {
  /** Space between neighbouring labels. */
  gap?: number;
  /** Extent of the "+n" marker (default: the smallest label size). */
  markerSize?: number;
}

interface Item {
  id: string;
  pos: number;
  size: number;
  priority: number;
  order: number;
  ids?: string[];
}

interface Block {
  items: Item[];
  start: number;
  size: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Labels inside [lo, hi] without overlaps; see the module comment for the rules. */
export function layoutLabels(labels: readonly AxisLabel[], lo: number, hi: number, opts: LayoutOptions = {}): LabelLayout {
  const gap = opts.gap ?? 1;
  const items: Item[] = labels.map((l, order) => ({ id: l.id, pos: l.pos, size: l.size, priority: l.priority, order }));
  const byPriority = (a: Item, b: Item) => b.priority - a.priority || a.order - b.order;
  const placed: PlacedLabel[] = [];
  const collapsed: CollapsedLabel[] = [];

  // 1. Pinned labels, highest priority first, into the free intervals left by earlier ones.
  const pins = labels.map((l, i) => (l.pin ? items[i] : null)).filter((x): x is Item => x !== null).sort(byPriority);
  let free: [number, number][] = [[lo, hi]];
  const taken: [number, number][] = [];
  for (const p of pins) {
    const want = p.pos - p.size / 2;
    let best: number | null = null;
    for (const [a, b] of free) {
      if (b - a < p.size) continue;
      const s = clamp(want, a, b - p.size);
      if (best === null || Math.abs(s - want) < Math.abs(best - want)) best = s;
    }
    if (best === null) continue; // no room at all: dropped (the axis is shorter than one label)
    placed.push({ id: p.id, pos: best + p.size / 2, size: p.size });
    taken.push([best - gap, best + p.size + gap]);
    free = subtract(free, best - gap, best + p.size + gap);
  }

  // 2. Other labels: assign each to a free interval, then spread inside it.
  const rest = items.filter((it) => !labels[it.order].pin);
  const buckets = free.map(() => [] as Item[]);
  for (const it of [...rest].sort(byPriority)) {
    let k = free.findIndex(([a, b]) => it.pos >= a && it.pos <= b);
    if (k < 0) {
      // Wanted position under a pinned label or outside the axis: nearest free interval.
      let bestD = Infinity;
      free.forEach(([a, b], j) => {
        if (b - a < it.size) return;
        const d = it.pos < a ? a - it.pos : it.pos - b;
        if (d < bestD) {
          bestD = d;
          k = j;
        }
      });
    }
    if (k >= 0) buckets[k].push(it);
  }
  free.forEach(([a, b], k) => {
    const list = buckets[k];
    if (!list.length) return;
    const fitted = fold(list, b - a, gap, opts.markerSize, byPriority);
    for (const blk of spread(fitted, a, b, gap)) {
      let s = blk.start;
      for (const it of blk.items) {
        if (it.ids) collapsed.push({ pos: s + it.size / 2, size: it.size, ids: it.ids });
        else placed.push({ id: it.id, pos: s + it.size / 2, size: it.size });
        s += it.size + gap;
      }
    }
  });
  return { placed, collapsed };
}

/** Free intervals minus [x0, x1]. */
function subtract(free: [number, number][], x0: number, x1: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of free) {
    if (x1 <= a || x0 >= b) out.push([a, b]);
    else {
      if (x0 > a) out.push([a, x0]);
      if (x1 < b) out.push([x1, b]);
    }
  }
  return out;
}

/** Keeps what fits in `room`; the remainder becomes one "+n" marker item. */
function fold(list: Item[], room: number, gap: number, markerSize: number | undefined, byPriority: (a: Item, b: Item) => number): Item[] {
  const total = list.reduce((s, it) => s + it.size + gap, -gap);
  if (total <= room) return list;
  const sorted = [...list].sort(byPriority);
  const marker = markerSize ?? Math.min(...list.map((it) => it.size));
  const keep: Item[] = [];
  let used = marker;
  for (const it of sorted) {
    if (used + gap + it.size <= room) {
      keep.push(it);
      used += gap + it.size;
    } else break;
  }
  const folded = sorted.slice(keep.length);
  if (marker > room) return keep; // not even the marker fits
  const pos = folded.reduce((s, it) => s + it.pos, 0) / folded.length;
  keep.push({ id: `+${folded.length}`, pos, size: marker, priority: -Infinity, order: Infinity, ids: folded.map((it) => it.id) });
  return keep;
}

/** Least-movement spreading of items inside [a, b] (blocks merge while they overlap). */
function spread(list: Item[], a: number, b: number, gap: number): Block[] {
  const sorted = [...list].sort((x, y) => x.pos - y.pos || y.priority - x.priority || x.order - y.order);
  const blocks: Block[] = [];
  for (const it of sorted) {
    let blk: Block = { items: [it], start: 0, size: it.size };
    blk.start = place(blk, a, b);
    // Merge with the previous block while they overlap.
    while (blocks.length) {
      const prev = blocks[blocks.length - 1];
      if (prev.start + prev.size + gap <= blk.start + 1e-9) break;
      blocks.pop();
      blk = { items: [...prev.items, ...blk.items], start: 0, size: prev.size + gap + blk.size };
      blk.start = place(blk, a, b);
    }
    blocks.push(blk);
  }
  return blocks;
}

/** Start of a block that minimizes squared movement of its items, kept inside [a, b]. */
function place(blk: Block, a: number, b: number): number {
  let off = 0;
  let sum = 0;
  const gapTotal = blk.size - blk.items.reduce((s, it) => s + it.size, 0);
  const g = blk.items.length > 1 ? gapTotal / (blk.items.length - 1) : 0;
  for (const it of blk.items) {
    sum += it.pos - it.size / 2 - off;
    off += it.size + g;
  }
  return clamp(sum / blk.items.length, a, Math.max(a, b - blk.size));
}
