import type { MarketData } from "../providers";
import type { Store } from "../store";
import { newId } from "../store";
import { badRequest, notFound, providerError } from "../errors";
import {
  cancelExits, fillOrder, markAccount, newAccount, processAccount, pruneOrders, resetAccount, snapshot, symKey,
  type SimAccount, type SimOrder,
} from "./sim";

export const PAPER_FILE = "paper.json";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validateAccountBody(body: unknown) {
  if (!isObj(body)) throw badRequest("Body must be an object");
  const out: { name?: string; currency?: string; balance?: number; commissionBps?: number; slippageBps?: number } = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 100) throw badRequest("name must be a string (max 100)");
    out.name = body.name.trim();
  }
  if (body.currency !== undefined) {
    if (typeof body.currency !== "string" || !/^[A-Za-z0-9]{2,10}$/.test(body.currency)) throw badRequest("currency must be a code such as USD");
    out.currency = body.currency.toUpperCase();
  }
  if (body.balance !== undefined) {
    if (!finite(body.balance) || body.balance <= 0 || body.balance > 1e12) throw badRequest("balance must be a positive number");
    out.balance = body.balance;
  }
  for (const k of ["commissionBps", "slippageBps"] as const) {
    if (body[k] === undefined) continue;
    const v = body[k];
    if (!finite(v) || v < 0 || v > 1000) throw badRequest(`${k} must be between 0 and 1000`);
    out[k] = v;
  }
  return out;
}

export function validateOrderBody(body: unknown, now: number): SimOrder {
  if (!isObj(body)) throw badRequest("Order must be an object");
  if (typeof body.symbol !== "string" || !body.symbol.trim() || body.symbol.length > 64) throw badRequest("symbol is required");
  if (body.side !== "buy" && body.side !== "sell") throw badRequest("side must be buy or sell");
  const type = body.type === undefined ? "market" : body.type;
  if (type !== "market" && type !== "limit" && type !== "stop" && type !== "stop-limit") throw badRequest("type must be market, limit, stop or stop-limit");
  if (!finite(body.qty) || body.qty <= 0) throw badRequest("qty must be a positive number");
  const order: SimOrder = { id: newId(), symbol: symKey(body.symbol), side: body.side, type, qty: body.qty, status: "working", createdAt: now };
  if (type !== "market") {
    if (!finite(body.price) || body.price <= 0) throw badRequest(`price is required for ${type} orders`);
    order.price = body.price;
  }
  if (type === "stop-limit") {
    if (!finite(body.stopPrice) || body.stopPrice <= 0) throw badRequest("stopPrice is required for stop-limit orders");
    order.stopPrice = body.stopPrice;
  }
  for (const k of ["stopLoss", "takeProfit"] as const) {
    if (body[k] === undefined || body[k] === null) continue;
    if (!finite(body[k]) || (body[k] as number) <= 0) throw badRequest(`${k} must be a positive number`);
    order[k] = body[k] as number;
  }
  const buy = order.side === "buy";
  const sl = order.stopLoss;
  const tp = order.takeProfit;
  if (sl !== undefined && tp !== undefined && (buy ? sl >= tp : sl <= tp)) {
    throw badRequest(buy ? "stopLoss must be below takeProfit for a buy" : "stopLoss must be above takeProfit for a sell");
  }
  if (order.price !== undefined) {
    if (sl !== undefined && (buy ? sl >= order.price : sl <= order.price)) throw badRequest("stopLoss is on the wrong side of the order price");
    if (tp !== undefined && (buy ? tp <= order.price : tp >= order.price)) throw badRequest("takeProfit is on the wrong side of the order price");
  }
  return order;
}

/** Fields of a working order that can be changed (chart line drags, ticket edits). */
export interface OrderPatch {
  price?: number;
  stopPrice?: number;
  qty?: number;
  /** null removes the bracket leg. */
  stopLoss?: number | null;
  takeProfit?: number | null;
}

export function validateOrderPatch(body: unknown): OrderPatch {
  if (!isObj(body)) throw badRequest("Body must be an object");
  const out: OrderPatch = {};
  for (const k of ["price", "stopPrice", "qty"] as const) {
    if (body[k] === undefined) continue;
    if (!finite(body[k]) || (body[k] as number) <= 0) throw badRequest(`${k} must be a positive number`);
    out[k] = body[k] as number;
  }
  for (const k of ["stopLoss", "takeProfit"] as const) {
    if (body[k] === undefined) continue;
    if (body[k] !== null && (!finite(body[k]) || (body[k] as number) <= 0)) throw badRequest(`${k} must be a positive number or null`);
    out[k] = body[k] as number | null;
  }
  if (!Object.keys(out).length) throw badRequest("Nothing to change");
  return out;
}

/**
 * Applies a patch to a working order (mutated). Market orders have no price to move; bracket
 * children (stop-loss / take-profit) only move their price. The changed order is checked like a
 * new one.
 */
export function applyOrderPatch(o: SimOrder, p: OrderPatch, now: number): void {
  if (o.status !== "working") throw badRequest(`Order is ${o.status}, not working`);
  if (o.parentId && (p.qty !== undefined || p.stopLoss !== undefined || p.takeProfit !== undefined || p.stopPrice !== undefined)) {
    throw badRequest("Only the price of a stop-loss / take-profit order can change");
  }
  if (o.type === "market" && (p.price !== undefined || p.stopPrice !== undefined)) throw badRequest("Market orders have no price");
  if (p.stopPrice !== undefined && o.type !== "stop-limit") throw badRequest("Only stop-limit orders have a stop price");
  const next: Record<string, unknown> = { ...o, ...p };
  for (const k of ["stopLoss", "takeProfit"] as const) if (next[k] === null) delete next[k];
  if (o.parentId) {
    o.price = p.price ?? o.price;
    return;
  }
  const checked = validateOrderBody(next, now);
  Object.assign(o, { price: checked.price, stopPrice: checked.stopPrice, qty: checked.qty, stopLoss: checked.stopLoss, takeProfit: checked.takeProfit });
  if (p.stopPrice !== undefined) o.triggered = false;
}

export interface PaperEngineOptions {
  store: Store;
  market: MarketData;
  now?: () => number;
}

/** Paper accounts: CRUD, order entry and the fill/equity loops. Purely simulated. */
export class PaperEngine {
  private readonly store: Store;
  private readonly market: MarketData;
  private readonly now: () => number;
  private timers: NodeJS.Timeout[] = [];
  private filling = false;

  constructor(opts: PaperEngineOptions) {
    this.store = opts.store;
    this.market = opts.market;
    this.now = opts.now ?? Date.now;
  }

  start(fillMs = 2000, snapshotMs = 60_000): void {
    if (this.timers.length) return;
    const fill = setInterval(() => void this.fillPass().catch((e) => console.warn("[paper] fill pass failed:", (e as Error).message)), fillMs);
    const snap = setInterval(() => void this.snapshotPass().catch((e) => console.warn("[paper] snapshot failed:", (e as Error).message)), snapshotMs);
    fill.unref();
    snap.unref();
    this.timers = [fill, snap];
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  async list(): Promise<SimAccount[]> {
    return (await this.store.readDoc<SimAccount[]>(PAPER_FILE)) ?? [];
  }

  private async raw(id: string): Promise<SimAccount> {
    const a = (await this.list()).find((x) => x.id === id);
    if (!a) throw notFound(`Paper account not found: ${id}`);
    return a;
  }

  /** Last prices by symbol key; symbols without a quote are missing from the map. */
  async prices(symbols: Iterable<string>): Promise<Map<string, number>> {
    const list = [...new Set([...symbols].map(symKey))];
    if (list.length === 0) return new Map();
    const quotes = await this.market.quotes(list).catch(() => []);
    return new Map(quotes.map((q) => [symKey(q.symbol), q.last]));
  }

  /** Account with positions marked to market. */
  async get(id: string) {
    const acc = await this.raw(id);
    return markAccount(acc, await this.prices(Object.keys(acc.positions)));
  }

  /** Atomically change one account. */
  private mutate<R>(id: string, fn: (acc: SimAccount) => R): Promise<{ acc: SimAccount; result: R }> {
    return this.store.updateDoc<SimAccount[], { acc: SimAccount; result: R }>(PAPER_FILE, (cur = []) => {
      const i = cur.findIndex((a) => a.id === id);
      if (i < 0) throw notFound(`Paper account not found: ${id}`);
      const acc = structuredClone(cur[i]);
      const result = fn(acc);
      const next = [...cur];
      next[i] = acc;
      return { value: next, result: { acc, result } };
    });
  }

  async create(body: unknown): Promise<SimAccount> {
    const acc = newAccount(newId(), validateAccountBody(body), this.now());
    return this.store.updateDoc<SimAccount[], SimAccount>(PAPER_FILE, (cur = []) => {
      if (cur.length >= 50) throw badRequest("Too many paper accounts (max 50)");
      return { value: [...cur, acc], result: acc };
    });
  }

  async remove(id: string): Promise<void> {
    await this.store.updateDoc<SimAccount[], void>(PAPER_FILE, (cur = []) => {
      if (!cur.some((a) => a.id === id)) throw notFound(`Paper account not found: ${id}`);
      return { value: cur.filter((a) => a.id !== id), result: undefined };
    });
  }

  async reset(id: string) {
    const { acc } = await this.mutate(id, (a) => Object.assign(a, resetAccount(a)));
    return markAccount(acc, new Map());
  }

  /** Place an order; it is checked against the current quote and filled at once when it triggers. */
  async placeOrder(id: string, body: unknown) {
    await this.raw(id);
    const order = validateOrderBody(body, this.now());
    const prices = await this.prices([order.symbol]);
    if (!prices.has(order.symbol)) throw providerError(`No quote for ${order.symbol}; order not placed`);
    const { acc } = await this.mutate(id, (a) => {
      a.orders.push(order);
      processAccount(a, prices, this.now());
    });
    const placed = acc.orders.find((o) => o.id === order.id) ?? order;
    return { order: placed, account: markAccount(acc, await this.prices(Object.keys(acc.positions))) };
  }

  /** Change a working order; it is checked against the current quote and may fill at once. */
  async modifyOrder(id: string, orderId: string, body: unknown) {
    const patch = validateOrderPatch(body);
    const acc0 = await this.raw(id);
    const o0 = acc0.orders.find((x) => x.id === orderId);
    if (!o0) throw notFound(`Order not found: ${orderId}`);
    const prices = await this.prices([o0.symbol]);
    const { acc, result } = await this.mutate(id, (a) => {
      const o = a.orders.find((x) => x.id === orderId);
      if (!o) throw notFound(`Order not found: ${orderId}`);
      applyOrderPatch(o, patch, this.now());
      processAccount(a, prices, this.now());
      return o;
    });
    return { order: result, account: markAccount(acc, await this.prices(Object.keys(acc.positions))) };
  }

  async cancelOrder(id: string, orderId: string) {
    const { result } = await this.mutate(id, (a) => {
      const o = a.orders.find((x) => x.id === orderId);
      if (!o) throw notFound(`Order not found: ${orderId}`);
      if (o.status !== "working") throw badRequest(`Order is ${o.status}, not working`);
      o.status = "cancelled";
      o.cancelReason = "Cancelled by user";
      return o;
    });
    return result;
  }

  /** Close a position at market (reduce-only) and cancel its bracket orders. */
  async closePosition(id: string, symbol: string) {
    const key = symKey(symbol);
    const acc0 = await this.raw(id);
    if (!acc0.positions[key]) throw notFound(`No open position in ${key}`);
    const prices = await this.prices([key]);
    const last = prices.get(key);
    if (last === undefined) throw providerError(`No quote for ${key}; position not closed`);
    const { acc, result } = await this.mutate(id, (a) => {
      const pos = a.positions[key];
      if (!pos) throw notFound(`No open position in ${key}`);
      const now = this.now();
      const order: SimOrder = { id: newId(), symbol: key, side: pos.qty > 0 ? "sell" : "buy", type: "market", qty: Math.abs(pos.qty), status: "working", createdAt: now, role: "close" };
      a.orders.push(order);
      const slip = a.slippageBps / 10_000;
      fillOrder(a, order, order.side === "buy" ? last * (1 + slip) : last * (1 - slip), now);
      cancelExits(a, key, "Position closed");
      pruneOrders(a);
      return order;
    });
    return { order: result, account: markAccount(acc, await this.prices(Object.keys(acc.positions))) };
  }

  /** Fill working orders of all accounts against current quotes. */
  async fillPass(): Promise<number> {
    if (this.filling) return 0;
    this.filling = true;
    try {
      const accounts = await this.list();
      const symbols = new Set<string>();
      for (const a of accounts) for (const o of a.orders) if (o.status === "working") symbols.add(symKey(o.symbol));
      if (symbols.size === 0) return 0;
      const prices = await this.prices(symbols);
      if (prices.size === 0) return 0;
      return await this.store.updateDoc<SimAccount[], number>(PAPER_FILE, (cur = []) => {
        let n = 0;
        const now = this.now();
        const next = cur.map((a) => {
          const copy = structuredClone(a);
          if (processAccount(copy, prices, now)) {
            n++;
            return copy;
          }
          return a;
        });
        return { value: n ? next : undefined, result: n };
      });
    } finally {
      this.filling = false;
    }
  }

  /** Append an equity point to every account (positions marked at current quotes). */
  async snapshotPass(): Promise<void> {
    const accounts = await this.list();
    if (accounts.length === 0) return;
    const prices = await this.prices(accounts.flatMap((a) => Object.keys(a.positions)));
    await this.store.updateDoc<SimAccount[], void>(PAPER_FILE, (cur = []) => {
      const now = this.now();
      const next = cur.map((a) => {
        const copy = structuredClone(a);
        snapshot(copy, prices, now);
        return copy;
      });
      return { value: next, result: undefined };
    });
  }
}
