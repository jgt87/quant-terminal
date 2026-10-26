import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Portfolio, PortfolioTransaction, Quote } from "@qt/core";
import { computeHoldings, replay } from "../src/portfolio/holdings";
import { createApp } from "../src/app";
import type { MarketData } from "../src/providers";
import { Store } from "../src/store";

let n = 0;
const tx = (side: "buy" | "sell", qty: number, price: number, fee = 0, symbol = "AAPL", time = ++n): PortfolioTransaction => ({ id: `t${n}`, time, symbol, side, qty, price, fee });
const pf = (transactions: PortfolioTransaction[], cash = 10_000): Portfolio => ({ id: "p", name: "P", currency: "USD", cash, transactions });
const q = (symbol: string, last: number, change = 0): [string, Quote] => [symbol, { symbol, last, change, changePct: 0, time: 0 }];

describe("average-cost replay", () => {
  it("weighted average of buys, fees in the cost basis", () => {
    const r = replay([tx("buy", 10, 100, 5), tx("buy", 30, 120, 15)]);
    const p = r.positions.get("AAPL")!;
    expect(p.qty).toBe(40);
    expect(p.avgPrice).toBeCloseTo((1000 + 5 + 3600 + 15) / 40, 12); // 115.5
    expect(r.cashDelta).toBeCloseTo(-(1005 + 3615), 12);
    expect(r.fees).toBe(20);
  });

  it("partial sell realizes against the average, keeps the average for the rest", () => {
    const r = replay([tx("buy", 10, 100), tx("buy", 10, 200), tx("sell", 5, 180, 2)]);
    const p = r.positions.get("AAPL")!;
    expect(p.qty).toBe(15);
    expect(p.avgPrice).toBe(150);
    expect(p.realizedPnl).toBeCloseTo((180 - 150) * 5 - 2, 12); // 148
    expect(r.cashDelta).toBeCloseTo(-3000 + 900 - 2, 12);
  });

  it("selling everything flattens; a later buy starts a new average", () => {
    const r = replay([tx("buy", 10, 100), tx("sell", 10, 110, 1), tx("buy", 5, 50)]);
    const p = r.positions.get("AAPL")!;
    expect(p.qty).toBe(5);
    expect(p.avgPrice).toBe(50);
    expect(p.realizedPnl).toBe(99);
  });

  it("transactions are applied in time order", () => {
    const sell = tx("sell", 5, 120, 0, "AAPL", 200);
    const buy = tx("buy", 10, 100, 0, "AAPL", 100);
    expect(replay([sell, buy]).positions.get("AAPL")!.qty).toBe(5);
  });

  it("selling more than held throws", () => {
    expect(() => replay([tx("buy", 1, 10), tx("sell", 2, 10)])).toThrow(/exceeds/);
  });

  it("symbols are independent and case-insensitive", () => {
    const r = replay([tx("buy", 1, 10, 0, "aapl"), tx("buy", 1, 20, 0, "AAPL"), tx("buy", 2, 5, 0, "MSFT")]);
    expect(r.positions.get("AAPL")!.avgPrice).toBe(15);
    expect(r.positions.get("MSFT")!.qty).toBe(2);
  });
});

describe("holdings and totals", () => {
  it("marks open positions, keeps closed ones with their realized P&L", () => {
    const p = pf([tx("buy", 10, 100, 10), tx("sell", 4, 150, 2), tx("buy", 3, 20, 0, "MSFT"), tx("buy", 2, 50, 0, "TSLA"), tx("sell", 2, 40, 0, "TSLA")]);
    const { holdings, totals } = computeHoldings(p, new Map([q("AAPL", 160, 2), q("MSFT", 25, -1)]));
    const aapl = holdings.find((h) => h.symbol === "AAPL")!;
    expect(aapl).toMatchObject({ qty: 6, avgPrice: 101, last: 160, marketValue: 960 });
    expect(aapl.unrealizedPnl).toBeCloseTo(6 * 59, 10);
    expect(aapl.realizedPnl).toBeCloseTo(4 * 49 - 2, 10);
    const tsla = holdings.find((h) => h.symbol === "TSLA")!;
    expect(tsla).toMatchObject({ qty: 0, marketValue: 0, unrealizedPnl: 0, realizedPnl: -20 });
    expect(holdings[holdings.length - 1].symbol).toBe("TSLA"); // closed positions last
    expect(totals.marketValue).toBeCloseTo(960 + 75, 10);
    expect(totals.unrealizedPnl).toBeCloseTo(354 + 15, 10);
    expect(totals.realizedPnl).toBeCloseTo(194 - 20, 10);
    expect(totals.dayChange).toBeCloseTo(6 * 2 + 3 * -1, 10);
    expect(totals.fees).toBe(12);
    const cash = 10_000 - 1010 + 598 - 60 - 100 + 80;
    expect(totals.cash).toBeCloseTo(cash, 10);
    expect(totals.equity).toBeCloseTo(cash + 1035, 10);
    expect(totals.costBasis).toBeCloseTo(606 + 60, 10);
  });

  it("missing quotes leave the holding unpriced and are listed", () => {
    const { holdings, totals } = computeHoldings(pf([tx("buy", 1, 10, 0, "XYZ")]), new Map());
    expect(holdings[0]).toMatchObject({ last: null, marketValue: null, unrealizedPnl: null });
    expect(totals.missingQuotes).toEqual(["XYZ"]);
    expect(totals.equity).toBe(totals.cash);
  });
});

describe("portfolio routes", () => {
  let server: Server;
  let base: string;
  let dir: string;
  const market = {
    async quotes(symbols: string[]) {
      return symbols.filter((s) => s.toUpperCase() === "AAPL").map((s) => ({ symbol: s, last: 200, change: 5, changePct: 2.5, time: 0 }));
    },
  } as unknown as MarketData;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "qt-portfolio-"));
    server = createServer(createApp({ market, store: new Store(dir) }));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  });

  const call = async (p: string, method = "GET", body?: unknown) => {
    const res = await fetch(base + p, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as any };
  };

  it("CRUD, transactions and holdings", async () => {
    const created = await call("/api/portfolios", "POST", { name: "Long term", cash: 5000 });
    expect(created.body).toMatchObject({ name: "Long term", currency: "USD", cash: 5000, transactions: [] });
    const id = created.body.id;
    expect((await call("/api/portfolios")).body).toHaveLength(1);

    const t1 = await call(`/api/portfolios/${id}/transactions`, "POST", { symbol: "AAPL", side: "buy", qty: 10, price: 150, fee: 1, time: 1 });
    expect(t1.body.transactions).toHaveLength(1);
    expect((await call(`/api/portfolios/${id}/transactions`, "POST", { symbol: "AAPL", side: "sell", qty: 11, price: 150, time: 2 })).status).toBe(400);
    const t2 = await call(`/api/portfolios/${id}/transactions`, "POST", [
      { symbol: "AAPL", side: "sell", qty: 4, price: 180, time: 3 },
      { symbol: "MSFT", side: "buy", qty: 1, price: 300, time: 4 },
    ]);
    expect(t2.body.transactions).toHaveLength(3);

    const h = await call(`/api/portfolios/${id}/holdings`);
    expect(h.status).toBe(200);
    const aapl = h.body.holdings.find((x: any) => x.symbol === "AAPL");
    expect(aapl).toMatchObject({ qty: 6, last: 200, marketValue: 1200 });
    expect(aapl.avgPrice).toBeCloseTo(150.1, 10);
    expect(h.body.totals.missingQuotes).toEqual(["MSFT"]);
    expect(h.body.totals.dayChange).toBe(30);

    // deleting the first buy would leave the sell uncovered
    const buyId = t1.body.transactions[0].id;
    expect((await call(`/api/portfolios/${id}/transactions/${buyId}`, "DELETE")).status).toBe(400);
    const sellId = t2.body.transactions[1].id;
    expect((await call(`/api/portfolios/${id}/transactions/${sellId}`, "DELETE")).body.transactions).toHaveLength(2);
    expect((await call(`/api/portfolios/${id}/transactions/nope`, "DELETE")).status).toBe(404);

    const put = await call(`/api/portfolios/${id}`, "PUT", { name: "Renamed", currency: "eur" });
    expect(put.body).toMatchObject({ name: "Renamed", currency: "EUR", cash: 5000 });
    expect(put.body.transactions).toHaveLength(2);
    expect((await call(`/api/portfolios/${id}`)).body.name).toBe("Renamed");
    expect((await call(`/api/portfolios/${id}`, "DELETE")).body).toEqual({ ok: true });
    expect((await call(`/api/portfolios/${id}`)).status).toBe(404);
  });

  it("validation", async () => {
    for (const bad of [{}, { name: "" }, { name: "x", cash: "1" }, { name: "x", currency: "$" }, { name: "x", transactions: [{ symbol: "A", side: "hold", qty: 1, price: 1 }] }]) {
      expect((await call("/api/portfolios", "POST", bad)).status, JSON.stringify(bad)).toBe(400);
    }
    const p = await call("/api/portfolios", "POST", { name: "v" });
    for (const bad of [{ symbol: "A", side: "buy", qty: 0, price: 1 }, { symbol: "A", side: "buy", qty: 1, price: -1 }, { symbol: "A", side: "buy", qty: 1, price: 1, fee: -1 }, { side: "buy", qty: 1, price: 1 }]) {
      expect((await call(`/api/portfolios/${p.body.id}/transactions`, "POST", bad)).status, JSON.stringify(bad)).toBe(400);
    }
  });
});
