// Totals of a list of trades for the time and sales panel, and the size from which a print counts
// as large (five times the median size).

import type { FlowTrade } from "@qt/core";

export function tapeSummary(trades: readonly FlowTrade[]): { buy: number; sell: number; large: number } {
  let buy = 0;
  let sell = 0;
  for (const t of trades) {
    if (t.buy) buy += t.qty;
    else sell += t.qty;
  }
  const sizes = trades.map((t) => t.qty).sort((a, b) => a - b);
  const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
  return { buy, sell, large: median > 0 ? median * 5 : Infinity };
}
