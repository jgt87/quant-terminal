// Auto Fibonacci retracement from the last significant zig-zag swing.

import type { Anchor, Bar } from "../types";
import { zigzag } from "./pivots";

export interface AutoFibOptions {
  /** Zig-zag reversal threshold in percent (default 5). */
  deviationPct?: number;
  /** Minimum bars between zig-zag pivots (default 1). */
  depth?: number;
}

/**
 * Returns the anchors of a fib drawing over the last zig-zag swing (the last two pivots,
 * the final one being the provisional current extreme), or null when no swing exists.
 * Anchor convention matches `fibLevels(a, b)`: a = start of the move (ratio 1),
 * b = end of the move (ratio 0), so levels measure the retracement back from b toward a.
 */
export function autoFib(bars: Bar[], opts: AutoFibOptions = {}): { a: Anchor; b: Anchor } | null {
  const piv = zigzag(bars, opts.deviationPct ?? 5, opts.depth ?? 1);
  if (piv.length < 2) return null;
  const p = piv[piv.length - 2];
  const q = piv[piv.length - 1];
  return { a: { time: p.time, price: p.price }, b: { time: q.time, price: q.price } };
}
