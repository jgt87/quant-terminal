// Pure portfolio math: average-cost holdings, realized P&L and totals.
import type { Holding, Portfolio, PortfolioTransaction, Quote } from "@qt/core";

const EPS = 1e-9;

export interface Position {
  symbol: string;
  qty: number;
  avgPrice: number;
  realizedPnl: number;
}

export interface Replay {
  positions: Map<string, Position>;
  /** Change of cash from all transactions (buys and fees reduce it, sells add). */
  cashDelta: number;
  fees: number;
}

/** Transactions in time order (stable for equal times). */
export const sortTransactions = (txs: readonly PortfolioTransaction[]) =>
  txs.map((t, i) => ({ t, i })).sort((a, b) => a.t.time - b.t.time || a.i - b.i).map((x) => x.t);

/**
 * Replay transactions with the average-cost method. Buy fees are part of the cost basis; sell
 * fees reduce realized P&L. Selling more than held throws (no shorting in portfolios).
 */
export function replay(txs: readonly PortfolioTransaction[]): Replay {
  const positions = new Map<string, Position>();
  let cashDelta = 0;
  let fees = 0;
  for (const t of sortTransactions(txs)) {
    const key = t.symbol.toUpperCase();
    let p = positions.get(key);
    if (!p) positions.set(key, (p = { symbol: t.symbol, qty: 0, avgPrice: 0, realizedPnl: 0 }));
    fees += t.fee;
    if (t.side === "buy") {
      const qty = p.qty + t.qty;
      p.avgPrice = (p.qty * p.avgPrice + t.qty * t.price + t.fee) / qty;
      p.qty = qty;
      cashDelta -= t.qty * t.price + t.fee;
    } else {
      if (t.qty > p.qty + EPS) throw new Error(`Sell of ${t.qty} ${t.symbol} exceeds the ${p.qty} held at that time`);
      p.realizedPnl += (t.price - p.avgPrice) * t.qty - t.fee;
      p.qty -= t.qty;
      if (p.qty < EPS) {
        p.qty = 0;
        p.avgPrice = 0;
      }
      cashDelta += t.qty * t.price - t.fee;
    }
  }
  return { positions, cashDelta, fees };
}

export interface PortfolioTotals {
  costBasis: number;
  marketValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  cash: number;
  equity: number;
  dayChange: number;
  fees: number;
  /** Open holdings without a quote (excluded from market value, unrealized and day change). */
  missingQuotes: string[];
}

/** Holdings marked to market with `quotes` (by symbol, case-insensitive) and portfolio totals. */
export function computeHoldings(portfolio: Portfolio, quotes: ReadonlyMap<string, Quote>): { holdings: Holding[]; totals: PortfolioTotals } {
  const r = replay(portfolio.transactions);
  const holdings: Holding[] = [];
  const totals: PortfolioTotals = {
    costBasis: 0, marketValue: 0, unrealizedPnl: 0, realizedPnl: 0,
    cash: portfolio.cash + r.cashDelta, equity: 0, dayChange: 0, fees: r.fees, missingQuotes: [],
  };
  for (const p of r.positions.values()) {
    const q = quotes.get(p.symbol.toUpperCase());
    const last = q?.last ?? null;
    const open = p.qty > 0;
    const marketValue = open && last !== null ? p.qty * last : open ? null : 0;
    const unrealized = open && last !== null ? (last - p.avgPrice) * p.qty : open ? null : 0;
    holdings.push({ symbol: p.symbol, qty: p.qty, avgPrice: p.avgPrice, last, marketValue, unrealizedPnl: unrealized, realizedPnl: p.realizedPnl });
    totals.realizedPnl += p.realizedPnl;
    if (!open) continue;
    totals.costBasis += p.qty * p.avgPrice;
    if (q) {
      totals.marketValue += p.qty * q.last;
      totals.unrealizedPnl += (q.last - p.avgPrice) * p.qty;
      totals.dayChange += p.qty * q.change;
    } else {
      totals.missingQuotes.push(p.symbol);
    }
  }
  totals.equity = totals.cash + totals.marketValue;
  holdings.sort((a, b) => Number(b.qty > 0) - Number(a.qty > 0) || a.symbol.localeCompare(b.symbol));
  return { holdings, totals };
}
