// Pure paper-trading simulator: order triggers, fills, netting, brackets (OCO) and marking.
// Everything here is simulated in our own store; nothing is ever sent to a broker.
import type { PaperAccount, PaperOrder } from "@qt/core";

const EPS = 1e-9;
export const MAX_HISTORY = 2000;
export const MAX_CLOSED_ORDERS = 1000;

/** Stored order: the contract plus bracket links and fill details. */
export interface SimOrder extends PaperOrder {
  /** Bracket child: id of the order whose fill created it (reduce-only). */
  parentId?: string;
  /** Orders sharing an ocoId cancel each other when one fills. */
  ocoId?: string;
  /** "stop-loss" / "take-profit" for bracket children, "close" for close-position orders. */
  role?: "stop-loss" | "take-profit" | "close";
  commission?: number;
  /** Realized P&L of this fill (before commission). */
  realizedPnl?: number;
  cancelReason?: string;
}

/** Stored account: the contract plus bookkeeping. `balance` is cash: start + realized P&L - commissions. */
export interface SimAccount extends PaperAccount {
  name: string;
  initialBalance: number;
  createdAt: number;
  realizedPnl: number;
  totalCommission: number;
  orders: SimOrder[];
}

export type PriceMap = ReadonlyMap<string, number>;

export const symKey = (s: string) => s.trim().toUpperCase();

export function newAccount(id: string, opts: { name?: string; currency?: string; balance?: number; commissionBps?: number; slippageBps?: number }, now: number): SimAccount {
  const balance = opts.balance ?? 100_000;
  return {
    id,
    name: opts.name ?? "Paper account",
    currency: opts.currency ?? "USD",
    balance,
    initialBalance: balance,
    commissionBps: opts.commissionBps ?? 0,
    slippageBps: opts.slippageBps ?? 0,
    orders: [],
    positions: {},
    history: [],
    createdAt: now,
    realizedPnl: 0,
    totalCommission: 0,
  };
}

export function resetAccount(acc: SimAccount): SimAccount {
  return { ...acc, balance: acc.initialBalance, orders: [], positions: {}, history: [], realizedPnl: 0, totalCommission: 0 };
}

/**
 * Fill price for a working order at `last`, or null when it does not trigger.
 * Market: last ± slippage. Limit buy: last <= limit, fills at min(last, limit) (sell mirrored),
 * no slippage. Stop buy: last >= stop, fills at max(last, stop) + slippage (sell mirrored).
 */
export function triggerPrice(o: Pick<PaperOrder, "type" | "side" | "price">, last: number, slippageBps: number): number | null {
  if (!Number.isFinite(last) || last <= 0) return null;
  const slip = slippageBps / 10_000;
  const buy = o.side === "buy";
  switch (o.type) {
    case "market":
      return buy ? last * (1 + slip) : last * (1 - slip);
    case "limit": {
      const p = o.price!;
      if (buy) return last <= p ? Math.min(last, p) : null;
      return last >= p ? Math.max(last, p) : null;
    }
    case "stop": {
      const p = o.price!;
      if (buy) return last >= p ? Math.max(last, p) * (1 + slip) : null;
      return last <= p ? Math.min(last, p) * (1 - slip) : null;
    }
  }
}

/**
 * Net a fill into a position. Same direction (or flat): weighted average price. Opposite
 * direction: realize (price - avg) x closed qty x direction; a flip opens the rest at `price`.
 */
export function netPosition(pos: { qty: number; avgPrice: number } | undefined, signedQty: number, price: number): { qty: number; avgPrice: number; realized: number } {
  const q = pos?.qty ?? 0;
  const avg = pos?.avgPrice ?? 0;
  if (Math.abs(q) < EPS || Math.sign(q) === Math.sign(signedQty)) {
    const qty = q + signedQty;
    return { qty, avgPrice: (Math.abs(q) * avg + Math.abs(signedQty) * price) / Math.abs(qty), realized: 0 };
  }
  const closing = Math.min(Math.abs(q), Math.abs(signedQty));
  const realized = (price - avg) * closing * Math.sign(q);
  const qty = q + signedQty;
  if (Math.abs(qty) < EPS) return { qty: 0, avgPrice: 0, realized };
  if (Math.sign(qty) === Math.sign(q)) return { qty, avgPrice: avg, realized };
  return { qty, avgPrice: price, realized }; // flipped: remainder opens at the fill price
}

/** Fill `order` (in `acc`, mutated) at `price`. Creates bracket children and cancels OCO siblings. */
export function fillOrder(acc: SimAccount, order: SimOrder, price: number, now: number): void {
  const key = symKey(order.symbol);
  let qty = order.qty;
  if (order.parentId || order.role === "close") {
    // Reduce-only: never more than the opposite position, cancelled when there is none.
    const pos = acc.positions[key]?.qty ?? 0;
    const reduces = order.side === "buy" ? pos < -EPS : pos > EPS;
    if (!reduces) {
      order.status = "cancelled";
      order.cancelReason = "No position to reduce";
      return;
    }
    qty = Math.min(qty, Math.abs(pos));
  }
  const signed = order.side === "buy" ? qty : -qty;
  const net = netPosition(acc.positions[key], signed, price);
  const commission = (qty * price * acc.commissionBps) / 10_000;
  if (Math.abs(net.qty) < EPS) delete acc.positions[key];
  else acc.positions[key] = { qty: net.qty, avgPrice: net.avgPrice };
  acc.balance += net.realized - commission;
  acc.realizedPnl += net.realized;
  acc.totalCommission += commission;
  Object.assign(order, { status: "filled", qty, filledAt: now, fillPrice: price, commission, realizedPnl: net.realized });

  if (order.ocoId) {
    for (const o of acc.orders) {
      if (o !== order && o.ocoId === order.ocoId && o.status === "working") {
        o.status = "cancelled";
        o.cancelReason = "OCO sibling filled";
      }
    }
  }
  if (!order.parentId && (order.stopLoss !== undefined || order.takeProfit !== undefined)) {
    const exitSide = order.side === "buy" ? "sell" : "buy";
    const child = (role: "stop-loss" | "take-profit", type: "stop" | "limit", p: number, n: number): SimOrder => ({
      id: `${order.id}-${role === "stop-loss" ? "sl" : "tp"}`,
      symbol: order.symbol,
      side: exitSide,
      type,
      qty,
      price: p,
      status: "working",
      createdAt: now + n,
      parentId: order.id,
      ocoId: order.id,
      role,
    });
    if (order.stopLoss !== undefined) acc.orders.push(child("stop-loss", "stop", order.stopLoss, 0));
    if (order.takeProfit !== undefined) acc.orders.push(child("take-profit", "limit", order.takeProfit, 1));
  }
}

/**
 * One simulator pass: fill every working order whose symbol has a price and whose trigger is
 * met. Bracket children created in this pass wait for the next pass. Returns true on changes.
 */
export function processAccount(acc: SimAccount, prices: PriceMap, now: number): boolean {
  let changed = false;
  const working = acc.orders.filter((o) => o.status === "working").sort((a, b) => a.createdAt - b.createdAt);
  for (const o of working) {
    if (o.status !== "working") continue; // cancelled by an OCO sibling in this pass
    const last = prices.get(symKey(o.symbol));
    if (last === undefined) continue;
    const price = triggerPrice(o, last, acc.slippageBps);
    if (price === null) continue;
    fillOrder(acc, o, price, now);
    changed = true;
  }
  if (changed) pruneOrders(acc);
  return changed;
}

/** Keep all working orders and the newest MAX_CLOSED_ORDERS finished ones. */
export function pruneOrders(acc: SimAccount): void {
  const done = acc.orders.filter((o) => o.status !== "working");
  if (done.length <= MAX_CLOSED_ORDERS) return;
  const drop = new Set(done.sort((a, b) => (a.filledAt ?? a.createdAt) - (b.filledAt ?? b.createdAt)).slice(0, done.length - MAX_CLOSED_ORDERS));
  acc.orders = acc.orders.filter((o) => !drop.has(o));
}

/** Cancel working bracket/close orders of a symbol (after the position is closed). */
export function cancelExits(acc: SimAccount, symbol: string, reason: string): void {
  const key = symKey(symbol);
  for (const o of acc.orders) {
    if (o.status === "working" && symKey(o.symbol) === key && (o.parentId || o.role === "close")) {
      o.status = "cancelled";
      o.cancelReason = reason;
    }
  }
}

export interface MarkedPosition {
  qty: number;
  avgPrice: number;
  last: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
}

/** Positions marked to market; equity = balance + unrealized P&L of priced positions. */
export function markAccount(acc: SimAccount, prices: PriceMap) {
  const positions: Record<string, MarkedPosition> = {};
  let unrealized = 0;
  const missing: string[] = [];
  for (const [sym, p] of Object.entries(acc.positions)) {
    const last = prices.get(symKey(sym)) ?? null;
    const u = last === null ? null : (last - p.avgPrice) * p.qty;
    positions[sym] = { qty: p.qty, avgPrice: p.avgPrice, last, marketValue: last === null ? null : last * p.qty, unrealizedPnl: u };
    if (u === null) missing.push(sym);
    else unrealized += u;
  }
  return { ...acc, positions, unrealizedPnl: unrealized, equity: acc.balance + unrealized, missingQuotes: missing };
}

/** Append an equity snapshot (time in ms), capped to MAX_HISTORY points. */
export function snapshot(acc: SimAccount, prices: PriceMap, now: number): void {
  const { equity } = markAccount(acc, prices);
  acc.history.push({ time: now, equity });
  if (acc.history.length > MAX_HISTORY) acc.history.splice(0, acc.history.length - MAX_HISTORY);
}
