// Depth ladder model: price rows around the mid with bid / ask size per row and the paper
// account's working orders in their rows; and what a click on a row places (simulated orders).

import { depthStep, type DepthFrame } from "@qt/core";
import type { BookView } from "../../api/depth";
import type { PaperOrderRequest, PaperOrderView } from "../../api/paper";

export interface LadderOrder {
  id: string;
  side: "buy" | "sell";
  qty: number;
  /** Short type text: LMT, STP, STP LMT. */
  type: string;
  /** Bracket leg of a parent order. */
  leg?: "stop-loss" | "take-profit";
}

export interface LadderRow {
  price: number;
  bid: number;
  ask: number;
  buys: LadderOrder[];
  sells: LadderOrder[];
  bestBid: boolean;
  bestAsk: boolean;
  /** The open position's average price falls in this row. */
  position: boolean;
}

const TYPE_TEXT: Record<string, string> = { limit: "LMT", stop: "STP", "stop-limit": "STP LMT", market: "MKT" };
const key = (s: string) => s.trim().toUpperCase();
const round = (v: number) => Number(v.toPrecision(12));

/** Grouping steps offered for a price: multiples of a hundredth of the heatmap step. */
export function ladderSteps(price: number): number[] {
  const base = depthStep(price) / 10;
  return [1, 2, 5, 10, 25, 50, 100].map((m) => round(base * m));
}

/** Row index of a price for a step (rows are step-aligned prices). */
export const rowKey = (price: number, step: number) => Math.round(price / step);

/**
 * `count` rows from the highest price down, centred on `center` (a price; the book's mid by
 * default). Sizes come from a book binned with the same step.
 */
export function ladderRows(book: BookView | null, step: number, count: number, orders: readonly PaperOrderView[] = [], symbol = "", position?: { qty: number; avgPrice: number } | null, center?: number): LadderRow[] {
  if (!book || !(step > 0)) return [];
  const mid = center ?? (book.bid != null && book.ask != null ? (book.bid + book.ask) / 2 : (book.bid ?? book.ask));
  if (mid == null) return [];
  const bids = new Map<number, number>();
  const asks = new Map<number, number>();
  // Like the server's binning: bids into the row below, asks into the row above.
  for (const [p, q] of book.bids) {
    const k = Math.floor(p / step + 1e-9);
    bids.set(k, (bids.get(k) ?? 0) + q);
  }
  for (const [p, q] of book.asks) {
    const k = Math.ceil(p / step - 1e-9);
    asks.set(k, (asks.get(k) ?? 0) + q);
  }
  const bb = book.bid != null ? Math.floor(book.bid / step + 1e-9) : null;
  const ba = book.ask != null ? Math.ceil(book.ask / step - 1e-9) : null;
  const top = Math.floor(mid / step + 1e-9) + Math.floor(count / 2);
  const sym = key(symbol);
  const mine = new Map<number, { buys: LadderOrder[]; sells: LadderOrder[] }>();
  for (const o of orders) {
    if (o.status !== "working" || key(o.symbol) !== sym || o.price === undefined) continue;
    const k = rowKey(o.price, step);
    const cell = mine.get(k) ?? { buys: [], sells: [] };
    const item: LadderOrder = { id: o.id, side: o.side, qty: o.qty, type: TYPE_TEXT[o.type] ?? o.type, ...(o.role === "stop-loss" || o.role === "take-profit" ? { leg: o.role } : {}) };
    (o.side === "buy" ? cell.buys : cell.sells).push(item);
    mine.set(k, cell);
  }
  const posKey = position && position.qty !== 0 ? rowKey(position.avgPrice, step) : null;
  const rows: LadderRow[] = [];
  for (let k = top; k > top - count; k--) {
    rows.push({
      price: round(k * step),
      bid: bids.get(k) ?? 0,
      ask: asks.get(k) ?? 0,
      buys: mine.get(k)?.buys ?? [],
      sells: mine.get(k)?.sells ?? [],
      bestBid: k === bb,
      bestAsk: k === ba,
      position: k === posKey,
    });
  }
  return rows;
}

/**
 * The simulated order a click places: on the buy side a limit below the best ask, a stop at or
 * above it; on the sell side a limit above the best bid, a stop at or below it.
 */
export function clickOrder(side: "buy" | "sell", price: number, book: Pick<BookView, "bid" | "ask">, qty: number, symbol: string): PaperOrderRequest {
  const marketable = side === "buy" ? book.ask != null && price >= book.ask : book.bid != null && price <= book.bid;
  return { symbol, side, type: marketable ? "stop" : "limit", qty, price };
}

/** The change a dragged order makes: its (limit / stop) price; active bracket legs are orders too. */
export const dragPatch = (orderId: string, price: number): { orderId: string; patch: { price: number } } => ({ orderId, patch: { price } });

/**
 * A recorded heatmap frame as a book (depth replay): bins at or below the best bid are bids, bins
 * at or above the best ask are asks, priced at their lower edge. Mode "replay".
 */
export function frameBook(f: DepthFrame | null | undefined, symbol: string): BookView | null {
  if (!f) return null;
  const bids: [number, number][] = [];
  const asks: [number, number][] = [];
  const bin = (p: number) => Math.floor((p - f.base) / f.step + 1e-9);
  const bb = f.bid != null ? bin(f.bid) : null;
  const ba = f.ask != null ? bin(f.ask) : null;
  f.qty.forEach((q, i) => {
    if (!(q > 0)) return;
    const price = round(f.base + i * f.step);
    if (bb !== null && i <= bb) bids.push([price, q]);
    else if (ba !== null && i >= ba) asks.push([price, q]);
  });
  bids.reverse();
  return { symbol, time: f.time, mode: "replay", synced: true, bid: f.bid, ask: f.ask, step: f.step, heatStep: f.step, bids, asks };
}
