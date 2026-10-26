import type { Portfolio, PortfolioTransaction, Quote } from "@qt/core";
import type { Router } from "../http";
import { readJsonBody } from "../http";
import type { MarketData } from "../providers";
import type { Store } from "../store";
import { assertId, newId } from "../store";
import { badRequest, notFound } from "../errors";
import { computeHoldings, replay } from "./holdings";

export const PORTFOLIOS_FILE = "portfolios.json";
const MAX_TX = 20_000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validateTransaction(v: unknown, where: string, now: number): PortfolioTransaction {
  if (!isObj(v)) throw badRequest(`${where} must be an object`);
  if (typeof v.symbol !== "string" || !v.symbol.trim() || v.symbol.length > 64) throw badRequest(`${where}.symbol is required`);
  if (v.side !== "buy" && v.side !== "sell") throw badRequest(`${where}.side must be buy or sell`);
  if (!finite(v.qty) || v.qty <= 0) throw badRequest(`${where}.qty must be a positive number`);
  if (!finite(v.price) || v.price < 0) throw badRequest(`${where}.price must be a non-negative number`);
  const fee = v.fee === undefined ? 0 : v.fee;
  if (!finite(fee) || fee < 0) throw badRequest(`${where}.fee must be a non-negative number`);
  const time = v.time === undefined ? now : v.time;
  if (!finite(time) || time <= 0) throw badRequest(`${where}.time must be a timestamp in ms`);
  if (v.note !== undefined && (typeof v.note !== "string" || v.note.length > 500)) throw badRequest(`${where}.note must be a string (max 500)`);
  if (v.id !== undefined && (typeof v.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(v.id))) throw badRequest(`${where}.id is invalid`);
  const tx: PortfolioTransaction = { id: (v.id as string) ?? newId(), time, symbol: v.symbol.trim(), side: v.side, qty: v.qty, price: v.price, fee };
  if (v.note) tx.note = v.note as string;
  return tx;
}

/** Validate a portfolio body (merged over `existing` for partial updates). */
export function validatePortfolio(body: unknown, id: string, now: number, existing?: Portfolio): Portfolio {
  if (!isObj(body)) throw badRequest("Portfolio must be an object");
  const m: Record<string, unknown> = { ...(existing ?? {}), ...body };
  if (typeof m.name !== "string" || !m.name.trim() || m.name.length > 200) throw badRequest("name is required (max 200)");
  const currency = m.currency === undefined ? "USD" : m.currency;
  if (typeof currency !== "string" || !/^[A-Za-z0-9]{2,10}$/.test(currency)) throw badRequest("currency must be a code such as USD");
  const cash = m.cash === undefined ? 0 : m.cash;
  if (!finite(cash)) throw badRequest("cash must be a number (starting cash)");
  const txsRaw = m.transactions === undefined ? [] : m.transactions;
  if (!Array.isArray(txsRaw) || txsRaw.length > MAX_TX) throw badRequest(`transactions must be an array (max ${MAX_TX})`);
  const transactions = txsRaw.map((t, i) => validateTransaction(t, `transactions[${i}]`, now));
  if (new Set(transactions.map((t) => t.id)).size !== transactions.length) throw badRequest("Duplicate transaction ids");
  const p: Portfolio = { id, name: m.name.trim(), currency: currency.toUpperCase(), cash, transactions };
  checkReplay(p);
  return p;
}

function checkReplay(p: Portfolio) {
  try {
    replay(p.transactions);
  } catch (err) {
    throw badRequest((err as Error).message);
  }
}

export function registerPortfolioRoutes(router: Router, store: Store, market: MarketData): void {
  const list = async () => (await store.readDoc<Portfolio[]>(PORTFOLIOS_FILE)) ?? [];
  const get = async (id: string) => {
    const p = (await list()).find((x) => x.id === id);
    if (!p) throw notFound(`Portfolio not found: ${id}`);
    return p;
  };
  /** Atomically replace one portfolio via `fn` (throws 404 when missing). */
  const mutate = (id: string, fn: (p: Portfolio) => Portfolio) =>
    store.updateDoc<Portfolio[], Portfolio>(PORTFOLIOS_FILE, (cur = []) => {
      const i = cur.findIndex((x) => x.id === id);
      if (i < 0) throw notFound(`Portfolio not found: ${id}`);
      const next = [...cur];
      next[i] = fn(cur[i]);
      return { value: next, result: next[i] };
    });

  router.get("/api/portfolios", list);

  router.post("/api/portfolios", async ({ req }) => {
    const p = validatePortfolio(await readJsonBody(req), newId(), Date.now());
    return store.updateDoc<Portfolio[], Portfolio>(PORTFOLIOS_FILE, (cur = []) => {
      if (cur.length >= 200) throw badRequest("Too many portfolios (max 200)");
      return { value: [...cur, p], result: p };
    });
  });

  router.get("/api/portfolios/:id", ({ params }) => get(assertId(params.id)));

  router.put("/api/portfolios/:id", async ({ req, params }) => {
    const id = assertId(params.id);
    const body = await readJsonBody(req);
    return mutate(id, (cur) => validatePortfolio(body, id, Date.now(), cur));
  });

  router.delete("/api/portfolios/:id", async ({ params }) => {
    const id = assertId(params.id);
    await store.updateDoc<Portfolio[], void>(PORTFOLIOS_FILE, (cur = []) => {
      if (!cur.some((x) => x.id === id)) throw notFound(`Portfolio not found: ${id}`);
      return { value: cur.filter((x) => x.id !== id), result: undefined };
    });
    return { ok: true };
  });

  router.post("/api/portfolios/:id/transactions", async ({ req, params }) => {
    const id = assertId(params.id);
    const body = await readJsonBody(req);
    const items = Array.isArray(body) ? body : [body];
    if (items.length === 0 || items.length > 1000) throw badRequest("Send one transaction or an array of up to 1000");
    const txs = items.map((t, i) => validateTransaction(t, Array.isArray(body) ? `[${i}]` : "transaction", Date.now()));
    return mutate(id, (cur) => {
      const ids = new Set(cur.transactions.map((t) => t.id));
      for (const t of txs) if (ids.has(t.id)) throw badRequest(`Duplicate transaction id: ${t.id}`);
      if (cur.transactions.length + txs.length > MAX_TX) throw badRequest(`Too many transactions (max ${MAX_TX})`);
      const next = { ...cur, transactions: [...cur.transactions, ...txs] };
      checkReplay(next);
      return next;
    });
  });

  router.delete("/api/portfolios/:id/transactions/:txId", async ({ params }) => {
    const id = assertId(params.id);
    const txId = assertId(params.txId);
    return mutate(id, (cur) => {
      if (!cur.transactions.some((t) => t.id === txId)) throw notFound(`Transaction not found: ${txId}`);
      const next = { ...cur, transactions: cur.transactions.filter((t) => t.id !== txId) };
      checkReplay(next);
      return next;
    });
  });

  router.get("/api/portfolios/:id/holdings", async ({ params }) => {
    const p = await get(assertId(params.id));
    const open = [...replay(p.transactions).positions.values()].filter((x) => x.qty > 0).map((x) => x.symbol);
    const quotes = open.length ? await market.quotes(open) : [];
    const byKey = new Map<string, Quote>(quotes.map((q) => [q.symbol.toUpperCase(), q]));
    return { portfolioId: p.id, currency: p.currency, asOf: Date.now(), ...computeHoldings(p, byKey) };
  });
}
