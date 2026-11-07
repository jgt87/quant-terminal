// Local order book kept from an exchange depth snapshot plus incremental updates (each update
// carries absolute sizes; size 0 removes the level), and price-binned depth frames for the
// liquidity heatmap and depth ladder. Pure code shared by server and web.

import { niceFlowStep } from "../orderflow";

/** [price, size]. */
export type BookLevel = [number, number];

export interface DepthSnapshot {
  /** Id of the last update included in the snapshot. */
  lastUpdateId: number;
  bids: BookLevel[];
  asks: BookLevel[];
}

/** One incremental update covering update ids U..u. */
export interface DepthDiff {
  U: number;
  u: number;
  bids: BookLevel[];
  asks: BookLevel[];
  /** Event time, UTC milliseconds. */
  time?: number;
}

/** applied: book changed; stale: already contained in the book; gap: updates were missed (resync). */
export type DiffResult = "applied" | "stale" | "gap";

export class OrderBook {
  readonly bids = new Map<number, number>();
  readonly asks = new Map<number, number>();
  lastUpdateId = 0;
  /** A snapshot is loaded and no gap was seen since. */
  synced = false;

  load(s: DepthSnapshot): void {
    this.bids.clear();
    this.asks.clear();
    setLevels(this.bids, s.bids);
    setLevels(this.asks, s.asks);
    this.lastUpdateId = s.lastUpdateId;
    this.synced = true;
  }

  /**
   * Applies an update. Updates ending at or before the book's id are stale; an update that starts
   * after the next expected id means some were missed: the book is marked unsynced.
   */
  apply(d: DepthDiff): DiffResult {
    if (!this.synced) return "gap";
    if (d.u <= this.lastUpdateId) return "stale";
    if (d.U > this.lastUpdateId + 1) {
      this.synced = false;
      return "gap";
    }
    setLevels(this.bids, d.bids);
    setLevels(this.asks, d.asks);
    this.lastUpdateId = d.u;
    return "applied";
  }

  bestBid(): number | null {
    let best: number | null = null;
    for (const p of this.bids.keys()) if (best === null || p > best) best = p;
    return best;
  }

  bestAsk(): number | null {
    let best: number | null = null;
    for (const p of this.asks.keys()) if (best === null || p < best) best = p;
    return best;
  }

  mid(): number | null {
    const b = this.bestBid();
    const a = this.bestAsk();
    if (b === null || a === null) return b ?? a;
    return (a + b) / 2;
  }

  /** Levels of one side, best first, at most `n`. */
  levels(side: "bid" | "ask", n = Infinity): BookLevel[] {
    const map = side === "bid" ? this.bids : this.asks;
    const out = [...map.entries()].sort((x, y) => (side === "bid" ? y[0] - x[0] : x[0] - y[0]));
    return n < out.length ? out.slice(0, n) : out;
  }

  /** Drops the levels farthest from the top of book so each side keeps at most `max`. */
  trim(max: number): void {
    for (const side of ["bid", "ask"] as const) {
      const map = side === "bid" ? this.bids : this.asks;
      if (map.size <= max) continue;
      for (const [p] of this.levels(side).slice(max)) map.delete(p);
    }
  }
}

function setLevels(map: Map<number, number>, levels: readonly BookLevel[]): void {
  for (const [p, q] of levels) {
    if (!Number.isFinite(p) || !Number.isFinite(q)) continue;
    if (q > 0) map.set(p, q);
    else map.delete(p);
  }
}

/** Parses an exchange level list (`[["price","qty"], …]`). */
export function parseLevels(raw: unknown): BookLevel[] {
  if (!Array.isArray(raw)) return [];
  const out: BookLevel[] = [];
  for (const row of raw) {
    if (!Array.isArray(row)) continue;
    const p = Number(row[0]);
    const q = Number(row[1]);
    if (Number.isFinite(p) && Number.isFinite(q)) out.push([p, q]);
  }
  return out;
}

const round = (v: number, digits = 12) => Number(v.toPrecision(digits));

/**
 * Sums levels into price bins of `step`: bids into the bin below (floor), asks into the bin above
 * (ceil), so a binned bid never shows above the real best bid and an ask never below the best ask.
 * Best first.
 */
export function binLevels(levels: readonly BookLevel[], step: number, side: "bid" | "ask"): BookLevel[] {
  if (!(step > 0)) return levels.map(([p, q]) => [p, q]);
  const bins = new Map<number, number>();
  for (const [p, q] of levels) {
    const k = side === "bid" ? Math.floor(p / step + 1e-9) : Math.ceil(p / step - 1e-9);
    bins.set(k, (bins.get(k) ?? 0) + q);
  }
  return [...bins.entries()]
    .sort((x, y) => (side === "bid" ? y[0] - x[0] : x[0] - y[0]))
    .map(([k, q]): BookLevel => [round(k * step), round(q, 10)]);
}

/** Heatmap bin size for a price: about 0.01 % of it, on a 1 / 2 / 2.5 / 5 step. */
export function depthStep(price: number): number {
  return niceFlowStep(Math.abs(price) * 0.0001);
}

/**
 * One sample of the book for the liquidity heatmap: resting size per price bin around the mid.
 * Bin i covers [base + i·step, base + (i+1)·step).
 */
export interface DepthFrame {
  /** UTC milliseconds. */
  time: number;
  step: number;
  base: number;
  /** Resting size per bin (bids and asks together; they do not overlap). */
  qty: number[];
  bid: number | null;
  ask: number | null;
}

/** A frame of `bins` bins of `step` centred on the book's mid. */
export function depthFrame(book: OrderBook, time: number, step: number, bins = 400): DepthFrame | null {
  const mid = book.mid();
  if (mid === null || !(step > 0)) return null;
  const base = round((Math.floor(mid / step) - Math.floor(bins / 2)) * step);
  const qty = new Array<number>(bins).fill(0);
  const add = (map: Map<number, number>) => {
    for (const [p, q] of map) {
      const i = Math.floor((p - base) / step + 1e-9);
      if (i >= 0 && i < bins) qty[i] += q;
    }
  };
  add(book.bids);
  add(book.asks);
  return { time, step, base, qty: qty.map((q) => round(q, 6)), bid: book.bestBid(), ask: book.bestAsk() };
}

/** Lower edge price of bin `i` of a frame. */
export const framePrice = (f: DepthFrame, i: number): number => round(f.base + i * f.step);

/**
 * Keeps at most `max` frames by taking the frame with the most total size out of each group of
 * consecutive frames (big resting orders stay visible when zoomed out).
 */
export function thinFrames(frames: readonly DepthFrame[], max: number): DepthFrame[] {
  if (frames.length <= max || max < 1) return frames.slice();
  const group = Math.ceil(frames.length / max);
  const out: DepthFrame[] = [];
  for (let i = 0; i < frames.length; i += group) {
    let best = frames[i];
    let bestSum = -1;
    for (let j = i; j < Math.min(frames.length, i + group); j++) {
      let s = 0;
      for (const q of frames[j].qty) s += q;
      if (s > bestSum) (bestSum = s), (best = frames[j]);
    }
    out.push(best);
  }
  return out;
}
